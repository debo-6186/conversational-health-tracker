import os
import json
import base64
import asyncio
import uvicorn
from typing import Optional, Dict, Any
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Body, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import websockets
import httpx
from elevenlabs.client import ElevenLabs
import time
from logger import app_logger
import numpy as np
from database import db

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(title="ElevenLabs Voice Chat")

# Add CORS middleware with WebSocket support
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ElevenLabs credentials and setup
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_AGENT_ID = os.getenv("ELEVENLABS_AGENT_ID")

# Initialize ElevenLabs client
elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

# Active conversations storage
active_conversations: Dict[str, Dict[str, Any]] = {}

# Add a new dictionary to store notification WebSocket connections
notification_connections: Dict[str, WebSocket] = {}

# Request model for initiating a call
class InitiateCallRequest(BaseModel):
    user_id: str
    agent_id: Optional[str] = None
    first_message: Optional[str] = "Hello! I am your caregiver. How can I help you today?"
    language: Optional[str] = "en"

# Add new request model for notification
class NotificationRequest(BaseModel):
    user_id: str
    notification_title: str = "Incoming Call"
    notification_body: str = "You have an incoming call. Click to answer."
    first_message: Optional[str] = None
    system_prompt: Optional[str] = None

@app.post("/initiate-call")
async def initiate_call(request: InitiateCallRequest):
    """
    Endpoint to initiate a call with ElevenLabs agent.
    This will create a conversation and return the conversation ID.
    """
    app_logger.info(f"Received call initiation request for user_id: {request.user_id}, agent_id: {request.agent_id}")
    try:
        user_id = request.user_id
        agent_id = request.agent_id or ELEVENLABS_AGENT_ID
        conversation_id = None  # Initialize conversation_id

        app_logger.info(f"Requesting signed URL from ElevenLabs for agent_id: {agent_id}")
        # Get a signed URL from ElevenLabs API - this creates a conversation
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url",
                params={"agent_id": agent_id},
                headers={"xi-api-key": ELEVENLABS_API_KEY}
            )
            
            if response.status_code != 200:
                app_logger.error(f"Failed to get signed URL. Status: {response.status_code}, Response: {response.text}")
                return JSONResponse(
                    content={"error": f"Failed to get signed URL: {response.text}"},
                    status_code=response.status_code
                )
            
            data = response.json()
            signed_url = data["signed_url"]
            app_logger.info("Successfully obtained signed URL from ElevenLabs")
            
            # Extract conversation_id from the signed URL
            url_parts = signed_url.split("&")
            for part in url_parts:
                if part.startswith("conversation_id="):
                    conversation_id = part.split("=")[1]
                    break
            
            if not conversation_id:
                app_logger.warning("Conversation ID not found in URL, generating temporary ID")
                conversation_id = f"conv_{user_id}_{int(time.time())}"
            else:
                app_logger.info(f"Extracted conversation_id from URL: {conversation_id}")
        
        # Store conversation information in memory only for now
        active_conversations[conversation_id] = {
            "user_id": user_id,
            "agent_id": agent_id,
            "first_message": request.first_message,
            "language": request.language,
            "status": "pending",
            "websocket": None,
            "signed_url": signed_url,
            "needs_db_storage": True  # Flag to indicate this needs to be stored in DB
        }
        
        app_logger.info(f"Created new conversation. ID: {conversation_id}, Status: pending")
        
        return JSONResponse(
            content={
                "success": True,
                "conversation_id": conversation_id,
                "status": "pending"
            },
            status_code=200
        )
    
    except Exception as e:
        app_logger.error(f"Error initiating call: {str(e)}", exc_info=True)
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )
    
async def analyze_transcript_with_claude(transcript: list, agent_id: str, evaluation_criteria: dict) -> dict:
    """
    Analyze conversation transcript using Claude 3.7 Sonnet.
    
    Args:
        transcript: List of conversation turns with role and message
        agent_id: The agent ID for context
        evaluation_criteria: The evaluation criteria from platform settings
        
    Returns:
        dict: Analysis results from Claude
    """
    max_retries = 3
    retry_delay = 2  # seconds
    timeout = httpx.Timeout(30.0, read=60.0)  # 30s connect timeout, 60s read timeout
    
    for attempt in range(max_retries):
        try:
            # First get agent details
            async with httpx.AsyncClient(timeout=timeout) as client:
                agent_response = await client.get(
                    f"https://api.elevenlabs.io/v1/convai/agents/{agent_id}",
                    headers={"xi-api-key": ELEVENLABS_API_KEY}
                )
                
                if agent_response.status_code != 200:
                    raise Exception(f"Failed to get agent details: {agent_response.text}")
                
                agent_data = agent_response.json()
                app_logger.info(f"Retrieved agent data: {agent_data}")
                
                # Extract evaluation criteria from platform settings
                criteria = agent_data.get('platform_settings', {}).get('evaluation', {}).get('criteria', [])
                
                # Extract data collection criteria
                data_collection = agent_data.get('platform_settings', {}).get('data_collection', {})
                
                # Prepare the prompt for Claude
                criteria_prompts = "\n".join([
                    f"# {c.get('name')} #: {c.get('conversation_goal_prompt')}"
                    for c in criteria
                ])
                
                # Prepare data collection prompts
                data_collection_prompts = "\n".join([
                    f"# Data Collection - {name} #: {details.get('description')}"
                    for name, details in data_collection.items()
                ])
                
                app_logger.info(f"Evaluation criteria prompts:\n{criteria_prompts}")
                app_logger.info(f"Data collection prompts:\n{data_collection_prompts}")
                
                # Format transcript for analysis
                formatted_transcript = "\n".join([
                    f"{turn['role'].upper()}: {turn['message']}"
                    for turn in transcript
                ])
                
                # Prepare the analysis request to Claude
                analysis_prompt = f"""Analyze this conversation between a user and AI agent (ID: {agent_id}).

Criteria:
{criteria_prompts}

Data Collection:
{data_collection_prompts}

Transcript:
{formatted_transcript}

Analyze based on criteria and data collection above. For each:
1. Success/failure
2. Rationale
3. Supporting evidence
4. For data collection: identify collected data

IMPORTANT: Return ONLY the raw JSON object without any markdown formatting or code blocks. Do not include ```json or ``` markers.

Return this exact JSON structure:
{{
    "analysis": {{
        "criteria_results": [
            {{
                "criterion_name": "name",
                "result": "success/failure",
                "rationale": "explanation",
                "supporting_evidence": ["examples"]
            }}
        ],
        "data_collection_results": [
            {{
                "data_type": "name",
                "collected": true/false,
                "value": "value if any",
                "rationale": "explanation"
            }}
        ],
        "overall_assessment": "success/failure",
        "summary": "brief summary"
    }}
}}"""

                app_logger.info(f"Analysis prompt for Claude (attempt {attempt + 1}/{max_retries})")
                
                # Make request to Claude API with timeout
                claude_response = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": os.getenv("ANTHROPIC_API_KEY"),
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json"
                    },
                    json={
                        "model": "claude-3-7-sonnet-20250219",
                        "max_tokens": 4000,
                        "messages": [
                            {
                                "role": "user",
                                "content": analysis_prompt
                            }
                        ]
                    }
                )
                
                if claude_response.status_code != 200:
                    raise Exception(f"Claude API error: {claude_response.text}")
                
                app_logger.info(f"Claude API response: {claude_response.text}")
                analysis_result = claude_response.json()
                return json.loads(analysis_result['content'][0]['text'])
                
        except httpx.ReadTimeout as e:
            error_msg = f"Timeout error on attempt {attempt + 1}/{max_retries}: {str(e)}"
            app_logger.warning(error_msg)
            if attempt < max_retries - 1:
                app_logger.info(f"Retrying in {retry_delay} seconds...")
                await asyncio.sleep(retry_delay)
                continue
            else:
                app_logger.error(error_msg, exc_info=True)
                return {
                    "error": error_msg,
                    "analysis": {
                        "criteria_results": [],
                        "data_collection_results": [],
                        "overall_assessment": "error",
                        "summary": f"Analysis failed after {max_retries} attempts: {error_msg}"
                    }
                }
        except Exception as e:
            error_msg = str(e)
            app_logger.error(f"Error in transcript analysis: {error_msg}", exc_info=True)
            return {
                "error": error_msg,
                "analysis": {
                    "criteria_results": [],
                    "data_collection_results": [],
                    "overall_assessment": "error",
                    "summary": f"Analysis failed: {error_msg}"
                }
            }

@app.get("/conversations/{user_id}")
async def get_conversation_history(user_id: str):
    """
    Get conversation history for a user, including ElevenLabs conversation details with simplified transcript
    and Claude analysis.
    """
    try:
        app_logger.info(f"Fetching conversations for user: {user_id}")
        conversations = db.get_user_conversations(user_id=user_id)
        
        # Fetch additional details from ElevenLabs for each conversation
        async with httpx.AsyncClient() as client:
            # Create tasks for all API calls
            tasks = []
            for conv in conversations:
                conv_id = conv['conversation_id']
                app_logger.info(f"Creating task to fetch ElevenLabs details for conversation: {conv_id}")
                tasks.append(
                    client.get(
                        f"https://api.elevenlabs.io/v1/convai/conversations/{conv_id}",
                        headers={"xi-api-key": ELEVENLABS_API_KEY}
                    )
                )
            
            # Execute all API calls concurrently
            app_logger.info(f"Executing {len(tasks)} ElevenLabs API calls concurrently")
            responses = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process responses and merge with conversation data
            for conv, response in zip(conversations, responses):
                if isinstance(response, Exception):
                    app_logger.error(f"Error fetching ElevenLabs details for {conv['conversation_id']}: {str(response)}")
                    conv['elevenlabs_details'] = {"error": str(response)}
                else:
                    try:
                        if response.status_code == 200:
                            data = response.json()
                            # Transform transcript to only include role and message
                            if 'transcript' in data:
                                simplified_transcript = [
                                    {
                                        'role': item['role'],
                                        'message': item['message']
                                    }
                                    for item in data['transcript']
                                    if item['message'] is not None  # Filter out null messages
                                ]
                                data['transcript'] = simplified_transcript
                                
                                # Get agent ID from dynamic variables
                                agent_id = data.get('conversation_initiation_client_data', {}).get('dynamic_variables', {}).get('system__agent_id')
                                
                                if agent_id:
                                    # Perform Claude analysis
                                    app_logger.info(f"Starting Claude analysis for conversation {conv['conversation_id']}")
                                    analysis_result = await analyze_transcript_with_claude(
                                        transcript=simplified_transcript,
                                        agent_id=agent_id,
                                        evaluation_criteria=data.get('platform_settings', {}).get('evaluation', {})
                                    )
                                    data['claude_analysis'] = analysis_result
                                    app_logger.info(f"Completed Claude analysis for conversation {conv['conversation_id']}")
                                else:
                                    app_logger.warning(f"No agent ID found for conversation {conv['conversation_id']}")
                                    data['claude_analysis'] = {"error": "No agent ID found"}
                            
                            conv['elevenlabs_details'] = data
                            app_logger.info(f"Successfully processed ElevenLabs details for {conv['conversation_id']}")
                        else:
                            app_logger.error(f"ElevenLabs API error for {conv['conversation_id']}: {response.status_code} - {response.text}")
                            conv['elevenlabs_details'] = {
                                "error": f"API error: {response.status_code}",
                                "details": response.text
                            }
                    except Exception as e:
                        app_logger.error(f"Error processing ElevenLabs response for {conv['conversation_id']}: {str(e)}")
                        conv['elevenlabs_details'] = {"error": str(e)}
        
        return JSONResponse(
            content={
                "success": True,
                "conversations": conversations
            },
            status_code=200
        )
    except Exception as e:
        app_logger.error(f"Error retrieving conversation history: {str(e)}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=500
        )

@app.post("/trigger-notification")
async def trigger_notification(request: NotificationRequest):
    """
    Endpoint to trigger a notification for an incoming call.
    This will create a conversation and return the notification details.
    """
    app_logger.info(f"Received notification request for user_id: {request.user_id}")
    app_logger.info(f"Request details - title: {request.notification_title}, body: {request.notification_body}")
    app_logger.info(f"First message: {request.first_message}, System prompt: {request.system_prompt}")
    
    try:
        # Create a unique notification ID
        notification_id = f"notif_{request.user_id}_{int(time.time())}"
        app_logger.info(f"Generated notification_id: {notification_id}")
        
        # Store notification information with all request data
        active_conversations[notification_id] = {
            "user_id": request.user_id,
            "agent_id": "agent_01jvvkzxr3e54rre8hjq5rxban",  # Specific agent for incoming calls
            "status": "pending_notification",
            "notification_title": request.notification_title,
            "notification_body": request.notification_body,
            "first_message": request.first_message,  # Store the original first_message
            "system_prompt": request.system_prompt,  # Store the original system_prompt
            "created_at": time.time(),
            "websocket": None,
            "needs_db_storage": True  # Flag to indicate this needs to be stored in DB
        }
        app_logger.info(f"Active conversations after adding new notification: {json.dumps(active_conversations[notification_id], default=str)}")
        app_logger.info(f"Total active conversations: {len(active_conversations)}")
        app_logger.info(f"Active conversation IDs: {list(active_conversations.keys())}")
        
        app_logger.info(f"Created new notification. ID: {notification_id}")
        
        # Prepare notification data
        notification_data = {
            "type": "notification",
            "notification_id": notification_id,
            "title": request.notification_title,
            "body": request.notification_body,
            "first_message": request.first_message,
            "system_prompt": request.system_prompt,
            "status": "pending_notification"
        }
        
        # Send notification to the user's WebSocket if connected
        if request.user_id in notification_connections:
            try:
                app_logger.info(f"Sending notification to user {request.user_id} via WebSocket")
                await notification_connections[request.user_id].send_json(notification_data)
                app_logger.info("Notification sent successfully via WebSocket")
            except Exception as e:
                app_logger.error(f"Error sending notification via WebSocket: {str(e)}")
        else:
            app_logger.info(f"No active WebSocket connection for user {request.user_id}")
        
        return JSONResponse(
            content={
                "success": True,
                "notification_id": notification_id,
                "title": request.notification_title,
                "body": request.notification_body,
                "first_message": request.first_message,
                "system_prompt": request.system_prompt,
                "status": "pending_notification"
            },
            status_code=200
        )
    
    except Exception as e:
        app_logger.error(f"Error triggering notification: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/accept-notification/{notification_id}")
async def accept_notification(notification_id: str):
    """
    Endpoint to accept a notification and initiate the call.
    This will convert the notification into an active call.
    """
    app_logger.info(f"Received notification acceptance for ID: {notification_id}")
    
    if notification_id not in active_conversations:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    app_logger.info(f"Current active conversations: {active_conversations}")
    conversation = active_conversations[notification_id]
    app_logger.info(f"Processing conversation: {conversation}")
    if conversation["status"] != "pending_notification":
        raise HTTPException(status_code=400, detail="Notification already processed")
    
    try:
        # Get a signed URL from ElevenLabs API
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"https://api.elevenlabs.io/v1/convai/conversation/get_signed_url",
                params={"agent_id": conversation["agent_id"]},
                headers={"xi-api-key": ELEVENLABS_API_KEY}
            )
            
            if response.status_code != 200:
                app_logger.error(f"Failed to get signed URL. Status: {response.status_code}, Response: {response.text}")
                raise HTTPException(status_code=response.status_code, detail="Failed to get signed URL")
            
            data = response.json()
            signed_url = data["signed_url"]
            
            # Extract conversation_id from the signed URL
            url_parts = signed_url.split("&")
            conversation_id = None
            for part in url_parts:
                if part.startswith("conversation_id="):
                    conversation_id = part.split("=")[1]
                    break
            
            if not conversation_id:
                conversation_id = f"conv_{conversation['user_id']}_{conversation['agent_id']}"
            
            # Update conversation information, preserving the original first_message and system_prompt
            conversation.update({
                "status": "pending",
                "signed_url": signed_url,
                "conversation_id": conversation_id,
                "first_message": conversation.get("first_message"),  # Use stored first_message
                "system_prompt": conversation.get("system_prompt")   # Use stored system_prompt
            })
            
            # Move to new conversation ID
            active_conversations[conversation_id] = conversation
            active_conversations.pop(notification_id)
            
            app_logger.info(f"Converted notification {notification_id} to conversation {conversation_id}")
            app_logger.info(f"Using stored first_message: {conversation.get('first_message')}")
            app_logger.info(f"Using stored system_prompt: {conversation.get('system_prompt')}")
            
            return JSONResponse(
                content={
                    "success": True,
                    "conversation_id": conversation_id,
                    "status": "pending",
                    "first_message": conversation.get("first_message"),  # Include in response
                    "system_prompt": conversation.get("system_prompt")   # Include in response
                },
                status_code=200
            )
    
    except Exception as e:
        app_logger.error(f"Error accepting notification: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Function to handle WebSocket connection
@app.websocket("/ws/{conversation_id}")
async def websocket_endpoint(websocket: WebSocket, conversation_id: str):
    """
    WebSocket endpoint for handling the voice chat connection.
    This connects the client directly to ElevenLabs.
    """
    app_logger.info(f"New WebSocket connection request for conversation_id: {conversation_id}")
    await websocket.accept()
    app_logger.info(f"WebSocket connection accepted for conversation_id: {conversation_id}")
    
    if conversation_id not in active_conversations:
        app_logger.error(f"Invalid conversation ID: {conversation_id}. Active conversations: {list(active_conversations.keys())}")
        await websocket.close(code=1000)
        return
    
    try:
        # Update conversation status
        conversation = active_conversations[conversation_id]
        conversation["status"] = "active"
        conversation["websocket"] = websocket
        app_logger.info(f"Updated conversation status to active for ID: {conversation_id}")
        
        # Retrieve the signed URL for the conversation
        signed_url = conversation["signed_url"]
        app_logger.info(f"Connecting to ElevenLabs WebSocket using signed URL for conversation: {conversation_id}")
        
        # Connect to ElevenLabs Conversational AI WebSocket
        async with websockets.connect(signed_url) as elevenlabs_ws:
            app_logger.info("Successfully connected to ElevenLabs WebSocket")

            # Handle receiving the initial metadata
            try:
                metadata_msg = await asyncio.wait_for(elevenlabs_ws.recv(), timeout=5.0)
                metadata = json.loads(metadata_msg)
                app_logger.info(f"Received initial metadata from ElevenLabs: {json.dumps(metadata)}")
                app_logger.info("Sending metadata to client")
                await websocket.send_json(metadata)
                
                if metadata.get("type") == "conversation_initiation_metadata":
                    # Update with the real conversation ID if provided
                    if "conversation_initiation_metadata_event" in metadata:
                        event_data = metadata["conversation_initiation_metadata_event"]
                        if "conversation_id" in event_data:
                            real_conversation_id = event_data["conversation_id"]
                            if real_conversation_id != conversation_id:
                                app_logger.info(f"Updating conversation ID from {conversation_id} to {real_conversation_id}")
                                active_conversations[real_conversation_id] = active_conversations[conversation_id]
                                active_conversations.pop(conversation_id, None)
                                conversation_id = real_conversation_id
                                
                                # Now store in database with the real conversation ID
                                if active_conversations[conversation_id].get("needs_db_storage"):
                                    try:
                                        db.store_conversation(
                                            conversation_id=conversation_id,
                                            user_id=active_conversations[conversation_id]["user_id"],
                                            conversation_details={
                                                "status": "active",
                                                "agent_id": active_conversations[conversation_id]["agent_id"],
                                                "first_message": active_conversations[conversation_id]["first_message"],
                                                "started_at": time.time()
                                            }
                                        )
                                        app_logger.info(f"Successfully stored conversation {conversation_id} in database")
                                        active_conversations[conversation_id]["needs_db_storage"] = False
                                    except Exception as e:
                                        app_logger.error(f"Failed to store conversation {conversation_id} in database: {e}")
                        # Set up client config with proper format
                        init_config = {
                            "type": "conversation_initiation_client_data",
                            "conversation_config_override": {
                                "agent": {
                                    "first_message": (
                                        conversation.get("first_message") or 
                                        conversation.get("default_first_message", "Hello! I am your caregiver. How can I help you today?")
                                    ),
                                    "start_conversation_immediately": True,
                                }
                            }
                        }
                        
                        # Add system prompt if it exists
                        if conversation.get("system_prompt"):
                            init_config["conversation_config_override"]["agent"]["prompt"] = {}
                            init_config["conversation_config_override"]["agent"]["prompt"]["prompt"] = conversation["system_prompt"]
                        
                        app_logger.info(f"Sending initialization config to ElevenLabs: {json.dumps(init_config)}")
                        await elevenlabs_ws.send(json.dumps(init_config))
                else:
                    app_logger.error(f"Unexpected initial message from ElevenLabs: {metadata}")
            except asyncio.TimeoutError:
                app_logger.error("Timeout waiting for initial metadata from ElevenLabs")
                await websocket.close(code=1001, reason="Timeout waiting for ElevenLabs response")
                return
            except Exception as e:
                app_logger.error(f"Error processing initial metadata: {str(e)}", exc_info=True)
                await websocket.close(code=1001, reason=f"Error: {str(e)}")
                return
            
            # Function to handle incoming audio from client
            async def handle_client_audio():
                app_logger.info("Starting client audio handler")
                try:
                    while True:
                        try:
                            # Receive message from client WebSocket
                            client_msg = await websocket.receive()
                            app_logger.debug(f"Received message from client of type: {type(client_msg)}")
                            
                            if "bytes" in client_msg:
                                # This is audio data from the client
                                audio_bytes = client_msg["bytes"]
                                app_logger.info(f"Received audio chunk from client, size: {len(audio_bytes)} bytes")
                                
                                try:
                                    # Send audio to ElevenLabs with proper format
                                    user_audio_data = {
                                        "type": "audio",
                                        "audio_event": {
                                            "audio_base_64": audio_bytes,
                                        }
                                    }
                                    
                                    # Enhanced logging for debugging
                                    app_logger.info(f"Audio chunk details - Base64 length: {len(audio_bytes)}, Decoded size: {len(audio_bytes)} bytes")
                                    
                                    # Verify PCM format
                                    if len(audio_bytes) % 2 != 0:
                                        app_logger.error("Invalid PCM data: odd number of bytes")
                                        continue
                                    
                                    # Log the message we're about to send
                                    app_logger.debug(f"Sending audio message to ElevenLabs: {json.dumps(user_audio_data)[:100]}...")
                                    
                                    # Convert dictionary to JSON string before sending
                                    await elevenlabs_ws.send(json.dumps(user_audio_data))
                                    app_logger.info("Successfully sent audio chunk to ElevenLabs")
                                    
                                    # Verify WebSocket state after sending
                                    if elevenlabs_ws.open:
                                        app_logger.debug("ElevenLabs WebSocket is still open after sending")
                                    else:
                                        app_logger.error("ElevenLabs WebSocket closed after sending audio")
                                        break
                                    
                                except Exception as e:
                                    app_logger.error(f"Error processing audio chunk: {str(e)}", exc_info=True)
                                    
                            elif "text" in client_msg:
                                # Handle control messages
                                try:
                                    data = json.loads(client_msg["text"])
                                    app_logger.info(f"Received text message from client")
                                    app_logger.info(f"Received message type from client: {data.get('type')}")
                                    
                                    if data.get("type") == "end_call":
                                        app_logger.info(f"Client requested to end call for conversation {conversation_id}")
                                        return
                                    
                                    # Handle contextual update messages
                                    if data.get("type") == "contextual_update" and "text" in data:
                                        app_logger.info(f"Sending contextual update to ElevenLabs: {data['text']}")
                                        await elevenlabs_ws.send(json.dumps({
                                            "type": "contextual_update",
                                            "text": data["text"]
                                        }))
                                    
                                    # Handle audio messages
                                    if data.get("type") == "audio" and "audio_event" in data:
                                        app_logger.info("Received audio message from client")
                                        audio_data = {"user_audio_chunk": data["audio_event"]["audio_base_64"]}
                                        app_logger.info(f"Forwarding audio message to ElevenLabs, size: {len(data['audio_event']['audio_base_64'])} bytes")
                                        await elevenlabs_ws.send(json.dumps(audio_data))
                                    
                                except json.JSONDecodeError as e:
                                    app_logger.error(f"Error decoding client message: {str(e)}")
                                except Exception as e:
                                    app_logger.error(f"Error handling client text message: {str(e)}", exc_info=True)
                        
                        except WebSocketDisconnect:
                            app_logger.info("Client WebSocket disconnected during audio handling")
                            break
                        except Exception as e:
                            app_logger.error(f"Error in client audio handler: {str(e)}", exc_info=True)
                            break
                
                except Exception as e:
                    app_logger.error(f"Error in client audio handler: {str(e)}", exc_info=True)
                finally:
                    app_logger.info("Client audio handler stopped")
                    # Close ElevenLabs connection if still open
                    try:
                        if elevenlabs_ws.open:
                            await elevenlabs_ws.close(1000, "Client disconnected")
                    except Exception as e:
                        app_logger.error(f"Error closing ElevenLabs connection: {str(e)}")

            # Function to handle incoming messages from ElevenLabs
            async def handle_elevenlabs_messages():
                app_logger.info("Starting ElevenLabs messages handler")
                try:
                    while True:
                        try:
                            # Receive message from ElevenLabs
                            elevenlabs_msg = await elevenlabs_ws.recv()
                            app_logger.info(f"Raw message from ElevenLabs: {elevenlabs_msg[:200]}...")  # Log first 200 chars
                            
                            try:
                                data = json.loads(elevenlabs_msg)
                                app_logger.info(f"Received message from ElevenLabs of type: {data.get('type')}")
                                
                                # Handle ping messages - send pong response
                                if data.get("type") == "ping" and "ping_event" in data:
                                    event_id = data["ping_event"]["event_id"]
                                    app_logger.info(f"Received ping from ElevenLabs, sending pong with event_id: {event_id}")
                                    await elevenlabs_ws.send(json.dumps({
                                        "type": "pong",
                                        "event_id": event_id
                                    }))
                                    continue
                                
                                # Handle different message types
                                if data.get("type") == "audio" and "audio_event" in data:
                                    # Audio response from agent
                                    audio_data = data["audio_event"]["audio_base_64"]
                                    audio_bytes = base64.b64decode(audio_data)
                                    app_logger.info(f"Sending audio response to client, size: {len(audio_bytes)} bytes")
                                    await websocket.send_bytes(audio_bytes)
                                elif data.get("type") == "error":
                                    # Enhanced error logging
                                    error_msg = data.get("error", {}).get("message", "Unknown error")
                                    error_code = data.get("error", {}).get("code", "No error code")
                                    app_logger.error(f"Received error from ElevenLabs - Code: {error_code}, Message: {error_msg}")
                                    app_logger.error(f"Full error data: {json.dumps(data)}")
                                    await websocket.send_json(data)
                                elif data.get("type") in ["user_transcript", "agent_transcript", "agent_response"]:
                                    app_logger.info(f"Received {data.get('type')} from ElevenLabs: {json.dumps(data)}")
                                    await websocket.send_json(data)
                                else:
                                    # Forward other message types to client
                                    app_logger.info(f"Forwarding message type {data.get('type')} to client: {json.dumps(data)}")
                                    await websocket.send_json(data)
                                    
                            except json.JSONDecodeError as e:
                                app_logger.error(f"Error decoding ElevenLabs message: {str(e)}")
                                app_logger.error(f"Raw message that failed to decode: {elevenlabs_msg[:200]}...")
                            except Exception as e:
                                app_logger.error(f"Error processing ElevenLabs message: {str(e)}", exc_info=True)
                        
                        except websockets.exceptions.ConnectionClosed as e:
                            app_logger.error(f"ElevenLabs WebSocket connection closed: {str(e)}", exc_info=True)
                            break
                        except Exception as e:
                            app_logger.error(f"Unexpected error in ElevenLabs messages handler: {str(e)}", exc_info=True)
                            break
                
                except Exception as e:
                    app_logger.error(f"Error in ElevenLabs messages handler: {str(e)}", exc_info=True)
                finally:
                    app_logger.info("ElevenLabs messages handler stopped")
                    # Notify client about disconnection
                    try:
                        if websocket.client_state.CONNECTED:
                            await websocket.send_json({"type": "end_call", "reason": "connection_closed"})
                    except Exception as e:
                        app_logger.error(f"Error notifying client about disconnection: {str(e)}")

            app_logger.info("Starting concurrent handlers for client audio and ElevenLabs messages")
            # Run both handlers concurrently
            await asyncio.gather(
                handle_client_audio(),
                handle_elevenlabs_messages()
            )
    
    except Exception as e:
        app_logger.error(f"Error in WebSocket connection: {str(e)}", exc_info=True)
    
    finally:
        # Cleanup conversation
        if conversation_id in active_conversations:
            app_logger.info(f"Cleaning up resources for conversation {conversation_id}")
            active_conversations.pop(conversation_id, None)
            app_logger.info(f"Remaining active conversations: {list(active_conversations.keys())}")
        
        # Ensure WebSocket is closed
        if websocket.client_state.CONNECTED:
            app_logger.info("Closing WebSocket connection")
            await websocket.close()
            app_logger.info("WebSocket connection closed")

@app.post("/end-call/{conversation_id}")
async def end_call(conversation_id: str):
    """
    Endpoint to end an active call.
    """
    app_logger.info(f"Received request to end call for conversation: {conversation_id}")
    if conversation_id in active_conversations:
        websocket = active_conversations[conversation_id].get("websocket")
        if websocket and websocket.client_state.CONNECTED:
            app_logger.info(f"Sending end_call message to client for conversation: {conversation_id}")
            await websocket.send_json({"type": "end_call"})
        
        app_logger.info(f"Removing conversation {conversation_id} from active conversations")
        active_conversations.pop(conversation_id, None)
        app_logger.info(f"Remaining active conversations: {list(active_conversations.keys())}")
        return JSONResponse(content={"success": True})
    
    app_logger.warning(f"Attempted to end non-existent conversation: {conversation_id}")
    return JSONResponse(
        content={"error": "Conversation not found"},
        status_code=404
    )

@app.websocket("/ws/notifications/{user_id}")
async def notification_websocket(websocket: WebSocket, user_id: str):
    """
    WebSocket endpoint for server-to-client notifications.
    This allows the server to push notifications to specific users.
    """
    app_logger.info(f"New notification WebSocket connection attempt for user: {user_id}")
    app_logger.info(f"WebSocket headers: {websocket.headers}")
    app_logger.info(f"WebSocket client: {websocket.client}")
    
    try:
        await websocket.accept()
        app_logger.info(f"Notification WebSocket connection accepted for user: {user_id}")
        
        # Store the WebSocket connection
        notification_connections[user_id] = websocket
        app_logger.info(f"Stored notification connection for user: {user_id}")
        app_logger.info(f"Current active notification connections: {list(notification_connections.keys())}")
        
        # Send a test message to verify connection
        await websocket.send_json({
            "type": "connection_established",
            "message": "WebSocket connection established successfully"
        })
        
        # Keep the connection alive and handle disconnection
        while True:
            try:
                # Wait for any message (we don't need to process it, just keep connection alive)
                data = await websocket.receive_text()
                app_logger.info(f"Received message from client {user_id}: {data}")
            except WebSocketDisconnect:
                app_logger.info(f"Notification WebSocket disconnected for user: {user_id}")
                break
            except Exception as e:
                app_logger.error(f"Error in notification WebSocket for user {user_id}: {str(e)}", exc_info=True)
                break
    except Exception as e:
        app_logger.error(f"Error accepting WebSocket connection for user {user_id}: {str(e)}", exc_info=True)
        raise
    finally:
        # Clean up the connection
        if user_id in notification_connections:
            app_logger.info(f"Removing notification connection for user: {user_id}")
            notification_connections.pop(user_id, None)
            app_logger.info(f"Remaining notification connections: {list(notification_connections.keys())}")

# Add a test endpoint to verify server is running
@app.get("/health")
async def health_check():
    return {"status": "ok", "websocket_endpoint": "/ws/notifications/{user_id}"}

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)