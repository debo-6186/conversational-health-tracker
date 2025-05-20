import os
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Create logs directory if it doesn't exist
LOGS_DIR = "logs"
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR)

# Configure logging format
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
DATE_FORMAT = '%Y-%m-%d %H:%M:%S'

# Configure log file settings
MAX_BYTES = 10 * 1024 * 1024  # 10MB
BACKUP_COUNT = 5  # Keep 5 backup files

def setup_logger(name: str, log_level: int = logging.INFO) -> logging.Logger:
    """
    Set up a logger with rotating file handler and console handler.
    
    Args:
        name (str): Name of the logger
        log_level (int): Logging level (default: logging.INFO)
    
    Returns:
        logging.Logger: Configured logger instance
    """
    # Create logger
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # Prevent adding handlers multiple times
    if logger.handlers:
        return logger
    
    # Create formatters
    file_formatter = logging.Formatter(LOG_FORMAT, DATE_FORMAT)
    console_formatter = logging.Formatter('%(levelname)s - %(message)s')
    
    # Create and configure rotating file handler
    log_file = os.path.join(LOGS_DIR, f"{name}.log")
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=MAX_BYTES,
        backupCount=BACKUP_COUNT,
        encoding='utf-8'
    )
    file_handler.setLevel(log_level)
    file_handler.setFormatter(file_formatter)
    
    # Create and configure console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(console_formatter)
    
    # Add handlers to logger
    logger.addHandler(file_handler)
    logger.addHandler(console_handler)
    
    return logger

# Create and export all loggers
app_logger = setup_logger('app')
websocket_logger = setup_logger('websocket')
elevenlabs_logger = setup_logger('elevenlabs')

# Example usage:
if __name__ == "__main__":
    # Test the loggers
    app_logger.info("Application logger initialized")
    websocket_logger.debug("WebSocket logger initialized")
    elevenlabs_logger.warning("ElevenLabs logger initialized")
    
    # Test log rotation
    for i in range(1000):
        app_logger.info(f"Test log message {i}") 