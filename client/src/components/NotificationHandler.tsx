import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { notification } from 'antd';
import { PhoneOutlined } from '@ant-design/icons';

// Add console logging utility
const log = {
  info: (message: string, ...args: any[]) => {
    console.log(`[NotificationHandler] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[NotificationHandler] ${message}`, ...args);
  }
};

interface NotificationData {
  notification_id: string;
  title: string;
  body: string;
  first_message?: string;
  system_prompt?: string;
  status: string;
}

interface NotificationHandlerProps {
  userId: string;
  serverUrl: string;
  onCallAccepted: (conversationId: string, firstMessage?: string, systemPrompt?: string) => void;
}

export interface NotificationHandlerRef {
  handleIncomingNotification: (firstMessage?: string, systemPrompt?: string) => Promise<void>;
  testNotification: () => Promise<void>;
}

const NotificationHandler = forwardRef<NotificationHandlerRef, NotificationHandlerProps>(
  ({ userId, serverUrl, onCallAccepted }, ref) => {
    const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
    const notificationKeyRef = useRef<string | null>(null);
    const notificationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const notificationWsRef = useRef<WebSocket | null>(null);

    // Connect to notification WebSocket
    useEffect(() => {
      let reconnectTimeout: NodeJS.Timeout;
      let isConnecting = false;

      const connectNotificationWebSocket = async () => {
        if (isConnecting) {
          log.info('Already attempting to connect, skipping...');
          return;
        }

        isConnecting = true;
        const wsUrl = `${serverUrl.replace('http', 'ws')}/ws/notifications/${userId}`;
        log.info(`Connecting to notification WebSocket: ${wsUrl}`);

        try {
          // First check if server is available
          const healthCheck = await fetch(`${serverUrl}/health`);
          if (!healthCheck.ok) {
            throw new Error('Server health check failed');
          }
          const healthData = await healthCheck.json();
          log.info('Server health check:', healthData);

          // Close existing connection if any
          if (notificationWsRef.current) {
            notificationWsRef.current.close();
            notificationWsRef.current = null;
          }

          const ws = new WebSocket(wsUrl);
          notificationWsRef.current = ws;

          ws.onopen = () => {
            log.info('Notification WebSocket connected');
            isConnecting = false;
            // Send a test message
            ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
          };

          ws.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              log.info('Received message from server:', data);
              
              if (data.type === 'connection_established') {
                log.info('Connection established message received:', data.message);
              } else if (data.type === 'notification') {
                showNotification(data.notification_id, data.title, data.body);
              }
            } catch (error) {
              log.error('Error processing WebSocket message:', error);
            }
          };

          ws.onclose = (event) => {
            log.info(`Notification WebSocket closed (code: ${event.code}, reason: ${event.reason})`);
            isConnecting = false;
            notificationWsRef.current = null;
            
            // Attempt to reconnect after a delay
            if (event.code !== 1000) { // Don't reconnect if closed normally
              log.info('Scheduling reconnection...');
              reconnectTimeout = setTimeout(connectNotificationWebSocket, 5000);
            }
          };

          ws.onerror = (error) => {
            log.error('Notification WebSocket error:', error);
            // Log additional connection details
            log.info('WebSocket state:', ws.readyState);
            log.info('WebSocket URL:', ws.url);
            isConnecting = false;
          };
        } catch (error) {
          log.error('Error setting up WebSocket connection:', error);
          isConnecting = false;
          // Attempt to reconnect after a delay
          reconnectTimeout = setTimeout(connectNotificationWebSocket, 5000);
        }
      };

      // Initial connection
      connectNotificationWebSocket();

      // Cleanup on unmount
      return () => {
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout);
        }
        if (notificationWsRef.current) {
          notificationWsRef.current.close(1000, 'Component unmounting');
          notificationWsRef.current = null;
        }
        if (notificationIntervalRef.current) {
          clearInterval(notificationIntervalRef.current);
        }
        if (notificationSoundRef.current) {
          notificationSoundRef.current.pause();
          notificationSoundRef.current = null;
        }
        if (notificationKeyRef.current) {
          notification.destroy(notificationKeyRef.current);
        }
      };
    }, [userId, serverUrl]);

    useEffect(() => {
      // Initialize notification sound
      notificationSoundRef.current = new Audio('/notification-sound.mp3');
      notificationSoundRef.current.loop = true;

      // Cleanup on unmount
      return () => {
        if (notificationIntervalRef.current) {
          clearInterval(notificationIntervalRef.current);
        }
        if (notificationSoundRef.current) {
          notificationSoundRef.current.pause();
          notificationSoundRef.current = null;
        }
        // Destroy any existing notification
        if (notificationKeyRef.current) {
          notification.destroy(notificationKeyRef.current);
        }
      };
    }, []);

    const playNotificationSound = () => {
      if (notificationSoundRef.current) {
        notificationSoundRef.current.play().catch(error => {
          log.error('Error playing notification sound:', error);
        });
      }
    };

    const stopNotificationSound = () => {
      if (notificationSoundRef.current) {
        notificationSoundRef.current.pause();
        notificationSoundRef.current.currentTime = 0;
      }
    };

    const showNotification = async (notificationId: string, title: string, body: string, firstMessage?: string, systemPrompt?: string) => {
      // Stop any existing notification
      if (notificationKeyRef.current) {
        notification.destroy(notificationKeyRef.current);
      }
      if (notificationIntervalRef.current) {
        clearInterval(notificationIntervalRef.current);
      }
      stopNotificationSound();

      // Start playing notification sound
      playNotificationSound();

      // Show notification
      const key = `notification-${notificationId}`;
      notificationKeyRef.current = key;

      notification.open({
        key,
        message: title,
        description: body,
        icon: <PhoneOutlined style={{ color: '#108ee9' }} />,
        duration: 0, // Notification stays until manually closed
        btn: (
          <button
            onClick={async () => {
              try {
                // Accept the notification and get conversation ID
                const response = await fetch(`${serverUrl}/accept-notification/${notificationId}`, {
                  method: 'POST',
                });
                
                const data = await response.json();
                if (!data.success) {
                  throw new Error(data.error || 'Failed to accept notification');
                }

                // Stop notification sound and clear notification
                stopNotificationSound();
                if (notificationIntervalRef.current) {
                  clearInterval(notificationIntervalRef.current);
                }
                notification.destroy(key);
                notificationKeyRef.current = null;

                // Use the first_message and system_prompt from the server response
                onCallAccepted(
                  data.conversation_id,
                  data.first_message || firstMessage,  // Use server response first, then fallback to notification data
                  data.system_prompt || systemPrompt    // Use server response first, then fallback to notification data
                );
              } catch (error) {
                log.error('Error accepting notification:', error);
                notification.error({
                  message: 'Error',
                  description: 'Failed to accept call. Please try again.',
                });
              }
            }}
            style={{
              background: '#108ee9',
              color: 'white',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Answer Call
          </button>
        ),
      });

      // Set up interval to keep showing notification if it's closed
      notificationIntervalRef.current = setInterval(() => {
        if (!document.querySelector(`.ant-notification-notice-${key}`)) {
          showNotification(notificationId, title, body, firstMessage, systemPrompt);
        }
      }, 1000);
    };

    // Function to handle incoming notifications
    const handleIncomingNotification = async (firstMessage?: string, systemPrompt?: string) => {
      log.info('Starting to handle incoming notification');
      try {
        log.info(`Sending request to ${serverUrl}/trigger-notification`);
        const response = await fetch(`${serverUrl}/trigger-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            notification_title: 'Incoming Call',
            notification_body: 'You have an incoming call. Click to answer.',
            first_message: firstMessage || 'Hello! I am your caregiver. How can I help you today?',
            system_prompt: systemPrompt || 'You are a caring and attentive caregiver. Your role is to help the patient with their daily needs and health concerns.'
          }),
        });
        
        log.info('Received response from server');
        const data = await response.json();
        log.info('Response data:', data);
        
        if (!data.success) {
          throw new Error(data.error || 'Failed to trigger notification');
        }

        log.info(`Showing notification with ID: ${data.notification_id}`);
        showNotification(
          data.notification_id, 
          data.title, 
          data.body,
          data.first_message,
          data.system_prompt
        );
      } catch (error) {
        log.error('Error handling incoming notification:', error);
        notification.error({
          message: 'Notification Error',
          description: 'Failed to trigger notification. Please try again.',
        });
      }
    };

    // Add a function to manually trigger notification for testing
    const testNotification = async () => {
      log.info('Testing notification manually');
      try {
        const response = await fetch(`${serverUrl}/trigger-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
            notification_title: 'Test Call',
            notification_body: 'This is a test notification. Click to answer.',
          }),
        });
        
        const data = await response.json();
        log.info('Test notification response:', data);
        
        if (data.success) {
          showNotification(data.notification_id, data.title, data.body);
        }
      } catch (error) {
        log.error('Error in test notification:', error);
      }
    };

    // Expose both handler functions to parent component
    useImperativeHandle(ref, () => ({
      handleIncomingNotification,
      testNotification, // Expose test function
    }));

    return null; // This component doesn't render anything
  }
);

export default NotificationHandler; 