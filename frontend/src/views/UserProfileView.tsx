import React, { useState, useEffect } from 'react';
import {
  Typography,
  Button,
  Tag,
  Input,
  message,
  Space,
  Alert,
  Spin,
  Empty
} from 'antd';
import {
  UserOutlined,
  LogoutOutlined,
  LoginOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  UnlockOutlined,
  AppleOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
const API_BASE = '/api';

const { Title, Text } = Typography;

interface UserProfileViewProps {
  onOpenAuthModal: (tab: 'login' | 'register') => void;
  onOpenPwaGuide: () => void;
}

export const UserProfileView: React.FC<UserProfileViewProps> = ({
  onOpenAuthModal,
  onOpenPwaGuide,
}) => {
  const { user, isAuthenticated, logout, token } = useAuth();
  const [claims, setClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [inputOtp, setInputOtp] = useState('');
  const [submittingRedeem, setSubmittingRedeem] = useState(false);

  // Fetch my claims
  const fetchMyClaims = async () => {
    if (!token) return;
    setLoadingClaims(true);
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
    } finally {
      setLoadingClaims(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      void fetchMyClaims();
    }
  }, [isAuthenticated, token]);

  const handleRedeem = async (claimId: number, otp: string) => {
    if (!otp || otp.trim().length !== 6) {
      message.warning('Mã nhận đồ phải gồm 6 chữ số');
      return;
    }

    setSubmittingRedeem(true);
    try {
      const res = await fetch(`${API_BASE}/claims/redeem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          claim_id: claimId,
          claim_code: otp.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Xác thực mã mở tủ thất bại');
      }

      message.success(data.message);
      setRedeemingId(null);
      setInputOtp('');
      await fetchMyClaims();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi mở tủ nhận đồ');
    } finally {
      setSubmittingRedeem(false);
    }
  };

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'pending':
        return <Tag icon={<ClockCircleOutlined />} color="processing">Chờ duyệt</Tag>;
      case 'approved':
        return <Tag icon={<CheckCircleOutlined />} color="success">Đã duyệt — Có mã OTP</Tag>;
      case 'rejected':
        return <Tag icon={<CloseCircleOutlined />} color="error">Đã từ chối</Tag>;
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="default">Đã nhận đồ</Tag>;
      default:
        return <Tag>{status}</Tag>;
    }
  };

  if (!isAuthenticated) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 10px' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: '#eff6ff',
            color: '#2563eb',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            marginBottom: 16,
          }}
        >
          <UserOutlined />
        </div>
        <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
          Đăng nhập vào FindBox
        </Title>
        <Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 6, marginBottom: 24 }}>
          Đăng nhập để theo dõi trạng thái yêu cầu nhận đồ, nhận mã OTP mở tủ và lưu lại lịch sử.
        </Text>

        <Space direction="vertical" style={{ width: '100%', maxWidth: 280 }}>
          <Button
            type="primary"
            size="large"
            block
            icon={<LoginOutlined />}
            onClick={() => onOpenAuthModal('login')}
            style={{ height: 46, borderRadius: 12, fontWeight: 600 }}
          >
            Đăng nhập
          </Button>

          <Button
            size="large"
            block
            onClick={() => onOpenAuthModal('register')}
            style={{ height: 46, borderRadius: 12 }}
          >
            Đăng ký tài khoản mới
          </Button>

          <Button
            type="dashed"
            block
            icon={<AppleOutlined />}
            onClick={onOpenPwaGuide}
            style={{ height: 40, borderRadius: 12, marginTop: 10 }}
          >
            Hướng dẫn cài PWA trên iPhone
          </Button>
        </Space>
      </div>
    );
  }

  return (
    <div>
      {/* Profile Card */}
      <div
        className="card-clean"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
          borderColor: '#dbeafe',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: '#2563eb',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 20,
            }}
          >
            {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
              {user?.full_name}
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{user?.email}</div>
            <Tag color={user?.role === 'admin' ? 'purple' : 'blue'} style={{ marginTop: 4, borderRadius: 4, fontSize: 10 }}>
              {user?.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
            </Tag>
          </div>
        </div>

        <Button
          type="text"
          danger
          icon={<LogoutOutlined />}
          onClick={logout}
          title="Đăng xuất"
        >
          Đăng xuất
        </Button>
      </div>

      {/* Action shortcuts */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <Button
          block
          icon={<AppleOutlined />}
          onClick={onOpenPwaGuide}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          Cài PWA iPhone
        </Button>
        <Button
          block
          icon={<ReloadOutlined />}
          onClick={fetchMyClaims}
          loading={loadingClaims}
          style={{ borderRadius: 10, fontSize: 13 }}
        >
          Làm mới
        </Button>
      </div>

      {/* Claims List */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
            Yêu cầu nhận đồ của bạn
          </Title>
          <span style={{ fontSize: 12, color: '#64748b' }}>{claims.length} yêu cầu</span>
        </div>

        {loadingClaims ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Spin tip="Đang tải danh sách..." />
          </div>
        ) : claims.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Bạn chưa gửi yêu cầu nhận lại đồ nào."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {claims.map((claim) => {
              const isApproved = claim.status === 'approved';
              const isRedeemingThis = redeemingId === claim.id;

              return (
                <div
                  key={claim.id}
                  className="card-clean"
                  style={{
                    borderColor: isApproved ? '#22c55e' : '#e2e8f0',
                    background: isApproved ? '#f0fdf4' : '#ffffff',
                    margin: 0,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                        {claim.item_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Vị trí: {claim.found_location} · Gửi lúc: {new Date(claim.created_at).toLocaleDateString('vi-VN')}
                      </div>
                    </div>
                    <div>{getStatusTag(claim.status)}</div>
                  </div>

                  <div style={{ margin: '8px 0', fontSize: 12, color: '#475569' }}>
                    <span style={{ color: '#64748b' }}>Bằng chứng đã gửi: </span>
                    <i>{claim.proof_description}</i>
                  </div>

                  {claim.rejection_reason && (
                    <Alert
                      type="error"
                      showIcon
                      message={`Lý do từ chối: ${claim.rejection_reason}`}
                      style={{ marginTop: 6, fontSize: 12 }}
                    />
                  )}

                  {/* Approved OTP Box */}
                  {isApproved && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: '#ffffff',
                        border: '1px solid #bbf7d0',
                        borderRadius: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Text type="secondary" style={{ fontSize: 11 }}>MÃ OTP MỞ TỦ (DÙNG 1 LẦN):</Text>
                          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 4, color: '#16a34a' }}>
                            {claim.claim_code}
                          </div>
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Hết hạn: {new Date(claim.code_expires_at).toLocaleTimeString('vi-VN')}
                          </div>
                        </div>

                        {!isRedeemingThis && (
                          <Button
                            type="primary"
                            icon={<UnlockOutlined />}
                            style={{
                              background: '#16a34a',
                              borderColor: '#16a34a',
                              borderRadius: 8,
                              fontWeight: 600,
                            }}
                            onClick={() => {
                              setRedeemingId(claim.id);
                              setInputOtp(claim.claim_code);
                            }}
                          >
                            Mở ngăn tủ
                          </Button>
                        )}
                      </div>

                      {isRedeemingThis && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #cbd5e1' }}>
                          <Text strong style={{ fontSize: 12 }}>Xác nhận mở ngăn cất đồ:</Text>
                          <Space.Compact style={{ width: '100%', marginTop: 6 }}>
                            <Input
                              placeholder="Nhập 6 số"
                              value={inputOtp}
                              onChange={(e) => setInputOtp(e.target.value)}
                              maxLength={6}
                              style={{ borderRadius: '8px 0 0 8px' }}
                            />
                            <Button
                              type="primary"
                              loading={submittingRedeem}
                              onClick={() => handleRedeem(claim.id, inputOtp)}
                              style={{ background: '#16a34a', borderColor: '#16a34a' }}
                            >
                              Xác nhận mở
                            </Button>
                            <Button onClick={() => setRedeemingId(null)}>Hủy</Button>
                          </Space.Compact>
                        </div>
                      )}
                    </div>
                  )}

                  {claim.status === 'completed' && (
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                      ✓ Đã nhận đồ thành công lúc: {new Date(claim.claimed_at).toLocaleString('vi-VN')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
