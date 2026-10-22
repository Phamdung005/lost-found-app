import React, { useState, useEffect } from 'react';
import {
  Typography,
  Form,
  Input,
  Button,
  Segmented,
  message,
  Select,
  Modal,
  Result,
} from 'antd';
import {
  FileAddOutlined,
  InboxOutlined,
  SendOutlined,
} from '@ant-design/icons';
const API_BASE = '/api';

const { Title, Text } = Typography;

interface UserReportViewProps {
  initialType?: 'lost' | 'found';
  onReportSuccess?: () => void;
}

export const UserReportView: React.FC<UserReportViewProps> = ({
  initialType = 'lost',
  onReportSuccess
}) => {
  const [reportType, setReportType] = useState<'lost' | 'found'>(initialType);
  const [lostForm] = Form.useForm();
  const [foundForm] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [emptySlots, setEmptySlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [successData, setSuccessData] = useState<any | null>(null);

  useEffect(() => {
    setReportType(initialType);
  }, [initialType]);

  // Load empty slots when found item tab is selected
  useEffect(() => {
    if (reportType === 'found') {
      void fetchEmptySlots();
    }
  }, [reportType]);

  const fetchEmptySlots = async () => {
    setLoadingSlots(true);
    try {
      const res = await fetch(`${API_BASE}/lockers/L-001/slots`);
      const data = await res.json();
      if (data.success) {
        const slots = data.data || [];
        const available = slots.filter((s: any) => s.status.toLowerCase() === 'empty');
        setEmptySlots(available);
      }
    } catch (err) {
      console.error('Error fetching slots:', err);
    } finally {
      setLoadingSlots(false);
    }
  };

  // Submit Lost Report
  const handleSubmitLost = async (values: any) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/lost-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tạo báo cáo mất đồ');
      }

      setSuccessData({
        type: 'lost',
        item_name: values.item_name,
        location: values.lost_location,
        message: 'Báo cáo mất đồ của bạn đã được ghi nhận vào hệ thống.',
      });
      lostForm.resetFields();
      if (onReportSuccess) onReportSuccess();
    } catch (err: any) {
      message.error(err.message || 'Gửi báo cáo thất bại, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Found Item Deposit
  const handleSubmitFound = async (values: any) => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/found-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: values.item_name,
          description: values.description,
          found_location: values.found_location,
          locker_code: 'L-001',
          slot_code: values.slot_code,
          finder_contact: values.finder_contact,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể tiếp nhận đồ vật');
      }

      setSuccessData({
        type: 'found',
        item_name: values.item_name,
        slot_code: values.slot_code,
        tracking_code: data.data?.tracking_code,
        message: `Món đồ đã được tiếp nhận thành công vào ngăn ${values.slot_code}. Cửa ngăn tủ đã được kích hoạt mở để cất đồ!`,
      });
      foundForm.resetFields();
      void fetchEmptySlots();
      if (onReportSuccess) onReportSuccess();
    } catch (err: any) {
      message.error(err.message || 'Lưu món đồ thất bại, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
          Báo cáo đồ vật
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Điền thông tin ngắn gọn để hệ thống FindBox hỗ trợ bạn ngay lập tức.
        </Text>
      </div>

      {/* Segmented Switcher */}
      <div style={{ marginBottom: 18 }}>
        <Segmented
          block
          size="large"
          value={reportType}
          onChange={(val) => {
            setReportType(val as 'lost' | 'found');
            setSuccessData(null);
          }}
          options={[
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600 }}>
                  <FileAddOutlined style={{ marginRight: 6 }} /> Báo mất đồ
                </div>
              ),
              value: 'lost',
            },
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600 }}>
                  <InboxOutlined style={{ marginRight: 6 }} /> Báo nhặt được đồ
                </div>
              ),
              value: 'found',
            },
          ]}
          style={{
            background: '#f1f5f9',
            padding: 4,
            borderRadius: 12,
          }}
        />
      </div>

      {/* TAB 1: FORM BÁO MẤT ĐỒ */}
      {reportType === 'lost' && (
        <div className="card-clean" style={{ margin: 0 }}>
          <Form
            form={lostForm}
            layout="vertical"
            onFinish={handleSubmitLost}
            requiredMark={false}
          >
            <Form.Item
              name="item_name"
              label={<span style={{ fontWeight: 600 }}>Tên đồ vật bị mất <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập tên đồ vật' }]}
            >
              <Input placeholder="Ví dụ: Ví da màu nâu, Chìa khóa xe..." size="large" />
            </Form.Item>

            <Form.Item
              name="lost_location"
              label={<span style={{ fontWeight: 600 }}>Khu vực bạn nghi rơi/mất <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập địa điểm bị mất' }]}
            >
              <Input placeholder="Ví dụ: Căn tin tầng 1, Phòng học A302..." size="large" />
            </Form.Item>

            <Form.Item
              name="lost_at"
              label={<span style={{ fontWeight: 600 }}>Thời gian bị mất (nếu nhớ)</span>}
            >
              <Input type="datetime-local" size="large" />
            </Form.Item>

            <Form.Item
              name="description"
              label={<span style={{ fontWeight: 600 }}>Đặc điểm nhận dạng</span>}
            >
              <Input.TextArea
                rows={3}
                placeholder="Màu sắc, móc khóa đính kèm, vết trầy xước đặc trưng..."
              />
            </Form.Item>

            <Form.Item
              name="reporter_contact"
              label={<span style={{ fontWeight: 600 }}>Số điện thoại hoặc Email liên hệ</span>}
            >
              <Input placeholder="Số điện thoại hoặc email của bạn" size="large" />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              icon={<SendOutlined />}
              style={{
                height: 48,
                borderRadius: 12,
                background: '#f97316',
                borderColor: '#f97316',
                fontWeight: 600,
                fontSize: 15,
                marginTop: 6,
              }}
            >
              Gửi báo cáo mất đồ
            </Button>
          </Form>
        </div>
      )}

      {/* TAB 2: FORM BÁO NHẶT ĐƯỢC ĐỒ & GỬI VÀO TỦ */}
      {reportType === 'found' && (
        <div className="card-clean" style={{ margin: 0 }}>
          <Form
            form={foundForm}
            layout="vertical"
            onFinish={handleSubmitFound}
            requiredMark={false}
          >
            <Form.Item
              name="item_name"
              label={<span style={{ fontWeight: 600 }}>Tên đồ vật nhặt được <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập tên đồ vật' }]}
            >
              <Input placeholder="Ví dụ: Thẻ sinh viên, Tai nghe Bluetooth..." size="large" />
            </Form.Item>

            <Form.Item
              name="found_location"
              label={<span style={{ fontWeight: 600 }}>Vị trí bạn nhặt được <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập địa điểm nhặt được' }]}
            >
              <Input placeholder="Ví dụ: Thư viện bàn 12, Ghế đá sân trường..." size="large" />
            </Form.Item>

            <Form.Item
              name="slot_code"
              label={<span style={{ fontWeight: 600 }}>Chọn ngăn tủ cất đồ <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng chọn ngăn tủ' }]}
              extra={
                emptySlots.length === 0 ? (
                  <span style={{ color: '#d97706', fontSize: 12 }}>
                    ⚠️ Hiện tất cả ngăn tủ đang bận hoặc đang bảo trì.
                  </span>
                ) : (
                  <span style={{ color: '#16a34a', fontSize: 12 }}>
                    Có {emptySlots.length} ngăn trống sẵn sàng tiếp nhận.
                  </span>
                )
              }
            >
              <Select
                placeholder="Chọn ngăn tủ trống tại tủ L-001"
                size="large"
                loading={loadingSlots}
                disabled={emptySlots.length === 0}
              >
                {emptySlots.map((slot) => (
                  <Select.Option key={slot.slot_code} value={slot.slot_code}>
                    Ngăn {slot.slot_code} (Trống - Sẵn sàng)
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              name="description"
              label={<span style={{ fontWeight: 600 }}>Mô tả chi tiết (bảo mật)</span>}
            >
              <Input.TextArea
                rows={3}
                placeholder="Mô tả đặc điểm nhận dạng của đồ vật..."
              />
            </Form.Item>

            <Form.Item
              name="finder_contact"
              label={<span style={{ fontWeight: 600 }}>Thông tin người gửi (tùy chọn)</span>}
            >
              <Input placeholder="Số điện thoại hoặc tên người nhặt..." size="large" />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              icon={<InboxOutlined />}
              disabled={emptySlots.length === 0}
              style={{
                height: 48,
                borderRadius: 12,
                background: '#2563eb',
                fontWeight: 600,
                fontSize: 15,
                marginTop: 6,
              }}
            >
              Mở ngăn cất đồ & Hoàn tất
            </Button>
          </Form>
        </div>
      )}

      {/* Success Result Modal */}
      {successData && (
        <Modal
          open={!!successData}
          onCancel={() => setSuccessData(null)}
          footer={null}
          destroyOnClose
          centered
          width={380}
        >
          <Result
            status="success"
            title={
              successData.type === 'lost'
                ? 'Đã ghi nhận báo mất!'
                : 'Đã gửi đồ vào tủ!'
            }
            subTitle={successData.message}
            extra={[
              successData.tracking_code && (
                <div
                  key="track"
                  style={{
                    background: '#f1f5f9',
                    padding: 12,
                    borderRadius: 8,
                    marginBottom: 16,
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>Mã theo dõi món đồ:</Text>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563eb', letterSpacing: 1 }}>
                    {successData.tracking_code}
                  </div>
                </div>
              ),
              <Button
                type="primary"
                key="ok"
                block
                size="large"
                onClick={() => setSuccessData(null)}
                style={{ borderRadius: 10 }}
              >
                Đóng thông báo
              </Button>,
            ]}
          />
        </Modal>
      )}
    </div>
  );
};
