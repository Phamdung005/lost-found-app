import React, { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, Typography, Upload, message } from 'antd';
import { SafetyCertificateOutlined, UploadOutlined } from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';

const { Text, Paragraph } = Typography;

interface ClaimModalProps {
  open: boolean;
  item: any | null;
  onCancel: () => void;
  onSuccess: () => void;
}

export const ClaimModal: React.FC<ClaimModalProps> = ({ open, item, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [images, setImages] = useState<RcFile[]>([]);
  const { token, isAuthenticated } = useAuth();

  const handleSubmit = async (values: any) => {
    if (!isAuthenticated || !token) {
      message.warning('Vui lòng đăng nhập trước khi gửi yêu cầu nhận đồ');
      return;
    }

    setSubmitting(true);
    try {
      let proofImageObjectKeys: string[] = [];
      if (images.length > 0) {
        const uploadBody = new FormData();
        images.forEach((file) => uploadBody.append('images', file));
        const uploadRes = await fetch(`${API_BASE}/uploads/images`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: uploadBody,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.message || 'Không thể tải ảnh bằng chứng lên');
        }
        proofImageObjectKeys = (uploadData.data || []).map(
          (image: { object_key: string }) => image.object_key,
        );
      }

      const res = await fetch(`${API_BASE}/claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          found_item_id: item.id,
          proof_description: values.proof_description,
          proof_contact: values.proof_contact,
          proof_image_object_keys: proofImageObjectKeys,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể gửi yêu cầu nhận đồ');
      }

      message.success('Đã gửi yêu cầu nhận đồ! Quản trị viên sẽ sớm xác minh.');
      form.resetFields();
      setImages([]);
      onSuccess();
      onCancel();
    } catch (err: any) {
      message.error(err.message || 'Gửi yêu cầu thất bại');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return null;

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      title={
        <Space>
          <SafetyCertificateOutlined style={{ color: '#2563eb', fontSize: 20 }} />
          <span style={{ fontWeight: 700 }}>Yêu cầu nhận lại đồ thất lạc</span>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginTop: 4 }}>
        Món đồ: <Text strong>{item.item_name}</Text> ({item.category}) — Nhặt tại{' '}
        <Text strong>{item.found_location}</Text>
      </Paragraph>

      <Alert
        type="warning"
        showIcon
        message="Bảo mật nhận dạng"
        description="Để đảm bảo đồ vật được trao trả đúng chủ nhân, vui lòng cung cấp chi tiết các đặc điểm nhận dạng riêng hoặc giấy tờ chứng minh bên trong."
        style={{ marginBottom: 16 }}
      />

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Form.Item
          name="proof_description"
          label="Mô tả bằng chứng nhận dạng riêng"
          rules={[
            { required: true, message: 'Vui lòng cung cấp mô tả để Admin xác minh' },
            { min: 10, message: 'Mô tả tối thiểu 10 ký tự' },
          ]}
          extra="Ví dụ: Họ tên trên giấy tờ bên trong, màu sắc móc khóa, vết trầy xước đặc biệt..."
        >
          <Input.TextArea rows={4} placeholder="Mô tả chi tiết những gì bên trong hoặc đặc điểm chỉ bạn mới biết..." />
        </Form.Item>

        <Form.Item label="Ảnh bằng chứng (không bắt buộc)" extra="Tối đa 3 ảnh, mỗi ảnh không quá 5 MB.">
          <Upload
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
            onRemove={(file) => setImages((current) => current.filter((image) => image.uid !== file.uid))}
            fileList={images}
          >
            <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
          </Upload>
        </Form.Item>

        <Form.Item
          name="proof_contact"
          label="Số điện thoại hoặc Email liên hệ"
          rules={[{ required: true, message: 'Vui lòng nhập thông tin liên hệ' }]}
        >
          <Input placeholder="0912345678 hoặc email@gmail.com" />
        </Form.Item>

        <Button type="primary" htmlType="submit" size="large" block loading={submitting}>
          Gửi yêu cầu xác minh nhận đồ
        </Button>
      </Form>
    </Modal>
  );
};
