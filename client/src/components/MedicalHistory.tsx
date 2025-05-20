import React, { useState } from 'react';
import { Table, Button, Layout, Typography, Tag, Space, Card, Menu, Badge } from 'antd';
import { PhoneOutlined, CalendarOutlined, BellOutlined } from '@ant-design/icons';
import styled from 'styled-components';
import VoiceChat from './VoiceChat';
import type { ColumnsType, TableProps } from 'antd/es/table';

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

// Styled components
const StyledLayout = styled(Layout)`
  min-height: 100vh;
  background: #f0f2f5;
`;

const StyledHeader = styled(Header)`
  background: #fff;
  padding: 0 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1;
  height: 64px;
  line-height: 64px;
`;

const StyledSider = styled(Sider)`
  background: #fff;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
  position: fixed;
  height: calc(100vh - 64px);
  left: 0;
  top: 64px;
  z-index: 1;
  overflow: auto;
`;

const StyledContent = styled(Content)`
  margin-left: 250px;
  padding: 24px;
  min-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
`;

const StyledCard = styled(Card)`
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 24px;
  overflow: hidden;

  .ant-card-body {
    flex: 1;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
`;

// Update the TableContainer styling
const TableContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  
  .ant-table-container {
    height: 100%;
  }

  .ant-table {
    height: 100%;
  }

  .ant-table-container table > thead > tr:first-child th {
    background: #fafafa;
    font-weight: 600;
    height: 48px;
  }

  .ant-table-tbody > tr > td {
    height: 64px;
    padding: 12px 16px;
  }

  .ant-table-body {
    height: calc(100vh - 250px) !important;
  }

  // Style for the checkbox in medicine rows
  .ant-table-tbody input[type="checkbox"] {
    width: 20px;
    height: 20px;
    cursor: pointer;
  }
`;

// Create a custom table component with proper typing
const CustomTable = <T extends object>({ className, ...props }: TableProps<T>) => {
  return (
    <TableContainer className={className}>
      <Table<T> {...props} />
    </TableContainer>
  );
};

// Update the CallButtonContainer styling
const CallButtonContainer = styled.div`
  position: fixed;
  bottom: 48px;
  right: 48px;
  z-index: 1000;
`;

const DateMenuItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  font-size: 14px;
`;

const MenuTitle = styled.div`
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
  color: #1890ff;
  border-bottom: 1px solid #f0f0f0;
`;

const NotificationIcon = styled.div`
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1001;
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

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
`;

const HeaderRight = styled.div`
  display: flex;
  align-items: center;
`;

// Types
interface MedicalRecord {
  id: string;
  date: string;
  type: 'vital' | 'medicine';
  name: string;
  value?: string;
  systolic?: number;
  diastolic?: number;
  taken?: boolean;
}

// Sample dates for the menu
const availableDates = [
  '2024-03-20',
  '2024-03-19',
  '2024-03-18',
  '2024-03-17',
  '2024-03-16',
];

// Sample data
const sampleData: MedicalRecord[] = [
  {
    id: '1',
    date: '2024-03-20',
    type: 'vital',
    name: 'Blood Pressure',
    systolic: 120,
    diastolic: 80,
  },
  {
    id: '2',
    date: '2024-03-20',
    type: 'vital',
    name: 'Blood Glucose',
    value: '95 mg/dL',
  },
  {
    id: '3',
    date: '2024-03-20',
    type: 'vital',
    name: 'Weight',
    value: '65 kg',
  },
  {
    id: '4',
    date: '2024-03-20',
    type: 'medicine',
    name: 'Metformin',
    taken: true,
  },
  {
    id: '5',
    date: '2024-03-20',
    type: 'medicine',
    name: 'Vitamin D',
    taken: false,
  },
  // Add more sample data for other dates
  {
    id: '6',
    date: '2024-03-19',
    type: 'vital',
    name: 'Blood Pressure',
    systolic: 118,
    diastolic: 78,
  },
  {
    id: '7',
    date: '2024-03-19',
    type: 'vital',
    name: 'Blood Glucose',
    value: '92 mg/dL',
  },
  {
    id: '8',
    date: '2024-03-18',
    type: 'vital',
    name: 'Blood Pressure',
    systolic: 122,
    diastolic: 82,
  },
];

const MedicalHistory: React.FC = () => {
  const [data, setData] = useState<MedicalRecord[]>(sampleData);
  const [selectedDate, setSelectedDate] = useState<string>('2024-03-20');
  const [hasNotification, setHasNotification] = useState<boolean>(false);

  const filteredData = data.filter(record => record.date === selectedDate);

  const columns: ColumnsType<MedicalRecord> = [
    {
      title: 'Date',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      sorter: (a: MedicalRecord, b: MedicalRecord) => 
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    },
    {
      title: 'Type',
      dataIndex: 'type',
      key: 'type',
      width: 120,
      render: (type: string) => (
        <Tag color={type === 'vital' ? 'blue' : 'green'}>
          {type.charAt(0).toUpperCase() + type.slice(1)}
        </Tag>
      ),
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 200,
    },
    {
      title: 'Value',
      key: 'value',
      width: 200,
      render: (_: any, record: MedicalRecord) => {
        if (record.type === 'vital') {
          if (record.name === 'Blood Pressure') {
            return `${record.systolic}/${record.diastolic} mmHg`;
          }
          return record.value;
        }
        return (
          <input
            type="checkbox"
            checked={record.taken}
            onChange={(e) => {
              const newData = data.map(item =>
                item.id === record.id ? { ...item, taken: e.target.checked } : item
              );
              setData(newData);
            }}
          />
        );
      },
    },
  ];

  const menuItems = [
    {
      key: 'title',
      label: <MenuTitle>Medical History</MenuTitle>,
      disabled: true,
    },
    ...availableDates.map(date => ({
      key: date,
      label: (
        <DateMenuItem>
          <CalendarOutlined />
          {new Date(date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          })}
        </DateMenuItem>
      ),
    }))
  ];

  // Function to handle notification click
  const handleNotificationClick = () => {
    // TODO: Implement notification handling
    setHasNotification(false); // Clear notification when clicked
  };

  return (
    <StyledLayout>
      <NotificationIcon 
        onClick={handleNotificationClick}
        className={hasNotification ? 'has-notification' : ''}
      >
        <Badge dot={hasNotification}>
          <BellOutlined />
        </Badge>
      </NotificationIcon>
      <StyledHeader>
        <HeaderLeft>
          <Title level={3} style={{ margin: 0 }}>Medical History</Title>
        </HeaderLeft>
      </StyledHeader>
      <StyledSider width={250}>
        <Menu
          mode="inline"
          selectedKeys={[selectedDate]}
          style={{ height: '100%', borderRight: 0 }}
          items={menuItems}
          onClick={({ key }) => key !== 'title' && setSelectedDate(key)}
        />
      </StyledSider>
      <StyledContent>
        <StyledCard>
          <CustomTable<MedicalRecord>
            dataSource={filteredData}
            columns={columns}
            rowKey="id"
            pagination={{ 
              pageSize: 10,
              position: ['bottomCenter'],
              style: { margin: '16px 0' }
            }}
            scroll={{ x: 'max-content', y: 'calc(100vh - 250px)' }}
            size="large"
            rowClassName={() => 'custom-table-row'}
          />
        </StyledCard>
        <CallButtonContainer>
          <VoiceChat
            userId="user123"
            serverUrl={process.env.REACT_APP_SERVER_URL || 'http://localhost:8000'}
          />
        </CallButtonContainer>
      </StyledContent>
    </StyledLayout>
  );
};

export default MedicalHistory; 