import React, { createContext, useContext, useState, useEffect } from 'react';
import { message } from 'antd';

export type UserRole = 'admin' | 'user';

export interface User {
  id: number;
  email: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  is_active?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (payload: { email: string; password: string; full_name: string; phone?: string }) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = 'http://localhost:3000/api';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('findbox_token'));
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = async (jwtToken: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${jwtToken}` },
      });
      if (!res.ok) {
        throw new Error('Phiên đăng nhập hết hạn');
      }
      const data = await res.json();
      if (data.success && data.data) {
        setUser(data.data);
      } else {
        throw new Error(data.message || 'Lỗi phiên');
      }
    } catch {
      localStorage.removeItem('findbox_token');
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      void fetchCurrentUser(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        message.error(data.message || 'Đăng nhập không thành công');
        return false;
      }
      const receivedToken = data.data.token;
      const receivedUser = data.data.user;
      localStorage.setItem('findbox_token', receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      message.success(`Xin chào, ${receivedUser.full_name}!`);
      return true;
    } catch (err) {
      console.error(err);
      message.error('Không thể kết nối đến máy chủ xác thực');
      return false;
    }
  };

  const register = async (payload: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        message.error(data.message || 'Đăng ký tài khoản không thành công');
        return false;
      }
      const receivedToken = data.data.token;
      const receivedUser = data.data.user;
      localStorage.setItem('findbox_token', receivedToken);
      setToken(receivedToken);
      setUser(receivedUser);
      message.success('Đăng ký tài khoản thành công!');
      return true;
    } catch (err) {
      console.error(err);
      message.error('Lỗi khi đăng ký tài khoản');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('findbox_token');
    setToken(null);
    setUser(null);
    message.info('Đã đăng xuất khỏi hệ thống');
  };

  const refreshUser = async () => {
    if (token) {
      await fetchCurrentUser(token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'admin',
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
