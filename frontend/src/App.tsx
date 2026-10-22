import React, { useState } from 'react';
import { App as AntApp, Button, Space, Spin, Badge } from 'antd';
import {
  SafetyCertificateOutlined,
  AppleOutlined,
  ThunderboltOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useAuth } from './context/AuthContext';
import { BottomNavBar } from './components/BottomNavBar';
import { LoginGatewayView } from './views/LoginGatewayView';
import { UserHomeView } from './views/UserHomeView';
import { UserSearchView } from './views/UserSearchView';
import { UserReportView } from './views/UserReportView';
import { UserProfileView } from './views/UserProfileView';
import { AdminOverviewView } from './views/AdminOverviewView';
import { AdminReportsView } from './views/AdminReportsView';
import { AdminLockersView } from './views/AdminLockersView';
import { AdminAccountView } from './views/AdminAccountView';
import { AuthModal } from './components/AuthModal';
import { ClaimModal } from './components/ClaimModal';
import { PWAInstallGuideModal } from './components/PWAInstallGuideModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import './App.css';

export function App() {
  const { user, isAdmin, isAuthenticated, loading } = useAuth();
  
  // Tab state (defaults to 'home' for user, 'admin_overview' for admin)
  const [currentTab, setCurrentTab] = useState<string>(isAdmin ? 'admin_overview' : 'home');

  // Sub-navigation parameters
  const [reportType, setReportType] = useState<'lost' | 'found'>('lost');
  const [searchKeyword, setSearchKeyword] = useState<string>('');
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimTargetItem, setClaimTargetItem] = useState<any | null>(null);
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  // Sync tab if user role changes
  React.useEffect(() => {
    if (isAdmin && !currentTab.startsWith('admin_')) {
      setCurrentTab('admin_overview');
    } else if (!isAdmin && currentTab.startsWith('admin_')) {
      setCurrentTab('home');
    }
  }, [isAdmin]);

  const handleNavigateTab = (tab: string, param?: any) => {
    if (tab === 'report') {
      if (param?.type) setReportType(param.type);
      setCurrentTab('report');
    } else if (tab === 'search') {
      if (param?.keyword) setSearchKeyword(param.keyword);
      setCurrentTab('search');
    } else {
      setCurrentTab(tab);
    }
  };

  const handleOpenItemDetail = (item: any) => {
    setSelectedItemDetail(item);
    setCurrentTab('search');
  };

  const handleClaimItem = (item: any) => {
    if (!isAuthenticated) {
      setAuthTab('login');
      setAuthModalOpen(true);
      return;
    }
    setClaimTargetItem(item);
    setClaimModalOpen(true);
  };

  const handleOpenAuthModal = (tab: 'login' | 'register') => {
    setAuthTab(tab);
    setAuthModalOpen(true);
  };

  // 1. Loading state while verifying token on startup
  if (loading) {
    return (
      <AntApp>
        <div className="mobile-app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          <Spin size="large" tip="Đang khởi động FindBox..." />
        </div>
      </AntApp>
    );
  }

  // 2. Authentication Gateway: Bắt buộc đăng nhập trước khi sử dụng hệ thống
  if (!isAuthenticated) {
    return (
      <AntApp>
        <div className="mobile-app-container" style={{ minHeight: '100vh', justifyContent: 'center' }}>
          <LoginGatewayView onOpenPwaGuide={() => setPwaGuideOpen(true)} />
          <PWAInstallGuideModal
            open={pwaGuideOpen}
            onCancel={() => setPwaGuideOpen(false)}
          />
        </div>
      </AntApp>
    );
  }

  // 3. Main Authenticated App
  return (
    <AntApp>
      <div className="mobile-app-container">
        {/* Top App Bar */}
        <header className="mobile-top-bar">
          <div className="top-bar-brand">
            <div className="brand-badge-icon">
              {isAdmin ? <ThunderboltOutlined /> : <SafetyCertificateOutlined />}
            </div>
            <div>
              <span className="brand-text-name">FindBox</span>
              <span className="brand-role-tag" style={{ marginLeft: 6 }}>
                {isAdmin ? 'Quản trị' : 'Smart Locker'}
              </span>
            </div>
          </div>

          <Space size={10}>
            <Button
              type="text"
              size="small"
              icon={<AppleOutlined />}
              onClick={() => setPwaGuideOpen(true)}
              style={{ color: '#2563eb', fontWeight: 600, fontSize: 12 }}
            >
              PWA
            </Button>

            <Badge count={unreadNotifCount} size="small" offset={[-2, 4]}>
              <Button
                type="text"
                shape="circle"
                icon={<BellOutlined style={{ fontSize: 18, color: '#334155' }} />}
                onClick={() => setNotificationOpen(true)}
                title="Thông báo"
                style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              />
            </Badge>

            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: isAdmin ? '#9333ea' : '#2563eb',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
              }}
              onClick={() => setCurrentTab(isAdmin ? 'admin_account' : 'profile')}
              title="Tài khoản"
            >
              {user?.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
          </Space>
        </header>

        {/* Main Content Area */}
        <main className="mobile-content-area">
          {!isAdmin ? (
            <>
              {currentTab === 'home' && (
                <UserHomeView
                  onNavigateTab={handleNavigateTab}
                  onOpenItemDetail={handleOpenItemDetail}
                />
              )}
              {currentTab === 'search' && (
                <UserSearchView
                  initialKeyword={searchKeyword}
                  onClaimItem={handleClaimItem}
                  selectedItemDetail={selectedItemDetail}
                  onCloseItemDetail={() => setSelectedItemDetail(null)}
                />
              )}
              {currentTab === 'report' && (
                <UserReportView
                  initialType={reportType}
                  onReportSuccess={() => setCurrentTab('search')}
                />
              )}
              {currentTab === 'profile' && (
                <UserProfileView
                  onOpenAuthModal={handleOpenAuthModal}
                  onOpenPwaGuide={() => setPwaGuideOpen(true)}
                />
              )}
            </>
          ) : (
            <>
              {currentTab === 'admin_overview' && (
                <AdminOverviewView onNavigateTab={setCurrentTab} />
              )}
              {currentTab === 'admin_reports' && (
                <AdminReportsView />
              )}
              {currentTab === 'admin_lockers' && (
                <AdminLockersView />
              )}
              {currentTab === 'admin_account' && (
                <AdminAccountView onOpenPwaGuide={() => setPwaGuideOpen(true)} />
              )}
            </>
          )}
        </main>

        {/* Fixed Mobile Bottom Navigation Bar */}
        <BottomNavBar
          isAdmin={isAdmin}
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
        />

        {/* Global Modals */}
        <AuthModal
          open={authModalOpen}
          onCancel={() => setAuthModalOpen(false)}
          defaultTab={authTab}
        />

        <ClaimModal
          open={claimModalOpen}
          item={claimTargetItem}
          onCancel={() => {
            setClaimModalOpen(false);
            setClaimTargetItem(null);
          }}
          onSuccess={() => {
            setClaimModalOpen(false);
            setClaimTargetItem(null);
            setCurrentTab('profile');
          }}
        />

        <PWAInstallGuideModal
          open={pwaGuideOpen}
          onCancel={() => setPwaGuideOpen(false)}
        />

        <NotificationDrawer
          open={notificationOpen}
          onClose={() => setNotificationOpen(false)}
          onUnreadCountChange={setUnreadNotifCount}
        />
      </div>
    </AntApp>
  );
}

export default App;