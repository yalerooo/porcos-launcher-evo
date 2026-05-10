import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Upload, Link, User, Shirt, Crown, Loader2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useI18n } from '@/i18n';
import SkinViewer3D from './SkinViewer3D';
import CapeViewer3D from './CapeViewer3D';
import styles from './PlayerSkinPopover.module.css';

interface McProfile {
  id: string;
  name: string;
  skins: Array<{
    id: string;
    state: string;
    url: string;
    variant?: string;
  }>;
  capes: Array<{
    id: string;
    state: string;
    url: string;
  }>;
}

interface PlayerSkinPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onSkinChanged?: () => void;
  triggerRef: React.RefObject<HTMLElement | null>;
}

const PlayerSkinPopover: React.FC<PlayerSkinPopoverProps> = ({ isOpen, onClose, onSkinChanged, triggerRef }) => {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const popoverRef = useRef<HTMLDivElement>(null);

  const [profile, setProfile] = useState<McProfile | null>(null);
  const [currentSkinUrl, setCurrentSkinUrl] = useState<string>('');
  const [currentCapeUrl, setCurrentCapeUrl] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<'steve' | 'alex'>('steve');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [skinUrlInput, setSkinUrlInput] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const loadingRef = useRef(false);

  const urlToBase64 = async (url: string): Promise<string> => {
    try {
      const base64 = await invoke<string>('get_skin_as_base64', { url });
      return base64;
    } catch (e) {
      console.error('Failed to convert URL to base64:', e);
      return url;
    }
  };

  const getValidToken = async (): Promise<string | null> => {
    const isValid = await useAuthStore.getState().validateAndRefresh();
    if (!isValid) return null;
    return useAuthStore.getState().user?.accessToken || null;
  };

  useEffect(() => {
    if (isOpen && !profileLoaded && !loadingRef.current && user?.mode === 'microsoft' && user.accessToken) {
      loadProfile();
    }
  }, [isOpen]);

  useEffect(() => {
    if (user?.uuid) {
      setCurrentSkinUrl('');
      setPreviewUrl(null);
      setProfileLoaded(false);
      setProfile(null);
    }
  }, [user]);

  const loadProfile = async (forceRefresh = false) => {
    if (!user?.accessToken || loadingRef.current) return;
    if (profileLoaded && !forceRefresh && profile) return;

    loadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      let tokenToUse = user.accessToken;

      const profileData = await invoke<McProfile>('get_minecraft_profile_full', {
        token: tokenToUse,
      }).catch(async (e) => {
        if (String(e).includes('401') && !forceRefresh) {
          const newToken = await getValidToken();
          if (!newToken) throw new Error('Session expired. Please log in again.');
          tokenToUse = newToken;
          return invoke<McProfile>('get_minecraft_profile_full', { token: tokenToUse });
        }
        throw e;
      });

      setProfile(profileData);
      setProfileLoaded(true);

      const activeSkin = profileData.skins.find(s => s.state === 'ACTIVE');
      if (activeSkin) {
        const skinBase64 = await urlToBase64(activeSkin.url);
        setCurrentSkinUrl(skinBase64);
        setSelectedModel(activeSkin.variant === 'SLIM' ? 'alex' : 'steve');
      } else {
        setCurrentSkinUrl('');
        setPreviewUrl(null);
      }

      const activeCape = profileData.capes.find(c => c.state === 'ACTIVE');
      if (activeCape) {
        const capeBase64 = await urlToBase64(activeCape.url);
        setCurrentCapeUrl(capeBase64);
      } else {
        setCurrentCapeUrl(null);
      }
    } catch (e: any) {
      console.error('Failed to load profile:', e);
      setError(String(e));
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'skin' | 'cape') => {
    const file = event.target.files?.[0];
    if (!file || !user?.accessToken) return;

    if (!file.type.includes('png')) {
      setError('Only PNG files are supported');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setError('File too large. Maximum size is 2MB.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const isValid = await useAuthStore.getState().validateAndRefresh();
      if (!isValid) {
        setError('Failed to validate session. Please log in again.');
        setIsUploading(false);
        return;
      }

      const refreshedToken = useAuthStore.getState().user?.accessToken;
      const tokenToUse = refreshedToken || user.accessToken;

      const arrayBuffer = await file.arrayBuffer();
      const imageData = Array.from(new Uint8Array(arrayBuffer));

      if (type === 'skin') {
        console.log('Uploading skin with variant:', selectedModel === 'alex' ? 'SLIM' : 'CLASSIC');
        const result = await invoke('upload_minecraft_skin', {
          token: tokenToUse,
          imageData,
          variant: selectedModel === 'alex' ? 'SLIM' : 'CLASSIC',
        });
        console.log('Skin upload result:', result);
      } else {
        const result = await invoke<{ id?: string }>('upload_minecraft_cape', {
          token: tokenToUse,
          imageData,
        });
        if (result?.id) {
          await invoke('set_minecraft_active_cape', {
            token: tokenToUse,
            capeId: result.id,
          });
        }
      }

      await loadProfile(true);
      console.log('Profile reloaded after upload');
      if (type === 'skin' && onSkinChanged) {
        onSkinChanged();
      }
    } catch (e: any) {
      console.error('Upload failed:', e);
      setError(`Upload failed: ${String(e)}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlImport = async () => {
    if (!skinUrlInput || !user?.accessToken) return;

    setIsUploading(true);
    setError(null);

    try {
      const isValid = await useAuthStore.getState().validateAndRefresh();
      if (!isValid) {
        setError('Failed to validate session. Please log in again.');
        setIsUploading(false);
        return;
      }

      const refreshedToken = useAuthStore.getState().user?.accessToken;
      const tokenToUse = refreshedToken || user.accessToken;

      const imageData = await invoke<number[]>('download_skin_from_url', {
        url: skinUrlInput,
      });

      await invoke('upload_minecraft_skin', {
        token: tokenToUse,
        imageData,
        variant: selectedModel === 'alex' ? 'SLIM' : 'CLASSIC',
      });

      setShowUrlInput(false);
      setSkinUrlInput('');
      setPreviewUrl(null);
      await loadProfile(true);
      if (onSkinChanged) {
        onSkinChanged();
      }
    } catch (e: any) {
      console.error('URL import failed:', e);
      setError(String(e));
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreviewFromUrl = async () => {
    if (!skinUrlInput) return;
    try {
      const base64 = await urlToBase64(skinUrlInput);
      setPreviewUrl(base64);
    } catch (e) {
      console.error('Failed to preview URL:', e);
      setPreviewUrl(skinUrlInput);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose, triggerRef]);

  if (user?.mode !== 'microsoft') {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={popoverRef}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15 }}
          className={styles.popover}
        >
          <div className={styles.header}>
            <h3 className={styles.title}>{t('skinSettings')}</h3>
            <button onClick={onClose} className={styles.closeButton}>
              <X size={16} />
            </button>
          </div>

          <div className={styles.content}>
            {isLoading ? (
              <div className={styles.loading}>
                <Loader2 className="animate-spin" size={24} />
              </div>
            ) : (
              <>
                <div className={styles.viewerContainer}>
                  <SkinViewer3D
                    skinUrl={previewUrl || currentSkinUrl}
                    capeUrl={currentCapeUrl}
                    width={240}
                    height={320}
                  />
                </div>

                <div className={styles.usernameSection}>
                  <User size={14} />
                  <span>{user.username}</span>
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Shirt size={14} />
                    <span>{t('mySkin')}</span>
                  </div>

                  <div className={styles.modelSelector}>
                    <button
                      className={`${styles.modelButton} ${selectedModel === 'steve' ? styles.modelButtonActive : ''}`}
                      onClick={() => setSelectedModel('steve')}
                    >
                      Steve
                    </button>
                    <button
                      className={`${styles.modelButton} ${selectedModel === 'alex' ? styles.modelButtonActive : ''}`}
                      onClick={() => setSelectedModel('alex')}
                    >
                      Alex
                    </button>
                  </div>

                  <div className={styles.actions}>
                    <label className={styles.actionButton}>
                      <Upload size={14} />
                      <span>{t('uploadPng')}</span>
                      <input
                        type="file"
                        accept="image/png"
                        className={styles.fileInput}
                        onChange={(e) => handleFileUpload(e, 'skin')}
                        disabled={isUploading}
                      />
                    </label>

                    <button
                      className={styles.actionButton}
                      onClick={() => setShowUrlInput(!showUrlInput)}
                    >
                      <Link size={14} />
                      <span>{t('fromUrl')}</span>
                    </button>
                  </div>

                  {showUrlInput && (
                    <div className={styles.urlInputContainer}>
                      <input
                        type="url"
                        value={skinUrlInput}
                        onChange={(e) => setSkinUrlInput(e.target.value)}
                        placeholder={t('pasteSkinUrl')}
                        className={styles.urlInput}
                      />
                      <div className={styles.urlActions}>
                        <button
                          onClick={handlePreviewFromUrl}
                          className={styles.previewButton}
                          disabled={!skinUrlInput}
                        >
                          {t('preview')}
                        </button>
                        <button
                          onClick={handleUrlImport}
                          className={styles.applyButton}
                          disabled={!skinUrlInput || isUploading}
                        >
                          {isUploading ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          <span>{t('apply')}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.section}>
                  <div className={styles.sectionHeader}>
                    <Crown size={14} />
                    <span>{t('capes')}</span>
                  </div>

                  {profile?.capes && profile.capes.length > 0 ? (
                    <div className={styles.capesList}>
                      {profile.capes.map((cape) => (
                        <button
                          key={cape.id}
                          className={`${styles.capeItem} ${cape.state === 'ACTIVE' ? styles.capeItemActive : ''}`}
                          onClick={async () => {
                            if (cape.state === 'ACTIVE') {
                              const capeBase64 = await urlToBase64(cape.url);
                              setCurrentCapeUrl(capeBase64);
                              return;
                            }
                            try {
                              await invoke('set_minecraft_active_cape', {
                                token: user.accessToken,
                                capeId: cape.id,
                              });
                              setProfile(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  capes: prev.capes.map(c => ({
                                    ...c,
                                    state: c.id === cape.id ? 'ACTIVE' : 'INACTIVE'
                                  }))
                                };
                              });
                              const capeBase64 = await urlToBase64(cape.url);
                              setCurrentCapeUrl(capeBase64);
                            } catch (e) {
                              console.error('Failed to activate cape:', e);
                              setError(`Failed to activate cape: ${String(e)}`);
                            }
                          }}
                        >
                          <CapeViewer3D capeUrl={cape.url} />
                          {cape.state === 'ACTIVE' && <Check size={12} className={styles.capeCheck} />}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={styles.noCapes}>{t('noCapes')}</p>
                  )}
                </div>

                {profile?.skins && profile.skins.length > 1 && (
                  <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <span>{t('savedSkins')}</span>
                    </div>
                    <div className={styles.skinsList}>
                      {profile.skins.map((skin) => (
                        <button
                          key={skin.id}
                          className={`${styles.skinItem} ${skin.state === 'ACTIVE' ? styles.skinItemActive : ''}`}
                          onClick={async () => {
                            const skinBase64 = await urlToBase64(skin.url);
                            setCurrentSkinUrl(skinBase64);
                            setSelectedModel(skin.variant === 'SLIM' ? 'alex' : 'steve');

                            if (skin.state === 'ACTIVE') {
                              if (onSkinChanged) {
                                onSkinChanged();
                              }
                              return;
                            }

                            try {
                              await invoke('set_minecraft_active_skin', {
                                token: user.accessToken,
                                skinId: skin.id,
                                variant: skin.variant || 'CLASSIC',
                              });
                              setProfile(prev => {
                                if (!prev) return prev;
                                return {
                                  ...prev,
                                  skins: prev.skins.map(s => ({
                                    ...s,
                                    state: s.id === skin.id ? 'ACTIVE' : 'INACTIVE'
                                  }))
                                };
                              });
                            } catch (e) {
                              console.error('Failed to activate skin:', e);
                            }

                            if (onSkinChanged) {
                              onSkinChanged();
                            }
                          }}
                        >
                          <img src={skin.url} alt="Skin" className={styles.skinPreview} />
                          {skin.state === 'ACTIVE' && <Check size={12} className={styles.skinCheck} />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className={styles.error}>
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default PlayerSkinPopover;