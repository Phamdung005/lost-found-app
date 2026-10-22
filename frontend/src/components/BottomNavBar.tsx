import React from 'react';
import {
  HomeOutlined,
  SearchOutlined,
  FileAddOutlined,
  UserOutlined,
  DashboardOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

interface BottomNavBarProps {
  isAdmin: boolean;
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  isAdmin,
  currentTab,
  onSelectTab,
}) => {
  // Navigation tabs for normal user
  const userTabs = [
    { key: 'home', label: 'Trang chủ', icon: <HomeOutlined className="nav-icon" /> },
    { key: 'search', label: 'Tìm đồ', icon: <SearchOutlined className="nav-icon" /> },
    { key: 'report', label: 'Báo đồ', icon: <FileAddOutlined className="nav-icon" /> },
    { key: 'profile', label: 'Tài khoản', icon: <UserOutlined className="nav-icon" /> },
  ];

  // Navigation tabs for Admin
  const adminTabs = [
    { key: 'admin_overview', label: 'Tổng quan', icon: <DashboardOutlined className="nav-icon" /> },
    { key: 'admin_reports', label: 'Báo cáo', icon: <FileTextOutlined className="nav-icon" /> },
    { key: 'admin_lockers', label: 'Tủ IoT', icon: <ThunderboltOutlined className="nav-icon" /> },
    { key: 'admin_account', label: 'Tài khoản', icon: <UserOutlined className="nav-icon" /> },
  ];

  const tabs = isAdmin ? adminTabs : userTabs;

  return (
    <nav className="mobile-bottom-nav" role="navigation" aria-label="Thanh điều hướng dưới">
      {tabs.map((t) => {
        const isActive = currentTab === t.key;
        return (
          <button
            key={t.key}
            type="button"
            className={`nav-item-btn ${isActive ? 'active' : ''}`}
            onClick={() => onSelectTab(t.key)}
            aria-label={t.label}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
