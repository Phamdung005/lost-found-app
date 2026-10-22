import React, { useState, useEffect } from 'react';
import { Typography, Tag, Button, Spin } from 'antd';
import {
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  RightOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
const API_BASE = '/api';

const { Title, Text } = Typography;

interface AdminOverviewViewProps {
  onNavigateTab: (tab: string) => void;
}

export const AdminOverviewView: React.FC<AdminOverviewViewProps> = ({ onNavigateTab }) => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [lostReports, setLostReports] = useState<any[]>([]);
  const [slots, setSlots] = useState<any[]>([]);
  const [deviceStatus, setDeviceStatus] = useState<any>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [claimsRes, reportsRes, slotsRes, deviceRes] = await Promise.all([
        fetch(`${API_BASE}/claims/pending`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/lost-reports`),
        fetch(`${API_BASE}/lockers/L-001/slots`),
        fetch(`${API_BASE}/device/status`),
      ]);

      if (claimsRes.ok) {
        const cData = await claimsRes.json();
        setPendingClaims(cData.data || []);
      }
      if (reportsRes.ok) {
        const rData = await reportsRes.json();
        setLostReports(rData.data || []);
      }
      if (slotsRes.ok) {
        const sData = await slotsRes.json();
        setSlots(sData.data || []);
      }
      if (deviceRes.ok) {
        const dData = await deviceRes.json();
        setDeviceStatus(dData.data || null);
      }
    } catch (err) {
      console.error('Error fetching admin overview data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchDashboardData();
  }, [token]);

  const occupiedCount = slots.filter((s) => s.status.toLowerCase() !== 'empty').length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            Quản trị FindBox
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Tổng quan công việc và trạng thái tủ thông minh.
          </Text>
        </div>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={fetchDashboardData}
          loading={loading}
          style={{ borderRadius: 8 }}
        />
      </div>

      {/* Simulation Warning Banner if in simulation mode */}
      {deviceStatus?.simulation_mode && (
        <div className="simulation-mode-banner">
          <span className="simulation-tag">MÔ PHỎNG</span>
          <div style={{ fontSize: 12, color: '#92400e' }}>
            Hệ thống đang chạy <b>Chế độ mô phỏng</b> (Không kích hoạt relay/servo phần cứng).
          </div>
        </div>
      )}

      {/* 3 Main Stat Cards (Clean, Mobile-First) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
        <div
          className="card-clean"
          style={{ margin: 0, cursor: 'pointer', background: '#fff' }}
          onClick={() => onNavigateTab('admin_reports')}
        >
          <div style={{ color: '#d97706', fontSize: 18, marginBottom: 4 }}>
            <SafetyCertificateOutlined />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            {pendingClaims.length}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Yêu cầu chờ duyệt</div>
        </div>

        <div
          className="card-clean"
          style={{ margin: 0, cursor: 'pointer', background: '#fff' }}
          onClick={() => onNavigateTab('admin_lockers')}
        >
          <div style={{ color: '#2563eb', fontSize: 18, marginBottom: 4 }}>
            <ThunderboltOutlined />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>
            {occupiedCount}/{slots.length || 2}
          </div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Ngăn có đồ (L-001)</div>
        </div>
      </div>

      {/* Quick Action Navigation - Stacked cleanly for mobile */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
        <Button
          type="primary"
          size="large"
          icon={<SafetyCertificateOutlined />}
          onClick={() => onNavigateTab('admin_reports')}
          style={{
            height: 46,
            borderRadius: 12,
            fontWeight: 600,
            background: '#16a34a',
            borderColor: '#16a34a',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Duyệt yêu cầu nhận đồ ({pendingClaims.length})
        </Button>
        <Button
          type="primary"
          size="large"
          icon={<ThunderboltOutlined />}
          onClick={() => onNavigateTab('admin_lockers')}
          style={{
            height: 46,
            borderRadius: 12,
            fontWeight: 600,
            background: '#2563eb',
            fontSize: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          Điều khiển ngăn tủ IoT (L-001)
        </Button>
      </div>

      {/* Urgent Pending Claims Section */}
      <div className="card-clean" style={{ margin: 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
            Yêu cầu nhận đồ cần duyệt ({pendingClaims.length})
          </Text>
          <Button
            type="link"
            size="small"
            onClick={() => onNavigateTab('admin_reports')}
            style={{ padding: 0, fontSize: 12 }}
          >
            Xem tất cả <RightOutlined style={{ fontSize: 10 }} />
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Spin size="small" />
          </div>
        ) : pendingClaims.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 13 }}>
            <CheckCircleOutlined style={{ color: '#16a34a', marginRight: 6 }} />
            Không có yêu cầu nào đang chờ duyệt.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingClaims.slice(0, 3).map((claim) => (
              <div
                key={claim.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{claim.item_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Người gửi: {claim.claimer_name || 'Người dùng'} · {claim.claimer_email}
                  </div>
                </div>
                <Button
                  size="small"
                  type="primary"
                  onClick={() => onNavigateTab('admin_reports')}
                  style={{ borderRadius: 6, fontSize: 11 }}
                >
                  Xử lý
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lost Reports Summary */}
      <div className="card-clean" style={{ margin: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 14, color: '#0f172a' }}>
            Báo cáo mất đồ gần đây ({lostReports.length})
          </Text>
        </div>

        {lostReports.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#94a3b8', fontSize: 13 }}>
            Chưa có báo cáo mất đồ nào.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lostReports.slice(0, 3).map((report) => (
              <div
                key={report.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: '#f8fafc',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{report.item_name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    Địa điểm: {report.lost_location}
                  </div>
                </div>
                <Tag color={report.status === 'pending' ? 'processing' : 'default'} style={{ margin: 0, fontSize: 11 }}>
                  {report.status === 'pending' ? 'Đang chờ' : report.status}
                </Tag>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
