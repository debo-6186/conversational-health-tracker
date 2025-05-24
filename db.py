import os
import json
import mysql.connector
from mysql.connector import Error
from dotenv import load_dotenv
from logger import app_logger

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''),
    'database': 'care_companion_ai'
}

def get_db_connection():
    """Create a database connection."""
    try:
        connection = mysql.connector.connect(**DB_CONFIG)
        if connection.is_connected():
            app_logger.info("Successfully connected to MySQL database")
            return connection
    except Error as e:
        app_logger.error(f"Error connecting to MySQL database: {e}")
        raise
    return None

def store_conversation(conversation_id: str, user_id: str, conversation_details: dict):
    """
    Store conversation details in the database.
    
    Args:
        conversation_id (str): Unique identifier for the conversation
        user_id (str): User identifier
        conversation_details (dict): JSON-serializable dictionary containing conversation details
    """
    try:
        connection = get_db_connection()
        if connection is None:
            raise Exception("Could not establish database connection")

        cursor = connection.cursor()
        
        # Convert conversation_details to JSON string
        details_json = json.dumps(conversation_details)
        
        # Insert conversation record
        query = """
        INSERT INTO conversations (conversation_id, user_id, conversation_details)
        VALUES (%s, %s, %s)
        """
        cursor.execute(query, (conversation_id, user_id, details_json))
        
        connection.commit()
        app_logger.info(f"Successfully stored conversation {conversation_id} for user {user_id}")
        
    except Error as e:
        app_logger.error(f"Error storing conversation: {e}")
        raise
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            app_logger.debug("Database connection closed")

def get_conversation(conversation_id: str):
    """
    Retrieve conversation details from the database.
    
    Args:
        conversation_id (str): Unique identifier for the conversation
        
    Returns:
        dict: Conversation details if found, None otherwise
    """
    try:
        connection = get_db_connection()
        if connection is None:
            raise Exception("Could not establish database connection")

        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT * FROM conversations 
        WHERE conversation_id = %s
        """
        cursor.execute(query, (conversation_id,))
        
        result = cursor.fetchone()
        if result:
            # Parse JSON string back to dictionary
            result['conversation_details'] = json.loads(result['conversation_details'])
            app_logger.info(f"Successfully retrieved conversation {conversation_id}")
            return result
        
        app_logger.info(f"No conversation found with ID {conversation_id}")
        return None
        
    except Error as e:
        app_logger.error(f"Error retrieving conversation: {e}")
        raise
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            app_logger.debug("Database connection closed")

def get_user_conversations(user_id: str, limit: int = 10):
    """
    Retrieve recent conversations for a user.
    
    Args:
        user_id (str): User identifier
        limit (int): Maximum number of conversations to retrieve
        
    Returns:
        list: List of conversation records
    """
    try:
        connection = get_db_connection()
        if connection is None:
            raise Exception("Could not establish database connection")

        cursor = connection.cursor(dictionary=True)
        
        query = """
        SELECT * FROM conversations 
        WHERE user_id = %s 
        ORDER BY created_at DESC 
        LIMIT %s
        """
        cursor.execute(query, (user_id, limit))
        
        results = cursor.fetchall()
        for result in results:
            # Parse JSON string back to dictionary
            result['conversation_details'] = json.loads(result['conversation_details'])
        
        app_logger.info(f"Successfully retrieved {len(results)} conversations for user {user_id}")
        return results
        
    except Error as e:
        app_logger.error(f"Error retrieving user conversations: {e}")
        raise
    finally:
        if connection.is_connected():
            cursor.close()
            connection.close()
            app_logger.debug("Database connection closed") 