import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Form, Input, Result, Select, Typography, DatePicker, message, Upload } from 'antd';
import { InboxOutlined, SendOutlined, SafetyCertificateOutlined, PictureOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { API_BASE } from '../config/api';
import type { RcFile } from 'antd/es/upload';

const { Title, Text } = Typography;

export const GuestFoundReportView: React.FC = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [emptySlots, setEmptySlots] = useState<any[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [images, setImages] = useState<RcFile[]>([]);

  useEffect(() => {
    const loadSlots = async () => {
      setLoadingSlots(true);
      try {
        const response = await fetch(`${API_BASE}/lockers/L-001/slots`);
        const data = await response.json();
        if (data.success) {
          setEmptySlots((data.data || []).filter((slot: any) =>
            (slot.occupancy_status || slot.status || '').toLowerCase() === 'empty' && slot.hardware_enabled !== false,
          ));
        }
      } finally {
        setLoadingSlots(false);
      }
    };
    void loadSlots();
  }, []);

  const submit = async (values: any) => {
    setSubmitting(true);
    try {
      let imageObjectKeys: string[] = [];
      if (images.length > 0) {
        const uploadBody = new FormData();
        images.forEach((file) => uploadBody.append('images', file));
        const uploadResponse = await fetch(`${API_BASE}/uploads/images`, { method: 'POST', body: uploadBody });
        const uploadData = await uploadResponse.json();
        if (!uploadResponse.ok || !uploadData.success) throw new Error(uploadData.message || 'Không thể tải ảnh lên');
        imageObjectKeys = (uploadData.data || []).map((image: any) => image.object_key);
      }
      const response = await fetch(`${API_BASE}/found-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name: values.item_name,
          category: values.category || 'other',
          description: values.description,
          found_location: values.found_location,
          found_at: values.found_at?.toISOString() || new Date().toISOString(),
          finder_contact: values.finder_contact,
          locker_code: 'L-001',
          slot_code: values.slot_code,
          image_object_keys: imageObjectKeys,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Không thể gửi thông tin');
      setSuccessData(data.data);
      form.resetFields();
      setImages([]);
    } catch (error: any) {
      message.error(error.message || 'Gửi thông tin thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div style={{ width: '100%', maxWidth: 560, padding: 24 }}>
        <Result
          status="success"
          icon={<InboxOutlined />}
          title="Đã ghi nhận món đồ nhặt được"
          subTitle="Admin sẽ kiểm tra và liên hệ khi tìm thấy chủ nhân."
          extra={<Card><Text>Mã theo dõi: </Text><Text strong copyable>{successData.tracking_code}</Text></Card>}
        />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 560, padding: '28px 20px 40px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, margin: '0 auto 12px', borderRadius: 16, background: '#2563eb', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 28 }}>
          <SafetyCertificateOutlined />
        </div>
        <Title level={3} style={{ margin: 0 }}>Báo nhặt được đồ</Title>
        <Text type="secondary">Không cần đăng nhập. Điền thông tin, chọn ngăn trống và cất món đồ vào tủ.</Text>
      </div>
      <Alert
        showIcon
        type="info"
        icon={<InboxOutlined />}
        message="Đây là biểu mẫu công khai dành cho khách"
        description="Sau khi gửi, ngăn trống sẽ được mở để bạn cất món đồ. Hãy đóng cửa tủ sau khi hoàn tất."
        style={{ marginBottom: 16 }}
      />
      <Card>
        <Form form={form} layout="vertical" onFinish={submit} requiredMark={false} initialValues={{ found_at: dayjs() }}>
          <Form.Item name="item_name" label="Tên món đồ" rules={[{ required: true, message: 'Vui lòng nhập tên món đồ' }]}>
            <Input size="large" placeholder="Ví dụ: Ví da màu nâu" />
          </Form.Item>
          <Form.Item name="category" label="Danh mục" initialValue="other">
            <Select size="large" options={[
              { value: 'wallet', label: 'Ví tiền / Bóp' },
              { value: 'electronics', label: 'Thiết bị điện tử' },
              { value: 'keys', label: 'Chìa khóa / Thẻ' },
              { value: 'documents', label: 'Giấy tờ' },
              { value: 'clothing', label: 'Trang phục' },
              { value: 'other', label: 'Khác' },
            ]} />
          </Form.Item>
          <Form.Item name="found_location" label="Địa điểm nhặt được" rules={[{ required: true, message: 'Vui lòng nhập địa điểm' }]}>
            <Input size="large" placeholder="Ví dụ: sảnh thư viện, tầng 1" />
          </Form.Item>
          <Form.Item
            name="slot_code"
            label="Chọn ngăn trống để cất đồ"
            rules={[{ required: true, message: 'Vui lòng chọn ngăn trống' }]}
            extra={emptySlots.length ? `Có ${emptySlots.length} ngăn trống sẵn sàng` : 'Hiện không có ngăn trống'}
          >
            <Select
              size="large"
              loading={loadingSlots}
              disabled={emptySlots.length === 0}
              placeholder="Chọn ngăn tủ L-001"
              options={emptySlots.map((slot) => ({ value: slot.slot_code, label: `Ngăn ${slot.slot_code} (Trống)` }))}
            />
          </Form.Item>
          <Form.Item name="found_at" label="Thời gian nhặt được">
            <DatePicker showTime size="large" style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhận dạng kín">
            <Input.TextArea rows={3} placeholder="Đặc điểm chỉ chủ nhân thật sự biết..." />
          </Form.Item>
          <Form.Item name="finder_contact" label="Thông tin liên hệ (khuyến nghị)">
            <Input size="large" placeholder="Số điện thoại, email hoặc tên của bạn" />
          </Form.Item>
          <Form.Item label="Ảnh món đồ (không bắt buộc)" extra="Tối đa 3 ảnh, mỗi ảnh không quá 5 MB.">
            <Upload
              listType="picture-card"
              accept="image/jpeg,image/png,image/webp"
              multiple
              maxCount={3}
              beforeUpload={(file) => {
                if (file.size > 5 * 1024 * 1024) {
                  message.error('Mỗi ảnh không được vượt quá 5 MB');
                  return Upload.LIST_IGNORE;
                }
                setImages((current) => [...current, file].slice(0, 3));
                return false;
              }}
              onRemove={(file) => setImages((current) => current.filter((item) => item.uid !== file.uid))}
            >
              <PictureOutlined />
              <div style={{ marginTop: 8 }}>Chọn ảnh</div>
            </Upload>
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting} disabled={emptySlots.length === 0} icon={<SendOutlined />}>
            Mở ngăn và cất món đồ
          </Button>
        </Form>
      </Card>
    </div>
  );
};
