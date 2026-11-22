import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { Platform } from 'react-native';

import { AppColors, darkColors, lightColors, weeklineColors } from './palettes';

export type ThemeScheme = 'light' | 'dark';

type ThemeContextValue = {
  scheme: ThemeScheme;
  colors: AppColors;
  isDark: boolean;
  isReady: boolean;
  setScheme: (scheme: ThemeScheme) => void;
  toggleScheme: () => void;
};

const STORAGE_KEY = 'mypitchowner_theme_scheme';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark is MYPitch's original look, so it stays the default until a
  // stored preference says otherwise.
  const [scheme, setSchemeState] = useState<ThemeScheme>('dark');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isMounted && (stored === 'light' || stored === 'dark')) {
          setSchemeState(stored);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function setScheme(next: ThemeScheme) {
    setSchemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }

  function toggleScheme() {
    setScheme(scheme === 'dark' ? 'light' : 'dark');
  }

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme,
      // The web app has a single look (the blue "weekline" palette used by its
      // navigation, Agenda and Academy); only the native app is green / themeable.
      colors: Platform.OS === 'web' ? weeklineColors : scheme === 'dark' ? darkColors : lightColors,
      isDark: Platform.OS === 'web' || scheme === 'dark',
      isReady,
      setScheme,
      toggleScheme,
    }),
    [scheme, isReady]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }

  return context;
}
