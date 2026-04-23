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
import express from 'express';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import 'dayjs/locale/ro.js';

// CRITICAL: Dayjs plugin initialization for timezone-aware operations
// All date operations MUST use BUCHAREST_TZ for Romanian business hours
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

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
  id: getClinicId(),
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

// ==========================================
// CACHED DOCTORS - always reads from DB, 60s TTL
// ==========================================

let _doctorCache: { data: DoctorResource[]; ts: number } | null = null;

export async function getCachedDoctors(clinicId: string): Promise<DoctorResource[]> {
  const now = Date.now();
  if (_doctorCache && now - _doctorCache.ts < 60_000) {
    return _doctorCache.data;
  }
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .select('id, name, working_days, working_hours_start, working_hours_end')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('id');
    if (error || !data || data.length === 0) {
      return BUSINESS_CONFIG.resources;
    }
    const doctors: DoctorResource[] = data.map((d: any) => ({
      id: d.id,
      name: d.name,
      calendarId: undefined,
      workingDays: d.working_days,
      workingHours: { start: d.working_hours_start, end: d.working_hours_end },
    }));
    _doctorCache = { data: doctors, ts: now };
    return doctors;
  } catch {
    return BUSINESS_CONFIG.resources;
  }
}

export function invalidateDoctorCache(): void {
  _doctorCache = null;
}

// ==========================================
// SMS REMINDER SYSTEM - v3.7.0
// ==========================================

/**
 * SMS Reminder abstraction layer.
 * TODO v3.7.x: Replace console.log with Twilio/Vonage SDK call.
 * Provider: add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER to env.
 */
export async function sendSmsReminder(
  toPhone: string,
  message: string,
  clinicId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // STUB — log for now, replace with provider SDK
    console.log(`[SMS Reminder][${clinicId}] → ${toPhone}: ${message}`);
    // When Twilio is integrated:
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ body: message, from: process.env.TWILIO_FROM_NUMBER, to: toPhone });
    return { success: true };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : 'Unknown SMS error';
    console.error(`[SMS Reminder] Failed to send to ${toPhone}:`, error);
    return { success: false, error };
  }
}

/**
 * Calculates the actual send time for a reminder, respecting clinic working hours.
 * If ideal send time (appointment - leadHours) falls outside working hours,
 * shifts to the closest valid time that does NOT exceed the ideal time.
 *
 * @param appointmentDatetime - The appointment start datetime (Europe/Bucharest)
 * @param leadHours - How many hours before the appointment to send
 * @param workingHoursStart - e.g. "09:00"
 * @param workingHoursEnd - e.g. "18:00"
 * @param workingDays - Romanian day names e.g. ["Luni","Marti","Miercuri","Joi","Vineri"]
 * @returns Date to send reminder, or null if appointment is too soon to remind
 */
export function calculateReminderSendTime(
  appointmentDatetime: Date,
  leadHours: number,
  workingHoursStart: string,
  workingHoursEnd: string,
  workingDays: string[]
): Date | null {
  const BUCHAREST_TZ = 'Europe/Bucharest';
  
  // Romanian day name mapping (Sunday=0)
  const RO_DAYS: Record<number, string> = {
    0: 'Duminica', 1: 'Luni', 2: 'Marti', 3: 'Miercuri',
    4: 'Joi', 5: 'Vineri', 6: 'Sambata'
  };
  
  const parseHHMM = (hhmm: string): { h: number; m: number } => {
    const [h, m] = hhmm.split(':').map(Number);
    return { h, m };
  };
  
  const isWorkingDay = (date: Date): boolean => {
    const dayIndex = new Date(date.toLocaleString('en-US', { timeZone: BUCHAREST_TZ })).getDay();
    return workingDays.includes(RO_DAYS[dayIndex]);
  };
  
  const setTimeOnDate = (date: Date, hhmm: string): Date => {
    const { h, m } = parseHHMM(hhmm);
    const result = new Date(date);
    // Convert to Bucharest timezone, set time, then convert back to UTC
    const bucharestStr = result.toLocaleString('en-US', { timeZone: BUCHAREST_TZ });
    const bucharestDate = new Date(bucharestStr);
    bucharestDate.setHours(h, m, 0, 0);
    
    // Get the UTC equivalent
    const utcStr = bucharestDate.toLocaleString('en-US', { timeZone: 'UTC' });
    return new Date(utcStr);
  };

  const getTimeInBucharest = (date: Date): { h: number; m: number } => {
    const str = date.toLocaleString('en-US', { timeZone: BUCHAREST_TZ, hour: '2-digit', minute: '2-digit', hour12: false });
    const [h, m] = str.split(':').map(Number);
    return { h, m };
  };

  const idealSendTime = new Date(appointmentDatetime.getTime() - leadHours * 60 * 60 * 1000);
  const now = new Date();

  // If ideal send time is in the past, skip
  if (idealSendTime <= now) return null;

  const { h: idealH, m: idealM } = getTimeInBucharest(idealSendTime);
  const { h: startH, m: startM } = parseHHMM(workingHoursStart);
  const { h: endH, m: endM } = parseHHMM(workingHoursEnd);
  
  const idealMinutes = idealH * 60 + idealM;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  // Case 1: ideal time is within working hours AND it's a working day
  if (isWorkingDay(idealSendTime) && idealMinutes >= startMinutes && idealMinutes <= endMinutes) {
    return idealSendTime;
  }

  // Case 2: ideal time is outside working hours → find previous working day's end time
  // Walk back day by day (max 7 days) to find last valid working slot
  for (let daysBack = 0; daysBack <= 7; daysBack++) {
    const candidate = new Date(idealSendTime);
    candidate.setDate(candidate.getDate() - daysBack);
    
    if (!isWorkingDay(candidate)) continue;
    
    if (daysBack === 0) {
      // Same day: only use if ideal time is after end of working hours
      if (idealMinutes > endMinutes) {
        // Schedule at end of this working day (minus 30min buffer)
        const sendMinutes = endMinutes - 30;
        if (sendMinutes >= startMinutes) {
          const sendH = Math.floor(sendMinutes / 60);
          const sendM = sendMinutes % 60;
          return setTimeOnDate(candidate, `${sendH.toString().padStart(2, '0')}:${sendM.toString().padStart(2, '0')}`);
        }
      }
    } else {
      // Previous working day: schedule at end of working hours - 30min
      const sendMinutes = endMinutes - 30;
      if (sendMinutes >= startMinutes) {
        const sendH = Math.floor(sendMinutes / 60);
        const sendM = sendMinutes % 60;
        const sendTime = setTimeOnDate(candidate, `${sendH.toString().padStart(2, '0')}:${sendM.toString().padStart(2, '0')}`);
        if (sendTime > now) return sendTime;
      }
    }
  }
  
  return null; // Cannot find valid send time
}

// ==========================================
// TECHNICAL CONFIGURATION - SINGLE SOURCE OF TRUTH
// ==========================================

export const TECH_CONFIG = {
  email: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
    host: process.env['SMTP_HOST'] || 'smtp.gmail.com',
    port: parseInt(process.env['SMTP_PORT'] || '465'),
    secure: process.env['SMTP_PORT'] === '587' ? false : true
  },
  channels: {
    whatsapp: { number: process.env['WHATSAPP_NUMBER'] || "40700000000", text: "Bună! Vreau o programare prin DentalVoice." },
    // messenger: { pageId: process.env['FACEBOOK_PAGE_ID'] || "123456789" } // DEFERRED: facebook-channel
  },
  frontendUrl: process.env['FRONTEND_URL'] || 'https://dentalvoice.ro'
};

// --- DOCTOR MAPPING HELPER ---
export const getCalendarIdForDoctor = (frontendDoctorId: string): string | undefined => {
  const doctorId = frontendDoctorId.toLowerCase();
  const envKey = `CALENDAR_ID_${doctorId.toUpperCase()}`;
  let calendarId: string | undefined = process.env[envKey];

  if (!calendarId) {
    const doc = BUSINESS_CONFIG.resources.find((r) => r.id.toLowerCase() === doctorId);
    calendarId = doc?.calendarId;
  }

  if (!calendarId) {
    calendarId = process.env['CALENDAR_ID_MAIN'] || BUSINESS_CONFIG.resources[0]?.calendarId;
  }

  return calendarId;
};

// ==========================================
// SECURITY & CONSTANTS
// ==========================================

export const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] || "dv-secret-key-2026";

/** Stale optimistic-lock rows: Pending appointments older than this are removed by POST /api/admin/cleanup-pending */
export const PENDING_APPOINTMENT_STALE_MINUTES = 5;

// Test phone: bookings limit is bypassed for this number. Set via env for safety.
export const TEST_PHONE_NORMALIZED = sanitizePhone(process.env['TEST_PHONE'] || '0700000000');

// Maximum booking horizon in months (default: 3 if not set)
export const MAX_BOOKING_HORIZON_MONTHS = parseInt(process.env['MAX_BOOKING_HORIZON_MONTHS'] || '3');

// Middleware for API Key protection
export const protectRoute = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

// ==========================================
// PURE UTILITY FUNCTIONS - DATE & FORMATTING
// ==========================================

/** Candidate slot start times (HH:mm) that fit fully within clinic working hours for the given duration. */
export const buildClinicDaySlotStarts = (isoDate: string, durationMinutes: number): string[] => {
  const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;
  const { start: whStart, end: whEnd } = BUSINESS_CONFIG.scheduling.workingHours;
  const slotStarts: string[] = [];
  let t = dayjs.tz(`${isoDate}T${whStart}:00`, BUCHAREST_TZ);
  const endLimit = dayjs.tz(`${isoDate}T${whEnd}:00`, BUCHAREST_TZ);
  while (true) {
    const windowEnd = t.add(durationMinutes, 'minute');
    if (windowEnd.isAfter(endLimit)) break;
    slotStarts.push(t.format('HH:mm'));
    t = t.add(step, 'minute');
  }
  return slotStarts;
};

export const parseRomanianDate = (dateStr: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  const monthsMap: { [key: string]: string } = {
    ianuarie: '01',
    februarie: '02',
    martie: '03',
    aprilie: '04',
    mai: '05',
    iunie: '06',
    iulie: '07',
    august: '08',
    septembrie: '09',
    octombrie: '10',
    noiembrie: '11',
    decembrie: '12',
  };

  const lowerDate = dateStr.toLowerCase();
  const parts = lowerDate.split(' ');
  const day = parts.find((p) => /^\d+$/.test(p.replace(',', '')))?.replace(',', '').padStart(2, '0');
  const monthName = Object.keys(monthsMap).find((m) => lowerDate.includes(m));

  if (day && monthName) {
    const now = dayjs().tz(BUCHAREST_TZ);
    const y = now.year();
    
    // Check if the date is in the past, if so use next year
    const parsedDate = dayjs.tz(`${y}-${monthsMap[monthName]}-${day}`, BUCHAREST_TZ);
    if (parsedDate.isBefore(now, 'day')) {
      return `${y + 1}-${monthsMap[monthName]}-${day}`;
    }
    
    return `${y}-${monthsMap[monthName]}-${day}`;
  }
  return null;
};

export const RO_WEEKDAYS_SHORT = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

export const formatDisplayDateRo = (isoDate: string): string =>
  dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ).locale('ro').format('dddd D MMMM YYYY');

export const formatQuickDayLabelRo = (isoDate: string): string => {
  const d = dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ).locale('ro');
  return `${RO_WEEKDAYS_SHORT[d.day()]} ${d.format('D')} ${d.format('MMM')}`;
};

export const isWeekdayBucharest = (isoDate: string): boolean => {
  const d = dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ);
  const dow = d.day();
  return dow !== 0 && dow !== 6;
};

export const formatYMD = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export const validateEmail = (email: string): { valid: boolean; error?: string } => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Adresa de email nu este validă.' };
  }
  return { valid: true };
};

export const resolveDurationMinutesFromQuery = (q: express.Request['query']): number => {
  const raw = q['durationMinutes'];
  const dm = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
  if (!Number.isNaN(dm) && dm > 0) return dm;
  const sid = typeof q['serviceId'] === 'string' ? q['serviceId'] : undefined;
  if (sid) {
    const svc = BUSINESS_CONFIG.services.find((s) => s.id === sid || s.name === sid);
    if (svc) return svc.durationMinutes;
  }
  return BUSINESS_CONFIG.scheduling.defaultServiceDuration;
};

/**
 * Returns clinic_id for the current request.
 * Strategy 1: process.env.CLINIC_ID (primary — set per deployment in Vercel)
 * Strategy 2: fallback literal for local dev / legacy
 */
export function getClinicId(): string {
  return process.env.CLINIC_ID ?? 'beautiful-smile-demo';
}
