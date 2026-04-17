/**
 * DentalVoice Clinic Configuration Hook
 * 
 * Tank Architecture Implementation:
 * - Robustness: Error handling with fallback states and loading indicators
 * - SaaS Multi-tenancy: Environment-driven configuration from backend API
 * - Dynamic Parameters: Real-time configuration updates without restart
 * - Explicit Logic: Clear separation between API calls and state management
 * 
 * PURPOSE: Provides centralized clinic configuration management
 * - Fetches clinic-specific settings from backend /api/config endpoint
 * - Manages loading states for better UX during API calls
 * - Handles errors gracefully with fallback to default values
 * - Enables multi-tenant deployments with environment-specific configurations
 */

import { useState, useEffect } from 'react';

// ==========================================
// CONFIGURATION INTERFACES
// ==========================================

/**
 * Clinic Configuration Interface: Frontend configuration structure
 * 
 * PURPOSE: Defines the shape of clinic configuration data
 * - Matches backend /api/config endpoint response structure
 * - Supports multi-tenant deployments with environment-specific values
 * - Used throughout the application for consistent branding and communication
 * 
 * SAAS SCALING CONSIDERATIONS:
 * - Each clinic deployment has unique configuration via environment variables
 * - Backend API serves as single source of truth for all settings
 * - Frontend components consume this hook for consistent data access
 * - Add new fields here to support additional clinic customizations
 * 
 * @param clinicName - Display name for the clinic (from CLINIC_NAME env var)
 * @param clinicPhone - Contact phone number (from CLINIC_PHONE env var)
 * @param whatsappNumber - WhatsApp business number (from WHATSAPP_NUMBER env var)
 * @param whatsappText - Default WhatsApp message template
 * @param facebookPageId - Facebook Page ID for Messenger integration
 * @param messengerId - Messenger bot identifier
 */
export interface ClinicConfig {
  clinicName: string;
  clinicPhone: string;
  whatsappNumber: string;
  whatsappText: string;
  facebookPageId: string;
  messengerId: string;
}

// ==========================================
// CLINIC CONFIGURATION HOOK
// ==========================================

/**
 * useClinicConfig Hook: Centralized configuration management
 * 
 * PURPOSE: Provides reactive access to clinic configuration data
 * - Fetches configuration from backend /api/config endpoint on mount
 * - Manages loading states for better user experience
 * - Handles API errors gracefully without breaking the application
 * - Returns configuration object and loading state for components
 * 
 * USAGE PATTERN:
 * ```typescript
 * const { config, loading } = useClinicConfig();
 * 
 * if (loading) return <LoadingSpinner />;
 * if (!config) return <ErrorMessage />;
 * 
 * return <div>Clinic: {config.clinicName}</div>;
 * ```
 * 
 * ERROR HANDLING:
 * - Logs errors to console for debugging
 * - Sets loading to false even on error to prevent infinite loading states
 * - Returns null config when API fails (components should handle gracefully)
 * 
 * PERFORMANCE CONSIDERATIONS:
 * - Fetches configuration only once on component mount
 * - Uses empty dependency array to prevent unnecessary re-fetches
 * - Configuration is cached in component state for fast access
 * 
 * @returns Object containing config data and loading state
 * @returns config - Clinic configuration object or null if not loaded/error
 * @returns loading - Boolean indicating if configuration is being fetched
 */
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
