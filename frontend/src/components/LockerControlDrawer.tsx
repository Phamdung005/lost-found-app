import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Card,
  Row,
  Col,
  Tag,
  Button,
  Space,
  Typography,
  Switch,
  Alert,
  Table,
  Badge,
  message,
  Divider,
} from 'antd';
import {
  AppstoreOutlined,
  UnlockOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  WifiOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Text, Title } = Typography;

interface LockerControlDrawerProps {
  open: boolean;
  onClose: () => void;
  onRefreshParent: () => void;
}

import { API_BASE } from '../config/api';

export const LockerControlDrawer: React.FC<LockerControlDrawerProps> = ({
  open,
  onClose,
  onRefreshParent,
}) => {
  const [deviceData, setDeviceData] = useState<any | null>(null);
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [commandIssuing, setCommandIssuing] = useState<string | null>(null);
  const { token } = useAuth();

  const loadStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/device/status`);
      const data = await res.json();
      if (data.success) {
        setDeviceData(data.data);
      }
    } catch (err) {
      console.error('Không thể lấy trạng thái thiết bị:', err);
    }
  };

  const loadCommands = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/device/commands`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setCommands(data.data || []);
      }
    } catch (err) {
      console.error('Không thể lấy lịch sử lệnh:', err);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([loadStatus(), loadCommands()]);
    setLoading(false);
    onRefreshParent();
  };

  useEffect(() => {
    if (open) {
      void refreshAll();
      // Polling cập nhật mỗi 3 giây khi drawer đang mở
      const timer = setInterval(() => {
        void loadStatus();
        void loadCommands();
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [open, token]);

  // Toggle Chế độ Mô phỏng
  const handleToggleSimulation = async (enabled: boolean) => {
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
        await refreshAll();
      }
    } catch {
      message.error('Lỗi khi chuyển đổi chế độ mô phỏng');
    }
  };

  // Gửi lệnh mở ngăn tủ
  const handleOpenSlot = async (slotCode: string) => {
    setCommandIssuing(slotCode);
    try {
      const res = await fetch(`${API_BASE}/device/commands`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slot_code: slotCode,
          command_type: 'OPEN_SLOT',
          duration_ms: 5000,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi lệnh');
      }

      message.success(data.message);

      // Nếu đang bật Chế độ Mô phỏng, tự động gọi simulate-execute sau 1s để giả lập ESP32 phản hồi
      if (deviceData?.locker?.is_simulation_mode && data.data?.command?.id) {
        setTimeout(async () => {
          try {
            await fetch(`${API_BASE}/device/simulate-execute/${data.data.command.id}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
            });
            void refreshAll();
          } catch {
            // ignore
          }
        }, 1000);
      }

      await refreshAll();
    } catch (err: any) {
      message.error(err.message || 'Lỗi gửi lệnh');
    } finally {
      setCommandIssuing(null);
    }
  };

  const locker = deviceData?.locker;
  const slots = deviceData?.slots || [];
  const isOnline = !!locker?.is_online;
  const isSimulation = !!locker?.is_simulation_mode;

  const columns = [
    {
      title: 'Mã lệnh',
      dataIndex: 'id',
      key: 'id',
      render: (id: number, record: any) => (
        <span>
          #{id} {record.is_simulation && <Tag color="warning">MÔ PHỎNG</Tag>}
        </span>
      ),
    },
    {
      title: 'Ngăn',
      dataIndex: 'slot_code',
      key: 'slot_code',
      render: (code: string) => <Tag color="blue">{code}</Tag>,
    },
    {
      title: 'Thao tác',
      dataIndex: 'command_type',
      key: 'command_type',
      render: (type: string) => <Text code>{type}</Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'success') return <Tag color="success" icon={<CheckCircleOutlined />}>Thành công</Tag>;
        if (status === 'executing') return <Tag color="processing" icon={<ClockCircleOutlined />}>Đang thực thi</Tag>;
        if (status === 'pending') return <Tag color="warning" icon={<ClockCircleOutlined />}>Chờ thiết bị</Tag>;
        if (status === 'failed') return <Tag color="error" icon={<CloseCircleOutlined />}>Thất bại</Tag>;
        return <Tag>{status}</Tag>;
      },
    },
    {
      title: 'Kết quả từ ESP32',
      dataIndex: 'result_message',
      key: 'result_message',
      render: (msg: string) => <Text type="secondary" style={{ fontSize: 12 }}>{msg || '—'}</Text>,
    },
    {
      title: 'Thời gian',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t: string) => <Text type="secondary" style={{ fontSize: 11 }}>{new Date(t).toLocaleTimeString('vi-VN')}</Text>,
    },
  ];

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            <ThunderboltOutlined style={{ color: '#2563eb', fontSize: 20 }} />
            <span style={{ fontWeight: 700 }}>Quản lý Tủ & Giám sát IoT (ESP32)</span>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading} size="small">
            Làm mới
          </Button>
        </div>
      }
      placement="right"
      width={980}
      onClose={onClose}
      open={open}
    >
      {/* Banner cảnh báo chế độ mô phỏng */}
      {isSimulation ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="HỆ THỐNG ĐANG BẬT CHẾ ĐỘ MÔ PHỎNG (SIMULATION MODE)"
          description="Các lệnh điều khiển servo sẽ được giả lập thành công để phục vụ thuyết trình / kiểm thử giao diện khi chưa cắm nguồn ESP32 thực tế. Các thao tác đều được đánh dấu [MÔ PHỎNG] rõ ràng."
        />
      ) : (
        <Alert
          type={isOnline ? 'success' : 'error'}
          showIcon
          style={{ marginBottom: 16 }}
          message={isOnline ? 'ESP32 ĐANG KẾT NỐI TRỰC TUYẾN' : 'ESP32 HIỆN ĐANG NGOẠI TUYẾN'}
          description={
            isOnline
              ? `Thiết bị gửi heartbeat gần nhất lúc ${new Date(locker?.last_heartbeat).toLocaleTimeString('vi-VN')}. Lệnh mở ngăn sẽ được truyền ngay lập tức qua Wi-Fi.`
              : 'Thiết bị ESP32 chưa gửi heartbeat hoặc đang mất nguồn. Nếu bạn muốn demo khi chưa có phần cứng, hãy gạt công tắc "Chế độ Mô phỏng" bên dưới.'
          }
        />
      )}

      {/* Thông tin phần cứng & Switch chế độ mô phỏng */}
      <Card style={{ marginBottom: 20, background: '#f8fafc' }}>
        <Row gutter={[16, 16]} align="middle">
          <Col xs={24} sm={14}>
            <Space direction="vertical" size={4}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Text strong style={{ fontSize: 16 }}>Tủ {locker?.locker_code || 'L-001'}</Text>
                <Badge
                  status={isOnline ? 'success' : 'error'}
                  text={isOnline ? 'Online (ESP32)' : 'Offline'}
                />
                {locker?.wifi_rssi && (
                  <Tag icon={<WifiOutlined />} color="cyan">
                    {locker.wifi_rssi} dBm
                  </Tag>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Firmware: {locker?.firmware_version || 'v1.2.0'} · IP: {locker?.ip_address || 'Chưa ghi nhận'} · Chân Servo: GPIO 18 (A01), GPIO 19 (A02)
              </Text>
            </Space>
          </Col>
          <Col xs={24} sm={10} style={{ textAlign: 'right' }}>
            <Space align="center">
              <Text strong style={{ fontSize: 13 }}>Chế độ Mô phỏng:</Text>
              <Switch
                checked={isSimulation}
                onChange={handleToggleSimulation}
                checkedChildren="BẬT"
                unCheckedChildren="TẮT"
              />
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Điều khiển trực tiếp 2 ngăn tủ A01 và A02 */}
      <Title level={5} style={{ marginBottom: 12 }}>
        Bảng điều khiển Servo & Cảm biến cửa từ:
      </Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {slots.map((slot: any) => {
          const isA01 = slot.slot_code === 'A01';
          const gpioPin = isA01 ? 18 : 19;
          const sensorPin = isA01 ? 22 : 23;
          const isDoorOpen = (slot.door_status || '').toLowerCase() === 'open';
          const isEmpty = (slot.occupancy_status || slot.status || '').toLowerCase() === 'empty';

          return (
            <Col xs={24} sm={12} key={slot.id}>
              <Card
                style={{
                  borderTop: `4px solid ${isDoorOpen ? '#f59e0b' : '#22c55e'}`,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Space align="center">
                    <AppstoreOutlined style={{ fontSize: 20, color: '#2563eb' }} />
                    <Text strong style={{ fontSize: 18 }}>Ngăn {slot.slot_code}</Text>
                  </Space>
                  <Space>
                    <Tag color={isEmpty ? 'success' : 'orange'}>
                      {isEmpty ? 'Ngăn trống' : 'Đang chứa đồ'}
                    </Tag>
                    <Tag color={isDoorOpen ? 'warning' : 'green'}>
                      Cửa: {isDoorOpen ? 'ĐANG MỞ' : 'ĐANG ĐÓNG'}
                    </Tag>
                  </Space>
                </div>

                <div style={{ background: '#f1f5f9', padding: 10, borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
                  <div><strong>Điều khiển Servo SG90:</strong> GPIO {gpioPin} (PWM 50Hz)</div>
                  <div><strong>Cảm biến cửa từ:</strong> GPIO {sensorPin} (Reed switch)</div>
                  <div><strong>Cập nhật gần nhất:</strong> {new Date(slot.updated_at).toLocaleTimeString('vi-VN')}</div>
                </div>

                <Button
                  type="primary"
                  block
                  size="large"
                  icon={<UnlockOutlined />}
                  loading={commandIssuing === slot.slot_code}
                  style={{ background: '#2563eb' }}
                  onClick={() => handleOpenSlot(slot.slot_code)}
                >
                  Gửi lệnh mở ngăn {slot.slot_code} (GPIO {gpioPin})
                </Button>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Divider style={{ margin: '16px 0' }} />

      {/* Lịch sử lệnh điều khiển */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Title level={5} style={{ margin: 0 }}>
          Hàng đợi & Lịch sử lệnh điều khiển (locker_commands):
        </Title>
        <Text type="secondary" style={{ fontSize: 12 }}>Tự động làm mới mỗi 3s</Text>
      </div>

      <Table
        columns={columns}
        dataSource={commands}
        rowKey="id"
        size="small"
        pagination={{ pageSize: 6 }}
      />
    </Drawer>
  );
};
