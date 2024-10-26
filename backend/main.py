import asyncio
import json
import websockets
import os
from dotenv import load_dotenv
from database import Database
from ai_assistant import AIAssistant

load_dotenv()

db = Database(os.getenv('MONGODB_URI'))
ai_assistant = AIAssistant(os.getenv('GEMINI_API_KEY'))

connected_clients = {}

async def handle_client(websocket, path):
    try:
        async for message in websocket:
            data = json.loads(message)
            if data['type'] == 'register':
                connected_clients[data['username']] = websocket
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
                await db.add_friend(data['from'], data['to'])
                await broadcast({'type': 'friend_added', 'from': data['from'], 'to': data['to']})
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