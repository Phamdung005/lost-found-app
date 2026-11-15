import React, { useEffect, useState } from 'react';
import {
  Typography,
  Button,
  Input,
  Select,
  Tag,
  Modal,
  Form,
  Popconfirm,
  message,
  Space,
  Spin,
  Empty,
  Tooltip,
  Switch,
} from 'antd';
import {
  UserAddOutlined,
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  UnlockOutlined,
  CrownOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config/api';

const { Title, Text } = Typography;
const { Option } = Select;

interface UserItem {
  id: number;
  email: string;
  full_name: string;
  phone?: string | null;
  role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  lost_reports_count?: number;
  claims_count?: number;
}

export const AdminUsersView: React.FC = () => {
  const { user: currentAdmin, token } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Thêm User
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [createLoading, setCreateLoading] = useState(false);

  // Modal Sửa User
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [editForm] = Form.useForm();
  const [editLoading, setEditLoading] = useState(false);

  // Tải danh sách người dùng
  const fetchUsers = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`${API_BASE}/users?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
      } else {
        message.error(data.message || 'Không thể tải danh sách người dùng');
      }
    } catch (err) {
      console.error('Fetch users error:', err);
      message.error('Lỗi kết nối khi tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchUsers();
  }, [token, roleFilter, statusFilter]);

  // Xử lý tạo người dùng mới
  const handleCreateUser = async (values: any) => {
    setCreateLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Tạo người dùng thành công');
        setIsCreateModalOpen(false);
        createForm.resetFields();
        void fetchUsers();
      } else {
        message.error(data.message || 'Không thể tạo người dùng');
      }
    } catch (err) {
      console.error('Create user error:', err);
      message.error('Lỗi khi tạo người dùng');
    } finally {
      setCreateLoading(false);
    }
  };

  // Mở modal sửa người dùng
  const handleOpenEditModal = (u: UserItem) => {
    setEditingUser(u);
    editForm.setFieldsValue({
      full_name: u.full_name,
      phone: u.phone || '',
      role: u.role,
      is_active: u.is_active,
      password: '',
    });
    setIsEditModalOpen(true);
  };

  // Xử lý cập nhật thông tin & phân quyền
  const handleUpdateUser = async (values: any) => {
    if (!editingUser) return;
    setEditLoading(true);
    try {
      const payload: any = {
        full_name: values.full_name,
        phone: values.phone || null,
        role: values.role,
        is_active: values.is_active,
      };
      if (values.password && values.password.trim()) {
        payload.password = values.password.trim();
      }

      const res = await fetch(`${API_BASE}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Cập nhật người dùng thành công');
        setIsEditModalOpen(false);
        setEditingUser(null);
        void fetchUsers();
      } else {
        message.error(data.message || 'Không thể cập nhật người dùng');
      }
    } catch (err) {
      console.error('Update user error:', err);
      message.error('Lỗi khi cập nhật người dùng');
    } finally {
      setEditLoading(false);
    }
  };

  // Khóa / Mở khóa nhanh
  const handleToggleActive = async (u: UserItem) => {
    if (u.id === currentAdmin?.id) {
      message.warning('Bạn không thể tự khóa tài khoản của chính mình');
      return;
    }
    const nextStatus = !u.is_active;
    try {
      const res = await fetch(`${API_BASE}/users/${u.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ is_active: nextStatus }),
      });
      const data = await res.json();
      if (data.success) {
        message.success(nextStatus ? `Đã kích hoạt tài khoản "${u.email}"` : `Đã khóa tài khoản "${u.email}"`);
        void fetchUsers();
      } else {
        message.error(data.message || 'Thao tác thất bại');
      }
    } catch (err) {
      console.error('Toggle active error:', err);
      message.error('Lỗi thao tác');
    }
  };

  // Xóa người dùng
  const handleDeleteUser = async (userId: number) => {
    try {
      const res = await fetch(`${API_BASE}/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        message.success(data.message || 'Đã xóa người dùng thành công');
        void fetchUsers();
      } else {
        message.error(data.message || 'Không thể xóa người dùng');
      }
    } catch (err) {
      console.error('Delete user error:', err);
      message.error('Lỗi kết nối khi xóa người dùng');
    }
  };

  // Thống kê nhanh
  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const lockedCount = users.filter((u) => !u.is_active).length;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <Title level={4} style={{ margin: 0, fontWeight: 800 }}>
            Quản lý Người dùng
          </Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            Thêm, sửa, xóa tài khoản và phân quyền quản trị hệ thống.
          </Text>
        </div>
        <Space>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={fetchUsers}
            loading={loading}
            style={{ borderRadius: 8 }}
          />
          <Button
            type="primary"
            icon={<UserAddOutlined />}
            onClick={() => {
              createForm.resetFields();
              createForm.setFieldsValue({ role: 'user', is_active: true });
              setIsCreateModalOpen(true);
            }}
            style={{ borderRadius: 8, fontWeight: 600, background: '#2563eb' }}
          >
            Thêm
          </Button>
        </Space>
      </div>

      {/* Mini Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        <div className="card-clean" style={{ margin: 0, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{totalUsers}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Tổng số</div>
        </div>
        <div className="card-clean" style={{ margin: 0, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#9333ea' }}>{adminCount}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Quản trị viên</div>
        </div>
        <div className="card-clean" style={{ margin: 0, padding: '10px 12px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: lockedCount > 0 ? '#ef4444' : '#10b981' }}>
            {lockedCount}
          </div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Đã khóa</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-clean" style={{ margin: '0 0 14px', padding: 12 }}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Input
            placeholder="Tìm theo tên, email, SĐT..."
            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={fetchUsers}
            allowClear
            style={{ borderRadius: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <Select
              value={roleFilter}
              onChange={setRoleFilter}
              style={{ flex: 1 }}
              size="middle"
            >
              <Option value="all">Tất cả vai trò</Option>
              <Option value="admin">Quản trị viên (Admin)</Option>
              <Option value="user">Người dùng (User)</Option>
            </Select>

            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ flex: 1 }}
              size="middle"
            >
              <Option value="all">Tất cả trạng thái</Option>
              <Option value="active">Đang hoạt động</Option>
              <Option value="inactive">Đã khóa</Option>
            </Select>
          </div>
        </Space>
      </div>

      {/* Users List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 8, color: '#64748b', fontSize: 13 }}>Đang tải danh sách người dùng...</div>
        </div>
      ) : users.length === 0 ? (
        <Empty description="Không tìm thấy người dùng nào phù hợp" style={{ margin: '40px 0' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {users.map((u) => {
            const isSelf = u.id === currentAdmin?.id;
            return (
              <div
                key={u.id}
                className="card-clean"
                style={{
                  margin: 0,
                  borderLeft: u.role === 'admin' ? '4px solid #9333ea' : '4px solid #3b82f6',
                  opacity: u.is_active ? 1 : 0.65,
                  background: u.is_active ? '#ffffff' : '#f8fafc',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: u.role === 'admin' ? '#9333ea' : '#2563eb',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {u.role === 'admin' ? <CrownOutlined /> : <UserOutlined />}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                          {u.full_name}
                        </span>
                        {isSelf && (
                          <Tag color="cyan" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                            Bạn
                          </Tag>
                        )}
                        <Tag
                          color={u.role === 'admin' ? 'purple' : 'blue'}
                          style={{ fontSize: 10, padding: '0 6px', borderRadius: 4, margin: 0, fontWeight: 600 }}
                        >
                          {u.role === 'admin' ? 'ADMIN' : 'USER'}
                        </Tag>
                        <Tag
                          color={u.is_active ? 'success' : 'error'}
                          style={{ fontSize: 10, padding: '0 6px', borderRadius: 4, margin: 0 }}
                        >
                          {u.is_active ? 'Hoạt động' : 'Đã khóa'}
                        </Tag>
                      </div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        <MailOutlined style={{ marginRight: 4 }} />
                        {u.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional Info */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 12,
                    fontSize: 12,
                    color: '#64748b',
                    padding: '8px 10px',
                    background: '#f8fafc',
                    borderRadius: 8,
                    marginBottom: 10,
                  }}
                >
                  {u.phone && (
                    <span>
                      <PhoneOutlined style={{ marginRight: 4 }} />
                      {u.phone}
                    </span>
                  )}
                  <span>
                    Báo mất: <strong>{u.lost_reports_count || 0}</strong>
                  </span>
                  <span>
                    Nhận đồ: <strong>{u.claims_count || 0}</strong>
                  </span>
                  <span>
                    Tạo: {new Date(u.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  {/* Nút Khóa / Mở khóa nhanh */}
                  <Tooltip title={isSelf ? 'Không thể tự khóa tài khoản' : u.is_active ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}>
                    <Button
                      size="small"
                      disabled={isSelf}
                      icon={u.is_active ? <LockOutlined /> : <UnlockOutlined />}
                      onClick={() => handleToggleActive(u)}
                      style={{
                        borderRadius: 6,
                        color: u.is_active ? '#e11d48' : '#16a34a',
                        borderColor: u.is_active ? '#fecdd3' : '#bbf7d0',
                      }}
                    >
                      {u.is_active ? 'Khóa' : 'Mở khóa'}
                    </Button>
                  </Tooltip>

                  {/* Nút Sửa / Phân quyền */}
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    icon={<EditOutlined />}
                    onClick={() => handleOpenEditModal(u)}
                    style={{ borderRadius: 6 }}
                  >
                    Sửa & Phân quyền
                  </Button>

                  {/* Nút Xóa */}
                  <Tooltip title={isSelf ? 'Không thể tự xóa chính mình' : 'Xóa tài khoản'}>
                    <Popconfirm
                      title="Xóa tài khoản này?"
                      description={
                        <div>
                          Hành động này sẽ xóa hoàn toàn tài khoản <strong>{u.email}</strong>.
                          <br />
                          Các báo cáo và lịch sử liên quan sẽ được giữ lại an toàn.
                        </div>
                      }
                      okText="Xóa vĩnh viễn"
                      cancelText="Hủy"
                      okButtonProps={{ danger: true }}
                      disabled={isSelf}
                      onConfirm={() => handleDeleteUser(u.id)}
                    >
                      <Button
                        size="small"
                        danger
                        disabled={isSelf}
                        icon={<DeleteOutlined />}
                        style={{ borderRadius: 6 }}
                      />
                    </Popconfirm>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Thêm người dùng mới */}
      <Modal
        title={
          <Space>
            <UserAddOutlined style={{ color: '#2563eb' }} />
            <span>Thêm tài khoản người dùng mới</span>
          </Space>
        }
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateUser}
          initialValues={{ role: 'user', is_active: true }}
          style={{ marginTop: 16 }}
        >
          <Form.Item
            name="email"
            label="Địa chỉ Email"
            rules={[
              { required: true, message: 'Vui lòng nhập email' },
              { type: 'email', message: 'Email không đúng định dạng' },
            ]}
          >
            <Input prefix={<MailOutlined style={{ color: '#94a3b8' }} />} placeholder="vidu@findbox.vn" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Mật khẩu khởi tạo"
            rules={[
              { required: true, message: 'Vui lòng nhập mật khẩu' },
              { min: 6, message: 'Mật khẩu phải từ 6 ký tự trở lên' },
            ]}
          >
            <Input.Password prefix={<KeyOutlined style={{ color: '#94a3b8' }} />} placeholder="Tối thiểu 6 ký tự" />
          </Form.Item>

          <Form.Item
            name="full_name"
            label="Họ và tên"
            rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
          >
            <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} placeholder="Ví dụ: Nguyễn Văn A" />
          </Form.Item>

          <Form.Item name="phone" label="Số điện thoại liên hệ">
            <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} placeholder="Ví dụ: 0912345678" />
          </Form.Item>

          <Form.Item
            name="role"
            label="Phân quyền (Vai trò)"
            rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
          >
            <Select>
              <Option value="user">Người dùng thông thường (User)</Option>
              <Option value="admin">Quản trị viên hệ thống (Admin)</Option>
            </Select>
          </Form.Item>

          <Form.Item name="is_active" label="Trạng thái tài khoản" valuePropName="checked">
            <Switch checkedChildren="Hoạt động" unCheckedChildren="Khóa" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
            <Button onClick={() => setIsCreateModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={createLoading} style={{ background: '#2563eb' }}>
              Tạo tài khoản
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Chỉnh sửa & Phân quyền người dùng */}
      <Modal
        title={
          <Space>
            <EditOutlined style={{ color: '#9333ea' }} />
            <span>Chỉnh sửa & Phân quyền tài khoản</span>
          </Space>
        }
        open={isEditModalOpen}
        onCancel={() => {
          setIsEditModalOpen(false);
          setEditingUser(null);
        }}
        footer={null}
        destroyOnClose
      >
        {editingUser && (
          <Form
            form={editForm}
            layout="vertical"
            onFinish={handleUpdateUser}
            style={{ marginTop: 16 }}
          >
            <div
              style={{
                background: '#f1f5f9',
                padding: '10px 12px',
                borderRadius: 8,
                marginBottom: 16,
                fontSize: 13,
              }}
            >
              Email định danh: <strong>{editingUser.email}</strong> (Không đổi)
            </div>

            <Form.Item
              name="full_name"
              label="Họ và tên"
              rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
            >
              <Input prefix={<UserOutlined style={{ color: '#94a3b8' }} />} />
            </Form.Item>

            <Form.Item name="phone" label="Số điện thoại liên hệ">
              <Input prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />} />
            </Form.Item>

            <Form.Item
              name="role"
              label="Phân quyền (Vai trò)"
              rules={[{ required: true, message: 'Vui lòng chọn vai trò' }]}
            >
              <Select disabled={editingUser.id === currentAdmin?.id}>
                <Option value="user">Người dùng thông thường (User)</Option>
                <Option value="admin">Quản trị viên hệ thống (Admin)</Option>
              </Select>
            </Form.Item>

            <Form.Item name="is_active" label="Trạng thái tài khoản" valuePropName="checked">
              <Switch
                checkedChildren="Hoạt động"
                unCheckedChildren="Khóa"
                disabled={editingUser.id === currentAdmin?.id}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Đặt mật khẩu mới (Nếu cần reset)"
              extra="Để trống nếu không muốn thay đổi mật khẩu của tài khoản này"
            >
              <Input.Password
                prefix={<KeyOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Nhập mật khẩu mới từ 6 ký tự"
              />
            </Form.Item>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
              <Button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingUser(null);
                }}
              >
                Hủy
              </Button>
              <Button type="primary" htmlType="submit" loading={editLoading} style={{ background: '#9333ea' }}>
                Lưu thay đổi
              </Button>
            </div>
          </Form>
        )}
      </Modal>
    </div>
  );
};
