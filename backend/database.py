from bson import ObjectId
from pymongo import MongoClient
from datetime import datetime
import logging
from cachetools import TTLCache
import asyncio

logger = logging.getLogger(__name__)

class Database:
    def __init__(self, uri):
        if not uri:
            raise ValueError("MongoDB URI cannot be empty")
            
        self.client = MongoClient(uri)
        self.db = self.client['messenger_app']
        self.users = self.db['users']
        self.messages = self.db['messages']
        self.ai_messages = self.db['ai_messages']

        # Create indexes
        self.messages.create_index([("from", 1), ("to", 1)])
        self.ai_messages.create_index([("from", 1), ("to", 1)])
        self.users.create_index("username", unique=True)
        
        # Initialize message cache
        self.message_cache = TTLCache(maxsize=1000, ttl=300)  # Cache up to 1000 messages for 5 minutes
        
        logger.info("Database initialized")
        
    async def add_user(self, username):
        """
        Add a new user to the database if they don't already exist.
        Returns True if user was added, False if username already exists.
        """
        existing_user = self.users.find_one({'username': username})
        if existing_user:
            return False
            
        user_doc = {
            'username': username,
            'friends': [],
            'friend_requests': [],
            'joined_date': datetime.utcnow()
        }
        self.users.insert_one(user_doc)
        return True

    async def can_add_friend(self, from_user, to_user):
        """
        Check if a friend request can be sent between users.
        Returns tuple (bool, str) where bool indicates if request is allowed
        and str contains the reason if not allowed.
        """
        # Check if users are the same
        if from_user == to_user:
            return False, "Cannot send friend request to yourself"

        # Check if both users exist
        from_user_doc = self.users.find_one({'username': from_user})
        to_user_doc = self.users.find_one({'username': to_user})
        
        if not from_user_doc or not to_user_doc:
            return False, "One or both users do not exist"

        # Check if already friends
        if to_user in from_user_doc.get('friends', []):
            return False, "Users are already friends"

        # Check if friend request already sent
        if from_user in to_user_doc.get('friend_requests', []):
            return False, "Friend request already sent"

        # Check if there's a pending request in the opposite direction
        if to_user in from_user_doc.get('friend_requests', []):
            return False, "You have a pending friend request from this user"

        return True, "Friend request can be sent"

    async def get_friends(self, username):
        """
        Get the list of friends for a given user.
        Returns empty list if user not found.
        """
        user = self.users.find_one({'username': username})
        if user and 'friends' in user:
            return user['friends']
        return []

    async def get_friend_requests(self, username):
        """
        Get the list of pending friend requests for a user.
        Returns empty list if user not found.
        """
        user = self.users.find_one({'username': username})
        if user and 'friend_requests' in user:
            # Convert ObjectId to string if needed
            requests = list(user['friend_requests'])
            return {
                'type': 'friend_requests',
                'requests': requests
            }
        return {
            'type': 'friend_requests',
            'requests': []
        }

    async def add_friend(self, from_user, to_user):
        """
        Send a friend request from one user to another.
        Returns dict with status and message.
        """
        can_add, reason = await self.can_add_friend(from_user, to_user)
        if not can_add:
            return {
                'type': 'friend_request_response',
                'status': 'error',
                'message': reason
            }

        # Add friend request
        self.users.update_one(
            {'username': to_user},
            {'$addToSet': {'friend_requests': from_user}}
        )
        
        return {
            'type': 'friend_request_response',
            'status': 'success',
            'message': 'Friend request sent successfully',
            'from': from_user,
            'to': to_user
        }

    async def add_reaction(self, message_id, from_user, emoji):
        """
        Add or update a reaction to a message.
        """
        try:
            # Convert string message_id to ObjectId
            message_id = ObjectId(message_id)
            
            # Find the message in both regular and AI messages collections
            message = await self.get_message_by_id(message_id)
            if not message:
                logger.error(f"Message with id {message_id} not found in either messages or ai_messages collection")
                return None

            collection = self.messages if message['to'] != "AI Assistant" and message['from'] != "AI Assistant" else self.ai_messages

            # Initialize reactions array if it doesn't exist and add/update reaction
            result = collection.update_one(
                {'_id': message_id},
                {
                    '$pull': {
                        'reactions': {
                            'user': from_user
                        }
                    }
                }
            )

            result = collection.update_one(
                {'_id': message_id},
                {
                    '$push': {
                        'reactions': {
                            'user': from_user,
                            'emoji': emoji,
                            'timestamp': datetime.utcnow().isoformat()
                        }
                    }
                }
            )

            # Get updated message with reactions
            updated_message = collection.find_one({'_id': message_id})
            if not updated_message:
                raise ValueError(f"Failed to retrieve updated message {message_id}")
            
            # Update cache
            self.message_cache[str(message_id)] = updated_message
                
            # Group reactions by emoji for the response
            reaction_counts = {}
            for reaction in updated_message.get('reactions', []):
                emoji = reaction['emoji']
                if emoji in reaction_counts:
                    reaction_counts[emoji]['count'] += 1
                    reaction_counts[emoji]['users'].append(reaction['user'])
                else:
                    reaction_counts[emoji] = {
                        'emoji': emoji,
                        'count': 1,
                        'users': [reaction['user']]
                    }

            return {
                'message_id': str(message_id),
                'reactions': list(reaction_counts.values())
            }

        except Exception as e:
            logger.error(f"Error adding reaction: {str(e)}")
            logger.error(f"Message ID: {message_id}, From User: {from_user}, Emoji: {emoji}")
            raise
        
    async def accept_friend_request(self, user, friend):
        """
        Accept a friend request. Adds each user to the other's friends list
        and removes the friend request.
        Returns dict with status and message.
        """
        # Verify the friend request exists
        user_doc = self.users.find_one({
            'username': user,
            'friend_requests': friend
        })
        
        if not user_doc:
            return {
                'type': 'friend_request_response',
                'status': 'error',
                'message': 'Friend request not found'
            }

        # Add each user to the other's friends list
        self.users.update_one(
            {'username': user},
            {
                '$pull': {'friend_requests': friend},
                '$addToSet': {'friends': friend}
            }
        )
        self.users.update_one(
            {'username': friend},
            {'$addToSet': {'friends': user}}
        )
        
        return {
            'type': 'friend_added',
            'status': 'success',
            'message': 'Friend request accepted',
            'from': friend,
            'to': user
        }

    async def reject_friend_request(self, user, friend):
        """
        Reject a friend request by removing it from the requests list.
        """
        self.users.update_one(
            {'username': user},
            {'$pull': {'friend_requests': friend}}
        )
        return True

    async def remove_friend(self, user1, user2):
        """
        Remove two users from each other's friends lists.
        """
        self.users.update_one(
            {'username': user1},
            {'$pull': {'friends': user2}}
        )
        self.users.update_one(
            {'username': user2},
            {'$pull': {'friends': user1}}
        )
        return True

    async def save_message(self, from_user, to_user, content):
        """
        Save a message to the appropriate collection with read receipt status.
        Returns the inserted message ID.
        """
        try:
            message_doc = {
                'from': from_user,
                'to': to_user,
                'content': content,
                'timestamp': datetime.utcnow().isoformat(),
                'read': False,
                'readAt': None
            }
            
            if to_user == "AI Assistant" or from_user == "AI Assistant":
                result = self.ai_messages.insert_one(message_doc)
                logger.info(f"AI message saved with ID: {result.inserted_id}")
                collection = self.ai_messages
            else:
                result = self.messages.insert_one(message_doc)
                logger.info(f"User message saved with ID: {result.inserted_id}")
                collection = self.messages
            
            # Add the message to the cache with _id for quick reads and dedupe
            self.message_cache[str(result.inserted_id)] = {**message_doc, '_id': result.inserted_id}
            
            return str(result.inserted_id)
        except Exception as e:
            logger.error(f"Error saving message: {e}")
            raise

    async def get_message_by_id(self, message_id):
        """
        Retrieve a message by its ID from either messages or ai_messages collection.
        """
        try:
            # Check cache first
            cached_message = self.message_cache.get(str(message_id))
            if cached_message:
                return cached_message

            message_id = ObjectId(message_id)
            
            # Check regular messages first
            message = self.messages.find_one({'_id': message_id})
            if message:
                self.message_cache[str(message_id)] = message
                return message
                
            # Check AI messages if not found in regular messages
            message = self.ai_messages.find_one({'_id': message_id})
            if message:
                self.message_cache[str(message_id)] = message
                return message
                
            logger.error(f"Message with id {message_id} not found in either messages or ai_messages collection")
            return None
        except Exception as e:
            logger.error(f"Error retrieving message by ID: {e}")
            raise

    def is_valid_object_id(self, id_string):
        try:
            ObjectId(id_string)
            return True
        except:
            return False
           
    async def mark_messages_read(self, reader, sender):
        """
        Mark all messages from sender to reader as read.
        Returns the number of messages marked as read.
        """
        try:
            current_time = datetime.utcnow().isoformat()  # Store as ISO string
            result = self.messages.update_many(
                {
                    'from': sender,
                    'to': reader,
                    'read': False
                },
                {
                    '$set': {
                        'read': True,
                        'readAt': current_time
                    }
                }
            )
            return {
                'modified_count': result.modified_count,
                'timestamp': current_time
            }
        except Exception as e:
            logger.error(f"Error marking messages as read: {e}")
            raise

    async def get_messages(self, user1, user2):
        """
        Retrieve messages between two users.
        """
        try:
            if user2 == "AI Assistant" or user1 == "AI Assistant":
                messages = list(self.ai_messages.find({
                    '$or': [
                        {'from': user1, 'to': user2},
                        {'from': user2, 'to': user1}
                    ]
                }).sort('timestamp'))
                
                # Convert datetime objects to ISO strings
                for msg in messages:
                    if isinstance(msg.get('timestamp'), datetime):
                        msg['timestamp'] = msg['timestamp'].isoformat()
                    if isinstance(msg.get('readAt'), datetime):
                        msg['readAt'] = msg['readAt'].isoformat()
                        
                logger.info(f"Retrieved {len(messages)} AI messages")
                return messages
                
            messages = list(self.messages.find({
                '$or': [
                    {'from': user1, 'to': user2},
                    {'from': user2, 'to': user1}
                ]
            }).sort('timestamp'))
            
            # Convert datetime objects to ISO strings
            for msg in messages:
                if isinstance(msg.get('timestamp'), datetime):
                    msg['timestamp'] = msg['timestamp'].isoformat()
                if isinstance(msg.get('readAt'), datetime):
                    msg['readAt'] = msg['readAt'].isoformat()
                    
            logger.info(f"Retrieved {len(messages)} user messages")
            return messages
        except Exception as e:
            logger.error(f"Error retrieving messages: {e}")
            raise
    
    async def get_user_profile(self, username):
        user = self.users.find_one({'username': username})
        if user:
            return {
                'username': user['username'],
                'friends': user['friends'],
                'friend_requests': user.get('friend_requests', []),
                'joined_date': user.get('joined_date', datetime.utcnow())
            }
        return None

    def is_valid_object_id(self, id_string):
        try:
            ObjectId(id_string)
            return True
        except:
            return False

    async def check_message_consistency(self):
        all_messages = list(self.messages.find({})) + list(self.ai_messages.find({}))
        message_ids = set(str(msg['_id']) for msg in all_messages)
        
        for msg in all_messages:
            if 'reactions' in msg:
                for reaction in msg['reactions']:
                    if 'messageId' in reaction and str(reaction['messageId']) not in message_ids:
                        logger.error(f"Inconsistency found: Reaction refers to non-existent message {reaction['messageId']}")