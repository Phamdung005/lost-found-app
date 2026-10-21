import React, { useState, useEffect } from 'react';
import {
  Modal,
  List,
  Tag,
  Typography,
  Space,
  Button,
  Card,
  Input,
  message,
  Alert,
  Divider,
} from 'antd';
import {
  KeyOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Text, Paragraph, Title } = Typography;

interface MyClaimsModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const API_BASE = 'http://localhost:3000/api';

export const MyClaimsModal: React.FC<MyClaimsModalProps> = ({ open, onCancel, onSuccess }) => {
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [redeemClaimId, setRedeemClaimId] = useState<number | null>(null);
  const [inputOtp, setInputOtp] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const { token } = useAuth();

  const loadMyClaims = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/claims/my`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setClaims(data.data || []);
      }
    } catch (err) {
      console.error(err);
      message.error('Không thể tải danh sách yêu cầu của bạn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      void loadMyClaims();
      setRedeemClaimId(null);
      setInputOtp('');
    }
  }, [open, token]);

  const handleRedeem = async (claimId: number, otpCode: string) => {
    if (!otpCode || otpCode.trim().length !== 6) {
      message.warning('Mã nhận đồ phải gồm 6 chữ số');
      return;
    }

    setRedeeming(true);
    try {
      const res = await fetch(`${API_BASE}/claims/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          claim_id: claimId,
          claim_code: otpCode.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Xác thực mã nhận đồ thất bại');
      }

      message.success(data.message);
      setRedeemClaimId(null);
      setInputOtp('');
      await loadMyClaims();
      onSuccess();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi mở tủ nhận đồ');
    } finally {
      setRedeeming(false);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <Tag icon={<ClockCircleOutlined />} color="processing">
            Chờ xác minh
          </Tag>
        );
      case 'approved':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            Đã duyệt — Có mã nhận đồ
          </Tag>
        );
      case 'rejected':
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            Đã từ chối
          </Tag>
        );
      case 'completed':
        return (
          <Tag icon={<CheckCircleOutlined />} color="default">
            Đã nhận đồ thành công
          </Tag>
        );
      case 'expired':
        return <Tag color="warning">Mã đã hết hạn</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      width={680}
      title={
        <Space>
          <KeyOutlined style={{ color: '#2563eb', fontSize: 20 }} />
          <span style={{ fontWeight: 700 }}>Yêu cầu nhận đồ & Mã mở tủ</span>
        </Space>
      }
    >
      <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
        Theo dõi trạng thái các yêu cầu nhận lại đồ và sử dụng mã nhận đồ dùng một lần (OTP) để mở tủ thông minh.
      </Paragraph>

      <List
        loading={loading}
        dataSource={claims}
        locale={{ emptyText: 'Bạn chưa gửi yêu cầu nhận đồ nào.' }}
        renderItem={(claim) => {
          const isApproved = claim.status === 'approved';
          const isRedeemingThis = redeemClaimId === claim.id;

          return (
            <Card style={{ marginBottom: 12, borderColor: isApproved ? '#22c55e' : '#e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <Title level={5} style={{ margin: 0 }}>
                    {claim.item_name}
                  </Title>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Vị trí tìm thấy: {claim.found_location} · Gửi yêu cầu:{' '}
                    {new Date(claim.created_at).toLocaleString('vi-VN')}
                  </Text>
                </div>
                <div>{getStatusTag(claim.status)}</div>
              </div>

              <div style={{ margin: '10px 0', fontSize: 13 }}>
                <Text type="secondary">Bằng chứng bạn đã cung cấp: </Text>
                <Text italic>{claim.proof_description}</Text>
              </div>

              {claim.rejection_reason && (
                <Alert
                  type="error"
                  message={`Lý do từ chối: ${claim.rejection_reason}`}
                  style={{ marginTop: 8 }}
                />
              )}

              {isApproved && (
                <div style={{ marginTop: 14, padding: 12, background: '#f0fdf4', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <Text type="secondary">Mã OTP nhận đồ một lần:</Text>
                      <br />
                      <Text strong style={{ fontSize: 24, letterSpacing: 4, color: '#16a34a' }}>
                        {claim.claim_code}
                      </Text>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        Hết hạn lúc: {new Date(claim.code_expires_at).toLocaleTimeString('vi-VN')}
                      </div>
                    </div>

                    {!isRedeemingThis && (
                      <Button
                        type="primary"
                        icon={<UnlockOutlined />}
                        style={{ background: '#16a34a', borderColor: '#16a34a' }}
                        onClick={() => {
                          setRedeemClaimId(claim.id);
                          setInputOtp(claim.claim_code); // Tự điền mã để tiện test
                        }}
                      >
                        Mở ngăn tủ nhận đồ
                      </Button>
                    )}
                  </div>

                  {isRedeemingThis && (
                    <div style={{ marginTop: 12 }}>
                      <Divider style={{ margin: '8px 0' }} />
                      <Text strong>Xác nhận mở ngăn tủ:</Text>
                      <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                        <Input
                          placeholder="Nhập mã 6 chữ số"
                          value={inputOtp}
                          onChange={(e) => setInputOtp(e.target.value)}
                          maxLength={6}
                        />
                        <Button
                          type="primary"
                          loading={redeeming}
                          onClick={() => handleRedeem(claim.id, inputOtp)}
                        >
                          Xác nhận mở tủ
                        </Button>
                        <Button onClick={() => setRedeemClaimId(null)}>Hủy</Button>
                      </Space.Compact>
                    </div>
                  )}
                </div>
              )}

              {claim.status === 'completed' && (
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Đã hoàn tất nhận đồ lúc: {new Date(claim.claimed_at).toLocaleString('vi-VN')}
                  </Text>
                </div>
              )}
            </Card>
          );
        }}
      />
    </Modal>
  );
};
