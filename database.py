import os
import json
import mysql.connector
from mysql.connector import Error, pooling
from dotenv import load_dotenv
from logger import app_logger
from contextlib import contextmanager
import datetime

# Load environment variables
load_dotenv()

class DatabaseManager:
    _instance = None
    _pool = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DatabaseManager, cls).__new__(cls)
            cls._instance._initialize_pool()
        return cls._instance
    
    def _initialize_pool(self):
        """Initialize the connection pool."""
        try:
            dbconfig = {
                'host': 'localhost',
                'user': 'root',
                'database': 'care_companion_ai',
                'pool_name': 'care_companion_pool',
                'pool_size': 5,  # Adjust based on your needs
                'autocommit': True
            }
            
            self._pool = mysql.connector.pooling.MySQLConnectionPool(**dbconfig)
            app_logger.info("Database connection pool initialized successfully")
            
            # Test the connection
            with self.get_connection() as conn:
                if conn.is_connected():
                    app_logger.info("Successfully connected to MySQL database")
                    db_info = conn.get_server_info()
                    app_logger.info(f"Connected to MySQL Server version {db_info}")
                    
                    # Verify database exists
                    cursor = conn.cursor()
                    cursor.execute("SHOW DATABASES LIKE 'care_companion_ai'")
                    if not cursor.fetchone():
                        app_logger.error("Database 'care_companion_ai' does not exist!")
                        raise Exception("Database 'care_companion_ai' not found. Please run init_db.sql first.")
                    
                    cursor.close()
                    
        except Error as e:
            app_logger.error(f"Error initializing database pool: {e}")
            raise
    
    @contextmanager
    def get_connection(self):
        """Get a connection from the pool."""
        conn = None
        try:
            conn = self._pool.get_connection()
            yield conn
        except Error as e:
            app_logger.error(f"Error getting connection from pool: {e}")
            raise
        finally:
            if conn:
                conn.close()
    
    def execute_query(self, query, params=None, fetch=False, many=False):
        """
        Execute a database query.
        
        Args:
            query (str): SQL query to execute
            params (tuple/list/dict, optional): Parameters for the query
            fetch (bool): Whether to fetch results
            many (bool): Whether to fetch multiple rows
            
        Returns:
            list/dict/None: Query results if fetch=True, None otherwise
        """
        with self.get_connection() as conn:
            cursor = conn.cursor(dictionary=True)
            try:
                # Handle parameters
                if params is not None:
                    # If params is already a tuple/list/dict, use it as is
                    if isinstance(params, (tuple, list, dict)):
                        pass
                    # If it's a single value, convert to tuple
                    elif isinstance(params, (str, int, float)):
                        params = (params,)
                    else:
                        raise ValueError(f"Invalid parameter type: {type(params)}. Must be str, int, float, list, tuple, or dict.")
                
                app_logger.debug(f"Executing query: {query} with params: {params}")
                
                # Execute query
                cursor.execute(query, params)
                
                if fetch:
                    if many:
                        # For SELECT queries with many=True, use fetchall()
                        results = cursor.fetchall()
                        app_logger.debug(f"Fetched {len(results) if results else 0} rows")
                    else:
                        # For single row results
                        results = cursor.fetchone()
                        app_logger.debug(f"Fetched single row: {results is not None}")
                    return results
                
                conn.commit()
                return None
                
            except Error as e:
                app_logger.error(f"Error executing query: {e}")
                conn.rollback()
                raise
            finally:
                cursor.close()
    
    def store_conversation(self, conversation_id: str, user_id: str, conversation_details: dict):
        """Store or update conversation details."""
        try:
            # Convert conversation_details to JSON string
            details_json = json.dumps(conversation_details)
            
            # Check if conversation exists
            existing = self.execute_query(
                "SELECT id FROM conversations WHERE conversation_id = %s",
                (conversation_id,),
                fetch=True
            )
            
            if existing:
                # Update existing conversation
                self.execute_query(
                    """
                    UPDATE conversations 
                    SET conversation_details = %s
                    WHERE conversation_id = %s
                    """,
                    (details_json, conversation_id)
                )
                app_logger.info(f"Updated conversation {conversation_id}")
            else:
                # Insert new conversation
                self.execute_query(
                    """
                    INSERT INTO conversations (conversation_id, user_id, conversation_details)
                    VALUES (%s, %s, %s)
                    """,
                    (conversation_id, user_id, details_json)
                )
                app_logger.info(f"Stored new conversation {conversation_id}")
                
        except Error as e:
            app_logger.error(f"Error storing conversation: {e}")
            raise
    
    def get_conversation(self, conversation_id: str):
        """Get conversation details."""
        try:
            result = self.execute_query(
                "SELECT * FROM conversations WHERE conversation_id = %s",
                (conversation_id,),
                fetch=True
            )
            
            if result:
                result['conversation_details'] = json.loads(result['conversation_details'])
                return result
            return None
            
        except Error as e:
            app_logger.error(f"Error retrieving conversation: {e}")
            raise
    
    def get_user_conversations(self, user_id: str, limit: int = 10):
        """Get recent conversations for a user."""
        try:
            app_logger.info(f"Executing get_user_conversations for user_id: {user_id}, limit: {limit}")
            
            query = """
                SELECT * FROM conversations 
                WHERE user_id = %s 
                ORDER BY created_at DESC 
                LIMIT %s
            """
            
            # Pass parameters as a tuple
            params = (str(user_id), int(limit))
            
            app_logger.info(f"Query: {query}, Params: {params}")
            
            # Execute query and fetch all results
            results = self.execute_query(
                query=query,
                params=params,
                fetch=True,
                many=True  # Use many=True to get all rows
            )
            
            app_logger.info(f"Query results: {results}")
            
            if results:
                # Convert results to JSON-serializable format
                serializable_results = []
                for result in results:
                    # Convert datetime to ISO format string
                    if isinstance(result['created_at'], datetime.datetime):
                        result['created_at'] = result['created_at'].isoformat()
                    
                    # Parse conversation_details JSON string to dict
                    if isinstance(result['conversation_details'], str):
                        result['conversation_details'] = json.loads(result['conversation_details'])
                    
                    serializable_results.append(result)
                
                app_logger.info(f"Serialized results: {serializable_results}")
                return serializable_results
            return []
            
        except Error as e:
            app_logger.error(f"Error retrieving user conversations: {e}")
            raise

# Create a global instance
db = DatabaseManager()

# Example usage in app.py:
"""
from database import db

# Store a conversation
db.store_conversation(
    conversation_id="conv_123",
    user_id="user_456",
    conversation_details={
        "status": "active",
        "messages": []
    }
)

# Get a conversation
conversation = db.get_conversation("conv_123")

# Get user's conversations
user_conversations = db.get_user_conversations("user_456", limit=10)

# Execute custom query
results = db.execute_query(
    "SELECT * FROM conversations WHERE status = %s",
    ("active",),
    fetch=True,
    many=True
)
""" 