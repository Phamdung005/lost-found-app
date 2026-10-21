import React, { useState } from 'react';
import { Modal, Tabs, Form, Input, Button, Space, Typography, Alert, Divider } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Text, Paragraph } = Typography;

interface AuthModalProps {
  open: boolean;
  onCancel: () => void;
  defaultTab?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onCancel, defaultTab = 'login' }) => {
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  const handleLogin = async (values: any) => {
    setLoading(true);
    const ok = await login(values.email, values.password);
    setLoading(false);
    if (ok) {
      loginForm.resetFields();
      onCancel();
    }
  };

  const handleRegister = async (values: any) => {
    setLoading(true);
    const ok = await register({
      email: values.email,
      password: values.password,
      full_name: values.full_name,
      phone: values.phone,
    });
    setLoading(false);
    if (ok) {
      registerForm.resetFields();
      onCancel();
    }
  };

  const fillQuickAccount = (email: string, pass: string) => {
    setActiveTab('login');
    loginForm.setFieldsValue({
      email,
      password: pass,
    });
  };

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      centered
      title={
        <Space align="center" style={{ marginBottom: 8 }}>
          <SafetyCertificateOutlined style={{ color: '#2563eb', fontSize: 22 }} />
          <span style={{ fontWeight: 700, fontSize: 18 }}>Tài khoản FindBox</span>
        </Space>
      }
    >
      <Tabs
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as 'login' | 'register')}
        items={[
          {
            key: 'login',
            label: 'Đăng nhập',
            children: (
              <div>
                <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
                  Đăng nhập để quản trị tủ đồ thông minh hoặc gửi yêu cầu nhận lại đồ thất lạc.
                </Paragraph>

                <Form form={loginForm} layout="vertical" onFinish={handleLogin}>
                  <Form.Item
                    name="email"
                    label="Email"
                    rules={[
                      { required: true, message: 'Vui lòng nhập email' },
                      { type: 'email', message: 'Email không hợp lệ' },
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="admin@findbox.vn" size="large" />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label="Mật khẩu"
                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="••••••••" size="large" />
                  </Form.Item>

                  <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                    Đăng nhập hệ thống
                  </Button>
                </Form>

                <Divider style={{ margin: '18px 0 12px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    TÀI KHOẢN MẪU KIỂM THỬ NHANH
                  </Text>
                </Divider>

                <Space direction="vertical" style={{ width: '100%' }}>
                  <Alert
                    type="info"
                    showIcon
                    icon={<RocketOutlined />}
                    message={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Text strong>Admin:</Text> admin@findbox.vn
                        </div>
                        <Button
                          size="small"
                          type="link"
                          onClick={() => fillQuickAccount('admin@findbox.vn', 'Admin@123456')}
                        >
                          Điền nhanh
                        </Button>
                      </div>
                    }
                  />

                  <Alert
                    type="success"
                    showIcon
                    icon={<UserOutlined />}
                    message={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <Text strong>User:</Text> user@findbox.vn
                        </div>
                        <Button
                          size="small"
                          type="link"
                          onClick={() => fillQuickAccount('user@findbox.vn', 'User@123456')}
                        >
                          Điền nhanh
                        </Button>
                      </div>
                    }
                  />
                </Space>
              </div>
            ),
          },
          {
            key: 'register',
            label: 'Đăng ký tài khoản',
            children: (
              <div>
                <Paragraph type="secondary" style={{ fontSize: 13, marginBottom: 16 }}>
                  Đăng ký tài khoản để theo dõi báo cáo mất đồ và nhận mã OTP mở tủ khi xác minh.
                </Paragraph>

                <Form form={registerForm} layout="vertical" onFinish={handleRegister}>
                  <Form.Item
                    name="full_name"
                    label="Họ và tên"
                    rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
                  >
                    <Input prefix={<UserOutlined />} placeholder="Nguyễn Văn A" size="large" />
                  </Form.Item>

                  <Form.Item
                    name="email"
                    label="Địa chỉ Email"
                    rules={[
                      { required: true, message: 'Vui lòng nhập email' },
                      { type: 'email', message: 'Email không hợp lệ' },
                    ]}
                  >
                    <Input prefix={<MailOutlined />} placeholder="vidu@gmail.com" size="large" />
                  </Form.Item>

                  <Form.Item
                    name="phone"
                    label="Số điện thoại (tùy chọn)"
                    rules={[{ pattern: /^[0-9+ ]{8,15}$/, message: 'Số điện thoại không hợp lệ' }]}
                  >
                    <Input prefix={<PhoneOutlined />} placeholder="0912345678" size="large" />
                  </Form.Item>

                  <Form.Item
                    name="password"
                    label="Mật khẩu"
                    rules={[
                      { required: true, message: 'Vui lòng nhập mật khẩu' },
                      { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} placeholder="Tối thiểu 6 ký tự" size="large" />
                  </Form.Item>

                  <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                    Tạo tài khoản mới
                  </Button>
                </Form>
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};
