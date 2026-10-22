import React, { useState, useEffect } from 'react';
import {
  Typography,
  Segmented,
  Tag,
  Button,
  Modal,
  Input,
  message,
  Spin,
  Empty,
  Popconfirm
} from 'antd';
import {
  SafetyCertificateOutlined,
  FileTextOutlined,
  CheckOutlined,
  CloseOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
const API_BASE = (import.meta as any).env?.VITE_API_BASE || '/api';

const { Title, Text } = Typography;

export const AdminReportsView: React.FC = () => {
  const { token } = useAuth();
  const [tab, setTab] = useState<'claims' | 'lost_reports'>('claims');
  const [claims, setClaims] = useState<any[]>([]);
  const [lostReports, setLostReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Reject Modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectingClaimId, setRejectingClaimId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingAction, setProcessingAction] = useState(false);

  const fetchClaims = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/claims/pending`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setClaims(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLostReports = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/lost-reports`);
      const data = await res.json();
      if (data.success) {
        setLostReports(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'claims') {
      void fetchClaims();
    } else {
      void fetchLostReports();
    }
  }, [tab, token]);

  const handleApprove = async (claimId: number) => {
    setProcessingAction(true);
    try {
      const res = await fetch(`${API_BASE}/claims/${claimId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể duyệt yêu cầu');
      }

      message.success(`Đã duyệt thành công! Mã OTP mở tủ: ${data.data?.claim_code}`);
      await fetchClaims();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi duyệt');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingClaimId) return;
    setProcessingAction(true);
    try {
      const res = await fetch(`${API_BASE}/claims/${rejectingClaimId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Không thể từ chối yêu cầu');
      }

      message.success('Đã từ chối yêu cầu nhận đồ');
      setRejectModalOpen(false);
      setRejectReason('');
      setRejectingClaimId(null);
      await fetchClaims();
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi từ chối');
    } finally {
      setProcessingAction(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            Quản lý Báo cáo & Yêu cầu
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Xác minh người nhận đồ và đối chiếu thông tin thất lạc.
          </Text>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={tab === 'claims' ? fetchClaims : fetchLostReports}
          loading={loading}
          style={{ borderRadius: 8 }}
        />
      </div>

      {/* Segmented Switcher */}
      <div style={{ marginBottom: 16 }}>
        <Segmented
          block
          size="large"
          value={tab}
          onChange={(val) => setTab(val as 'claims' | 'lost_reports')}
          options={[
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600, fontSize: 13 }}>
                  <SafetyCertificateOutlined style={{ marginRight: 4 }} />
                  Yêu cầu ({claims.length})
                </div>
              ),
              value: 'claims',
            },
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600, fontSize: 13 }}>
                  <FileTextOutlined style={{ marginRight: 4 }} />
                  Báo mất ({lostReports.length})
                </div>
              ),
              value: 'lost_reports',
            },
          ]}
          style={{ background: '#f1f5f9', padding: 4, borderRadius: 12 }}
        />
      </div>

      {/* TAB 1: CLAIMS LIST */}
      {tab === 'claims' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Spin tip="Đang tải yêu cầu..." />
            </div>
          ) : claims.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Không có yêu cầu nhận đồ nào đang chờ duyệt."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {claims.map((claim) => (
                <div key={claim.id} className="card-clean" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>
                        {claim.item_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Vị trí nhặt: {claim.found_location} · Mã theo dõi: {claim.tracking_code || 'N/A'}
                      </div>
                    </div>
                    <Tag color="orange" style={{ margin: 0 }}>Chờ duyệt</Tag>
                  </div>

                  <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
                    <div style={{ marginBottom: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>Người yêu cầu: </Text>
                      <Text strong>{claim.claimer_name || 'Người dùng'}</Text> ({claim.claimer_email})
                    </div>
                    <div>
                      <Text type="secondary" style={{ fontSize: 12 }}>Bằng chứng cung cấp: </Text>
                      <span style={{ fontWeight: 600, color: '#1e40af' }}>{claim.proof_description}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button
                      danger
                      icon={<CloseOutlined />}
                      onClick={() => {
                        setRejectingClaimId(claim.id);
                        setRejectReason('');
                        setRejectModalOpen(true);
                      }}
                      style={{ borderRadius: 8 }}
                    >
                      Từ chối
                    </Button>

                    <Popconfirm
                      title="Xác nhận duyệt yêu cầu?"
                      description="Hệ thống sẽ tự động cấp mã OTP 6 số để người này mở ngăn tủ."
                      onConfirm={() => handleApprove(claim.id)}
                      okText="Duyệt & Cấp OTP"
                      cancelText="Hủy"
                    >
                      <Button
                        type="primary"
                        icon={<CheckOutlined />}
                        loading={processingAction}
                        style={{ background: '#16a34a', borderColor: '#16a34a', borderRadius: 8 }}
                      >
                        Duyệt & Cấp OTP
                      </Button>
                    </Popconfirm>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LOST REPORTS LIST */}
      {tab === 'lost_reports' && (
        <div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <Spin tip="Đang tải báo cáo mất đồ..." />
            </div>
          ) : lostReports.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="Chưa có báo cáo mất đồ nào."
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lostReports.map((report) => (
                <div key={report.id} className="card-clean" style={{ margin: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                        {report.item_name}
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        Địa điểm mất: {report.lost_location}
                      </div>
                    </div>
                    <Tag color={report.status === 'pending' ? 'processing' : 'default'} style={{ margin: 0 }}>
                      {report.status === 'pending' ? 'Đang chờ' : report.status}
                    </Tag>
                  </div>

                  {report.description && (
                    <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>
                      <Text type="secondary">Đặc điểm: </Text>{report.description}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Liên hệ: {report.reporter_contact || 'Không để lại'}</span>
                    <span>Báo lúc: {new Date(report.created_at).toLocaleDateString('vi-VN')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        title="Từ chối yêu cầu nhận đồ"
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        onOk={handleReject}
        confirmLoading={processingAction}
        okText="Xác nhận từ chối"
        cancelText="Hủy"
        destroyOnClose
      >
        <div style={{ marginBottom: 12 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Vui lòng nhập lý do từ chối để thông báo đến người gửi yêu cầu (ví dụ: bằng chứng nhận dạng không khớp, hình ảnh không đúng...).
          </Text>
        </div>
        <Input.TextArea
          rows={3}
          placeholder="Nhập lý do từ chối..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
      </Modal>
    </div>
  );
};
