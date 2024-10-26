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

                # Send initial friends and friend requests, with "AI Assistant" included
                friends = await db.get_friends(data['username'])
                friends.append("AI Assistant")  # Ensure AI Assistant is always in the friend list
                requests = await db.get_friend_requests(data['username'])

                await websocket.send(json.dumps({
                    'type': 'initial_data',
                    'friends': friends,
                    'friend_requests': requests
                }))

            elif data['type'] == 'add_friend':
                # Attempt to add friend, notifying both users
                result = await db.add_friend(data['from'], data['to'])

                if result['status'] == 'success':
                    recipient_socket = connected_clients.get(data['to'])
                    if recipient_socket:
                        await recipient_socket.send(json.dumps({
                            'type': 'friend_request',
                            'from': data['from'],
                            'to': data['to']
                        }))

                    # Notify sender about request status
                    sender_socket = connected_clients.get(data['from'])
                    if sender_socket:
                        await sender_socket.send(json.dumps(result))

            elif data['type'] == 'accept_friend_request':
                result = await db.accept_friend_request(data['from'], data['to'])

                # Notify both users about the new friendship
                for username in [data['from'], data['to']]:
                    if username in connected_clients:
                        await connected_clients[username].send(json.dumps({
                            'type': 'friend_added',
                            'from': data['from'],
                            'to': data['to']
                        }))

            elif data['type'] == 'get_friends':
                friends = await db.get_friends(data['username'])
                friends.append("AI Assistant")  # Ensure AI Assistant is in the friend list

                await websocket.send(json.dumps({
                    'type': 'friends_list',
                    'friends': friends
                }))

            elif data['type'] == 'message':
                # Check if the message is for AI Assistant
                if data['to'] == "AI Assistant":
                    # Generate AI response and send back
                    ai_response = await ai_assistant.get_response(data['content'])
                    await websocket.send(json.dumps({
                        'type': 'message',
                        'from': "AI Assistant",
                        'to': data['from'],
                        'content': ai_response
                    }))
                else:
                    # Save and forward the message to the actual friend
                    await db.save_message(data['from'], data['to'], data['content'])

                    recipient_socket = connected_clients.get(data['to'])
                    if recipient_socket:
                        await recipient_socket.send(json.dumps(data))

                    # Confirm to sender
                    sender_socket = connected_clients.get(data['from'])
                    if sender_socket:
                        await sender_socket.send(json.dumps(data))

            elif data['type'] == 'get_friend_requests':
                requests = await db.get_friend_requests(data['username'])
                await websocket.send(json.dumps({
                    'type': 'friend_requests',
                    'requests': requests
                }))

    except Exception as e:
        print(f"Error in handle_client: {e}")
    finally:
        if websocket in connected_clients.values():
            username = [k for k, v in connected_clients.items() if v == websocket][0]
            del connected_clients[username]

async def broadcast(message):
    for client in connected_clients.values():
        await client.send(json.dumps(message))

async def main():
    server = await websockets.serve(handle_client, "localhost", 8765)
    print("WebSocket server started on ws://localhost:8765")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
