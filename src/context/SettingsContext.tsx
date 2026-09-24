import { createContext, type ReactNode, useContext, useEffect, useState, useCallback } from 'react';
import { api, getApiBase } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { useAuth } from '@/context/AuthContext';

interface SettingsContextValue {
  settings: Settings | null;
  loading: boolean;
  symbol: string;
  refresh: () => Promise<void>;
  logoSrc: string | null;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setSettings(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api.get<Settings>('/api/settings');
      setSettings(data);
    } catch {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logoSrc = settings?.logo_url
    ? settings.logo_url.startsWith('http') || settings.logo_url.startsWith('data:')
      ? settings.logo_url
      : `${getApiBase()}${settings.logo_url}`
    : null;

  return (
    <SettingsContext.Provider
      value={{ settings, loading, symbol: settings?.currency_symbol || 'Rs', refresh, logoSrc }}
    >
      {children}
    </SettingsContext.Provider>
  );
}
