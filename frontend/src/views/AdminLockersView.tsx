import React, { useState, useEffect } from 'react';
import {
  Typography,
  Tag,
  Button,
  Switch,
  message,
  Popconfirm
} from 'antd';
import {
  UnlockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
const API_BASE = '/api';

const { Title, Text } = Typography;

export const AdminLockersView: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [commandHistory, setCommandHistory] = useState<any[]>([]);
  const [unlockingSlot, setUnlockingSlot] = useState<string | null>(null);
  const [togglingSim, setTogglingSim] = useState(false);

  const fetchLockerData = async () => {
    setLoading(true);
    try {
      const [statusRes, slotsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/device/status`),
        fetch(`${API_BASE}/lockers/L-001/slots`),
        fetch(`${API_BASE}/device/commands/history`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (statusRes.ok) {
        const sData = await statusRes.json();
        setDeviceStatus(sData.data || null);
      }
      if (slotsRes.ok) {
        const slData = await slotsRes.json();
        setSlots(slData.data || []);
      }
      if (historyRes.ok) {
        const hData = await historyRes.json();
        setCommandHistory(hData.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLockerData();
    const interval = setInterval(() => {
      void fetchLockerData();
    }, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, [token]);

  // Toggle Simulation Mode
  const handleToggleSimulation = async (enabled: boolean) => {
    setTogglingSim(true);
    try {
      const res = await fetch(`${API_BASE}/device/simulation-mode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message);
        await fetchLockerData();
      }
    } catch (err) {
      message.error('Không thể đổi chế độ mô phỏng');
    } finally {
      setTogglingSim(false);
    }
  };

  // Issue Unlock Command for slot A01 or A02
  const handleUnlockSlot = async (slotCode: string) => {
    setUnlockingSlot(slotCode);
    try {
      const res = await fetch(`${API_BASE}/device/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          locker_code: 'L-001',
          slot_code: slotCode,
          action: 'unlock_slot',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi gửi lệnh');
      }

      message.success(data.message);
      await fetchLockerData();
    } catch (err: any) {
      message.error(err.message || 'Không thể gửi lệnh mở ngăn tủ');
    } finally {
      setUnlockingSlot(null);
    }
  };

  const isOnline = deviceStatus?.is_online;
  const isSimulation = deviceStatus?.simulation_mode;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            Quản lý Tủ & Ngăn IoT
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tủ thông minh L-001 (Điều khiển servo & cảm biến cửa).
          </Text>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={fetchLockerData}
          loading={loading}
          style={{ borderRadius: 8 }}
        />
      </div>

      {/* Simulation Banner & Toggle */}
      <div
        className="card-clean"
        style={{
          background: isSimulation ? '#fffbeb' : '#f8fafc',
          borderColor: isSimulation ? '#fde68a' : '#e2e8f0',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="simulation-tag" style={{ background: isSimulation ? '#f59e0b' : '#64748b' }}>
                {isSimulation ? 'CHẾ ĐỘ MÔ PHỎNG: BẬT' : 'CHẾ ĐỘ THẬT (PHẦN CỨNG)'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              {isSimulation
                ? 'Khi chưa cắm ESP32 thật, hệ thống sẽ ghi nhận lệnh mô phỏng phục vụ chấm điểm/demo.'
                : 'Lệnh điều khiển servo sẽ gửi trực tiếp đến phần cứng ESP32 qua Wi-Fi.'}
            </div>
          </div>
          <Switch
            checked={isSimulation}
            onChange={handleToggleSimulation}
            loading={togglingSim}
          />
        </div>
      </div>

      {/* Device Connection Status Bar */}
      <div
        className="card-clean"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          background: '#ffffff',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Trạng thái kết nối ESP32:</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {deviceStatus?.last_seen_at
              ? `Nhịp tim gần nhất: ${new Date(deviceStatus.last_seen_at).toLocaleTimeString('vi-VN')}`
              : 'Chưa nhận được tín hiệu heartbeat'}
          </div>
        </div>
        <Tag
          icon={isOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={isOnline ? 'success' : 'default'}
          style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12 }}
        >
          {isOnline ? 'ESP32 Trực tuyến' : 'ESP32 Ngoại tuyến'}
        </Tag>
      </div>

      {/* Slots List (A01, A02) */}
      <div style={{ marginBottom: 20 }}>
        <Title level={5} style={{ margin: '0 0 10px', fontWeight: 700 }}>
          Danh sách ngăn tủ (L-001)
        </Title>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {['A01', 'A02'].map((slotCode) => {
            const slotData = slots.find((s) => s.slot_code === slotCode);
            const isEmpty = slotData ? slotData.status.toLowerCase() === 'empty' : true;
            const doorState = deviceStatus?.door_states?.[slotCode] || 'closed';
            const isUnlockingThis = unlockingSlot === slotCode;

            return (
              <div key={slotCode} className="slot-hardware-card">
                <div className="slot-hardware-header">
                  <div>
                    <span className="slot-code-title">Ngăn {slotCode}</span>
                    <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
                      (GPIO {slotCode === 'A01' ? '18/22' : '19/23'})
                    </span>
                  </div>
                  <Tag color={isEmpty ? 'success' : 'orange'} style={{ borderRadius: 6 }}>
                    {isEmpty ? 'Ngăn trống' : 'Đang chứa đồ'}
                  </Tag>
                </div>

                {/* 4 Independent States Metadata */}
                <div className="slot-meta-row">
                  <div className="slot-meta-item">
                    <span className="slot-meta-label">Trạng thái chứa đồ:</span>
                    <span className="slot-meta-val" style={{ color: isEmpty ? '#16a34a' : '#d97706' }}>
                      {isEmpty ? 'Trống (Sẵn sàng)' : 'Có đồ thất lạc'}
                    </span>
                  </div>

                  <div className="slot-meta-item">
                    <span className="slot-meta-label">Cảm biến từ cửa tủ:</span>
                    <span className="slot-meta-val" style={{ color: doorState === 'open' ? '#2563eb' : '#64748b' }}>
                      {doorState === 'open' ? '🚪 Cửa đang MỞ' : '🔒 Cửa đang ĐÓNG'}
                    </span>
                  </div>
                </div>

                {/* Manual Unlock Action */}
                <Popconfirm
                  title={`Xác nhận mở ngăn ${slotCode}?`}
                  description={
                    isSimulation
                      ? 'Hệ thống sẽ thực hiện lệnh mô phỏng mở servo.'
                      : 'Hệ thống sẽ gửi lệnh xoay Servo SG90 trên ESP32.'
                  }
                  onConfirm={() => handleUnlockSlot(slotCode)}
                  okText="Mở ngăn"
                  cancelText="Hủy"
                >
                  <Button
                    type="primary"
                    block
                    icon={<UnlockOutlined />}
                    loading={isUnlockingThis}
                    style={{
                      height: 44,
                      borderRadius: 10,
                      fontWeight: 600,
                      background: isSimulation ? '#f59e0b' : '#2563eb',
                      borderColor: isSimulation ? '#f59e0b' : '#2563eb',
                    }}
                  >
                    {isSimulation ? `Mô phỏng mở ngăn ${slotCode}` : `Mở ngăn ${slotCode} (Servo)`}
                  </Button>
                </Popconfirm>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Commands History */}
      <div className="card-clean" style={{ margin: 0 }}>
        <Title level={5} style={{ margin: '0 0 10px', fontSize: 14 }}>
          Lịch sử lệnh điều khiển gần đây
        </Title>

        {commandHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 13 }}>
            Chưa có lệnh điều khiển nào được ghi lại.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {commandHistory.slice(0, 4).map((cmd) => (
              <div
                key={cmd.id}
                style={{
                  padding: 8,
                  borderRadius: 6,
                  background: '#f8fafc',
                  fontSize: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <span style={{ fontWeight: 600 }}>Mở ngăn {cmd.slot_code}</span>
                  <span style={{ color: '#64748b', marginLeft: 6 }}>
                    ({new Date(cmd.created_at).toLocaleTimeString('vi-VN')})
                  </span>
                </div>
                <Tag
                  color={
                    cmd.status === 'executed'
                      ? 'success'
                      : cmd.status === 'simulated'
                        ? 'warning'
                        : 'processing'
                  }
                  style={{ margin: 0, fontSize: 11 }}
                >
                  {cmd.status === 'executed'
                    ? 'Đã mở thật'
                    : cmd.status === 'simulated'
                      ? 'Mô phỏng'
                      : 'Đang chờ'}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
