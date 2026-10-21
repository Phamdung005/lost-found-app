import React, { useState, useEffect } from 'react';
import {
  Drawer,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Modal,
  Input,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloseOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Text, Paragraph } = Typography;

interface AdminClaimsDrawerProps {
  open: boolean;
  onClose: () => void;
  onRefreshParent: () => void;
}

const API_BASE = 'http://localhost:3000/api';

export const AdminClaimsDrawer: React.FC<AdminClaimsDrawerProps> = ({
  open,
  onClose,
  onRefreshParent,
}) => {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const { token } = useAuth();

  const loadClaims = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/claims`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setClaims(data.data || []);
      }
    } catch (err) {
      console.error(err);
      message.error('Không thể tải danh sách yêu cầu nhận đồ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadClaims();
    }
  }, [open, token]);

  const handleVerify = async (claimId: number, action: 'approve' | 'reject', reason?: string) => {
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE}/claims/${claimId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          rejection_reason: reason,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Xử lý thất bại');
      }

      message.success(data.message);
      setRejectModalOpen(false);
      setRejectReason('');
      setSelectedClaimId(null);
      await loadClaims();
      onRefreshParent();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi xác minh');
    } finally {
      setProcessing(false);
    }
  };

  const columns = [
    {
      title: 'Món đồ',
      dataIndex: 'item_name',
      key: 'item_name',
      render: (text: string, record: any) => (
        <div>
          <Text strong>{text}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Khu vực: {record.found_location} · Ngăn: {record.slot_code || 'Chưa gửi tủ'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Người yêu cầu',
      key: 'user',
      render: (_: any, record: any) => (
        <div>
          <Text strong>{record.user_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.user_email} · {record.proof_contact || record.user_phone || 'Không có SĐT'}
          </Text>
        </div>
      ),
    },
    {
      title: 'Đối chiếu nhận dạng',
      key: 'comparison',
      render: (_: any, record: any) => (
        <div style={{ maxWidth: 300 }}>
          <div style={{ marginBottom: 4 }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              Bằng chứng người dùng khai:
            </Text>
            <br />
            <Text strong style={{ color: '#2563eb' }}>{record.proof_description}</Text>
          </div>
          {record.item_secret_description && (
            <div style={{ background: '#f1f5f9', padding: 6, borderRadius: 4 }}>
              <Text type="secondary" style={{ fontSize: 11 }}>
                Mô tả kín lúc nhặt được:
              </Text>
              <br />
              <Text italic>{record.item_secret_description}</Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: any) => {
        if (status === 'pending') return <Tag color="processing">Chờ duyệt</Tag>;
        if (status === 'approved')
          return (
            <div>
              <Tag color="success">Đã cấp mã: {record.claim_code}</Tag>
              <div style={{ fontSize: 10, color: '#64748b' }}>
                Hết hạn: {new Date(record.code_expires_at).toLocaleTimeString('vi-VN')}
              </div>
            </div>
          );
        if (status === 'completed') return <Tag color="default">Đã nhận xong</Tag>;
        if (status === 'rejected') return <Tag color="error">Đã từ chối</Tag>;
        return <Tag>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_: any, record: any) => {
        if (record.status !== 'pending') {
          return <Text type="secondary">—</Text>;
        }

        return (
          <Space>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              loading={processing}
              onClick={() => handleVerify(record.id, 'approve')}
            >
              Duyệt & Cấp OTP
            </Button>
            <Button
              danger
              size="small"
              icon={<CloseOutlined />}
              onClick={() => {
                setSelectedClaimId(record.id);
                setRejectModalOpen(true);
              }}
            >
              Từ chối
            </Button>
          </Space>
        );
      },
    },
  ];

  return (
    <>
      <Drawer
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              <SafetyCertificateOutlined style={{ color: '#2563eb', fontSize: 20 }} />
              <span style={{ fontWeight: 700 }}>Xác minh yêu cầu nhận đồ (Admin)</span>
            </Space>
            <Button icon={<ReloadOutlined />} onClick={loadClaims} loading={loading} size="small">
              Làm mới
            </Button>
          </div>
        }
        placement="right"
        width={950}
        onClose={onClose}
        open={open}
      >
        <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
          Đối chiếu bằng chứng do người yêu cầu cung cấp với mô tả bí mật lúc nhặt đồ để quyết định cấp mã OTP nhận đồ.
        </Paragraph>

        <Table
          columns={columns}
          dataSource={claims}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 6 }}
        />
      </Drawer>

      <Modal
        title="Từ chối yêu cầu nhận đồ"
        open={rejectModalOpen}
        onCancel={() => {
          setRejectModalOpen(false);
          setRejectReason('');
          setSelectedClaimId(null);
        }}
        onOk={() => {
          if (selectedClaimId) {
            void handleVerify(selectedClaimId, 'reject', rejectReason);
          }
        }}
        okText="Xác nhận từ chối"
        okButtonProps={{ danger: true, loading: processing }}
        cancelText="Hủy"
      >
        <Paragraph type="secondary">
          Vui lòng nhập lý do từ chối để thông báo đến người gửi yêu cầu:
        </Paragraph>
        <Input.TextArea
          rows={3}
          placeholder="Ví dụ: Đặc điểm nhận dạng không khớp với đồ vật được tìm thấy..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </>
  );
};
