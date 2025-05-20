import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Button, notification } from 'antd';
import { PhoneOutlined, PhoneFilled } from '@ant-design/icons';
import NotificationHandler, { NotificationHandlerRef } from './NotificationHandler';

// Add console logging utility
const log = {
  info: (message: string, ...args: any[]) => {
    console.log(`[VoiceChat] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[VoiceChat] ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    console.debug(`[VoiceChat] ${message}`, ...args);
  }
};

// Audio format constants
const AUDIO_CONFIG = {
  sampleRate: 16000,
  channels: 1,
  bitsPerSample: 16
};

interface VoiceChatProps {
  userId: string;
  serverUrl: string;
  onIncomingCall?: () => void;
}

export interface VoiceChatRef {
  startIncomingCall: () => Promise<void>;
}

const VoiceChat = forwardRef<VoiceChatRef, VoiceChatProps>(({ userId, serverUrl, onIncomingCall }, ref) => {
  log.info(`Initializing VoiceChat component for user: ${userId}, server: ${serverUrl}`);
  
  const [isCallActive, setIsCallActive] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isProcessingAudioRef = useRef(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const isRecordingRef = useRef(false);

  const notificationHandlerRef = useRef<NotificationHandlerRef>(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    startIncomingCall: async () => {
      if (notificationHandlerRef.current) {
        await notificationHandlerRef.current.handleIncomingNotification();
      }
    }
  }));

  // Function to process audio queue
  const processAudioQueue = async () => {
    if (isProcessingAudioRef.current || audioQueueRef.current.length === 0) {
      return;
    }
    
    isProcessingAudioRef.current = true;
    log.debug(`Processing audio queue, ${audioQueueRef.current.length} buffers remaining`);
    
    try {
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        log.error('Audio context not available');
        return;
      }

      // Resume audio context if it's suspended
      if (audioContext.state === 'suspended') {
        log.info('Resuming suspended audio context');
        await audioContext.resume();
      }
      
      const source = audioContext.createBufferSource();
      const audioBuffer = audioQueueRef.current.shift();
      
      if (audioBuffer) {
        log.debug(`Playing audio buffer of length: ${audioBuffer.length} samples, sample rate: ${audioBuffer.sampleRate}`);
        source.buffer = audioBuffer;
        
        // Create a gain node to control volume
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 1.0; // Set volume to 100%
        
        // Connect the nodes: source -> gain -> destination
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Create a promise that resolves when the audio finishes playing
        await new Promise<void>((resolve) => {
          source.onended = () => {
            log.debug('Audio buffer finished playing');
            gainNode.disconnect();
            source.disconnect();
            resolve();
          };
          
          try {
            source.start(0);
            log.debug('Started playing audio buffer');
          } catch (error: unknown) {
            log.error('Error starting audio playback:', error);
            gainNode.disconnect();
            source.disconnect();
            resolve();
          }
        });
      }
    } catch (error) {
      log.error('Error processing audio:', error);
    } finally {
      isProcessingAudioRef.current = false;
      // Process next audio buffer if available
      if (audioQueueRef.current.length > 0) {
        log.debug(`${audioQueueRef.current.length} buffers remaining in queue`);
        processAudioQueue();
      }
    }
  };

  // Function to handle different types of server messages
  const handleServerMessage = (message: any) => {
    log.debug(`Handling message of type: ${message.type}`);
    
    switch (message.type) {
      case 'end_call':
        log.info('Received end call message from server');
        endCall();
        break;
        
      case 'agent_response':
        log.info('Received agent response:', message.agent_response_event?.agent_response);
        // TODO: Display agent response in UI
        break;
        
      case 'conversation_initiation_metadata':
        log.info('Received conversation metadata:', message.conversation_initiation_metadata_event);
        // Store any needed metadata
        break;
        
      case 'user_transcript':
      case 'agent_transcript':
        log.info(`Received ${message.type}:`, message);
        // TODO: Display transcript in UI
        break;
        
      case 'error':
        log.error('Received error from server:', message);
        notification.error({
          message: 'Server Error',
          description: message.error || 'An error occurred during the call',
        });
        break;
        
      default:
        log.debug('Received unhandled message type:', message.type, message);
    }
  };

  // Function to handle accepted call
  const handleCallAccepted = async (conversationId: string) => {
    log.info(`Call accepted with conversation ID: ${conversationId}`);
    setConversationId(conversationId);
    
    // Start the call with the provided conversation ID
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          sampleSize: 16,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      mediaStreamRef.current = stream;
      setupAudioProcessing();
      
      // Connect to WebSocket
      const wsUrl = `${serverUrl.replace('http', 'ws')}/ws/${conversationId}`;
      log.info(`Connecting to WebSocket for accepted call: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      setupWebSocketHandlers(ws);
      websocketRef.current = ws;
      
      setIsCallActive(true);
      setIsRecording(true);
      isRecordingRef.current = true;
      
      if (onIncomingCall) {
        onIncomingCall();
      }
    } catch (error) {
      log.error('Error starting accepted call:', error);
      notification.error({
        message: 'Call Failed',
        description: error instanceof Error ? error.message : 'Failed to start call',
      });
      endCall();
    }
  };

  // Function to setup audio processing
  const setupAudioProcessing = () => {
    const audioContext = audioContextRef.current;
    if (!audioContext || !mediaStreamRef.current) {
      log.error('Audio context or media stream not available for setup');
      return;
    }

    log.info('Setting up audio processing');
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    processorNodeRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (!isRecordingRef.current) {
        log.debug('Not recording, skipping audio processing');
        return;
      }

      if (!websocketRef.current || websocketRef.current.readyState !== WebSocket.OPEN) {
        log.error('WebSocket not available or not open for audio processing');
        return;
      }

      try {
        // Get the input buffer
        const inputBuffer = e.inputBuffer;
        const inputData = inputBuffer.getChannelData(0);
        
        // Calculate audio level for debugging
        let maxLevel = 0;
        let sumLevel = 0;
        for (let i = 0; i < inputData.length; i++) {
          const level = Math.abs(inputData[i]);
          maxLevel = Math.max(maxLevel, level);
          sumLevel += level;
        }
        const avgLevel = sumLevel / inputData.length;
        
        // Log audio input details
        log.debug(`Audio input - Buffer size: ${inputData.length}, Max level: ${maxLevel.toFixed(4)}, Avg level: ${avgLevel.toFixed(4)}`);
        
        // Check if we have actual audio data
        const SILENCE_THRESHOLD = 0.005;
        let hasAudio = false;
        for (let i = 0; i < inputData.length; i++) {
          if (Math.abs(inputData[i]) > SILENCE_THRESHOLD) {
            hasAudio = true;
            break;
          }
        }
        
        if (!hasAudio) {
          log.debug(`No audio detected (silence) - Max level: ${maxLevel.toFixed(4)}, Threshold: ${SILENCE_THRESHOLD}`);
          return;
        }
        
        // Convert float32 to int16 PCM
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // Create audio message
        const audioMessage = {
          type: "audio",
          audio_event: {
            audio_base_64: btoa(
              Array.from(new Uint8Array(pcmData.buffer))
                .map(byte => String.fromCharCode(byte))
                .join('')
            )
          }
        };
        
        // Log before sending
        log.debug(`Sending audio chunk - PCM size: ${pcmData.byteLength}, Base64 length: ${audioMessage.audio_event.audio_base_64.length}, Max level: ${maxLevel.toFixed(4)}`);
        
        // Send audio data
        websocketRef.current.send(JSON.stringify(audioMessage));
        log.debug('Audio chunk sent successfully');
        
      } catch (error) {
        log.error('Error in audio processing:', error);
      }
    };

    // Connect the nodes
    log.info('Connecting audio nodes');
    source.connect(processor);
    processor.connect(audioContext.destination);
    log.info('Audio nodes connected successfully');
    
    // Verify audio context state
    log.info(`Audio context state: ${audioContext.state}, Sample rate: ${audioContext.sampleRate}`);
  };

  // Function to setup WebSocket handlers
  const setupWebSocketHandlers = (ws: WebSocket) => {
    ws.onopen = () => {
      log.info('WebSocket connection established');
      setIsCallActive(true);
    };

    ws.onmessage = async (event) => {
      try {
        // Handle text messages (JSON)
        if (typeof event.data === 'string') {
          const message = JSON.parse(event.data);
          log.info('Received text message from server:', message);
          handleServerMessage(message);
          return;
        }

        // Handle binary messages (audio)
        if (event.data instanceof Blob) {
          // Check if it's a small blob that might be JSON
          if (event.data.size < 1024) {
            try {
              const text = await event.data.text();
              const message = JSON.parse(text);
              log.info('Received JSON message from small blob:', message);
              handleServerMessage(message);
              return;
            } catch (e) {
              log.debug('Small blob is not JSON, treating as audio');
            }
          }

          // Process as audio data
          log.debug(`Processing audio blob of size: ${event.data.size} bytes`);
          try {
            const arrayBuffer = await event.data.arrayBuffer();
            const audioContext = audioContextRef.current;
            if (!audioContext) {
              throw new Error('Audio context not available');
            }

            // Create audio buffer from PCM data
            const audioBuffer = audioContext.createBuffer(
              1, // Mono channel
              arrayBuffer.byteLength / 2, // 16-bit samples
              AUDIO_CONFIG.sampleRate // Sample rate
            );

            // Get the channel data
            const channelData = audioBuffer.getChannelData(0);
            
            // Convert PCM data to float32
            const pcmView = new Int16Array(arrayBuffer);
            for (let i = 0; i < pcmView.length; i++) {
              channelData[i] = pcmView[i] / 32768.0;
            }

            log.debug(`Created audio buffer - Length: ${audioBuffer.length}, Sample rate: ${audioBuffer.sampleRate}`);
            
            // Add to queue and start processing if not already processing
            audioQueueRef.current.push(audioBuffer);
            if (!isProcessingAudioRef.current) {
              processAudioQueue();
            }
          } catch (error) {
            log.error('Error processing audio data:', error);
          }
        }
      } catch (error) {
        log.error('Error in WebSocket message handler:', error);
      }
    };

    ws.onclose = () => {
      log.info('WebSocket connection closed');
      endCall();
    };

    ws.onerror = (error) => {
      log.error('WebSocket error:', error);
      notification.error({
        message: 'Connection Error',
        description: 'Failed to establish connection with the server.',
      });
      endCall();
    };
  };

  // Initialize audio context and setup audio processing
  useEffect(() => {
    log.info('Initializing audio context');
    const initAudio = async () => {
      try {
        audioContextRef.current = new AudioContext({
          sampleRate: AUDIO_CONFIG.sampleRate,
          latencyHint: 'interactive'
        });
        
        // Resume audio context on user interaction
        const resumeAudioContext = async () => {
          if (audioContextRef.current?.state === 'suspended') {
            log.info('Resuming audio context');
            await audioContextRef.current.resume();
          }
        };
        
        // Add event listeners for user interaction
        document.addEventListener('click', resumeAudioContext);
        document.addEventListener('keydown', resumeAudioContext);
        
        // Initial resume attempt
        await resumeAudioContext();
        
        log.info(`Audio context initialized - State: ${audioContextRef.current.state}, Sample rate: ${audioContextRef.current.sampleRate}`);
      } catch (error) {
        log.error('Error initializing audio context:', error);
      }
    };
    
    initAudio();
    
    // Cleanup function
    const cleanup = () => {
      const resumeAudioContext = async () => {
        if (audioContextRef.current?.state === 'suspended') {
          await audioContextRef.current.resume();
        }
      };
      document.removeEventListener('click', resumeAudioContext);
      document.removeEventListener('keydown', resumeAudioContext);
      if (audioContextRef.current) {
        log.info('Closing audio context');
        audioContextRef.current.close();
      }
    };
    
    return cleanup;
  }, []);

  // Function to start a new call
  const startCall = async () => {
    log.info('Starting new call');
    try {
      // Request microphone access with specific constraints
      log.info('Requesting microphone access');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,  // Mono audio
          sampleRate: 16000,  // 16kHz
          sampleSize: 16,  // 16-bit
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      log.info('Microphone access granted');
      
      mediaStreamRef.current = stream;
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        throw new Error('Audio context not available');
      }

      // Resume audio context if suspended
      if (audioContext.state === 'suspended') {
        log.info('Resuming suspended audio context');
        await audioContext.resume();
      }

      // Setup audio processing
      setupAudioProcessing();
      
      // Set recording state
      isRecordingRef.current = true;
      setIsRecording(true);
      log.info('Recording started, state set to true');
      
      // Verify recording state
      log.info(`Recording state - isRecording: ${isRecording}, isRecordingRef: ${isRecordingRef.current}`);
      
      // Initiate call with server
      log.info('Initiating call with server');
      const response = await fetch(`${serverUrl}/initiate-call`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          user_id: userId,
        }),
      });
      
      const data = await response.json();
      log.info('Received response from server:', data);
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to initiate call');
      }
      
      setConversationId(data.conversation_id);
      log.info(`Call initiated with conversation ID: ${data.conversation_id}`);
      
      // Connect to WebSocket
      const wsUrl = `${serverUrl.replace('http', 'ws')}/ws/${data.conversation_id}`;
      log.info(`Connecting to WebSocket: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      setupWebSocketHandlers(ws);
      websocketRef.current = ws;
      
    } catch (error) {
      log.error('Error starting call:', error);
      notification.error({
        message: 'Call Failed',
        description: error instanceof Error ? error.message : 'Failed to start call',
      });
      endCall();
    }
  };

  // Function to end the call
  const endCall = async () => {
    log.info('Ending call');
    
    // Stop recording first
    log.info('Stopping recording');
    isRecordingRef.current = false;
    setIsRecording(false);
    log.info('Recording stopped, state set to false');
    
    // Stop audio processing
    if (processorNodeRef.current) {
      log.info('Disconnecting audio processor');
      try {
        processorNodeRef.current.disconnect();
        log.info('Audio processor disconnected successfully');
      } catch (error) {
        log.error('Error disconnecting audio processor:', error);
      }
      processorNodeRef.current = null;
    }
    
    // Stop media stream
    if (mediaStreamRef.current) {
      log.info('Stopping media stream');
      try {
        mediaStreamRef.current.getTracks().forEach(track => {
          log.debug(`Stopping track: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}`);
          track.stop();
        });
        log.info('Media stream tracks stopped successfully');
      } catch (error) {
        log.error('Error stopping media stream:', error);
      }
      mediaStreamRef.current = null;
    }
    
    // Verify recording state after cleanup
    log.info(`Recording state after cleanup - isRecording: ${isRecording}, isRecordingRef: ${isRecordingRef.current}`);
    
    // Close WebSocket connection
    if (websocketRef.current) {
      log.info('Closing WebSocket connection');
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    // End call on server if we have a conversation ID
    if (conversationId) {
      try {
        log.info(`Notifying server to end call for conversation: ${conversationId}`);
        await fetch(`${serverUrl}/end-call/${conversationId}`, {
          method: 'POST',
        });
        log.info('Server notified of call end');
      } catch (error) {
        log.error('Error ending call on server:', error);
      }
      setConversationId(null);
    }
    
    setIsCallActive(false);
    log.info('Call ended');
  };

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <NotificationHandler
        ref={notificationHandlerRef}
        userId={userId}
        serverUrl={serverUrl}
        onCallAccepted={handleCallAccepted}
      />
      <Button
        type={isCallActive ? 'primary' : 'default'}
        danger={isCallActive}
        icon={isCallActive ? <PhoneFilled /> : <PhoneOutlined />}
        onClick={isCallActive ? endCall : startCall}
        size="large"
        style={{ width: '120px', height: '120px', borderRadius: '60px' }}
      >
        {isCallActive ? 'End Call' : 'Start Call'}
      </Button>
    </div>
  );
});

export default VoiceChat; 