import React from 'react';
import { Typography, Button, Tag } from 'antd';
import {
  LogoutOutlined,
  AppleOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

interface AdminAccountViewProps {
  onOpenPwaGuide: () => void;
}

export const AdminAccountView: React.FC<AdminAccountViewProps> = ({ onOpenPwaGuide }) => {
  const { user, logout } = useAuth();

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
          Tài khoản Quản trị
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Thông tin phiên làm việc của Quản trị viên hệ thống FindBox.
        </Text>
      </div>

      {/* Admin Profile Card */}
      <div
        className="card-clean"
        style={{
          background: 'linear-gradient(135deg, #faf5ff 0%, #ffffff 100%)',
          borderColor: '#e9d5ff',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div
            style={{
              width: 50,
              height: 50,
              borderRadius: 14,
              background: '#9333ea',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 22,
            }}
          >
            A
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a' }}>
              {user?.full_name || 'Quản trị viên'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{user?.email}</div>
            <Tag color="purple" style={{ marginTop: 4, borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
              HỆ THỐNG QUẢN TRỊ VIÊN
            </Tag>
          </div>
        </div>

        <div style={{ background: '#ffffff', padding: 10, borderRadius: 8, fontSize: 12, color: '#475569' }}>
          <div>✓ Quyền hạn: Duyệt mã OTP, mở ngăn tủ khẩn cấp, cấu hình phần cứng IoT.</div>
          <div>✓ Môi trường: Bản thử nghiệm đồ án môn học FindBox 2026.</div>
        </div>
      </div>

      {/* Quick Settings & Guide */}
      <div className="card-clean" style={{ marginBottom: 16 }}>
        <Title level={5} style={{ margin: '0 0 10px', fontSize: 14 }}>
          Tiện ích di động
        </Title>
        <Button
          block
          icon={<AppleOutlined />}
          onClick={onOpenPwaGuide}
          style={{ height: 44, borderRadius: 10, marginBottom: 8 }}
        >
          Hướng dẫn cài đặt PWA trên iPhone
        </Button>
      </div>

      {/* Logout Button */}
      <Button
        danger
        block
        size="large"
        icon={<LogoutOutlined />}
        onClick={logout}
        style={{ height: 46, borderRadius: 12, fontWeight: 600 }}
      >
        Đăng xuất khỏi phiên quản trị
      </Button>
    </div>
  );
};
