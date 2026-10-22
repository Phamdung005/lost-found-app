import React, { useState, useEffect } from 'react';
import { Typography, Input, Tag, Button, Empty, Spin, Space } from 'antd';
import {
  SearchOutlined,
  InboxOutlined,
  QuestionCircleOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  KeyOutlined,
  RightOutlined
} from '@ant-design/icons';
import { API_BASE } from '../config/api';

const { Title, Text } = Typography;

interface UserHomeViewProps {
  onNavigateTab: (tab: string, subParam?: any) => void;
  onOpenItemDetail: (item: any) => void;
}

export const UserHomeView: React.FC<UserHomeViewProps> = ({
  onNavigateTab,
  onOpenItemDetail,
}) => {
  const [recentItems, setRecentItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  const fetchRecentItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/found-items?limit=4`);
      const data = await res.json();
      if (data.success) {
        setRecentItems(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching recent items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecentItems();
  }, []);

  const handleSearchSubmit = () => {
    if (quickSearch.trim()) {
      onNavigateTab('search', { keyword: quickSearch.trim() });
    } else {
      onNavigateTab('search');
    }
  };

  return (
    <div>
      {/* Short Greeting */}
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary" style={{ fontSize: 13 }}>Xin chào bạn 👋</Text>
        <Title level={3} style={{ margin: '2px 0 0', fontWeight: 800, letterSpacing: -0.5 }}>
          Bạn cần hỗ trợ gì hôm nay?
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Hệ thống tìm kiếm đồ thất lạc và tủ nhận đồ thông minh FindBox.
        </Text>
      </div>

      {/* 2 Big Action Buttons: Tôi bị mất đồ vs Tôi nhặt được đồ */}
      <div className="action-hero-grid">
        <div
          className="action-hero-card lost"
          onClick={() => onNavigateTab('report', { type: 'lost' })}
          role="button"
          tabIndex={0}
        >
          <div className="hero-icon-bubble">
            <QuestionCircleOutlined />
          </div>
          <div className="hero-title">Tôi bị mất đồ</div>
          <div className="hero-subtitle">Báo mất để tìm lại nhanh chóng</div>
        </div>

        <div
          className="action-hero-card found"
          onClick={() => onNavigateTab('report', { type: 'found' })}
          role="button"
          tabIndex={0}
        >
          <div className="hero-icon-bubble">
            <InboxOutlined />
          </div>
          <div className="hero-title">Tôi nhặt được đồ</div>
          <div className="hero-subtitle">Gửi vào tủ hoặc khai báo</div>
        </div>
      </div>

      {/* Quick Search Input with Action Button */}
      <div style={{ marginBottom: 20 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder="Tìm đồ thất lạc (ví, thẻ sinh viên...)"
            prefix={<SearchOutlined style={{ color: '#94a3b8', marginRight: 4 }} />}
            value={quickSearch}
            onChange={(e) => setQuickSearch(e.target.value)}
            onPressEnter={handleSearchSubmit}
            allowClear
            style={{
              borderRadius: '12px 0 0 12px',
              height: 48,
              fontSize: 14,
            }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={handleSearchSubmit}
            style={{
              borderRadius: '0 12px 12px 0',
              height: 48,
              padding: '0 18px',
              fontWeight: 600,
              background: '#2563eb',
            }}
          >
            Tìm
          </Button>
        </Space.Compact>
      </div>

      {/* Short Onboarding / Usage Guide */}
      <div className="card-clean" style={{ background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
        <Text strong style={{ fontSize: 13, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <KeyOutlined style={{ color: '#2563eb' }} /> Cách nhận lại đồ an toàn
        </Text>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#475569' }}>
          <div>1️⃣ Tìm đồ trong mục <b>Tìm đồ</b> và gửi yêu cầu xác minh.</div>
          <div>2️⃣ Quản trị viên đối chiếu và phê duyệt yêu cầu của bạn.</div>
          <div>3️⃣ Nhận mã <b>OTP 6 chữ số</b> và nhấn mở ngăn tủ để nhận lại.</div>
        </div>
      </div>

      {/* Recent Public Found Items Section */}
      <div style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Title level={5} style={{ margin: 0, fontWeight: 700 }}>
            Đồ vừa được gửi vào tủ
          </Title>
          <Button
            type="link"
            size="small"
            onClick={() => onNavigateTab('search')}
            style={{ padding: 0, fontSize: 13 }}
          >
            Xem tất cả <RightOutlined style={{ fontSize: 10 }} />
          </Button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '30px 0' }}>
            <Spin tip="Đang tải dữ liệu..." />
          </div>
        ) : recentItems.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Chưa có món đồ nào được gửi vào tủ gần đây."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {recentItems.map((item) => (
              <div
                key={item.id}
                className="card-clean"
                style={{
                  margin: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background 0.15s',
                }}
                onClick={() => onOpenItemDetail(item)}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
                      background: '#eff6ff',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                    }}
                  >
                    <InboxOutlined />
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 14, display: 'block', color: '#0f172a' }}>
                      {item.item_name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <EnvironmentOutlined style={{ fontSize: 11 }} /> {item.found_location}
                    </Text>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <Tag color={item.status === 'in_locker' ? 'processing' : 'default'} style={{ margin: 0 }}>
                    {item.status === 'in_locker' ? 'Trong tủ' : 'Đã trả'}
                  </Tag>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                    <ClockCircleOutlined style={{ fontSize: 10 }} />{' '}
                    {new Date(item.created_at).toLocaleDateString('vi-VN')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
