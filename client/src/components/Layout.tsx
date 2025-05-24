import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Menu as MenuIcon,
  Home as HomeIcon,
  Phone as PhoneIcon,
  Login as LoginIcon,
  PersonAdd as RegisterIcon,
  LocalHospital as HospitalIcon
} from '@mui/icons-material';
import { Badge } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import { useAuth } from '../contexts/AuthContext';
import NotificationHandler, { NotificationHandlerRef } from './NotificationHandler';

const NotificationIcon = styled.div`
  margin-left: auto;
  margin-right: 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  transition: all 0.3s;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  &:hover {
    background-color: #f0f0f0;
  }

  .anticon {
    font-size: 24px;
    color: #8c8c8c;
  }

  &.has-notification .anticon {
    color: #1890ff;
  }

  .ant-badge-dot {
    box-shadow: 0 0 0 2px #fff;
  }
`;

interface MenuItem {
  text: string;
  icon: React.ReactNode;
  path: string;
}

const drawerWidth = 240;

const Layout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [hasNotification, setHasNotification] = useState<boolean>(false);
  const notificationHandlerRef = useRef<NotificationHandlerRef>(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Update notification state from NotificationHandler
  const updateNotificationState = useCallback(() => {
    if (notificationHandlerRef.current) {
      const newState = notificationHandlerRef.current.hasActiveNotification;
      if (newState !== hasNotification) {
        console.log('[Layout] Notification state changed:', newState);
        setHasNotification(newState);
      }
    }
  }, [hasNotification]);

  useEffect(() => {
    // Update notification state every 100ms
    const interval = setInterval(updateNotificationState, 100);
    return () => clearInterval(interval);
  }, [updateNotificationState]);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleCallAccepted = (conversationId: string) => {
    console.log('[Layout] Call accepted, navigating to call page');
    navigate('/call');
  };

  const menuItems: MenuItem[] = [
    { text: 'Home', icon: <HomeIcon />, path: '/' },
    { text: 'Start Call', icon: <PhoneIcon />, path: '/call' },
    { text: 'Medical Records', icon: <HospitalIcon />, path: '/medical-records' },
    ...(user ? [] : [
      { text: 'Login', icon: <LoginIcon />, path: '/login' },
      { text: 'Register', icon: <RegisterIcon />, path: '/register' }
    ])
  ];

  const drawer = (
    <div>
      <Toolbar />
      <List>
        {menuItems.map((item) => (
          <ListItem
            button
            key={item.text}
            component={RouterLink}
            to={item.path}
            onClick={() => isMobile && setMobileOpen(false)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItem>
        ))}
      </List>
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <NotificationHandler
        ref={notificationHandlerRef}
        userId={user?.id || 'user123'}
        serverUrl={process.env.REACT_APP_SERVER_URL || 'http://localhost:8000'}
        onCallAccepted={handleCallAccepted}
      />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div">
            Health Tracker
          </Typography>
          <NotificationIcon 
            className={hasNotification ? 'has-notification' : ''}
            onClick={() => {
              if (notificationHandlerRef.current?.testNotification) {
                console.log('[Layout] Testing notification');
                notificationHandlerRef.current.testNotification();
              }
            }}
          >
            <Badge dot={hasNotification}>
              <BellOutlined />
            </Badge>
          </NotificationIcon>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant={isMobile ? 'temporary' : 'permanent'}
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{
            keepMounted: true, // Better open performance on mobile.
          }}
          sx={{
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: drawerWidth,
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout; 