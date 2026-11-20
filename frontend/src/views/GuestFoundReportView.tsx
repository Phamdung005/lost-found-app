import React, { useState } from 'react';
import { Alert, Button, Card, Form, Input, Result, Select, Typography, DatePicker, message } from 'antd';
import { InboxOutlined, SendOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { API_BASE } from '../config/api';

const { Title, Text } = Typography;

export const GuestFoundReportView: React.FC = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<any | null>(null);

  const submit = async (values: any) => {
    setSubmitting(true);
    try {
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
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Không thể gửi thông tin');
      setSuccessData(data.data);
      form.resetFields();
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
        <Text type="secondary">Không cần đăng nhập. Hãy để lại thông tin để FindBox hỗ trợ tìm chủ nhân.</Text>
      </div>
      <Alert
        showIcon
        type="info"
        icon={<InboxOutlined />}
        message="Đây là biểu mẫu công khai dành cho khách"
        description="Biểu mẫu chỉ ghi nhận thông tin; không tự mở ngăn tủ hoặc yêu cầu quyền truy cập tài khoản."
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
          <Form.Item name="found_at" label="Thời gian nhặt được">
            <DatePicker showTime size="large" style={{ width: '100%' }} format="DD/MM/YYYY HH:mm" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả nhận dạng kín">
            <Input.TextArea rows={3} placeholder="Đặc điểm chỉ chủ nhân thật sự biết..." />
          </Form.Item>
          <Form.Item name="finder_contact" label="Thông tin liên hệ (khuyến nghị)">
            <Input size="large" placeholder="Số điện thoại, email hoặc tên của bạn" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={submitting} icon={<SendOutlined />}>
            Gửi thông tin món đồ
          </Button>
        </Form>
      </Card>
    </div>
  );
};
