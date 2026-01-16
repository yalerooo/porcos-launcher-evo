import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { translations, Language, TranslationKey } from './translations';

// Detect system language and return 'es' for Spanish-speaking countries, 'en' otherwise
function getDefaultLanguage(): Language {
  // Get browser/system language
  const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
  const langCode = browserLang.toLowerCase();
  
  // Check if it's Spanish (es, es-ES, es-MX, es-AR, etc.)
  if (langCode.startsWith('es')) {
    return 'es';
  }
  
  return 'en';
}

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      language: getDefaultLanguage(),
      
      setLanguage: (language) => set({ language }),
      
      t: (key, params) => {
        const lang = get().language;
        let text: string = translations[lang][key] || translations.en[key] || key;
        
        // Replace parameters like {version} with actual values
        if (params) {
          Object.entries(params).forEach(([paramKey, value]) => {
            text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
          });
        }
        
        return text;
      },
    }),
    {
      name: 'i18n-storage',
      partialize: (state) => ({ language: state.language }),
    }
  )
);

// Export a non-hook version for use outside of React components
export function getTranslation(key: TranslationKey, params?: Record<string, string | number>): string {
  const state = useI18n.getState();
  let text: string = translations[state.language][key] || translations.en[key] || key;
  
  if (params) {
    Object.entries(params).forEach(([paramKey, value]) => {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
    });
  }
  
  return text;
}
