import React, { useState, useEffect } from 'react';
import {
  Drawer,
  List,
  Button,
  Space,
  Tag,
  Empty,
  Spin,
  message,
} from 'antd';
import {
  BellOutlined,
  CheckCircleFilled,
  InfoCircleFilled,
  ExclamationCircleFilled,
  InboxOutlined,
  SolutionOutlined,
  CheckOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

export interface NotificationItem {
  id: number;
  user_id: number | null;
  role: string | null;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'claim' | 'locker';
  is_read: boolean;
  created_at: string;
}

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  open,
  onClose,
  onUnreadCountChange,
}) => {
  const { token, isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = async (showLoading = false) => {
    if (!token || !isAuthenticated) return;
    if (showLoading) setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await res.json();
      if (result.success && Array.isArray(result.data)) {
        setNotifications(result.data);
        if (onUnreadCountChange) {
          onUnreadCountChange(result.unread_count || 0);
        }
      }
    } catch (err) {
      console.warn('Lỗi tải thông báo:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  // Tự động làm mới thông báo định kỳ mỗi 5 giây
  useEffect(() => {
    if (!isAuthenticated || !token) return;
    fetchNotifications(true);

    const interval = setInterval(() => {
      fetchNotifications(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [token, isAuthenticated]);

  // Đánh dấu 1 thông báo đã đọc
  const handleMarkAsRead = async (id: number) => {
    if (!token) return;
    try {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      const remainingUnread = notifications.filter(
        (n) => n.id !== id && !n.is_read
      ).length;
      if (onUnreadCountChange) onUnreadCountChange(remainingUnread);
    } catch (err) {
      console.error(err);
    }
  };

  // Đánh dấu tất cả đã đọc
  const handleMarkAllRead = async () => {
    if (!token) return;
    setMarkingAll(true);
    try {
      const res = await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        if (onUnreadCountChange) onUnreadCountChange(0);
        message.success('Đã đánh dấu tất cả thông báo là đã đọc');
      }
    } catch (err) {
      message.error('Không thể đánh dấu đã đọc tất cả');
    } finally {
      setMarkingAll(false);
    }
  };

  // Lấy icon tương ứng theo loại thông báo
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircleFilled style={{ color: '#16a34a', fontSize: 20 }} />;
      case 'claim':
        return <SolutionOutlined style={{ color: '#9333ea', fontSize: 20 }} />;
      case 'locker':
        return <InboxOutlined style={{ color: '#2563eb', fontSize: 20 }} />;
      case 'warning':
        return <ExclamationCircleFilled style={{ color: '#d97706', fontSize: 20 }} />;
      default:
        return <InfoCircleFilled style={{ color: '#0284c7', fontSize: 20 }} />;
    }
  };

  // Định dạng thời gian thân thiện
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMin = Math.floor(diffMs / (1000 * 60));
      const diffHour = Math.floor(diffMin / 60);

      if (diffMin < 1) return 'Vừa xong';
      if (diffMin < 60) return `${diffMin} phút trước`;
      if (diffHour < 24) return `${diffHour} giờ trước`;

      return `${date.getHours().toString().padStart(2, '0')}:${date
        .getMinutes()
        .toString()
        .padStart(2, '0')} - ${date.getDate()}/${date.getMonth() + 1}`;
    } catch {
      return isoString;
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Space size={8}>
            <BellOutlined style={{ color: '#2563eb', fontSize: 18 }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>Thông báo</span>
            {unreadCount > 0 && (
              <Tag color="red" style={{ borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                {unreadCount} mới
              </Tag>
            )}
          </Space>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined spin={loading} />}
            onClick={() => fetchNotifications(true)}
          />
        </div>
      }
      placement="right"
      width={window.innerWidth > 480 ? 420 : '90%'}
      onClose={onClose}
      open={open}
      extra={
        unreadCount > 0 && (
          <Button
            type="link"
            size="small"
            icon={<CheckOutlined />}
            loading={markingAll}
            onClick={handleMarkAllRead}
            style={{ fontSize: 12, padding: 0 }}
          >
            Đã đọc hết
          </Button>
        )
      }
      bodyStyle={{ padding: '8px 12px', background: '#f8fafc' }}
    >
      {loading && notifications.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin tip="Đang tải thông báo..." />
        </div>
      ) : notifications.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Bạn chưa có thông báo nào"
          style={{ marginTop: 60 }}
        />
      ) : (
        <List
          dataSource={notifications}
          renderItem={(item) => (
            <div
              key={item.id}
              onClick={() => !item.is_read && handleMarkAsRead(item.id)}
              style={{
                background: item.is_read ? '#ffffff' : '#eff6ff',
                border: item.is_read ? '1px solid #e2e8f0' : '1px solid #bfdbfe',
                borderRadius: 12,
                padding: '12px 14px',
                marginBottom: 10,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                position: 'relative',
                boxShadow: item.is_read ? '0 1px 2px rgba(0,0,0,0.03)' : '0 2px 6px rgba(37,99,235,0.08)',
              }}
            >
              {!item.is_read && (
                <div
                  style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#2563eb',
                  }}
                />
              )}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ paddingTop: 2 }}>{getNotificationIcon(item.type)}</div>
                <div style={{ flex: 1, paddingRight: item.is_read ? 0 : 12 }}>
                  <div
                    style={{
                      fontWeight: item.is_read ? 600 : 800,
                      fontSize: 14,
                      color: item.is_read ? '#1e293b' : '#0f172a',
                      marginBottom: 4,
                    }}
                  >
                    {item.title}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: '#475569',
                      lineHeight: 1.45,
                      marginBottom: 6,
                    }}
                  >
                    {item.message}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                    {formatTime(item.created_at)}
                  </div>
                </div>
              </div>
            </div>
          )}
        />
      )}
    </Drawer>
  );
};
