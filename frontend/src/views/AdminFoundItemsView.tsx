import React, { useEffect, useState } from 'react';
import { Alert, Empty, Input, Select, Spin, Tag, Typography } from 'antd';
import { InboxOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { API_BASE } from '../config/api';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

interface FoundItem {
  id: number;
  item_name: string;
  category: string;
  description?: string | null;
  found_location: string;
  found_at: string;
  status: string;
  tracking_code?: string | null;
  slot_code?: string | null;
  locker_code?: string | null;
  finder_contact?: string | null;
}

export const AdminFoundItemsView: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<FoundItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');

  const loadItems = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set('search', search.trim());
      const response = await fetch(`${API_BASE}/found-items?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Không thể tải danh sách đồ lưu trữ');
      }
      setItems(payload.data || []);
    } catch (error) {
      setItems([]);
      console.error('Không thể tải danh sách đồ lưu trữ:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
    const timer = setInterval(() => void loadItems(), 5000);
    return () => clearInterval(timer);
  }, [token, status]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>Đồ vật lưu trữ</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>Danh sách các món đồ đã được tiếp nhận vào hệ thống.</Text>
        </div>
        <ReloadOutlined spin={loading} onClick={() => void loadItems()} style={{ fontSize: 18, cursor: 'pointer' }} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Tìm tên đồ hoặc địa điểm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onPressEnter={() => void loadItems()}
        />
        <Select
          value={status}
          onChange={(value) => {
            setStatus(value);
            void loadItems();
          }}
          options={[
            { value: 'all', label: 'Tất cả' },
            { value: 'in_locker', label: 'Trong tủ' },
            { value: 'reported', label: 'Chưa gửi tủ' },
            { value: 'returned', label: 'Đã trao trả' },
          ]}
          style={{ width: 140 }}
        />
      </div>

      {!loading && items.length === 0 ? (
        <Empty description="Chưa có đồ vật nào phù hợp." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item) => (
            <div key={item.id} className="card-clean" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <Text strong style={{ fontSize: 15 }}>{item.item_name}</Text>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>
                    {item.category} · Nhặt tại {item.found_location}
                  </div>
                </div>
                <Tag color={item.status === 'returned' ? 'default' : item.slot_code ? 'blue' : 'orange'}>
                  {item.status === 'returned' ? 'Đã trao trả' : item.slot_code ? `Ngăn ${item.slot_code}` : 'Chưa gửi tủ'}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 8 }}>
                Mã theo dõi: <strong>{item.tracking_code || 'N/A'}</strong>
                {item.locker_code && <> · Tủ: <strong>{item.locker_code}</strong></>}
              </div>
              <Alert
                type="warning"
                showIcon
                icon={<InboxOutlined />}
                message="Mô tả bí mật"
                description={item.description || 'Chưa có mô tả bí mật.'}
                style={{ marginTop: 8 }}
              />
              {item.finder_contact && (
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 6 }}>
                  Liên hệ người nhặt: {item.finder_contact}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {loading && items.length === 0 && <div style={{ textAlign: 'center' }}><Spin /></div>}
    </div>
  );
};
