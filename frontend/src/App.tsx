import { useEffect, useState } from 'react';
import {
  App as AntApp,
  Badge,
  Button,
  Card,
  Col,
  Layout,
  Menu,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Typography,
  message,
  Form,
  Input,
  Modal,
} from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  BoxPlotOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  InboxOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  FileAddOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import './App.css';

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

type Locker = {
  id: number;
  locker_code: string;
  location: string;
  status: string;
};

type Slot = {
  locker_code: string;
  slot_code: string;
  status: string;
};

type LostReport = {
  id: number;
  item_name: string;
  description: string | null;
  lost_location: string;
  lost_at: string | null;
  reporter_contact: string | null;
  status: string;
  created_at: string;
};

const API = 'http://localhost:3000/api';

function App() {
  const [lockers, setLockers] = useState<Locker[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reportForm] = Form.useForm();
  const [lostReports, setLostReports] = useState<LostReport[]>([]);

  const submitLostReport = async (values: {
    item_name: string;
    description?: string;
    lost_location: string;
    lost_at?: string;
    reporter_contact?: string;
  }) => {
    setSubmitting(true);

    try {
      const response = await fetch(`${API}/lost-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Không thể gửi báo cáo');
      }

      message.success('Đã gửi báo cáo mất đồ thành công!');
      reportForm.resetFields();
      setReportOpen(false);
    } catch (error) {
      console.error(error);
      message.error('Gửi báo cáo thất bại. Hãy kiểm tra kết nối backend.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);

    try {
      const [lockerResponse, slotResponse, reportResponse] = await Promise.all([
        fetch(`${API}/lockers`),
        fetch(`${API}/lockers/L-001/slots`),
        fetch(`${API}/lost-reports`),
      ]);

      if (
        !lockerResponse.ok ||
        !slotResponse.ok ||
        !reportResponse.ok
      ) {
        throw new Error('API trả về lỗi');
      }

      const lockerJson = await lockerResponse.json();
      const slotJson = await slotResponse.json();
      const reportJson = await reportResponse.json();

      setLockers(lockerJson.data ?? []);
      setSlots(slotJson.data ?? []);
      setLostReports(reportJson.data ?? []);
      setApiOnline(true);

    } catch (error) {
      console.error(error);
      setApiOnline(false);
      message.error('Không kết nối được backend. Hãy kiểm tra server ở cổng 3000.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const occupiedSlots = slots.filter(
    (slot) => slot.status.toLowerCase() !== 'empty',
  ).length;

  const onlineLockers = lockers.filter(
    (locker) => locker.status.toLowerCase() === 'online',
  ).length;

  return (
    <AntApp>
      <Layout className="app-layout">
        <Sider width={245} className="sidebar" breakpoint="lg" collapsedWidth="0">
          <div className="brand">
            <div className="brand-icon">
              <SafetyCertificateOutlined />
            </div>
            <div>
              <div className="brand-title">FindBox</div>
              <div className="brand-subtitle">SMART LOCKER SYSTEM</div>
            </div>
          </div>

          <div className="menu-label">WORKSPACE</div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={['dashboard']}
            items={[
              {
                key: 'dashboard',
                icon: <DashboardOutlined />,
                label: 'Tổng quan',
              },
              {
                key: 'items',
                icon: <InboxOutlined />,
                label: 'Đồ thất lạc',
              },
              {
                key: 'lockers',
                icon: <AppstoreOutlined />,
                label: 'Quản lý tủ đồ',
              },
              {
                key: 'reports',
                icon: <BoxPlotOutlined />,
                label: 'Báo cáo mất đồ',
              },
            ]}
          />

          <div className="sidebar-bottom">
            <div className="help-card">
              <div className="help-icon"><SafetyCertificateOutlined /></div>
              <Text strong className="help-title">Hệ thống an toàn</Text>
              <Text className="help-description">
                Theo dõi trạng thái tủ và các ngăn lưu trữ.
              </Text>
              <Tag color={apiOnline ? 'success' : 'warning'}>
                {apiOnline ? 'Backend đang kết nối' : 'Đang kiểm tra kết nối'}
              </Tag>
            </div>
            <Text className="sidebar-footer">FindBox · IoT Project 2026</Text>
          </div>
        </Sider>

        <Layout>
          <Header className="topbar">
            <div>
              <Text className="breadcrumb">Workspace / </Text>
              <Text strong>Tổng quan</Text>
            </div>
            <Space size={16}>
              <Badge dot={apiOnline} color={apiOnline ? '#22c55e' : '#f59e0b'}>
                <BellOutlined className="topbar-icon" />
              </Badge>
              <div className="profile">
                <div className="profile-avatar">A</div>
                <div className="profile-info">
                  <Text strong>Quản trị viên</Text>
                  <Text type="secondary" className="profile-role">Administrator</Text>
                </div>
              </div>
            </Space>
          </Header>

          <Content className="dashboard-content">
            <div className="page-heading">
              <div>
                <Text className="eyebrow">SMART LOST & FOUND</Text>
                <Title level={2}>Tổng quan hệ thống</Title>
                <Text type="secondary">
                  Theo dõi tủ thông minh và quản lý đồ thất lạc tại một nơi.
                </Text>
              </div>
              <Space wrap>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void loadData()}
                  loading={loading}
                >
                  Làm mới dữ liệu
                </Button>

                <Button
                  type="primary"
                  icon={<FileAddOutlined />}
                  onClick={() => setReportOpen(true)}
                >
                  Báo mất đồ
                </Button>
              </Space>
            </div>

            <div className="status-strip">
              <span className={`status-dot ${apiOnline ? 'online' : 'offline'}`} />
              <Text>
                {apiOnline
                  ? 'Đã kết nối API và cơ sở dữ liệu'
                  : 'Chưa kết nối được API — hãy kiểm tra backend'}
              </Text>
              <Text type="secondary" className="status-end">
                <ClockCircleOutlined /> Cập nhật khi tải dữ liệu
              </Text>
            </div>

            <Row gutter={[16, 16]} className="stats-row">
              <Col xs={24} sm={12} xl={6}>
                <Card className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon purple"><AppstoreOutlined /></span>
                    <Tag color="blue">Phần cứng</Tag>
                  </div>
                  <Statistic title="Tổng số tủ" value={lockers.length} />
                  <Text type="secondary" className="stat-foot">
                    Tủ đã đăng ký trong hệ thống
                  </Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon green"><CheckCircleOutlined /></span>
                    <Tag color="success">Trực tuyến</Tag>
                  </div>
                  <Statistic title="Tủ đang hoạt động" value={onlineLockers} />
                  <Text type="secondary" className="stat-foot">
                    Theo trạng thái lưu trong database
                  </Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon orange"><InboxOutlined /></span>
                    <Tag color="warning">Lưu trữ</Tag>
                  </div>
                  <Statistic title="Tổng số ngăn" value={slots.length} />
                  <Text type="secondary" className="stat-foot">
                    {occupiedSlots} ngăn không ở trạng thái trống
                  </Text>
                </Card>
              </Col>
              <Col xs={24} sm={12} xl={6}>
                <Card className="stat-card">
                  <div className="stat-top">
                    <span className="stat-icon blue"><EnvironmentOutlined /></span>
                    <Tag color="cyan">Vị trí</Tag>
                  </div>
                  <Statistic title="Điểm lưu trữ" value={lockers.length} />
                  <Text type="secondary" className="stat-foot">
                    Các tủ được đăng ký trong hệ thống
                  </Text>
                </Card>
              </Col>
            </Row>

            <Row gutter={[16, 16]} className="main-row">
              <Col xs={24} xl={15}>
                <Card
                  className="section-card"
                  title={
                    <Space>
                      <span className="section-title-icon"><AppstoreOutlined /></span>
                      <span>Trạng thái tủ thông minh</span>
                    </Space>
                  }
                  extra={<Tag color="blue">{lockers.length} tủ</Tag>}
                >
                  {lockers.length === 0 ? (
                    <div className="empty-state">
                      <InboxOutlined />
                      <Text>Chưa có dữ liệu tủ để hiển thị.</Text>
                    </div>
                  ) : (
                    <div className="locker-list">
                      {lockers.map((locker) => (
                        <div className="locker-item" key={locker.id}>
                          <div className="locker-illustration">
                            <AppstoreOutlined />
                          </div>
                          <div className="locker-details">
                            <Text strong>{locker.locker_code}</Text>
                            <Text type="secondary">
                              <EnvironmentOutlined /> {locker.location}
                            </Text>
                            <Text className="locker-slot-count">
                              {locker.locker_code === 'L-001'
                                ? `${slots.length} ngăn được cấu hình`
                                : 'Chưa tải thông tin ngăn'}
                            </Text>
                          </div>
                          <Tag color={locker.status.toLowerCase() === 'online' ? 'success' : 'default'}>
                            {locker.status.toLowerCase() === 'online'
                              ? 'Hoạt động'
                              : locker.status}
                          </Tag>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card
                  className="section-card slots-card"
                  title={
                    <Space>
                      <span className="section-title-icon"><InboxOutlined /></span>
                      <span>Chi tiết ngăn tủ · L-001</span>
                    </Space>
                  }
                  extra={<Text type="secondary">2 ngăn dự kiến</Text>}
                >
                  <Row gutter={[12, 12]}>
                    {slots.map((slot) => {
                      const isEmpty = slot.status.toLowerCase() === 'empty';
                      return (
                        <Col xs={24} sm={12} key={slot.slot_code}>
                          <div className={`slot-box ${isEmpty ? 'slot-empty' : 'slot-used'}`}>
                            <div className="slot-header">
                              <div className="slot-symbol"><InboxOutlined /></div>
                              <Tag color={isEmpty ? 'success' : 'orange'}>
                                {isEmpty ? 'Trống' : slot.status}
                              </Tag>
                            </div>
                            <Title level={4}>{slot.slot_code}</Title>
                            <Text type="secondary">
                              {isEmpty
                                ? 'Sẵn sàng tiếp nhận đồ vật'
                                : 'Ngăn đang được sử dụng hoặc cần kiểm tra'}
                            </Text>
                            <Progress
                              percent={isEmpty ? 0 : 100}
                              showInfo={false}
                              strokeColor={isEmpty ? '#22c55e' : '#f59e0b'}
                              size="small"
                            />
                          </div>
                        </Col>
                      );
                    })}
                    {slots.length === 0 && (
                      <Col span={24}>
                        <div className="empty-state">
                          Chưa tải được thông tin các ngăn tủ.
                        </div>
                      </Col>
                    )}
                  </Row>
                </Card>
                <Card
                  className="section-card"
                  title={
                    <Space>
                      <span className="section-title-icon">
                        <InboxOutlined />
                      </span>
                      <span>Báo cáo mất đồ gần đây</span>
                    </Space>
                  }
                  extra={<Tag color="blue">{lostReports.length} báo cáo</Tag>}
                >
                  {lostReports.length === 0 ? (
                    <div className="empty-state">
                      <InboxOutlined />
                      <Text>Chưa có báo cáo mất đồ nào.</Text>
                    </div>
                  ) : (
                    <div className="locker-list">
                      {lostReports.map((report) => (
                        <div className="locker-item" key={report.id}>
                          <div className="locker-illustration">
                            <SearchOutlined />
                          </div>

                          <div className="locker-details">
                            <Text strong>{report.item_name}</Text>

                            <Text type="secondary">
                              <EnvironmentOutlined /> {report.lost_location}
                            </Text>

                            {report.description && (
                              <Text type="secondary">
                                {report.description}
                              </Text>
                            )}

                            <Text className="locker-slot-count">
                              Báo lúc: {new Date(report.created_at).toLocaleString('vi-VN')}
                            </Text>
                          </div>

                          <Tag
                            color={
                              report.status === 'pending'
                                ? 'processing'
                                : report.status === 'matched'
                                  ? 'success'
                                  : 'default'
                            }
                          >
                            {report.status === 'pending'
                              ? 'Đang chờ'
                              : report.status === 'matched'
                                ? 'Đã ghép'
                                : report.status}
                          </Tag>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </Col>

              <Col xs={24} xl={9}>
                <Card className="section-card" title="Tổng quan lưu trữ">
                  <div className="storage-summary">
                    <div className="storage-ring">
                      <div className="storage-ring-inner">
                        <InboxOutlined />
                        <Title level={3}>{slots.length}</Title>
                        <Text type="secondary">ngăn tủ</Text>
                      </div>
                    </div>
                    <Text type="secondary" className="storage-caption">
                      Thống kê dựa trên dữ liệu các ngăn đã tải từ backend.
                    </Text>
                  </div>
                  <div className="storage-line">
                    <span className="legend-dot green-dot" />
                    <Text>Ngăn trống</Text>
                    <Text strong>
                      {slots.filter((slot) => slot.status.toLowerCase() === 'empty').length}
                    </Text>
                  </div>
                  <div className="storage-line">
                    <span className="legend-dot orange-dot" />
                    <Text>Ngăn không trống</Text>
                    <Text strong>{occupiedSlots}</Text>
                  </div>
                  <div className="storage-line">
                    <span className="legend-dot blue-dot" />
                    <Text>Tủ trực tuyến</Text>
                    <Text strong>{onlineLockers}</Text>
                  </div>
                </Card>

                <Card className="section-card quick-card" title="Truy cập nhanh">
                  <Button block icon={<ReloadOutlined />} onClick={() => void loadData()} loading={loading}>
                    Đồng bộ dữ liệu
                  </Button>
                  <Button
                    block
                    icon={<InboxOutlined />}
                    onClick={() => message.info('Phần quản lý đồ thất lạc sẽ được bổ sung ở bước tiếp theo.')}
                  >
                    Quản lý đồ thất lạc
                  </Button>
                  <Button
                    block
                    icon={<SafetyCertificateOutlined />}
                    onClick={() => message.info('Chức năng mở ngăn sẽ được kết nối với ESP32 sau.')}
                  >
                    Điều khiển tủ IoT
                  </Button>
                </Card>

                <Card className="tip-card">
                  <div className="tip-icon"><SafetyCertificateOutlined /></div>
                  <Title level={5}>Bảo mật là ưu tiên</Title>
                  <Text>
                    Mã nhận đồ cần được xác minh trước khi cho phép mở ngăn.
                    Mọi thao tác mở tủ nên được ghi lại.
                  </Text>
                </Card>
              </Col>
            </Row>

            <div className="page-footer">
              <Text type="secondary">FindBox Smart Locker · Dashboard quản lý đồ thất lạc</Text>
              <Text type="secondary">Prototype · 2026</Text>
            </div>
          </Content>
        </Layout>
      </Layout>
      <Modal
        title="Tạo báo cáo mất đồ"
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Text type="secondary">
          Cung cấp thông tin để quản trị viên đối chiếu với đồ vật được tìm thấy.
        </Text>

        <Form
          form={reportForm}
          layout="vertical"
          onFinish={submitLostReport}
          style={{ marginTop: 20 }}
        >
          <Form.Item
            name="item_name"
            label="Tên đồ vật"
            rules={[{ required: true, message: 'Vui lòng nhập tên đồ vật' }]}
          >
            <Input placeholder="Ví dụ: Ví màu đen" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Mô tả"
          >
            <Input.TextArea
              rows={3}
              placeholder="Đặc điểm nhận dạng của đồ vật..."
            />
          </Form.Item>

          <Form.Item
            name="lost_location"
            label="Địa điểm mất"
            rules={[{ required: true, message: 'Vui lòng nhập địa điểm mất' }]}
          >
            <Input placeholder="Ví dụ: Phòng học A203" />
          </Form.Item>

          <Form.Item
            name="lost_at"
            label="Thời gian mất"
          >
            <Input type="datetime-local" />
          </Form.Item>

          <Form.Item
            name="reporter_contact"
            label="Thông tin liên hệ (không bắt buộc)"
          >
            <Input placeholder="Email hoặc số điện thoại" />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            block
            loading={submitting}
          >
            Gửi báo cáo
          </Button>
        </Form>
      </Modal>
    </AntApp>
  );
}

export default App;