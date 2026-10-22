import React, { useState } from 'react';
import { Typography, Button, Tag, Popconfirm, message } from 'antd';
import {
  LogoutOutlined,
  AppleOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const { Title, Text } = Typography;

interface AdminAccountViewProps {
  onOpenPwaGuide: () => void;
}

export const AdminAccountView: React.FC<AdminAccountViewProps> = ({ onOpenPwaGuide }) => {
  const { user, token, logout } = useAuth();
  const [clearingData, setClearingData] = useState(false);

  const handleClearData = async () => {
    if (!token) return;
    setClearingData(true);
    try {
      const res = await fetch(`${API_BASE}/admin/clear-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Đã làm sạch dữ liệu thử nghiệm!');
      } else {
        message.error(data.message || 'Không thể dọn dữ liệu');
      }
    } catch (err) {
      console.error(err);
      message.error('Lỗi kết nối khi dọn dữ liệu');
    } finally {
      setClearingData(false);
    }
  };

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

      {/* System Data Reset */}
      <div className="card-clean" style={{ marginBottom: 16, borderColor: '#fed7aa', background: '#fffaf5' }}>
        <Title level={5} style={{ margin: '0 0 6px', fontSize: 14, color: '#9a3412' }}>
          Quản lý dữ liệu hệ thống
        </Title>
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
          Dọn sạch toàn bộ đồ vật, báo cáo mất và yêu cầu nhận thử nghiệm. Cấu hình tủ và ngăn A01, A02 được giữ nguyên.
        </Text>

        <Popconfirm
          title="Xác nhận làm sạch dữ liệu thử nghiệm?"
          description="Hệ thống sẽ xóa tất cả đồ vật, báo cáo mất đồ và các yêu cầu nhận đồ. Ngăn A01 và A02 sẽ được reset về trạng thái Trống."
          okText="Xóa dữ liệu"
          cancelText="Hủy"
          okButtonProps={{ danger: true, loading: clearingData }}
          onConfirm={handleClearData}
        >
          <Button
            danger
            block
            icon={<ClearOutlined />}
            loading={clearingData}
            style={{ height: 42, borderRadius: 10, fontWeight: 600 }}
          >
            Làm sạch dữ liệu thử nghiệm (Giữ lại ngăn tủ)
          </Button>
        </Popconfirm>
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
