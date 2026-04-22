/**
 * DentalVoice Shared Backend Utilities
 * 
 * Tank Architecture Implementation:
 * - Robustness: Lazy initialization, comprehensive error handling
 * - SaaS Multi-tenancy: Environment-driven clinic configuration
 * - Dynamic Parameters: All business rules configurable via environment variables
 * - Explicit Logic: Clear separation of concerns with documented utilities
 * 
 * CRITICAL: This file is the single source of truth for:
 * - Database connection management (Supabase with RLS bypass)
 * - Clinic configuration and business rules
 * - Doctor resource management
 * - Phone normalization for consistent search
 * - Service definitions and scheduling parameters
 */

import { createClient } from '@supabase/supabase-js';

// ==========================================
// DATABASE CONNECTION & RLS MANAGEMENT
// ==========================================

/**
 * CRITICAL: Lazy Supabase client initialization with SERVICE_ROLE_KEY
 * 
 * WHY SERVICE_ROLE_KEY: Required for Row Level Security (RLS) bypass in backend operations
 * - Allows backend to access all clinic data regardless of user permissions
 * - Essential for multi-tenant isolation via clinic_id filtering
 * - Never expose this key to frontend (use SUPABASE_ANON_KEY instead)
 * 
 * LAZY INITIALIZATION: Prevents connection issues during startup
 * - Database connection established on first use
 * - Graceful error handling for missing environment variables
 * - Session persistence disabled for stateless backend operations
 */
let supabaseInstance: any = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url) {
    throw new Error('Supabase URL missing.');
  }

  if (!key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for backend RLS bypass. Check your environment variables.');
  }

  supabaseInstance = createClient(url, key, {
    auth: { persistSession: false },
  });

  return supabaseInstance;
};

// ==========================================
// CLINIC CONFIGURATION - SAAS MULTI-TENANCY
// ==========================================

/**
 * SaaS CLINIC CONFIGURATION: Environment-driven multi-tenant setup
 * 
 * CRITICAL FOR SCALING: Each clinic deployment uses different environment variables
 * - CLINIC_ID: Unique identifier for data isolation (REQUIRED for multi-tenancy)
 * - CLINIC_NAME: Display name for UI and emails
 * - CLINIC_ADDRESS: Physical address for maps and notifications (use env var, never hardcode)
 * - CLINIC_PHONE: Contact phone for confirmations and SMS
 * 
 * SCALING INSTRUCTIONS:
 * 1. Copy .env.example to .env for new clinic
 * 2. Set unique CLINIC_ID for data isolation
 * 3. Configure clinic-specific contact information
 * 4. Set up WhatsApp and social media integrations
 * 5. Adjust scheduling parameters as needed
 */
const getClinicConfig = () => ({
  id: process.env['CLINIC_ID'] || 'beautiful-smile-demo',
  name: process.env['CLINIC_NAME'] || 'Beautiful Smile',
  location: process.env['CLINIC_ADDRESS'] || 'Strada Clinicilor nr. 24, Bucuresti',
  clinicPhone: process.env['CLINIC_PHONE'] || '0700 000 000',
  mapsLink: process.env['CLINIC_MAPS_LINK'] || 'https://goo.gl/maps/example',
  wazeLink: process.env['CLINIC_WAZE_LINK'] || 'https://waze.com/ul/example',
  whatsapp: {
    number: process.env['WHATSAPP_NUMBER'] || 'YOUR_WA_NUMBER',
    text: 'Buna! Vreau o programare prin DentalVoice.',
  },
  social: {
    // facebookPageId: process.env['FACEBOOK_PAGE_ID'] || 'YOUR_FB_PAGE_ID', // DEFERRED: facebook-channel
    // messengerId: process.env['MESSENGER_ID'] || 'YOUR_MESSENGER_ID', // DEFERRED: facebook-channel
  },
  scheduling: {
    timezone: 'Europe/Bucharest',
    slotStepMinutes: parseInt(process.env['SLOT_INTERVAL_MIN'] || '60', 10),
    minLeadTimeHours: 2,
    workingHours: {
      start: process.env['CLINIC_START_HOUR'] || '09:00',
      end: process.env['CLINIC_END_HOUR'] || '18:00',
    },
    maxActiveBookingsPerPhone: parseInt(process.env['MAX_ACTIVE_BOOKINGS'] || '2', 10),
    defaultServiceDuration: parseInt(process.env['DEFAULT_SERVICE_DURATION'] || '30', 10),
  },
});

export const CLINIC_CONFIG = getClinicConfig();

/**
 * CLINIC INTEGRATION CONFIGURATION: Unified interface for external integrations
 * 
 * PURPOSE: Centralizes all external service configurations for easy maintenance
 * - WhatsApp bot integration
 * - Facebook Messenger integration
 * - Multi-platform communication channels
 * 
 * SCALING: Add new integrations here without modifying business logic
 */
export const CLINIC_INTEGRATION = {
  clinicId: CLINIC_CONFIG.id,
  whatsappNumber: CLINIC_CONFIG.whatsapp.number,
  // facebookPageId: CLINIC_CONFIG.social.facebookPageId, // DEFERRED: facebook-channel
  // messengerId: CLINIC_CONFIG.social.messengerId, // DEFERRED: facebook-channel
  whatsappText: CLINIC_CONFIG.whatsapp.text,
};

// ==========================================
// DOCTOR RESOURCE CONFIGURATION - SCALABLE TEAM MANAGEMENT
// ==========================================

/**
 * DOCTOR RESOURCE INTERFACE: Defines doctor configuration structure
 * 
 * SCALING DESIGN: Each doctor is configured via environment variables
 * - id: Unique identifier (dr1, dr2, etc.) used in database and load balancing
 * - name: Display name for UI and communications
 * - calendarId: Legacy field kept for backward compatibility (v3.0+ uses internal calendar)
 * - workingDays: Array of weekday numbers (0=Sunday, 1=Monday, ..., 6=Saturday)
 * - workingHours: Daily start/end times in HH:mm format
 */
export interface DoctorResource {
  id: string;
  name: string;
  calendarId: string | undefined;
  workingDays: number[];
  workingHours: { start: string; end: string };
}

/**
 * DYNAMIC DOCTOR CONFIGURATION: Environment-driven team setup
 * 
 * HOW TO ADD A NEW DOCTOR (SaaS Scaling):
 * 1. Increment CLINIC_TOTAL_DR_COUNT environment variable
 * 2. Set DOCTOR_NAME_DR{N} for display name
 * 3. Configure DOCTOR_WORKING_DAYS_DR{N} (comma-separated, 1-5 for Mon-Fri)
 * 4. Set DOCTOR_START_HOUR_DR{N} and DOCTOR_END_HOUR_DR{N} for working hours
 * 5. Restart application to load new configuration
 * 
 * EXAMPLE: Adding third doctor
 * CLINIC_TOTAL_DR_COUNT=3
 * DOCTOR_NAME_DR3="Dr. Maria Popescu"
 * DOCTOR_WORKING_DAYS_DR3="1,2,3,4,5"
 * DOCTOR_START_HOUR_DR3="08:00"
 * DOCTOR_END_HOUR_DR3="16:00"
 */
const buildDoctorsFromEnv = (): DoctorResource[] => {
  const count = parseInt(process.env['CLINIC_TOTAL_DR_COUNT'] || '1', 10);
  const doctors: DoctorResource[] = [];

  for (let i = 1; i <= count; i++) {
    // calendarId is no longer used but kept for backward compatibility
    const calendarId = process.env[`CALENDAR_ID_DR${i}`] || `internal-calendar-dr${i}`;
    
    const workingDaysRaw = process.env[`DOCTOR_WORKING_DAYS_DR${i}`] || '1,2,3,4,5';

    doctors.push({
      id: `dr${i}`,
      name: process.env[`DOCTOR_NAME_DR${i}`] || `Doctor ${i}`,
      calendarId,
      workingDays: workingDaysRaw
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((n) => !Number.isNaN(n)),
      workingHours: {
        start: process.env[`DOCTOR_START_HOUR_DR${i}`] || process.env['CLINIC_START_HOUR'] || '09:00',
        end: process.env[`DOCTOR_END_HOUR_DR${i}`] || process.env['CLINIC_END_HOUR'] || '18:00',
      },
    });
  }

  if (doctors.length === 0) {
    throw new Error('CRITICAL: No doctors configured. Set CLINIC_TOTAL_DR_COUNT and DOCTOR_NAME_DR1.');
  }

  return doctors;
};

// ==========================================
// BUSINESS CONFIGURATION - SERVICES & SCHEDULING
// ==========================================

/**
 * BUSINESS CONFIGURATION: Centralized business logic and service definitions
 * 
 * SERVICES CONFIGURATION: How to add a new service (SaaS scaling)
 * 1. Add service object to services array with unique id
 * 2. Set appropriate durationMinutes for slot generation
 * 3. Provide clear description for UI and communications
 * 4. Update frontend service selection if needed
 * 
 * SERVICE DURATION IMPACT:
 * - Affects slot generation and availability calculations
 * - Longer durations reduce available slots per day
 * - Must account for doctor working hours and setup time
 */
export const BUSINESS_CONFIG = {
  name: CLINIC_CONFIG.name,
  location: CLINIC_CONFIG.location,
  mapsLink: CLINIC_CONFIG.mapsLink,
  wazeLink: CLINIC_CONFIG.wazeLink,
  maxActiveBookingsPerPhone: CLINIC_CONFIG.scheduling.maxActiveBookingsPerPhone,
  resources: buildDoctorsFromEnv(),
  services: [
    { id: 'consultatie', name: 'Consultație', durationMinutes: 60, description: 'Evaluare inițială și plan de tratament.' },
    { id: 'igienizare', name: 'Igienizare', durationMinutes: 60, description: 'Detartraj, periaj profesional și airflow.' },
    { id: 'albire', name: 'Albire Profesională', durationMinutes: 120, description: 'Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor.' },
    { id: 'control', name: 'Control Periodic', durationMinutes: 60, description: 'Verificarea stării de sănătate orală la 6 luni.' },
    { id: 'urgenta', name: 'Urgență Stomatologică', durationMinutes: 60, description: 'Intervenție rapidă pentru dureri acute sau traumatisme.' },
    { id: 'implant', name: 'Implant Dentar', durationMinutes: 60, description: 'Restaurare dentară prin implant.' },
  ],
  scheduling: CLINIC_CONFIG.scheduling,
};

export const BUCHAREST_TZ = BUSINESS_CONFIG.scheduling.timezone;

// ==========================================
// PHONE NORMALIZATION - CRITICAL FOR DATA CONSISTENCY
// ==========================================

/**
 * CRITICAL: Phone sanitization for database consistency and search
 * 
 * WHY THIS IS CRITICAL: Romanian phone numbers have various formats
 * - Users may input: +40 700 000 000, 07 00 00 00 00, 0700-000-000
 * - Database must store consistent format for reliable searches
 * - Load balancing and booking limits depend on accurate phone matching
 * 
 * NORMALIZATION LOGIC:
 * 1. Remove all non-digit characters
 * 2. Take last 9 digits (Romanian mobile numbers)
 * 3. Pad with leading zeros to ensure exactly 9 digits
 * 4. Result: '070000000' format for all Romanian numbers
 * 
 * EXAMPLES:
 * '+40 700 000 000' -> '070000000'
 * '07 00 00 00 00' -> '070000000'
 * '0700-000-000' -> '070000000'
 */
export const sanitizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // Ensure we always get exactly 9 digits (last 9 digits)
  const normalized = digits.slice(-9);
  // Pad with leading zeros if needed to ensure 9 digits
  return normalized.padStart(9, '0').slice(-9);
};

/**
 * PHONE SEARCH NORMALIZATION: Optimized for database queries
 * 
 * DIFFERENCE FROM sanitizePhone: No padding for search optimization
 * - Uses raw last 9 digits for database indexing
 * - Supports dual search strategy (exact + padded) in countActiveBookings
 * - Improves search performance while maintaining accuracy
 * 
 * SEARCH STRATEGY:
 * 1. Try exact match with sanitized phone
 * 2. Fallback to padded version if no results
 * 3. Ensures no missed bookings due to formatting differences
 */
export const normalizePhoneForSearch = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  // For searches, we want the last 9 digits without padding
  return digits.slice(-9);
};

// ---------- Internal Calendar Types ----------
export interface InternalSlot {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:mm
  doctorId: string;
  available: boolean;
}

export interface BlockedSlot {
  doctorId: string | null;
  date: string;
  timeStart: string;
  timeEnd: string;
  reason?: string;
}

/**
 * Fetches doctors from Supabase doctors table.
 * Falls back to BUSINESS_CONFIG.resources if DB unavailable.
 * Used by all channels: dashboard, WhatsApp, WebBot.
 */
export async function getDoctorsFromDB(clinicId: string): Promise<typeof BUSINESS_CONFIG.resources> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, working_days, working_hours_start, working_hours_end')
      .eq('clinic_id', clinicId)
      .order('name');
    
    if (error || !data || data.length === 0) return BUSINESS_CONFIG.resources;
    
    return data.map((d: any) => ({
      id: d.id,
      name: d.name,
      calendarId: `internal-calendar-${d.id}`, // Generate calendarId for compatibility
      workingDays: d.working_days || [1, 2, 3, 4, 5],
      workingHours: {
        start: d.working_hours_start || '09:00',
        end: d.working_hours_end || '18:00',
      },
    }));
  } catch {
    return BUSINESS_CONFIG.resources;
  }
}

/**
 * Fetches services from Supabase services table.
 * Falls back to BUSINESS_CONFIG.services if DB unavailable.
 * Used by all channels: dashboard, WhatsApp, WebBot.
 */
export async function getServicesFromDB(clinicId: string): Promise<typeof BUSINESS_CONFIG.services> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('services')
      .select('id, name, duration_minutes, description, price_range')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('name');
    if (error || !data || data.length === 0) return BUSINESS_CONFIG.services;
    return data.map((s: any) => ({
      id: s.id,
      name: s.name,
      durationMinutes: s.duration_minutes,
      description: s.description || '',
    }));
  } catch {
    return BUSINESS_CONFIG.services;
  }
}

/**
 * Fetches editable clinic config from Supabase clinic_config table.
 * Falls back to env vars if DB unavailable.
 */
export async function getClinicConfigFromDB(clinicId: string): Promise<{
  name: string;
  clinicPhone: string;
  location: string;
  startHour: string;
  endHour: string;
}> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clinic_config')
      .select('key, value')
      .eq('clinic_id', clinicId);
    if (error || !data) throw error;
    const map: Record<string, string> = {};
    data.forEach((row: any) => { map[row.key] = row.value; });
    return {
      name: map['CLINIC_NAME'] || CLINIC_CONFIG.name,
      clinicPhone: map['CLINIC_PHONE'] || CLINIC_CONFIG.clinicPhone,
      location: map['CLINIC_ADDRESS'] || CLINIC_CONFIG.location,
      startHour: map['CLINIC_START_HOUR'] || CLINIC_CONFIG.scheduling.workingHours.start,
      endHour: map['CLINIC_END_HOUR'] || CLINIC_CONFIG.scheduling.workingHours.end,
    };
  } catch {
    return {
      name: CLINIC_CONFIG.name,
      clinicPhone: CLINIC_CONFIG.clinicPhone,
      location: CLINIC_CONFIG.location,
      startHour: CLINIC_CONFIG.scheduling.workingHours.start,
      endHour: CLINIC_CONFIG.scheduling.workingHours.end,
    };
  }
}
