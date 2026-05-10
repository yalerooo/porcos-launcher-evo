import MainLayout from '@/layouts/MainLayout';
import Login from '@/pages/Login';
import Home from '@/pages/Home';
import Settings from '@/pages/Settings';
import Console from '@/pages/Console';
import Instances from '@/pages/Instances';
import Mods from '@/pages/Mods';
import React from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useLauncherStore } from '@/stores/launcherStore';

interface UserProfile {
  username: string;
  uuid: string;
  mode: 'microsoft' | 'offline';
  skinUrl?: string;
}

function App() {
  const { user, isAuthenticated, isTokenValid, logout } = useAuthStore();
  const preloadAllImages = useLauncherStore((state) => state.preloadAllImages);
  const [currentView, setCurrentView] = React.useState<'login' | 'app'>('login');
  const [activePage, setActivePage] = React.useState('home');
  const [userProfile, setUserProfile] = React.useState<UserProfile | null>(null);

  const [isLoading, setIsLoading] = React.useState(true);
  const [imagesReady, setImagesReady] = React.useState(false);

  // Preload all instance images on app start
  React.useEffect(() => {
    preloadAllImages()
      .then(() => setImagesReady(true))
      .catch((err) => {
        console.error('Failed to preload images:', err);
        setImagesReady(true); // Continue anyway on error
      });
  }, [preloadAllImages]);

  // Check for existing session on mount
  React.useEffect(() => {
    const checkSession = async () => {
      if (isAuthenticated && user) {
        console.log('[App] User is authenticated, checking token validity...');
        console.log('[App] isTokenValid():', isTokenValid());
        console.log('[App] expiresAt:', user.expiresAt);
        console.log('[App] Time until expiry (minutes):', user.expiresAt ? ((user.expiresAt - Date.now()) / 1000 / 60).toFixed(1) : 'N/A');

        // Only validate with server if the token might be expired (within 1 hour of expiry)
        // This avoids unnecessary API calls and rate limiting
        let isValid = false;
        const tokenExpiryBuffer = 60 * 60 * 1000; // 1 hour buffer
        const isTokenExpired = user.expiresAt && (Date.now() > user.expiresAt - tokenExpiryBuffer);

        if (user.mode === 'microsoft' && user.accessToken && user.refreshToken) {
          if (isTokenExpired) {
            console.log('[App] Token expired or near expiry, calling validateAndRefresh...');
            isValid = await useAuthStore.getState().validateAndRefresh();
            console.log('[App] validateAndRefresh result:', isValid);
          } else {
            console.log('[App] Token still valid (local check), skipping server validation');
            isValid = true;
          }
        } else if (user.mode === 'offline') {
          isValid = true;
        } else {
          isValid = isTokenValid();
        }

        console.log('[App] Final isValid:', isValid);

        if (isValid) {
          setUserProfile({
            username: user.username,
            uuid: user.uuid,
            mode: user.mode,
            skinUrl: user.skinUrl
          });
          setCurrentView('app');
        } else {
          // Token expired and could not be refreshed
          console.log('[App] Token invalid or refresh failed, showing login');
          logout();
          setCurrentView('login');
        }
      } else {
        console.log('[App] No authenticated user, showing login');
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

  // Wait for both session check AND images to be ready
  if (isLoading || (currentView === 'app' && !imagesReady)) {
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


