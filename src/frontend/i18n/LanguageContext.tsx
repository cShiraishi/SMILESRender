import React, { createContext, useContext, useState, useCallback } from 'react';
import { Lang, TKey, translations, LANG_META } from './translations';

interface LanguageContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key as string,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = localStorage.getItem('smrender_lang') as Lang | null;
    return stored && translations[stored] ? stored : 'en';
  });

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem('smrender_lang', l);
    setLangState(l);
  }, []);

  const t = useCallback((key: TKey): string => {
    return translations[lang]?.[key] ?? translations['en']?.[key] ?? (key as string);
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export { LANG_META };
export type { Lang, TKey };
