import React, { useState, useEffect } from 'react';
import {
  Card,
  Row,
  Col,
  Input,
  Select,
  Tag,
  Button,
  Typography,
  Space,
  Empty,
} from 'antd';
import {
  SearchOutlined,
  EnvironmentOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { ClaimModal } from './ClaimModal';

const { Text, Title } = Typography;
const { Option } = Select;

interface FoundItemsListProps {
  onSuccessClaim?: () => void;
}

import { API_BASE } from '../config/api';

export const FoundItemsList: React.FC<FoundItemsListProps> = ({ onSuccessClaim }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const { token } = useAuth();

  const loadItems = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let url = `${API_BASE}/found-items?category=${category}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;

      const res = await fetch(url, { headers });
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
      }
    } catch (err) {
      console.error('Không thể tải danh sách đồ tìm thấy:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadItems();
  }, [category, token]);

  const getCategoryName = (cat: string) => {
    switch (cat) {
      case 'wallet':
        return 'Ví tiền / Bóp';
      case 'electronics':
        return 'Thiết bị điện tử';
      case 'keys':
        return 'Chìa khóa / Thẻ';
      case 'documents':
        return 'Giấy tờ tùy thân';
      case 'clothing':
        return 'Trang phục';
      default:
        return 'Đồ vật khác';
    }
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            Kho đồ thất lạc tìm thấy
          </Title>
          <Text type="secondary">
            Tìm kiếm theo khu vực và danh mục để đối chiếu đồ bạn đã đánh mất.
          </Text>
        </div>

        <Button icon={<ReloadOutlined />} onClick={loadItems} loading={loading}>
          Làm mới
        </Button>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={14}>
            <Input
              size="large"
              placeholder="Tìm theo tên đồ vật, địa điểm (ví dụ: Ví da, Tòa nhà A)..."
              prefix={<SearchOutlined />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={loadItems}
            />
          </Col>
          <Col xs={16} md={7}>
            <Select
              size="large"
              value={category}
              onChange={(val) => setCategory(val)}
              style={{ width: '100%' }}
            >
              <Option value="all">Tất cả danh mục</Option>
              <Option value="wallet">Ví tiền / Bóp</Option>
              <Option value="electronics">Điện tử (Điện thoại, Laptop)</Option>
              <Option value="keys">Chìa khóa / Thẻ từ</Option>
              <Option value="documents">Giấy tờ tùy thân / CCCD</Option>
              <Option value="clothing">Trang phục / Mũ nón</Option>
              <Option value="other">Đồ vật khác</Option>
            </Select>
          </Col>
          <Col xs={8} md={3}>
            <Button type="primary" size="large" block onClick={loadItems}>
              Tìm kiếm
            </Button>
          </Col>
        </Row>
      </Card>

      {items.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: '40px 0' }}>
          <Empty description="Không tìm thấy món đồ thất lạc nào phù hợp." />
        </Card>
      ) : (
        <Row gutter={[16, 16]}>
          {items.map((item) => {
            const isStored = item.status === 'stored';
            const isReturned = item.status === 'returned';

            return (
              <Col xs={24} sm={12} lg={8} key={item.id}>
                <Card
                  hoverable
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text strong style={{ fontSize: 16 }}>{item.item_name}</Text>
                      <Tag color="blue">{getCategoryName(item.category)}</Tag>
                    </div>
                  }
                >
                  <Space orientation="vertical" style={{ width: '100%' }} size={10}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569' }}>
                      <EnvironmentOutlined />
                      <Text>{item.found_location}</Text>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#64748b', fontSize: 12 }}>
                      <ClockCircleOutlined />
                      <Text type="secondary">
                        Nhặt lúc: {new Date(item.found_at).toLocaleString('vi-VN')}
                      </Text>
                    </div>

                    <div style={{ marginTop: 4 }}>
                      <Tag color={isStored ? 'success' : isReturned ? 'default' : 'orange'}>
                        {isStored
                          ? 'Đang lưu giữ trong tủ FindBox'
                          : isReturned
                          ? 'Đã trao trả chủ nhân'
                          : 'Đã ghi nhận (chưa cất vào tủ)'}
                      </Tag>
                    </div>

                    {item.tracking_code && (
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        Mã theo dõi: <Text code>{item.tracking_code}</Text>
                      </Text>
                    )}

                    {item.description && (
                      <div style={{ background: '#f8fafc', padding: 8, borderRadius: 6, marginTop: 4 }}>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          Mô tả đối chiếu (Admin):
                        </Text>
                        <br />
                        <Text italic style={{ fontSize: 12 }}>{item.description}</Text>
                      </div>
                    )}
                  </Space>

                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #f1f5f9' }}>
                    {isReturned ? (
                      <Button block disabled>
                        Món đồ đã được trao trả
                      </Button>
                    ) : (
                      <Button
                        type="primary"
                        block
                        icon={<SafetyCertificateOutlined />}
                        onClick={() => {
                          setSelectedItem(item);
                          setClaimModalOpen(true);
                        }}
                      >
                        Tôi là chủ nhân món đồ này
                      </Button>
                    )}
                  </div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <ClaimModal
        open={claimModalOpen}
        item={selectedItem}
        onCancel={() => {
          setClaimModalOpen(false);
          setSelectedItem(null);
        }}
        onSuccess={() => {
          void loadItems();
          if (onSuccessClaim) onSuccessClaim();
        }}
      />
    </div>
  );
};
