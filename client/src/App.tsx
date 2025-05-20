import React, { useRef } from 'react';
import { Layout, Typography } from 'antd';
import VoiceChat, { VoiceChatRef } from './components/VoiceChat';

const { Header, Content } = Layout;
const { Title } = Typography;

const App: React.FC = () => {
  // In a real app, this would come from your authentication system
  const userId = 'user123';
  const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:8000';
  
  const voiceChatRef = useRef<VoiceChatRef>(null);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 20px' }}>
        <Title level={3} style={{ margin: '16px 0' }}>
          Voice Chat with AI Assistant
        </Title>
      </Header>
      <Content style={{ padding: '50px', textAlign: 'center' }}>
        <VoiceChat 
          ref={voiceChatRef}
          userId={userId} 
          serverUrl={serverUrl}
          onIncomingCall={() => {
            console.log('Incoming call started');
          }}
        />
      </Content>
    </Layout>
  );
};

export default App; 