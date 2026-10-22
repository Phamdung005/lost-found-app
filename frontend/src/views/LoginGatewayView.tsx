import React, { useState, useEffect } from 'react';
import {
  Typography,
  Form,
  Input,
  Button,
  Segmented,
  message,
  Space,
  Tag,
  Modal,
  Alert,
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
  SettingOutlined,
  CheckCircleOutlined,
  DisconnectOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { getApiBase, setCustomApiBase, cleanApiBase } from '../config/api';

const { Title, Text, Paragraph } = Typography;

interface LoginGatewayViewProps {
  onOpenPwaGuide: () => void;
}

export const LoginGatewayView: React.FC<LoginGatewayViewProps> = ({ onOpenPwaGuide }) => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [submitting, setSubmitting] = useState(false);
  const [loginForm] = Form.useForm();
  const [registerForm] = Form.useForm();

  // Server config modal state
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => {
    const current = getApiBase();
    return current === '/api' ? '' : current;
  });
  const [pingStatus, setPingStatus] = useState<'testing' | 'online' | 'offline' | null>(null);
  const [pingMessage, setPingMessage] = useState<string>('');

  const checkConnection = async (targetUrl?: string) => {
    const raw = targetUrl !== undefined ? targetUrl : getApiBase();
    const base = cleanApiBase(raw);

    if (!base || base === '/api') {
      setPingStatus('offline');
      setPingMessage('Chưa cấu hình URL Backend. Vui lòng nhập link Backend Render của bạn.');
      return;
    }

    setPingStatus('testing');
    try {
      const res = await fetch(`${base}/db-check`, { method: 'GET' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setPingStatus('offline');
        setPingMessage('Máy chủ trả về HTML thay vì JSON API. Vui lòng kiểm tra lại URL Backend.');
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setPingStatus('online');
        setPingMessage(`Đã kết nối máy chủ! (${data.data?.database || 'PostgreSQL'})`);
      } else {
        setPingStatus('offline');
        setPingMessage(`Máy chủ phản hồi mã lỗi HTTP ${res.status}`);
      }
    } catch (err: any) {
      setPingStatus('offline');
      setPingMessage(err?.message || 'Không thể kết nối máy chủ backend');
    }
  };

  useEffect(() => {
    // Tự động kiểm tra kết nối khi mở màn hình
    checkConnection();
  }, []);

  const handleSaveServerUrl = () => {
    const cleaned = cleanApiBase(serverUrlInput);
    setCustomApiBase(cleaned);
    message.success('Đã lưu cấu hình máy chủ! Ứng dụng sẽ áp dụng URL mới.');
    setServerModalOpen(false);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

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
    <div style={{ padding: '24px 16px 40px', maxWidth: 420, margin: '0 auto' }}>
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 18,
            background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
            color: '#ffffff',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 30,
            marginBottom: 12,
            boxShadow: '0 8px 20px rgba(37, 99, 235, 0.25)',
          }}
        >
          <SafetyCertificateOutlined />
        </div>
        <Title level={3} style={{ margin: 0, fontWeight: 800, letterSpacing: -0.5 }}>
          FindBox
        </Title>
        <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
          Hệ thống tủ thông minh quản lý & tìm đồ thất lạc
        </Text>
        <Tag color="blue" style={{ marginTop: 8, borderRadius: 6, fontWeight: 600 }}>
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
            Người dùng (User)
          </Button>
          <Button
            size="middle"
            type="primary"
            icon={<ThunderboltOutlined />}
            onClick={() => fillCredentials('admin@findbox.vn', 'Admin@123456')}
            style={{ borderRadius: 8, fontSize: 12, fontWeight: 500, background: '#9333ea', borderColor: '#9333ea' }}
          >
            Quản trị (Admin)
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

      {/* Server Connectivity Alert */}
      {pingStatus === 'offline' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16, borderRadius: 10, fontSize: 13 }}
          message="Không thể kết nối đến máy chủ"
          description={
            <div>
              <span>{pingMessage || 'Kiểm tra đường truyền hoặc URL máy chủ.'}</span>
              <div style={{ marginTop: 6 }}>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  icon={<SettingOutlined />}
                  onClick={() => setServerModalOpen(true)}
                >
                  Cấu hình URL máy chủ
                </Button>
              </div>
            </div>
          }
        />
      )}

      {/* PWA Install Guide & Server Config Shortcut */}
      <div style={{ marginTop: 24, textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
        <Button
          type="text"
          icon={<AppleOutlined />}
          onClick={onOpenPwaGuide}
          style={{ color: '#64748b', fontSize: 13 }}
        >
          Hướng dẫn cài đặt PWA trên iPhone
        </Button>

        <Button
          type="link"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => {
            setServerUrlInput(getApiBase());
            setServerModalOpen(true);
          }}
          style={{ color: '#94a3b8', fontSize: 12 }}
        >
          Cấu hình kết nối máy chủ ({getApiBase()})
        </Button>
      </div>

      {/* Modal Cấu hình máy chủ */}
      <Modal
        title={
          <Space>
            <SettingOutlined style={{ color: '#2563eb' }} />
            <span>Cài đặt kết nối máy chủ Backend</span>
          </Space>
        }
        open={serverModalOpen}
        onCancel={() => setServerModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setServerModalOpen(false)}>
            Đóng
          </Button>,
          <Button
            key="test"
            icon={<ReloadOutlined />}
            loading={pingStatus === 'testing'}
            onClick={() => checkConnection(serverUrlInput)}
          >
            Kiểm tra
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveServerUrl}>
            Lưu & Áp dụng
          </Button>,
        ]}
      >
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          Bạn có thể nhập trực tiếp link backend Render của bạn vào đây. Cấu hình này chỉ lưu trên trình duyệt của bạn (không đẩy lên Git).
        </Paragraph>

        <div style={{ marginBottom: 12 }}>
          <label style={{ fontWeight: 600, fontSize: 13, display: 'block', marginBottom: 6 }}>
            Backend API URL:
          </label>
          <Input
            value={serverUrlInput}
            onChange={(e) => setServerUrlInput(e.target.value)}
            placeholder="Ví dụ: https://your-backend.onrender.com/api"
            allowClear
          />
        </div>

        {/* Trạng thái kiểm tra */}
        {pingStatus && (
          <div style={{ marginTop: 12 }}>
            {pingStatus === 'testing' && (
              <Tag color="processing">Đang kiểm tra kết nối tới {serverUrlInput}...</Tag>
            )}
            {pingStatus === 'online' && (
              <Tag icon={<CheckCircleOutlined />} color="success">
                {pingMessage}
              </Tag>
            )}
            {pingStatus === 'offline' && (
              <Tag icon={<DisconnectOutlined />} color="error">
                {pingMessage}
              </Tag>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <Button
            size="small"
            type="dashed"
            onClick={() => {
              setServerUrlInput('/api');
              checkConnection('/api');
            }}
          >
            Đặt lại mặc định (/api)
          </Button>
        </div>
      </Modal>
    </div>
  );
};
