import React from 'react';
import { Button, Typography, Layout } from 'antd';
import { HeartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const { Content } = Layout;
const { Title } = Typography;

const StyledLayout = styled(Layout)`
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
`;

const StyledContent = styled(Content)`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 50px;
  text-align: center;
`;

const LogoContainer = styled.div`
  margin-bottom: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
`;

const LogoIcon = styled(HeartOutlined)`
  font-size: 120px;
  color: #1890ff;
  margin-bottom: 20px;
`;

const StyledTitle = styled(Title)`
  color: #1890ff !important;
  margin-bottom: 40px !important;
  font-size: 48px !important;
`;

const StyledButton = styled(Button)`
  height: 60px;
  width: 200px;
  font-size: 20px;
  border-radius: 30px;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.3);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(24, 144, 255, 0.4);
  }
`;

const LandingPage: React.FC = () => {
  const navigate = useNavigate();

  const handleStart = () => {
    navigate('/medical-history');
  };

  return (
    <StyledLayout>
      <StyledContent>
        <LogoContainer>
          <LogoIcon />
          <StyledTitle>Health Tracker</StyledTitle>
        </LogoContainer>
        <StyledButton type="primary" size="large" onClick={handleStart}>
          Start
        </StyledButton>
      </StyledContent>
    </StyledLayout>
  );
};

export default LandingPage; 