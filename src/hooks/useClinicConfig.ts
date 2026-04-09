import { useState, useEffect } from 'react';

export interface ClinicConfig {
  clinicName: string;
  whatsappNumber: string;
  whatsappText: string;
  facebookPageId: string;
  messengerId: string;
}

export function useClinicConfig() {
  const [config, setConfig] = useState<ClinicConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        setConfig(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch clinic config:', err);
        setLoading(false);
      });
  }, []);

  return { config, loading };
}
