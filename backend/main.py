import asyncio
import json
import os
import logging
from aiohttp import web, WSMsgType
from dotenv import load_dotenv
from database import Database
from ai_assistant import AIAssistant
from bson import ObjectId
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv(override=True)

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
    # Skip broadcasting to AI assistant since it's not a websocket client
    if username == "AI Assistant":
        return False
    if username in connected_clients:
        try:
            await connected_clients[username].send_str(json.dumps(message))
            logger.info(f"Successfully sent message to {username}")
            return True
        except Exception as e:
            logger.error(f"Error broadcasting to user {username}: {e}")
            return False
    else:
        logger.warning(f"User {username} not found in connected clients")
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
        await websocket.send_str(json.dumps(ai_message))

    except Exception as e:
        logger.error(f"Error in AI message handling: {e}")
        await websocket.send_str(json.dumps({
            'type': 'error',
            'message': 'Failed to get AI response. Please try again.'
        }))

async def handle_reaction(websocket, data):
    max_retries = 3
    retry_delay = 1  # seconds

    for attempt in range(max_retries):
        try:
            if not all(key in data for key in ['messageId', 'from', 'emoji']):
                raise ValueError("Missing required fields for reaction")
            
            if not db.is_valid_object_id(data['messageId']):
                logger.error(f"Invalid message ID format: {data['messageId']}")
                await websocket.send_str(json.dumps({
                    'type': 'error',
                    'message': 'Invalid message ID format'
                }))
                return

            # Check if the message exists before adding the reaction
            message = await db.get_message_by_id(data['messageId'])
            if not message:
                raise ValueError(f"Message {data['messageId']} not found")
            
            result = await db.add_reaction(
                data['messageId'],
                data['from'],
                data['emoji']
            )
            
            if result is None:
                raise ValueError(f"Failed to add reaction. Message {data['messageId']} not found.")
            
            # Create the reaction update message
            reaction_update = {
                'type': 'reaction_update',
                'messageId': str(data['messageId']),  # Ensure messageId is a string
                'reactions': result['reactions']
            }
            
            # Get both participants
            participants = set([message['from'], message['to']])  # Use set to avoid duplicates
            
            # Broadcast to all relevant participants
            broadcast_tasks = []
            logger.info(f"Broadcasting reaction update to participants: {participants}")
            for participant in participants:
                if participant in connected_clients:
                    try:
                        # Create broadcast task
                        task = broadcast_to_user(participant, reaction_update)
                        broadcast_tasks.append(task)
                    except Exception as e:
                        logger.error(f"Error preparing broadcast to {participant}: {e}")
            
            # Wait for all broadcasts to complete
            if broadcast_tasks:
                await asyncio.gather(*broadcast_tasks)
                
            return  # Success, exit the function
            
        except Exception as e:
            logger.error(f"Error handling reaction (attempt {attempt + 1}): {str(e)}")
            if attempt < max_retries - 1:
                await asyncio.sleep(retry_delay)
            else:
                await websocket.send_str(json.dumps({
                    'type': 'error',
                    'message': 'Failed to add reaction after multiple attempts'
                }))
async def ws_handler(request):
    websocket = web.WebSocketResponse(heartbeat=30)
    await websocket.prepare(request)
    client_username = None
    try:
        async for msg in websocket:
            try:
                if msg.type != WSMsgType.TEXT:
                    continue
                data = json.loads(msg.data)
                
                if data['type'] == 'register':
                    client_username = data['username']
                    connected_clients[client_username] = websocket
                    await db.add_user(client_username)
                    
                    # Send initial data including AI Assistant
                    friends = await db.get_friends(client_username)
                    friends.append("AI Assistant")
                    requests = await db.get_friend_requests(client_username)

                    await websocket.send_str(json.dumps({
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
                        message_id = await db.save_message(data['from'], data['to'], data['content'])
                        message_data = {
                            'type': 'message',
                            '_id': message_id,
                            'from': data['from'],
                            'to': data['to'],
                            'content': data['content']
                        }
                        
                        await broadcast_to_user(data['to'], message_data)
                elif data['type'] == 'get_smart_replies':
                    try:
                        # Extract context from the request
                        from_user = data['from']
                        to_user = data['to']
                        context = data.get('context', {})

                        # Generate smart replies using AI assistant
                        smart_replies = await ai_assistant.generate_smart_replies(context)

                        # Send smart reply suggestions back to the client
                        await websocket.send_str(json.dumps({
                            'type': 'smart_replies',
                            'suggestions': smart_replies
                        }))

                    except Exception as e:
                        logger.error(f"Error generating smart replies: {e}")
                        await websocket.send_str(json.dumps({
                            'type': 'smart_replies',
                            'suggestions': []
                        }))
                elif data['type'] == 'get_friends': 
                    friends = await db.get_friends(data['username'])
                    friends.append("AI Assistant")
                    await websocket.send_str(json.dumps({
                        'type': 'friends_list',
                        'friends': friends
                    }))

                elif data['type'] == 'message_reaction':
                    await handle_reaction(websocket, data)

                elif data['type'] == 'get_friend_requests':
                    requests = await db.get_friend_requests(data['username'])
                    await websocket.send_str(json.dumps({
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
                            'read':   msg.get('read', False),
                            'readAt': msg.get('readAt'),
                            'reactions': msg.get('reactions', [])  # Include reactions if available
                        }
                        for msg in messages
                    ]
                    
                    await websocket.send_str(json.dumps({
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

    except Exception:
        logger.info("Client connection closed")
    except Exception as e:
        logger.error(f"Error in handle_client: {e}")
    finally:
        if client_username and client_username in connected_clients:
            del connected_clients[client_username]
            logger.info(f"User {client_username} disconnected")

    return websocket

async def health_handler(request):
    return web.Response(text='OK')

async def main():
    try:
        db.client.server_info()
        logger.info("Successfully connected to MongoDB")
    except Exception as e:
        logger.error(f"Error connecting to MongoDB: {e}")
        return

    port = int(os.getenv("PORT", "8765"))
    host = "0.0.0.0"

    app = web.Application()
    app.router.add_get('/', health_handler)
    app.router.add_get('/health', health_handler)
    app.router.add_get('/ws', ws_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()
    logger.info(f"HTTP server started on http://{host}:{port} (WebSocket at /ws)")
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())