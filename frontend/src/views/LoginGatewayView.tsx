import React, { useState } from 'react';
import {
  Typography,
  Form,
  Input,
  Button,
  Segmented,
  message,
  Tag,
} from 'antd';
import {
  SafetyCertificateOutlined,
  UserOutlined,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  LoginOutlined,
  UserAddOutlined,
  AppleOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';

const { Title, Text } = Typography;

interface LoginGatewayViewProps {
  onOpenPwaGuide: () => void;
}

export const LoginGatewayView: React.FC<LoginGatewayViewProps> = ({ onOpenPwaGuide }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  // Quick fill demo credentials
  const fillCredentials = (email: string, pass: string) => {
    setMode('login');
    loginForm.setFieldsValue({
      email,
      password: pass,
    });
    message.info(`Đã điền thông tin tài khoản: ${email}`);
  };

  const handleLoginSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const ok = await login(values.email.trim(), values.password);
      if (ok) {
        message.success('Đăng nhập thành công!');
      } else {
        message.error('Sai email hoặc mật khẩu');
      }
    } catch (err: any) {
      message.error(err.message || 'Lỗi kết nối máy chủ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegisterSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const ok = await register({
        email: values.email.trim(),
        password: values.password,
        full_name: values.full_name.trim(),
        phone: values.phone?.trim(),
      });
      if (ok) {
        message.success('Đăng ký tài khoản thành công! Bạn có thể sử dụng hệ thống.');
      } else {
        message.error('Đăng ký thất bại, email có thể đã được sử dụng');
      }
    } catch (err: any) {
      message.error(err.message || 'Lỗi khi tạo tài khoản');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
        width: '100%',
        maxWidth: 'none',
        margin: '0 auto',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 32,
            marginBottom: 14,
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.28)',
          }}
        >
          <SafetyCertificateOutlined />
        </div>
        <Title level={2} style={{ margin: 0, fontWeight: 800, letterSpacing: -0.5 }}>
          FindBox
        </Title>
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
          Hệ thống tủ thông minh quản lý &amp; tìm đồ thất lạc
        </Text>
        <Tag color="blue" style={{ marginTop: 10, borderRadius: 6, fontWeight: 600, fontSize: 11 }}>
          YÊU CẦU ĐĂNG NHẬP ĐỂ SỬ DỤNG
        </Tag>
      </div>

      {/* Quick Fill Demo Box */}
      <div
        className="card-clean"
        style={{
          background: '#f8fafc',
          border: '1px dashed #cbd5e1',
          padding: 12,
          marginBottom: 20,
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
          ⚡ Bấm để đăng nhập nhanh tài khoản demo:
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button
            size="middle"
            icon={<UserOutlined />}
            onClick={() => fillCredentials('user@findbox.vn', 'User@123456')}
            style={{ borderRadius: 8, fontSize: 12, fontWeight: 500 }}
          >
            Người dùng
          </Button>
          <Button
            size="middle"
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => fillCredentials('admin@findbox.vn', 'Admin@123456')}
            style={{ borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#9333ea', borderColor: '#9333ea' }}
          >
            Quản trị viên
          </Button>
        </div>
      </div>

      {/* Switcher Tab */}
      <div style={{ marginBottom: 20 }}>
        <Segmented
          block
          size="large"
          value={mode}
          onChange={(val) => setMode(val as 'login' | 'register')}
          options={[
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600 }}>
                  <LoginOutlined style={{ marginRight: 6 }} /> Đăng nhập
                </div>
              ),
              value: 'login',
            },
            {
              label: (
                <div style={{ padding: '6px 0', fontWeight: 600 }}>
                  <UserAddOutlined style={{ marginRight: 6 }} /> Đăng ký mới
                </div>
              ),
              value: 'register',
            },
          ]}
          style={{ background: '#f1f5f9', padding: 4, borderRadius: 12 }}
        />
      </div>

      {/* LOGIN FORM */}
      {mode === 'login' && (
        <div className="card-clean" style={{ margin: 0 }}>
          <Form
            form={loginForm}
            layout="vertical"
            onFinish={handleLoginSubmit}
            requiredMark={false}
          >
            <Form.Item
              name="email"
              label={<span style={{ fontWeight: 600 }}>Email</span>}
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không đúng định dạng' },
              ]}
            >
              <Input
                size="large"
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="email@example.com"
                autoComplete="email"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span style={{ fontWeight: 600 }}>Mật khẩu</span>}
              rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Nhập mật khẩu"
                autoComplete="current-password"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              icon={<LoginOutlined />}
              style={{
                height: 48,
                borderRadius: 12,
                background: '#2563eb',
                fontWeight: 600,
                fontSize: 15,
                marginTop: 8,
              }}
            >
              Đăng nhập vào FindBox
            </Button>
          </Form>
        </div>
      )}

      {/* REGISTER FORM */}
      {mode === 'register' && (
        <div className="card-clean" style={{ margin: 0 }}>
          <Form
            form={registerForm}
            layout="vertical"
            onFinish={handleRegisterSubmit}
            requiredMark={false}
          >
            <Form.Item
              name="full_name"
              label={<span style={{ fontWeight: 600 }}>Họ và tên <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[{ required: true, message: 'Vui lòng nhập họ tên' }]}
            >
              <Input
                size="large"
                prefix={<UserOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Nguyễn Văn A"
                autoComplete="name"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Form.Item
              name="email"
              label={<span style={{ fontWeight: 600 }}>Email <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không hợp lệ' },
              ]}
            >
              <Input
                size="large"
                prefix={<MailOutlined style={{ color: '#94a3b8' }} />}
                placeholder="email@example.com"
                autoComplete="email"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Form.Item
              name="phone"
              label={<span style={{ fontWeight: 600 }}>Số điện thoại (tùy chọn)</span>}
            >
              <Input
                size="large"
                prefix={<PhoneOutlined style={{ color: '#94a3b8' }} />}
                placeholder="0912345678"
                autoComplete="tel"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={<span style={{ fontWeight: 600 }}>Mật khẩu <span style={{ color: '#ef4444' }}>*</span></span>}
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu' },
                { min: 6, message: 'Mật khẩu tối thiểu 6 ký tự' },
              ]}
            >
              <Input.Password
                size="large"
                prefix={<LockOutlined style={{ color: '#94a3b8' }} />}
                placeholder="Tối thiểu 6 ký tự"
                autoComplete="new-password"
                style={{ borderRadius: 10, height: 46 }}
              />
            </Form.Item>

            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={submitting}
              icon={<UserAddOutlined />}
              style={{
                height: 48,
                borderRadius: 12,
                background: '#16a34a',
                borderColor: '#16a34a',
                fontWeight: 600,
                fontSize: 15,
                marginTop: 8,
              }}
            >
              Tạo tài khoản mới
            </Button>
          </Form>
        </div>
      )}

      {/* PWA Install Guide */}
      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Button
          type="text"
          icon={<AppleOutlined />}
          onClick={onOpenPwaGuide}
          style={{ color: '#64748b', fontSize: 13 }}
        >
          Hướng dẫn cài đặt PWA trên iPhone
        </Button>
      </div>
    </div>
  );
};
