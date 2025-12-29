import MainLayout from '@/layouts/MainLayout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Settings from '@/pages/Settings';
import Console from '@/pages/Console';
import Instances from '@/pages/Instances';
import Mods from '@/pages/Mods';
import React from 'react';
import { useAuthStore } from '@/stores/authStore';

interface UserProfile {
  username: string;
  uuid: string;
  mode: 'microsoft' | 'offline';
  skinUrl?: string;
}

function App() {
  const { user, isAuthenticated, isTokenValid, logout } = useAuthStore();
  const [currentView, setCurrentView] = React.useState<'login' | 'app'>('login');
  const [activePage, setActivePage] = React.useState('home');
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);

  // Check for existing session on mount
  React.useEffect(() => {
    const checkSession = async () => {
      if (isAuthenticated && user && isTokenValid()) {
        setUserProfile({
          username: user.username,
          uuid: user.uuid,
          mode: user.mode,
          skinUrl: user.skinUrl
        });
        setCurrentView('app');
      } else if (isAuthenticated && user && !isTokenValid()) {
        // Token expired, logout
        logout();
        setCurrentView('login');
      }
      setIsLoading(false);
    };

    checkSession();
  }, [isAuthenticated, user, isTokenValid, logout]);

  const handleLoginSuccess = (profile: UserProfile) => {
    setUserProfile(profile);
    setCurrentView('app');
  };

  const handleLogout = () => {
    logout();
    setUserProfile(null);
    setCurrentView('login');
  };

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <Home />;
      case 'instances':
        return <Instances />;
      case 'mods':
        return <Mods />;
      case 'settings':
        return <Settings />;
      case 'console':
        return <Console />;
      default:
        return <Home />;
    }
  };

  if (isLoading) {
    return (
      <div className="app-window flex items-center justify-center bg-[var(--bg-primary)]">
        {/* Optional: Add a spinner here */}
      </div>
    );
  }

  if (currentView === 'login') {
    return (
      <div className="app-window">
        <div className="flex-1 relative flex items-center justify-center overflow-hidden">
          <Login onLoginSuccess={handleLoginSuccess} />
        </div>
      </div>
    );
  }

  return (
    userProfile ? (
      <div className="app-window">
        <MainLayout
          activePage={activePage}
          setActivePage={setActivePage}
          onLogout={handleLogout}
          userProfile={userProfile}
        >
          {renderPage()}
        </MainLayout>
      </div>
    ) : null
  );
}

export default App;


