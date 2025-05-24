import React from 'react';
import { Box, Card, CardContent, Typography } from '@mui/material';
import { PhoneOutlined } from '@ant-design/icons';
import VoiceChat from './VoiceChat';

const Call: React.FC = () => {
  return (
    <Box sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Start a Voice Call
          </Typography>
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <VoiceChat
              userId="user123"
              serverUrl={process.env.REACT_APP_SERVER_URL || 'http://localhost:8000'}
            />
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Call; 