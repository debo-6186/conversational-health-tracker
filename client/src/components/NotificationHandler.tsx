import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
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
  hasActiveNotification: boolean;
}

const NotificationHandler = forwardRef<NotificationHandlerRef, NotificationHandlerProps>(
  ({ userId, serverUrl, onCallAccepted }, ref) => {
    const notificationSoundRef = useRef<HTMLAudioElement | null>(null);
    const notificationKeyRef = useRef<string | null>(null);
    const notificationIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const notificationWsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [hasActiveNotification, setHasActiveNotification] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);

    // Connect to notification WebSocket
    useEffect(() => {
      let isComponentMounted = true;
      let reconnectAttempts = 0;
      const MAX_RECONNECT_ATTEMPTS = 5;
      const RECONNECT_DELAY = 5000;

      const connectNotificationWebSocket = async () => {
        if (!isComponentMounted) {
          log.info('Component unmounted, skipping connection');
          return;
        }

        if (isConnecting || (notificationWsRef.current && notificationWsRef.current.readyState === WebSocket.OPEN)) {
          log.info('Already connected or connecting, skipping...');
          return;
        }

        if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          log.error('Max reconnection attempts reached');
          return;
        }

        setIsConnecting(true);
        const wsUrl = `${serverUrl.replace('http', 'ws')}/ws/notifications/${userId}`;
        log.info(`Connecting to notification WebSocket: ${wsUrl} (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

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
            log.info('Closing existing WebSocket connection');
            notificationWsRef.current.close(1000, 'Reconnecting');
            notificationWsRef.current = null;
          }

          log.info('Creating new WebSocket connection');
          const ws = new WebSocket(wsUrl);
          notificationWsRef.current = ws;

          ws.onopen = () => {
            if (!isComponentMounted) {
              ws.close(1000, 'Component unmounted');
              return;
            }
            log.info('Notification WebSocket connected successfully');
            setIsConnecting(false);
            reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            
            // Send a test message
            const pingMessage = { type: 'ping', timestamp: Date.now() };
            log.info('Sending ping message:', pingMessage);
            ws.send(JSON.stringify(pingMessage));
          };

          ws.onmessage = (event) => {
            if (!isComponentMounted) return;
            
            try {
              log.info('Raw WebSocket message received:', event.data);
              const data = JSON.parse(event.data);
              log.info('Parsed WebSocket message:', data);
              
              if (data.type === 'connection_established') {
                log.info('Connection established message received:', data.message);
              } else if (data.type === 'notification') {
                log.info('Received notification message:', {
                  notification_id: data.notification_id,
                  title: data.title,
                  body: data.body,
                  first_message: data.first_message,
                  system_prompt: data.system_prompt
                });

                // Ensure all required fields are present
                if (!data.notification_id || !data.title || !data.body) {
                  log.error('Invalid notification data:', data);
                  return;
                }

                // Call showNotification with the notification data
                showNotification(
                  data.notification_id,
                  data.title,
                  data.body,
                  data.first_message,
                  data.system_prompt
                );
              } else {
                log.info('Received other message type:', data.type);
              }
            } catch (error) {
              log.error('Error processing WebSocket message:', error);
              log.error('Raw message that caused error:', event.data);
            }
          };

          ws.onclose = (event) => {
            if (!isComponentMounted) return;
            
            log.info(`Notification WebSocket closed (code: ${event.code}, reason: ${event.reason})`);
            setIsConnecting(false);
            notificationWsRef.current = null;
            
            // Attempt to reconnect after a delay if not closed normally
            if (event.code !== 1000 && isComponentMounted) {
              reconnectAttempts++;
              log.info(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${RECONNECT_DELAY/1000} seconds...`);
              if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
              }
              reconnectTimeoutRef.current = setTimeout(() => {
                if (isComponentMounted) {
                  log.info('Attempting to reconnect WebSocket...');
                  connectNotificationWebSocket();
                }
              }, RECONNECT_DELAY);
            }
          };

          ws.onerror = (error) => {
            if (!isComponentMounted) return;
            
            log.error('Notification WebSocket error:', error);
            log.info('WebSocket state:', ws.readyState);
            log.info('WebSocket URL:', ws.url);
            setIsConnecting(false);
          };
        } catch (error) {
          if (!isComponentMounted) return;
          
          log.error('Error setting up WebSocket connection:', error);
          setIsConnecting(false);
          
          // Attempt to reconnect after a delay
          reconnectAttempts++;
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && isComponentMounted) {
            log.info(`Scheduling reconnection attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} after error in ${RECONNECT_DELAY/1000} seconds...`);
            if (reconnectTimeoutRef.current) {
              clearTimeout(reconnectTimeoutRef.current);
            }
            reconnectTimeoutRef.current = setTimeout(() => {
              if (isComponentMounted) {
                log.info('Attempting to reconnect WebSocket after error...');
                connectNotificationWebSocket();
              }
            }, RECONNECT_DELAY);
          }
        }
      };

      // Initial connection
      log.info('Setting up initial WebSocket connection');
      connectNotificationWebSocket();

      // Cleanup on unmount
      return () => {
        log.info('Cleaning up WebSocket connection');
        isComponentMounted = false;
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
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
      log.info('showNotification called with:', { notificationId, title, body, firstMessage, systemPrompt });
      
      // Stop any existing notification
      if (notificationKeyRef.current) {
        log.info('Destroying existing notification:', notificationKeyRef.current);
        notification.destroy(notificationKeyRef.current);
      }
      if (notificationIntervalRef.current) {
        log.info('Clearing existing notification interval');
        clearInterval(notificationIntervalRef.current);
      }
      stopNotificationSound();

      // Start playing notification sound
      log.info('Playing notification sound');
      playNotificationSound();
      setHasActiveNotification(true);

      // Show notification
      const key = `notification-${notificationId}`;
      notificationKeyRef.current = key;
      log.info('Creating new notification with key:', key);

      notification.open({
        key,
        message: title,
        description: body,
        icon: <PhoneOutlined style={{ color: '#108ee9' }} />,
        duration: 0,
        btn: (
          <button
            onClick={async () => {
              try {
                log.info('Accepting notification:', notificationId);
                const response = await fetch(`${serverUrl}/accept-notification/${notificationId}`, {
                  method: 'POST',
                });
                
                const data = await response.json();
                log.info('Accept notification response:', data);
                
                if (!data.success) {
                  throw new Error(data.error || 'Failed to accept notification');
                }

                log.info('Notification accepted successfully:', data);
                stopNotificationSound();
                if (notificationIntervalRef.current) {
                  clearInterval(notificationIntervalRef.current);
                }
                notification.destroy(key);
                notificationKeyRef.current = null;
                setHasActiveNotification(false);

                onCallAccepted(
                  data.conversation_id,
                  firstMessage || data.first_message,
                  systemPrompt || data.system_prompt
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
          log.info('Notification closed, showing again');
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

    // Expose both handler functions and state to parent component
    useImperativeHandle(ref, () => ({
      handleIncomingNotification,
      testNotification,
      hasActiveNotification,
    }));

    return null; // This component doesn't render anything
  }
);

export default NotificationHandler; 