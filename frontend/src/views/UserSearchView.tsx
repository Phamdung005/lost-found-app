import React, { useState, useEffect } from 'react';
import { Typography, Input, Tag, Empty, Spin, Button, Modal, Space } from 'antd';
import {
  SearchOutlined,
  InboxOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  LockOutlined,
} from '@ant-design/icons';
const API_BASE = '/api';

const { Title, Text } = Typography;

interface UserSearchViewProps {
  initialKeyword?: string;
  onClaimItem: (item: any) => void;
  selectedItemDetail?: any;
  onCloseItemDetail?: () => void;
}

export const UserSearchView: React.FC<UserSearchViewProps> = ({
  initialKeyword = '',
  onClaimItem,
  selectedItemDetail,
  onCloseItemDetail,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState(initialKeyword);
  const [activeSearchTerm, setActiveSearchTerm] = useState(initialKeyword);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [activeModalItem, setActiveModalItem] = useState<any>(selectedItemDetail || null);

  useEffect(() => {
    if (selectedItemDetail) {
      setActiveModalItem(selectedItemDetail);
    }
  }, [selectedItemDetail]);

  useEffect(() => {
    if (initialKeyword) {
      setSearchInput(initialKeyword);
      setActiveSearchTerm(initialKeyword);
    }
  }, [initialKeyword]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/found-items`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching items:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchItems();
  }, []);

  const handleExecuteSearch = () => {
    setActiveSearchTerm(searchInput.trim());
  };

  // Filter items based on activeSearchTerm and status
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !activeSearchTerm ||
      item.item_name.toLowerCase().includes(activeSearchTerm.toLowerCase()) ||
      (item.found_location && item.found_location.toLowerCase().includes(activeSearchTerm.toLowerCase()));

    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'in_locker' && item.status === 'in_locker') ||
      (filterStatus === 'returned' && item.status === 'returned');

    return matchesSearch && matchesStatus;
  });

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
          Tìm đồ thất lạc
        </Title>
        <Text type="secondary" style={{ fontSize: 13 }}>
          Danh sách đồ nhặt được đang được bảo quản trong hệ thống tủ FindBox.
        </Text>
      </div>

      {/* Search Input with explicit Search Button */}
      <div style={{ marginBottom: 14 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            size="large"
            placeholder="Nhập tên đồ vật hoặc vị trí..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onPressEnter={handleExecuteSearch}
            allowClear
            onClear={() => {
              setSearchInput('');
              setActiveSearchTerm('');
            }}
            style={{
              borderRadius: '12px 0 0 12px',
              height: 46,
              fontSize: 14,
            }}
          />
          <Button
            type="primary"
            size="large"
            icon={<SearchOutlined />}
            onClick={handleExecuteSearch}
            style={{
              borderRadius: '0 12px 12px 0',
              height: 46,
              padding: '0 18px',
              fontWeight: 600,
              background: '#2563eb',
            }}
          >
            Tìm
          </Button>
        </Space.Compact>
        {activeSearchTerm && (
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            Kết quả cho: <b>"{activeSearchTerm}"</b> ({filteredItems.length} kết quả)
          </div>
        )}
      </div>

      {/* Status Filter Chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
        <Button
          size="small"
          type={filterStatus === 'all' ? 'primary' : 'default'}
          onClick={() => setFilterStatus('all')}
          style={{ borderRadius: 16, fontSize: 12 }}
        >
          Tất cả ({items.length})
        </Button>
        <Button
          size="small"
          type={filterStatus === 'in_locker' ? 'primary' : 'default'}
          onClick={() => setFilterStatus('in_locker')}
          style={{ borderRadius: 16, fontSize: 12 }}
        >
          Đang trong tủ ({items.filter((i) => i.status === 'in_locker').length})
        </Button>
        <Button
          size="small"
          type={filterStatus === 'returned' ? 'primary' : 'default'}
          onClick={() => setFilterStatus('returned')}
          style={{ borderRadius: 16, fontSize: 12 }}
        >
          Đã trao trả ({items.filter((i) => i.status === 'returned').length})
        </Button>
      </div>

      {/* Items List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin tip="Đang tìm kiếm đồ thất lạc..." />
        </div>
      ) : filteredItems.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Không tìm thấy món đồ phù hợp."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="card-clean"
              style={{
                margin: 0,
                cursor: 'pointer',
                transition: 'border-color 0.15s, transform 0.15s',
              }}
              onClick={() => setActiveModalItem(item)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      background: item.status === 'in_locker' ? '#eff6ff' : '#f1f5f9',
                      color: item.status === 'in_locker' ? '#2563eb' : '#64748b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 18,
                    }}
                  >
                    <InboxOutlined />
                  </div>
                  <div>
                    <Text strong style={{ fontSize: 15, color: '#0f172a' }}>
                      {item.item_name}
                    </Text>
                    <div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <EnvironmentOutlined style={{ fontSize: 11 }} /> {item.found_location}
                    </div>
                  </div>
                </div>

                <Tag color={item.status === 'in_locker' ? 'processing' : 'default'} style={{ margin: 0, borderRadius: 6 }}>
                  {item.status === 'in_locker' ? 'Trong tủ' : 'Đã nhận'}
                </Tag>
              </div>

              {/* Masked notice for privacy */}
              <div
                style={{
                  background: '#f8fafc',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 11,
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <LockOutlined style={{ color: '#94a3b8' }} />
                <span>Đặc điểm nhận dạng riêng tư được giữ kín để đối chiếu an toàn.</span>
              </div>

              <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  <ClockCircleOutlined /> Gửi lúc: {new Date(item.created_at).toLocaleDateString('vi-VN')}
                </span>
                <Button
                  size="small"
                  type="link"
                  style={{ padding: 0, fontSize: 12, fontWeight: 600 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveModalItem(item);
                  }}
                >
                  Xem chi tiết & Nhận lại
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Item Detail Modal */}
      {activeModalItem && (
        <Modal
          open={!!activeModalItem}
          onCancel={() => {
            setActiveModalItem(null);
            if (onCloseItemDetail) onCloseItemDetail();
          }}
          footer={null}
          destroyOnClose
          centered
          width={420}
        >
          <div style={{ textAlign: 'center', padding: '10px 0 16px' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 16,
                background: '#eff6ff',
                color: '#2563eb',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 26,
                marginBottom: 10,
              }}
            >
              <InboxOutlined />
            </div>
            <Title level={4} style={{ margin: 0 }}>
              {activeModalItem.item_name}
            </Title>
            <Tag color={activeModalItem.status === 'in_locker' ? 'processing' : 'default'} style={{ marginTop: 6 }}>
              {activeModalItem.status === 'in_locker' ? 'Đang được lưu trong tủ' : 'Đã trao trả'}
            </Tag>
          </div>

          <div className="card-clean" style={{ background: '#f8fafc', fontSize: 13 }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Vị trí tìm thấy:</span>
              <span style={{ fontWeight: 600 }}>{activeModalItem.found_location}</span>
            </div>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Thời gian tiếp nhận:</span>
              <span>{new Date(activeModalItem.created_at).toLocaleString('vi-VN')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748b' }}>Hệ thống tủ:</span>
              <span style={{ fontWeight: 600 }}>Tủ thông minh FindBox (L-001)</span>
            </div>
          </div>

          <div
            style={{
              padding: 12,
              background: '#fefce8',
              border: '1px solid #fef08a',
              borderRadius: 8,
              fontSize: 12,
              color: '#854d0e',
              marginBottom: 16,
            }}
          >
            <SafetyCertificateOutlined style={{ marginRight: 6 }} />
            Để bảo vệ tài sản, thông tin chi tiết nhận dạng sẽ được người dùng đối chiếu trong biểu mẫu yêu cầu nhận lại đồ.
          </div>

          {activeModalItem.status === 'in_locker' ? (
            <Button
              type="primary"
              size="large"
              block
              icon={<SendOutlined />}
              onClick={() => {
                const target = activeModalItem;
                setActiveModalItem(null);
                if (onCloseItemDetail) onCloseItemDetail();
                onClaimItem(target);
              }}
              style={{
                height: 48,
                borderRadius: 12,
                background: '#2563eb',
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              Đây là đồ của tôi — Gửi yêu cầu nhận lại
            </Button>
          ) : (
            <Button block disabled size="large" style={{ height: 46, borderRadius: 12 }}>
              Món đồ này đã được trao trả thành công
            </Button>
          )}
        </Modal>
      )}
    </div>
  );
};
