from pymongo import MongoClient
from datetime import datetime

class Database:
    def __init__(self, uri):
        self.client = MongoClient(uri)
        self.db = self.client['messenger_app']
        self.users = self.db['users']
        self.messages = self.db['messages']

    async def add_user(self, username):
        if not self.users.find_one({'username': username}):
            self.users.insert_one({'username': username, 'friends': [], 'friend_requests': []})

    async def add_friend(self, user, friend):
        self.users.update_one({'username': user}, {'$addToSet': {'friends': friend}})
        self.users.update_one({'username': friend}, {'$addToSet': {'friends': user}})

    async def get_friends(self, username):
        user = self.users.find_one({'username': username})
        return user['friends'] if user else []

    async def save_message(self, from_user, to_user, content):
        self.messages.insert_one({
            'from': from_user,
            'to': to_user,
            'content': content,
            'timestamp': datetime.utcnow()
        })

    async def get_messages(self, user1, user2):
        return list(self.messages.find({
            '$or': [
                {'from': user1, 'to': user2},
                {'from': user2, 'to': user1}
            ]
        }).sort('timestamp'))

    async def add_friend_request(self, from_user, to_user):
        self.users.update_one({'username': to_user}, {'$addToSet': {'friend_requests': from_user}})

    async def accept_friend_request(self, from_user, to_user):
        self.users.update_one({'username': from_user}, {'$pull': {'friend_requests': to_user}})
        self.users.update_one({'username': from_user}, {'$addToSet': {'friends': to_user}})
        self.users.update_one({'username': to_user}, {'$addToSet': {'friends': from_user}})

    async def get_friend_requests(self, username):
        user = self.users.find_one({'username': username})
        return user.get('friend_requests', []) if user else []