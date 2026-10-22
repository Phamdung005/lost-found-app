import React from 'react';
import { Modal, Typography, Space, Button, Card, Steps, Tag } from 'antd';
import {
  AppleOutlined,
  ShareAltOutlined,
  PlusSquareOutlined,
  MobileOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface PWAInstallGuideModalProps {
  open: boolean;
  onCancel: () => void;
}

export const PWAInstallGuideModal: React.FC<PWAInstallGuideModalProps> = ({ open, onCancel }) => {
  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="close" type="primary" size="large" onClick={onCancel} block>
          Đã hiểu, đóng hướng dẫn
        </Button>,
      ]}
      width={560}
      centered
      title={
        <Space align="center">
          <AppleOutlined style={{ fontSize: 24, color: '#000000' }} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Cài đặt FindBox lên iPhone (PWA)</span>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        Thêm ứng dụng vào Màn hình chính iPhone để sử dụng với trải nghiệm mượt mà toàn màn hình, không có thanh địa chỉ trình duyệt.
      </Paragraph>

      <Card style={{ background: '#f8fafc', marginBottom: 20 }}>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: <Text strong>Bước 1: Mở trình duyệt Safari</Text>,
              description: 'Truy cập vào liên kết trang web FindBox bằng trình duyệt Safari mặc định trên iPhone.',
              icon: <AppleOutlined style={{ color: '#2563eb' }} />,
            },
            {
              title: <Text strong>Bước 2: Bấm nút Chia sẻ (Share)</Text>,
              description: (
                <span>
                  Tìm biểu tượng <strong>Chia sẻ</strong> <ShareAltOutlined style={{ color: '#2563eb' }} /> (hình vuông có mũi tên hướng lên) ở thanh menu dưới cùng của Safari.
                </span>
              ),
              icon: <ShareAltOutlined style={{ color: '#2563eb' }} />,
            },
            {
              title: <Text strong>Bước 3: Chọn "Thêm vào MH chính"</Text>,
              description: (
                <span>
                  Cuộn xuống danh sách tùy chọn và nhấn vào dòng <Tag color="blue" icon={<PlusSquareOutlined />}>Thêm vào MH chính</Tag> (Add to Home Screen).
                </span>
              ),
              icon: <PlusSquareOutlined style={{ color: '#2563eb' }} />,
            },
            {
              title: <Text strong>Bước 4: Bấm "Thêm" (Add)</Text>,
              description: 'Xác nhận tên ứng dụng "FindBox" và nhấn nút Thêm ở góc trên bên phải màn hình.',
              icon: <CheckCircleOutlined style={{ color: '#22c55e' }} />,
            },
          ]}
        />
      </Card>

      <div style={{ background: '#eff6ff', padding: 12, borderRadius: 8, textAlign: 'center' }}>
        <Space align="center">
          <MobileOutlined style={{ color: '#2563eb', fontSize: 20 }} />
          <Text style={{ fontSize: 13, color: '#1e40af' }}>
            Biểu tượng FindBox sẽ xuất hiện ngay trên màn hình iPhone như một ứng dụng độc lập!
          </Text>
        </Space>
      </div>
    </Modal>
  );
};
