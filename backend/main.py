import asyncio
import json
import websockets
import os
from dotenv import load_dotenv
from database import Database
from ai_assistant import AIAssistant

load_dotenv()

# Initialize db before using it
db = Database(os.getenv('MONGODB_URI'))
ai_assistant = AIAssistant(os.getenv('GEMINI_API_KEY'))

# Check the MongoDB connection
try:
    db.client.server_info()  # This will throw an exception if the connection fails
    print("Successfully connected to MongoDB")
except Exception as e:
    print(f"Error connecting to MongoDB: {e}")

connected_clients = {}

async def handle_client(websocket, path):
    try:
        async for message in websocket:
            data = json.loads(message)
            if data['type'] == 'register':
                connected_clients[data['username']] = websocket
                await db.add_user(data['username'])
                await broadcast({'type': 'user_joined', 'username': data['username']})
            elif data['type'] == 'message':
                await broadcast(data)
                if data['to'] == 'AI Assistant':
                    ai_response = await ai_assistant.get_response(data['content'])
                    await broadcast({
                        'type': 'message',
                        'from': 'AI Assistant',
                        'to': data['from'],
                        'content': ai_response
                    })
            elif data['type'] == 'add_friend':
                # Add friend request to the database
                await db.add_friend_request(data['from'], data['to'])
                
                # Send the friend request only to the specified user if they are online
                recipient_socket = connected_clients.get(data['to'])
                if recipient_socket:
                    await recipient_socket.send(json.dumps({
                        'type': 'friend_request',
                        'from': data['from'],
                        'to': data['to']
                    }))
            elif data['type'] == 'accept_friend_request':
                await db.accept_friend_request(data['from'], data['to'])
                
                # Notify both users if they are online
                from_socket = connected_clients.get(data['from'])
                to_socket = connected_clients.get(data['to'])
                
                if from_socket:
                    await from_socket.send(json.dumps({
                        'type': 'friend_added',
                        'from': data['from'],
                        'to': data['to']
                    }))
                
                if to_socket:
                    await to_socket.send(json.dumps({
                        'type': 'friend_added',
                        'from': data['from'],
                        'to': data['to']
                    }))
    finally:
        if websocket in connected_clients.values():
            username = [k for k, v in connected_clients.items() if v == websocket][0]
            del connected_clients[username]
            await broadcast({'type': 'user_left', 'username': username})

async def broadcast(message):
    for client in connected_clients.values():
        await client.send(json.dumps(message))

async def main():
    server = await websockets.serve(handle_client, "localhost", 8765)
    print("WebSocket server started on ws://localhost:8765")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
