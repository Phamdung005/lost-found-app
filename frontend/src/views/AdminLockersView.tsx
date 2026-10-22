import React, { useState, useEffect } from 'react';
import {
  Typography,
  Tag,
  Button,
  message,
  Popconfirm,
  Modal,
  Input,
  Space,
} from 'antd';
import {
  UnlockOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const { Title, Text } = Typography;

export const AdminLockersView: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [commandHistory, setCommandHistory] = useState<any[]>([]);
  const [unlockingSlot, setUnlockingSlot] = useState<string | null>(null);

  // Modal thêm ngăn tủ
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newSlotCode, setNewSlotCode] = useState('');
  const [addingSlot, setAddingSlot] = useState(false);

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

  // Gợi ý mã ngăn tiếp theo khi mở modal
  const handleOpenAddModal = () => {
    const nextNum = (slots.length + 1).toString().padStart(2, '0');
    setNewSlotCode(`A${nextNum}`);
    setAddModalOpen(true);
  };

  // 1. Thêm ngăn tủ
  const handleAddSlot = async () => {
    if (!newSlotCode.trim()) {
      message.error('Vui lòng nhập mã ngăn tủ (ví dụ A03)');
      return;
    }
    setAddingSlot(true);
    try {
      const res = await fetch(`${API_BASE}/lockers/L-001/slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ slot_code: newSlotCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi tạo ngăn tủ');
      }
      message.success(data.message || 'Đã thêm ngăn tủ mới thành công!');
      setAddModalOpen(false);
      await fetchLockerData();
    } catch (err: any) {
      message.error(err.message || 'Không thể tạo ngăn tủ');
    } finally {
      setAddingSlot(false);
    }
  };

  // 2. Xóa ngăn tủ
  const handleDeleteSlot = async (slotId: number, slotCode: string) => {
    try {
      const res = await fetch(`${API_BASE}/lockers/slots/${slotId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi xóa ngăn');
      }
      message.success(data.message || `Đã xóa ngăn ${slotCode}`);
      await fetchLockerData();
    } catch (err: any) {
      message.error(err.message || 'Không thể xóa ngăn tủ');
    }
  };

  // 3. Đổi trạng thái bảo trì
  const handleToggleMaintenance = async (slotId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'maintenance' ? 'empty' : 'maintenance';
    try {
      const res = await fetch(`${API_BASE}/lockers/slots/${slotId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Lỗi khi đổi trạng thái');
      }
      message.success(data.message);
      await fetchLockerData();
    } catch (err: any) {
      message.error(err.message || 'Không thể cập nhật trạng thái');
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

  const isOnline = Boolean(deviceStatus?.is_online ?? deviceStatus?.locker?.is_online);
  const lastHeartbeat =
    deviceStatus?.last_heartbeat ??
    deviceStatus?.locker?.last_heartbeat ??
    deviceStatus?.last_seen_at;
  const ipAddress = deviceStatus?.ip_address ?? deviceStatus?.locker?.ip_address;
  const wifiRssi = deviceStatus?.wifi_rssi ?? deviceStatus?.locker?.wifi_rssi;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            Quản lý Tủ & Ngăn IoT
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tủ thông minh L-001 (Điều khiển servo & cảm biến cửa phần cứng).
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

      {/* Device Connection Status Bar */}
      <div
        className="card-clean"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          background: '#ffffff',
          borderLeft: isOnline ? '4px solid #16a34a' : '4px solid #94a3b8',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
            Trạng thái kết nối Phần cứng ESP32:
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {lastHeartbeat
              ? `Nhịp tim gần nhất: ${new Date(lastHeartbeat).toLocaleTimeString('vi-VN')} (${new Date(lastHeartbeat).toLocaleDateString('vi-VN')})${ipAddress ? ` • IP: ${ipAddress}` : ''}${wifiRssi ? ` • Sóng: ${wifiRssi}dBm` : ''}`
              : 'Chưa nhận được tín hiệu heartbeat từ ESP32'}
          </div>
        </div>
        <Tag
          icon={isOnline ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
          color={isOnline ? 'success' : 'default'}
          style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600 }}
        >
          {isOnline ? 'ESP32 Trực tuyến' : 'ESP32 Ngoại tuyến'}
        </Tag>
      </div>

      {/* Slots List Header + Add Slot Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
            Danh sách ngăn tủ (L-001)
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            Tổng cộng: {slots.length} ngăn
          </Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={handleOpenAddModal}
          style={{ borderRadius: 8, background: '#16a34a', borderColor: '#16a34a', fontWeight: 600 }}
        >
          Thêm ngăn mới
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
        {slots.length === 0 && (
          <div className="card-clean" style={{ textAlign: 'center', color: '#94a3b8', padding: '24px 0' }}>
            Chưa có ngăn tủ nào. Bấm nút "Thêm ngăn mới" ở trên để tạo ngăn đầu tiên.
          </div>
        )}

        {slots.map((slot) => {
          const slotCode = slot.slot_code;
          const status = slot.occupancy_status || slot.status || 'empty';
          const isOccupied = status === 'occupied';
          const isMaintenance = status === 'maintenance';
          const isEmpty = status === 'empty';
          const doorState = deviceStatus?.door_states?.[slotCode] || slot.door_status || 'closed';
          const isUnlockingThis = unlockingSlot === slotCode;

          return (
            <div
              key={slot.id || slotCode}
              className="slot-hardware-card"
              style={{
                borderLeft: isMaintenance
                  ? '4px solid #ef4444'
                  : isOccupied
                  ? '4px solid #f59e0b'
                  : '4px solid #10b981',
              }}
            >
              <div
                className="slot-hardware-header"
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="slot-code-title">Ngăn {slotCode}</span>
                  {isOccupied && <Tag color="warning">Có đồ</Tag>}
                  {isEmpty && <Tag color="success">Trống</Tag>}
                  {isMaintenance && <Tag color="error">Bảo trì</Tag>}
                </div>

                {/* Quản lý ngăn: Nút Đổi Bảo trì & Nút Xóa ngăn */}
                <Space size="small">
                  <Button
                    size="small"
                    type="text"
                    icon={<ToolOutlined />}
                    onClick={() => handleToggleMaintenance(slot.id, status)}
                    style={{ fontSize: 12, color: isMaintenance ? '#16a34a' : '#f59e0b' }}
                  >
                    {isMaintenance ? 'Bỏ bảo trì' : 'Bảo trì'}
                  </Button>

                  <Popconfirm
                    title={`Xác nhận xóa ngăn ${slotCode}?`}
                    description={
                      isOccupied
                        ? 'Ngăn đang chứa đồ, không thể xóa!'
                        : 'Ngăn này sẽ được xóa vĩnh viễn khỏi tủ L-001.'
                    }
                    disabled={isOccupied}
                    onConfirm={() => handleDeleteSlot(slot.id, slotCode)}
                    okText="Xóa ngăn"
                    cancelText="Hủy"
                    okButtonProps={{ danger: true }}
                  >
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      disabled={isOccupied}
                      title={isOccupied ? 'Ngăn đang có đồ, không thể xóa' : 'Xóa ngăn'}
                    />
                  </Popconfirm>
                </Space>
              </div>

              {/* Thông tin trạng thái */}
              <div className="slot-meta-row">
                <div className="slot-meta-item">
                  <span className="slot-meta-label">Trạng thái:</span>
                  <span
                    className="slot-meta-val"
                    style={{
                      color: isMaintenance ? '#ef4444' : isOccupied ? '#d97706' : '#16a34a',
                    }}
                  >
                    {isMaintenance ? 'Đang bảo trì' : isOccupied ? 'Có đồ thất lạc' : 'Trống (Sẵn sàng)'}
                  </span>
                </div>

                <div className="slot-meta-item">
                  <span className="slot-meta-label">Cảm biến cửa:</span>
                  <span
                    className="slot-meta-val"
                    style={{ color: doorState === 'open' ? '#2563eb' : '#64748b' }}
                  >
                    {doorState === 'open' ? 'Cửa đang MỞ' : 'Cửa đang ĐÓNG'}
                  </span>
                </div>
              </div>

              {/* Nút Mở khóa Servo */}
              <Popconfirm
                title={`Xác nhận mở ngăn ${slotCode}?`}
                description="Hệ thống sẽ gửi lệnh xoay Servo SG90 trên ESP32 để mở chốt."
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
                    height: 42,
                    borderRadius: 10,
                    fontWeight: 600,
                    background: '#2563eb',
                    borderColor: '#2563eb',
                  }}
                >
                  Mở ngăn {slotCode} (Servo)
                </Button>
              </Popconfirm>
            </div>
          );
        })}
      </div>

      {/* Modal Thêm ngăn tủ mới (Giao diện cực kỳ đơn giản) */}
      <Modal
        title={
          <Space>
            <PlusOutlined style={{ color: '#16a34a' }} />
            <span>Thêm ngăn tủ mới vào Tủ L-001</span>
          </Space>
        }
        open={addModalOpen}
        onCancel={() => setAddModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setAddModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="submit"
            type="primary"
            loading={addingSlot}
            onClick={handleAddSlot}
            style={{ background: '#16a34a', borderColor: '#16a34a' }}
          >
            Tạo ngăn tủ
          </Button>,
        ]}
      >
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 14 }}>
          Hệ thống sẽ tự động tạo ngăn mới ở trạng thái <b>Trống</b> sẵn sàng chứa đồ.
        </p>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
            Mã ngăn tủ:
          </label>
          <Input
            value={newSlotCode}
            onChange={(e) => setNewSlotCode(e.target.value)}
            placeholder="Ví dụ: A03, A04..."
            size="large"
            style={{ borderRadius: 8 }}
          />
        </div>
      </Modal>

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
