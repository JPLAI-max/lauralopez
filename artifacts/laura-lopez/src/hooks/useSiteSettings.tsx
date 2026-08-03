import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SiteSettings {
  dre_license_number: string;
  brokerage_name: string;
  brokerage_dre_number: string;
  agent_name: string;
  contact_email: string;
  contact_phone: string;
  business_address: string;
}

const empty: SiteSettings = {
  dre_license_number:  "",
  brokerage_name:      "",
  brokerage_dre_number:"",
  agent_name:          "",
  contact_email:       "",
  contact_phone:       "",
  business_address:    "",
};

const SiteSettingsContext = createContext<SiteSettings>(empty);

// Module-level promise so the fetch happens at most once per page load.
let inflightPromise: Promise<SiteSettings> | null = null;

async function fetchSettings(): Promise<SiteSettings> {
  if (!inflightPromise) {
    inflightPromise = fetch("/api/content/site-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => ({ ...empty, ...(d?.settings ?? {}) }))
      .catch(() => empty);
  }
  return inflightPromise;
}

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(empty);
  useEffect(() => {
    fetchSettings().then(setSettings);
  }, []);
  return (
    <SiteSettingsContext.Provider value={settings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}

export function useSiteSettings(): SiteSettings {
  return useContext(SiteSettingsContext);
}
