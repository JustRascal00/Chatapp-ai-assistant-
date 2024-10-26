from pymongo import MongoClient
from datetime import datetime

class Database:
    def __init__(self, uri):
        self.client = MongoClient(uri)
        self.db = self.client['messenger_app']
        self.users = self.db['users']
        self.messages = self.db['messages']
        self.ai_messages = self.db['ai_messages']

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
        if to_user == "AI Assistant" or from_user == "AI Assistant":
            self.ai_messages.insert_one({
                'from': from_user,
                'to': to_user,
                'content': content,
                'timestamp': datetime.utcnow()
            })
        else:
            self.messages.insert_one({
                'from': from_user,
                'to': to_user,
                'content': content,
                'timestamp': datetime.utcnow()
            })
    
    async def get_messages(self, user1, user2):
        if user2 == "AI Assistant" or user1 == "AI Assistant":
            return list(self.ai_messages.find({
                '$or': [
                    {'from': user1, 'to': user2},
                    {'from': user2, 'to': user1}
                ]
            }).sort('timestamp'))
            
        return list(self.messages.find({
            '$or': [
                {'from': user1, 'to': user2},
                {'from': user2, 'to': user1}
            ]
        }).sort('timestamp'))
    
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