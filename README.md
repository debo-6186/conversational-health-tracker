# Twilio-ElevenLabs Voice Assistant

This application integrates Twilio's voice calling capabilities with ElevenLabs' conversational AI to create an interactive voice assistant that can handle both incoming and outgoing calls. Built with FastAPI for high performance and automatic API documentation.

## Features

- Handle both incoming and outgoing calls
- Real-time speech-to-text and text-to-speech conversion
- Conversational AI using ElevenLabs
- Persistent conversation context
- Error handling and graceful fallbacks
- Automatic API documentation (Swagger/OpenAPI)
- Async support for better performance
- Type validation with Pydantic
- Health check endpoint

## Prerequisites

- Python 3.8 or higher
- Twilio account with a phone number
- ElevenLabs API key
- A publicly accessible URL (for webhook endpoints)

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` with your credentials:
   - TWILIO_ACCOUNT_SID
   - TWILIO_AUTH_TOKEN
   - TWILIO_PHONE_NUMBER
   - ELEVENLABS_API_KEY
   - BASE_URL (your public URL)

## Running the Application

1. Start the FastAPI application:
   ```bash
   uvicorn app:app --reload --host 0.0.0.0 --port 5000
   ```
   Or simply:
   ```bash
   python app.py
   ```

2. Access the API documentation:
   - Swagger UI: http://localhost:5000/docs
   - ReDoc: http://localhost:5000/redoc

3. Make sure your application is accessible via a public URL (you can use ngrok for development)
4. Update your Twilio phone number's webhook URL to point to your application's `/handle-call` endpoint

## API Endpoints

### POST /make-call
Initiates an outgoing call. Request body:
```json
{
    "to_number": "+1234567890"
}
```

### POST /handle-call
Handles both incoming and outgoing calls. This is the webhook endpoint for Twilio.

### POST /handle-user-input
Processes user speech input and generates AI response. This is called by Twilio's Gather verb.

### POST /end-call
Ends a call and cleans up resources. Query parameter:
- conversation_id: The ID of the conversation to end

### GET /health
Health check endpoint to verify the service is running.

## API Documentation

The API documentation is automatically generated and available at:
- Swagger UI: `/docs`
- ReDoc: `/redoc`

The documentation includes:
- Detailed endpoint descriptions
- Request/response schemas
- Example requests
- Authentication requirements
- Error responses

## Security Considerations

- Keep your `.env` file secure and never commit it to version control
- Use HTTPS in production
- Implement proper authentication for API endpoints
- Regularly clean up the audio files directory
- Monitor your API usage and implement rate limiting
- Use FastAPI's built-in security features (OAuth2, JWT, etc.) for production

## Production Deployment

For production deployment:
1. Use a production-grade ASGI server (e.g., Gunicorn with Uvicorn workers)
2. Set up proper logging with structured logging
3. Implement proper audio file storage (e.g., S3)
4. Add authentication for API endpoints
5. Use environment variables for all sensitive data
6. Set up monitoring and error tracking
7. Configure CORS properly
8. Use a reverse proxy (e.g., Nginx)
9. Implement rate limiting
10. Set up proper SSL/TLS

Example production deployment with Gunicorn:
```bash
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:5000
```

## License

MIT License
