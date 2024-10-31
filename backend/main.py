import asyncio
import json
import websockets
import os
import logging
from dotenv import load_dotenv
from database import Database
from ai_assistant import AIAssistant
from bson import ObjectId
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

# Initialize database and AI assistant
mongodb_uri = os.getenv('MONGODB_URI')
if not mongodb_uri:
    raise ValueError("MONGODB_URI environment variable is not set")

db = Database(mongodb_uri)
ai_assistant = AIAssistant(os.getenv('GEMINI_API_KEY'))

# Store connected clients
connected_clients = {}

def convert_object_ids_and_datetimes_to_strings(data):
    if isinstance(data, dict):
        return {k: str(v) if isinstance(v, (ObjectId, datetime)) else convert_object_ids_and_datetimes_to_strings(v) 
                for k, v in data.items()}
    elif isinstance(data, list):
        return [convert_object_ids_and_datetimes_to_strings(item) for item in data]
    return data

async def broadcast_to_user(username, message):
    if username in connected_clients:
        try:
            await connected_clients[username].send(json.dumps(message))
            return True
        except Exception as e:
            logger.error(f"Error broadcasting to user {username}: {e}")
            return False
    return False

async def handle_message_to_ai(websocket, user_message_data):
    """Handle messages specifically for AI Assistant"""
    try:
        # Process AI response
        ai_response = await ai_assistant.get_response(user_message_data['content'])

        # Save user's message to database
        user_msg_id = await db.save_message(user_message_data['from'], "AI Assistant", user_message_data['content'])
        ai_msg_id = await db.save_message("AI Assistant", user_message_data['from'], ai_response)

        # Send AI response with message ID
        ai_message = {
            'type': 'message',
            '_id': str(ai_msg_id),
            'from': "AI Assistant",
            'to': user_message_data['from'],
            'content': ai_response
        }
        await websocket.send(json.dumps(ai_message))

    except Exception as e:
        logger.error(f"Error in AI message handling: {e}")
        await websocket.send(json.dumps({
            'type': 'error',
            'message': 'Failed to get AI response. Please try again.'
        }))

async def handle_client(websocket, path):
    client_username = None
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                if data['type'] == 'register':
                    client_username = data['username']
                    connected_clients[client_username] = websocket
                    await db.add_user(client_username)
                    
                    # Send initial data including AI Assistant
                    friends = await db.get_friends(client_username)
                    friends.append("AI Assistant")
                    requests = await db.get_friend_requests(client_username)

                    await websocket.send(json.dumps({
                        'type': 'initial_data',
                        'friends': friends,
                        'friend_requests': requests
                    }))

                elif data['type'] == 'add_friend':
                    result = await db.add_friend(data['from'], data['to'])
                    
                    if result['status'] == 'success':
                        await broadcast_to_user(data['to'], {
                            'type': 'friend_request',
                            'from': data['from'],
                            'to': data['to']
                        })
                        await broadcast_to_user(data['from'], result)

                elif data['type'] == 'accept_friend_request':
                    result = await db.accept_friend_request(data['from'], data['to'])
                    
                    if result['status'] == 'success':
                        notification = {
                            'type': 'friend_added',
                            'from': data['from'],
                            'to': data['to']
                        }
                        for username in [data['from'], data['to']]:
                            await broadcast_to_user(username, notification)

                elif data['type'] == 'message':
                    if data['to'] == "AI Assistant":
                        await handle_message_to_ai(websocket, data)
                    else:
                        await db.save_message(data['from'], data['to'], data['content'])
                        message_data = {
                            'type': 'message',
                            'from': data['from'],
                            'to': data['to'],
                            'content': data['content']
                        }
                        
                        await broadcast_to_user(data['to'], message_data)

                elif data['type'] == 'get_friends':
                    friends = await db.get_friends(data['username'])
                    friends.append("AI Assistant")
                    await websocket.send(json.dumps({
                        'type': 'friends_list',
                        'friends': friends
                    }))
                elif data['type'] == 'message_reaction':
                    try:
                        if not all(key in data for key in ['messageId', 'from', 'emoji']):
                            raise ValueError("Missing required fields for reaction")
                            
                        result = await db.add_reaction(
                            data['messageId'],
                            data['from'],
                            data['emoji']
                        )
                        
                        # Create reaction update message
                        reaction_update = {
                            'type': 'reaction_update',
                            'messageId': str(result['message_id']),
                            'reactions': result['reactions']
                        }
                        
                        # Get the message details to find participants
                        message = await db.get_message_by_id(data['messageId'])
                        if message:
                            # Send update to both the message sender and receiver
                            for participant in [message['from'], message['to']]:
                                if participant in connected_clients:
                                    try:
                                        await connected_clients[participant].send(
                                            json.dumps(reaction_update)
                                        )
                                    except Exception as e:
                                        logger.error(f"Error sending reaction to {participant}: {e}")
                                        
                    except Exception as e:
                        logger.error(f"Error handling reaction: {str(e)}")
                        await websocket.send(json.dumps({
                            'type': 'error',
                            'message': 'Failed to add reaction'
                        }))
                        
                elif data['type'] == 'get_friend_requests':
                    requests = await db.get_friend_requests(data['username'])
                    await websocket.send(json.dumps({
                        'type': 'friend_requests',
                        'requests': requests
                    }))

                elif data['type'] == 'load_chat_history':
                    messages = await db.get_messages(data['from'], data['to'])
                    messages = convert_object_ids_and_datetimes_to_strings(messages)
                    
                    formatted_messages = [
                        {
                            'type': 'message',
                            '_id': str(msg['_id']),  
                            'from': msg['from'],
                            'to': msg['to'],
                            'content': msg['content'],
                            'timestamp': msg.get('timestamp'),
                            'read': msg.get('read', False),
                            'readAt': msg.get('readAt')
                        }
                        for msg in messages
                    ]
                    
                    await websocket.send(json.dumps({
                        'type': 'chat_history',
                        'chat': formatted_messages
                    }))

                elif data['type'] == 'mark_messages_read':
                    try:
                        result = await db.mark_messages_read(data['reader'], data['sender'])
                        if result['modified_count'] > 0:
                            # Notify the sender that their messages were read
                            read_receipt = {
                                'type': 'messages_read',
                                'reader': data['reader'],
                                'sender': data['sender'],
                                'timestamp': result['timestamp']  # result['timestamp'] is already an ISO string
                            }
                            await broadcast_to_user(data['sender'], read_receipt)
                    except Exception as e:
                        logger.error(f"Error handling mark_messages_read: {e}")

                elif data['type'] == 'typing_status':
                    # Broadcast typing status to the recipient
                    typing_status = {
                        'type': 'typing_status',
                        'from': data['from'],
                        'to': data['to'],
                        'isTyping': data['isTyping']
                    }
                    await broadcast_to_user(data['to'], typing_status)

            except json.JSONDecodeError:
                logger.error("Invalid JSON received") 

    except websockets.exceptions.ConnectionClosed:
        logger.info("Client connection closed")
    except Exception as e:
        logger.error(f"Error in handle_client: {e}")
    finally:
        if client_username and client_username in connected_clients:
            del connected_clients[client_username]
            logger.info(f"User {client_username} disconnected")

async def main():
    try:
        db.client.server_info()
        logger.info("Successfully connected to MongoDB")
    except Exception as e:
        logger.error(f"Error connecting to MongoDB: {e}")
        return

    server = await websockets.serve(handle_client, "localhost", 8765)
    logger.info("WebSocket server started on ws://localhost:8765")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())