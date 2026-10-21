import React, { useState, useEffect } from 'react';
import {
  Modal,
  Form,
  Input,
  Select,
  DatePicker,
  Button,
  Radio,
  Space,
  Typography,
  message,
  Alert,
  Card,
  Tag,
} from 'antd';
import {
  InboxOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Text, Paragraph, Title } = Typography;
const { Option } = Select;

interface DepositItemModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const API_BASE = 'http://localhost:3000/api';

export const DepositItemModal: React.FC<DepositItemModalProps> = ({ open, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [depositType, setDepositType] = useState<'locker' | 'online_only'>('locker');
  const [emptySlots, setEmptySlots] = useState<any[]>([]);
  const [successData, setSuccessData] = useState<any | null>(null);

  // Lấy danh sách các ngăn tủ còn trống
  const loadAvailableSlots = async () => {
    try {
      const res = await fetch(`${API_BASE}/lockers/L-001/slots`);
      const data = await res.json();
      if (data.success && data.data) {
        const empties = data.data.filter(
          (s: any) => (s.occupancy_status || s.status || '').toLowerCase() === 'empty'
        );
        setEmptySlots(empties);
        if (empties.length > 0) {
          form.setFieldValue('slot_id', empties[0].id);
        }
      }
    } catch (err) {
      console.error('Không thể lấy danh sách ngăn tủ:', err);
    }
  };

  useEffect(() => {
    if (open) {
      setSuccessData(null);
      form.resetFields();
      void loadAvailableSlots();
    }
  }, [open]);

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        item_name: values.item_name,
        category: values.category || 'other',
        description: values.description,
        found_location: values.found_location,
        found_at: values.found_at ? values.found_at.toISOString() : new Date().toISOString(),
        finder_contact: values.finder_contact,
        image_url: values.image_url,
        slot_id: depositType === 'locker' ? values.slot_id : null,
      };

      const res = await fetch(`${API_BASE}/found-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể ghi nhận đồ nhặt được');
      }

      message.success(data.message);
      setSuccessData(data.data);
      onSuccess();
    } catch (error: any) {
      message.error(error.message || 'Gửi thông tin thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={() => {
        setSuccessData(null);
        onCancel();
      }}
      footer={null}
      destroyOnClose
      width={600}
      title={
        <Space>
          <InboxOutlined style={{ color: '#2563eb', fontSize: 22 }} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Gửi đồ thất lạc tìm thấy</span>
        </Space>
      }
    >
      {successData ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 48, color: '#22c55e', marginBottom: 16 }} />
          <Title level={4} style={{ marginBottom: 4 }}>
            {successData.slot_id ? 'Đã tiếp nhận đồ vào ngăn tủ thành công!' : 'Đã ghi nhận thông tin đồ nhặt được!'}
          </Title>
          <Paragraph type="secondary">
            Cảm ơn bạn đã hỗ trợ tìm lại đồ cho người khác.
          </Paragraph>

          <Card style={{ background: '#f8fafc', margin: '20px 0', textAlign: 'left' }}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <div>
                <Text type="secondary">Mã biên nhận (Tracking Code):</Text>
                <br />
                <Tag color="blue" style={{ fontSize: 16, padding: '4px 10px', marginTop: 4 }}>
                  {successData.tracking_code}
                </Tag>
              </div>

              <div>
                <Text type="secondary">Món đồ:</Text> <Text strong>{successData.item_name}</Text>
              </div>

              {successData.slot_id ? (
                <Alert
                  type="success"
                  showIcon
                  message={
                    <span>
                      Vui lòng cất đồ vào <strong>Ngăn A01/A02</strong> và đóng chặt cửa tủ. Ngăn đã được khóa an toàn.
                    </span>
                  }
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  message="Thông tin đã được đăng công khai tối thiểu để người mất tìm kiếm."
                />
              )}
            </Space>
          </Card>

          <Button type="primary" size="large" onClick={() => onCancel()} block>
            Hoàn tất
          </Button>
        </div>
      ) : (
        <div>
          <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
            Người nhặt được đồ có thể đăng thông tin và trực tiếp gửi đồ vào ngăn tủ thông minh FindBox để bảo quản an toàn.
          </Paragraph>

          <Form form={form} layout="vertical" onFinish={handleSubmit}>
            <Form.Item
              name="item_name"
              label="Tên món đồ"
              rules={[{ required: true, message: 'Vui lòng nhập tên món đồ' }]}
            >
              <Input placeholder="Ví dụ: Ví da Tommy Hilfiger màu đen" size="large" />
            </Form.Item>

            <Form.Item name="category" label="Danh mục đồ vật" initialValue="wallet">
              <Select size="large">
                <Option value="wallet">Ví tiền, Bóp, Túi xách</Option>
                <Option value="electronics">Điện thoại, Laptop, Tai nghe</Option>
                <Option value="keys">Chùm chìa khóa, Thẻ từ</Option>
                <Option value="documents">Giấy tờ tùy thân, CCCD, Thẻ SV</Option>
                <Option value="clothing">Áo khoác, Mũ, Phụ kiện</Option>
                <Option value="other">Đồ vật khác</Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="found_location"
              label="Địa điểm nhặt được"
              rules={[{ required: true, message: 'Vui lòng nhập vị trí nhặt được' }]}
            >
              <Input prefix={<EnvironmentOutlined />} placeholder="Ví dụ: Căn tin tầng 1, Tòa nhà A" size="large" />
            </Form.Item>

            <Form.Item name="found_at" label="Thời gian nhặt được" initialValue={dayjs()}>
              <DatePicker showTime format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} size="large" />
            </Form.Item>

            <Form.Item
              name="description"
              label="Đặc điểm nhận dạng (Bí mật - Dùng đối chiếu)"
              extra="Mô tả này sẽ được giữ kín, chỉ dùng để Admin đối chiếu khi có người đến nhận đồ."
            >
              <Input.TextArea
                rows={3}
                placeholder="Ví dụ: Bên trong có CCCD tên Nguyễn Văn A, số đuôi điện thoại 888..."
              />
            </Form.Item>

            <Form.Item name="finder_contact" label="Thông tin liên hệ của bạn (Tùy chọn)">
              <Input prefix={<PhoneOutlined />} placeholder="Số điện thoại hoặc Email để liên hệ khi cần" size="large" />
            </Form.Item>

            <div style={{ marginBottom: 16 }}>
              <Text strong>Hình thức gửi đồ:</Text>
              <Radio.Group
                value={depositType}
                onChange={(e) => setDepositType(e.target.value)}
                style={{ marginTop: 8, display: 'block' }}
              >
                <Space orientation="vertical">
                  <Radio value="locker">
                    Gửi trực tiếp vào ngăn tủ thông minh FindBox (L-001)
                  </Radio>
                  <Radio value="online_only">
                    Chỉ đăng tin báo tìm thấy trên hệ thống (giữ đồ tại chỗ)
                  </Radio>
                </Space>
              </Radio.Group>
            </div>

            {depositType === 'locker' && (
              <Form.Item
                name="slot_id"
                label="Chọn ngăn tủ còn trống"
                rules={[{ required: true, message: 'Vui lòng chọn ngăn tủ' }]}
              >
                {emptySlots.length > 0 ? (
                  <Select size="large">
                    {emptySlots.map((s) => (
                      <Option key={s.id} value={s.id}>
                        Ngăn {s.slot_code} — Tủ {s.locker_code} (Trống)
                      </Option>
                    ))}
                  </Select>
                ) : (
                  <Alert
                    type="warning"
                    showIcon
                    message="Hiện các ngăn tủ A01, A02 đều đang bận. Vui lòng chọn hình thức Chỉ đăng tin báo tìm thấy."
                  />
                )}
              </Form.Item>
            )}

            <Button
              type="primary"
              htmlType="submit"
              size="large"
              block
              loading={submitting}
              disabled={depositType === 'locker' && emptySlots.length === 0}
            >
              {depositType === 'locker' ? 'Xác nhận cất đồ vào ngăn tủ' : 'Đăng thông tin đồ nhặt được'}
            </Button>
          </Form>
        </div>
      )}
    </Modal>
  );
};
