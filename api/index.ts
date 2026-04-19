/**
 * DentalVoice API Server - Production-Grade Receptionist Dashboard
 * 
 * Tank Architecture Implementation:
 * - Robustness: Global error handling, RLS security, optimistic locking
 * - SaaS Multi-tenancy: Clinic-based isolation via clinic_id
 * - Dynamic Parameters: Environment-driven configuration
 * - Explicit Logic: Clear separation of concerns with documented functions
 * 
 * CORE RESPONSIBILITIES:
 * 1. Booking engine with load balancing (Rule 1: today's load, Rule 2: availability, Rule 3: weekly occupancy)
 * 2. WhatsApp state machine for conversational booking
 * 3. Internal calendar management (appointments, blocked_slots, unlocked_slots)
 * 4. Email/SMS notifications with .ics attachments
 * 5. Admin dashboard API endpoints
 */

// ==========================================
// DEPENDENCIES & TIMEZONE CONFIGURATION
// ==========================================

import express from "express";
import cors from "cors";
import nodemailer from 'nodemailer';
import * as ics from 'ics';
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
// SHARED LIBRARIES & CONFIGURATION
// ==========================================

import {
  BUCHAREST_TZ,
  BUSINESS_CONFIG,
  CLINIC_CONFIG,
  CLINIC_INTEGRATION,
  type DoctorResource,
  getSupabase,
  sanitizePhone,
  normalizePhoneForSearch,
} from './lib/shared.js';
import { runArchive } from './lib/archive.js';

// ==========================================
// ENVIRONMENT AUDIT & VALIDATION
// ==========================================

/**
 * CRITICAL: Required environment variables for production deployment
 * Missing variables will cause runtime failures
 */
const requiredEnvVars = [
  'SUPABASE_URL',           // Database connection
  'SUPABASE_ANON_KEY',      // Public API key
  'SUPABASE_SERVICE_ROLE_KEY', // Backend admin key (RLS bypass)
  'SMTP_USER',              // Email sending
  'SMTP_PASS'               // Email authentication
];

/**
 * Environment variable audit for SaaS deployment safety
 * Logs warnings for missing required variables during startup
 */
const auditEnvVars = () => {
  requiredEnvVars.forEach(v => {
    if (!process.env[v]) {
      console.warn(`WARNING: Missing environment variable: ${v}`);
    }
  });
  // Google Calendar removed in v3.0 - using internal Supabase calendar
};
auditEnvVars();

// ==========================================
// EXPRESS APP INITIALIZATION
// ==========================================

const app = express();

// ==========================================
// DYNAMIC TECHNICAL CONFIGURATION
// ==========================================

/**
 * Environment-driven configuration for SaaS multi-tenancy
 * All technical settings are configurable via environment variables
 */
const TECH_CONFIG = {
  email: {
    user: process.env['SMTP_USER'],
    pass: process.env['SMTP_PASS'],
    host: process.env['SMTP_HOST'] || 'smtp.gmail.com',
    port: parseInt(process.env['SMTP_PORT'] || '465'),
    secure: process.env['SMTP_PORT'] === '587' ? false : true
  },
  channels: {
    whatsapp: { number: process.env['WHATSAPP_NUMBER'] || "40700000000", text: "Bună! Vreau o programare prin DentalVoice." },
    messenger: { pageId: process.env['FACEBOOK_PAGE_ID'] || "123456789" }
  },
  frontendUrl: process.env['FRONTEND_URL'] || 'https://dentalvoice.ro'
};

// --- DOCTOR MAPPING HELPER ---
const getCalendarIdForDoctor = (frontendDoctorId: string): string | undefined => {
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
// 3. SECURITY & DATABASE
// ==========================================
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] || "dv-secret-key-2026";

/** Stale optimistic-lock rows: Pending appointments older than this are removed by POST /api/admin/cleanup-pending */
const PENDING_APPOINTMENT_STALE_MINUTES = 5;

// Test phone: bookings limit is bypassed for this number. Set via env for safety.
const TEST_PHONE_NORMALIZED = sanitizePhone(process.env['TEST_PHONE'] || '0700000000');

// Maximum booking horizon in months (default: 3 if not set)
const MAX_BOOKING_HORIZON_MONTHS = parseInt(process.env['MAX_BOOKING_HORIZON_MONTHS'] || '3');

// Middleware for API Key protection
const protectRoute = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized: Invalid API Key" });
  }
  next();
};

// Configurare CORS
app.use(cors({
  origin: [TECH_CONFIG.frontendUrl, "https://www.dentalvoice.ro", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
}));

// Force JSON headers for all responses
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use(express.json());

// Global error handling middleware - ensures all errors return JSON
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  // Don't send error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse = {
    error: err.message || 'Internal Server Error',
    ...(isDevelopment && { details: err.stack, originalError: err })
  };
  
  // Ensure we always return JSON, never HTML
  res.status(err.status || 500).json(errorResponse);
});

// Handle uncaught promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Session storage pentru OTP
const otpSessions = new Map<string, string>();

// WhatsApp / chat_sessions state (persisted in Supabase)
type ChatSessionStep =
  | 'idle'
  | 'awaiting_service'
  | 'awaiting_doctor'
  | 'awaiting_date'
  | 'awaiting_time'
  | 'awaiting_full_name'
  | 'awaiting_phone_confirm'
  | 'awaiting_manual_phone_input'
  | 'awaiting_booking_phone_verification_code'
  | 'awaiting_email'
  | 'confirming'
  | 'confirmed'
  | 'cancelling'
  | 'awaiting_cancel_phone'
  | 'awaiting_cancel_confirm'
  | 'awaiting_lookup_phone'
  | 'awaiting_sms_verification_code'
  | 'awaiting_cross_phone_input'
  | 'awaiting_cross_phone_otp';

interface ChatSession {
  step: ChatSessionStep;
  data: {
    service?: string;
    serviceId?: string;
    durationMinutes?: number;
    doctorId?: string;
    doctorName?: string;
    date?: string;
    displayDate?: string;
    time?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    availableSlots?: string[];
    availableDoctors?: { id: string; name: string }[];
    dateRetries?: number;
    suggestedIsoDate?: string;
    suggestedDisplayDate?: string;
    suggestedSlotsCount?: number;
    cancelDate?: string;
    cancelTime?: string;
    cancelService?: string;
    cancelDoctorName?: string;
    lookupPhone?: string;
    verificationCode?: string;
    verificationExpires?: string;
    phoneNumber?: string;
    verifiedPhone?: string;
    awaitingPhoneInput?: boolean;
    otpAttempts?: number;
    phone?: string;
  };
}

// --- HELPER FUNCTIONS ---

const getTransporter = () => {
  const user = process.env['SMTP_USER'];
  const pass = process.env['SMTP_PASS'];
  
  if (!user || !pass) {
    throw new Error("SMTP credentials missing (SMTP_USER/SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host: TECH_CONFIG.email.host,
    port: TECH_CONFIG.email.port,
    secure: TECH_CONFIG.email.secure,
    auth: { user, pass },
  });
};

const countActiveBookings = async (phone: string) => {
  const sanitized = sanitizePhone(phone);
  if (!sanitized) return 0;
  const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
  const staleThreshold = dayjs().tz(BUCHAREST_TZ).subtract(PENDING_APPOINTMENT_STALE_MINUTES, 'minute').toISOString();
  
  const { count, error } = await getSupabase()
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
    .eq('phone_normalized', sanitized)
    .gte('date', today)
    .or(`status.in.(Confirmed),and(status.eq.Pending,created_at.gt.${staleThreshold})`);

  if (error) {
    console.error('countActiveBookings Supabase error:', error.message);
    return 0;
  }
  return count ?? 0;
};

const isDoctorWorking = (doctor: DoctorResource, date: string, time: string, durationMinutes: number = 30) => {
  const dayOfWeek = dayjs.tz(date, BUCHAREST_TZ).day();
  const workingDays = doctor.workingDays || [1, 2, 3, 4, 5];
  
  if (!workingDays.includes(dayOfWeek)) return false;
  
  const hours = doctor.workingHours || BUSINESS_CONFIG.scheduling.workingHours;
  
  const startDateTime = dayjs.tz(`${date}T${time}:00`, BUCHAREST_TZ);
  const endDateTime = startDateTime.add(durationMinutes, 'minute');
  
  const workingStart = dayjs.tz(`${date}T${hours.start}:00`, BUCHAREST_TZ);
  const workingEnd = dayjs.tz(`${date}T${hours.end}:00`, BUCHAREST_TZ);
  
  if (startDateTime.isBefore(workingStart) || endDateTime.isAfter(workingEnd)) return false;
  
  return true;
};

/** Google Calendar event shape for overlap checks */
type GcalEventLike = {
  start?: { dateTime?: string | null; date?: string | null };
  end?: { dateTime?: string | null; date?: string | null };
};

/** Google Calendar event bounds; all-day uses Europe/Bucharest midnight with exclusive end date. */
interface GcalInterval {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

const parseGcalEventBounds = (ev: GcalEventLike): GcalInterval | null => {
  const s = ev.start?.dateTime || ev.start?.date;
  const e = ev.end?.dateTime || ev.end?.date;
  if (!s || !e) return null;
  if (ev.start?.dateTime && ev.end?.dateTime) {
    return { start: dayjs(ev.start.dateTime), end: dayjs(ev.end.dateTime) };
  }
  const start = dayjs.tz(s, BUCHAREST_TZ).startOf('day');
  const endExclusive = dayjs.tz(e, BUCHAREST_TZ).startOf('day');
  return { start, end: endExclusive };
};

const intervalsOverlap = (a: GcalInterval, b: GcalInterval): boolean =>
  a.start.isBefore(b.end) && a.end.isAfter(b.start);

const isWindowFreeOfEvents = (
  events: GcalEventLike[],
  windowStart: dayjs.Dayjs,
  windowEnd: dayjs.Dayjs
): boolean => {
  const win: GcalInterval = { start: windowStart, end: windowEnd };
  for (const ev of events) {
    const b = parseGcalEventBounds(ev);
    if (!b) continue;
    if (intervalsOverlap(b, win)) return false;
  }
  return true;
};

const resolveDurationMinutesFromQuery = (q: express.Request['query']): number => {
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

const doctorCanAccommodateSlot = (
  doctor: DoctorResource,
  isoDate: string,
  slotTimeHHmm: string,
  durationMinutes: number,
  doctorDayEvents: GcalEventLike[]
): boolean => {
  if (!doctor.calendarId) return false;
  if (!isDoctorWorking(doctor, isoDate, slotTimeHHmm, durationMinutes)) return false;
  const windowStart = dayjs.tz(`${isoDate}T${slotTimeHHmm}:00`, BUCHAREST_TZ);
  const windowEnd = windowStart.add(durationMinutes, 'minute');
  return isWindowFreeOfEvents(doctorDayEvents, windowStart, windowEnd);
};

/** Candidate slot start times (HH:mm) that fit fully within clinic working hours for the given duration. */
const buildClinicDaySlotStarts = (isoDate: string, durationMinutes: number): string[] => {
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

const parseRomanianDate = (dateStr: string) => {
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

const RO_WEEKDAYS_SHORT = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

const formatDisplayDateRo = (isoDate: string): string =>
  dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ).locale('ro').format('dddd D MMMM YYYY');

const formatQuickDayLabelRo = (isoDate: string): string => {
  const d = dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ).locale('ro');
  return `${RO_WEEKDAYS_SHORT[d.day()]} ${d.format('D')} ${d.format('MMM')}`;
};

/** Next 5 Mon-Fri days starting from tomorrow (excluding weekends). */
const nextFiveWorkingDayOptions = async (): Promise<{ iso: string; label: string }[]> => {
  const out: { iso: string; label: string }[] = [];
  // Romanian constants for date formatting
  const ZILE_RO = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  const LUNI_RO = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun', 'Iul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Start from tomorrow
  let d = dayjs().tz(BUCHAREST_TZ).add(1, 'day').startOf('day');
  
  for (let i = 0; i < 14 && out.length < 5; i++) {
    // Skip weekends (Saturday=6, Sunday=0)
    if (d.day() !== 6 && d.day() !== 0) {
      const iso = d.format('YYYY-MM-DD');
      const label = `${ZILE_RO[d.day()]}, ${d.date()} ${LUNI_RO[d.month()]}`;
      out.push({ iso, label });
    }
    
    // Move to next day (create new dayjs object to avoid mutation)
    d = d.add(1, 'day');
  }
  return out;
};

const checkIfDayIsFullyBlocked = async (date: string, doctorId: string): Promise<boolean> => {
  const supabase = getSupabase();
  const clinicId = CLINIC_CONFIG.id;
  
  // Get doctor's working hours
  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (!doctor) return false;
  
  const startH = parseInt(doctor.workingHours.start.split(':')[0]);
  const endH = parseInt(doctor.workingHours.end.split(':')[0]);
  const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');
  const endTotalMin = endH * 60 + endM;
  
  // Generate all possible slots for this day
  const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;
  const slotStarts: string[] = [];
  for (let h = startH; h < endH; h++) {
    for (let m = 0; m < 60; m += step) {
      const slotStart = h * 60 + m;
      const slotEnd = slotStart + step;
      if (slotEnd > endTotalMin) continue;
      slotStarts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }
  
  // Check if each slot is covered by a blocked slot
  for (const slotTime of slotStarts) {
    const [slotH, slotM] = slotTime.split(':').map(Number);
    const slotStartMin = slotH * 60 + slotM;
    const slotEndMin = slotStartMin + step;
    
    const hasBlockConflict = await supabase
      .from('blocked_slots')
      .select('time_start, time_end')
      .eq('clinic_id', clinicId)
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .or(
        `time_start.lte.${slotTime}`, // Block starts before or at this slot
        `time_end.gt.${slotTime}`   // Block ends after this slot
      )
      .maybeSingle();
    
    if (hasBlockConflict.data && hasBlockConflict.data.length > 0) {
      return true; // Day is fully blocked
    }
  }
  
  return false; // Day is not fully blocked
};

const isWeekdayBucharest = (isoDate: string): boolean => {
  const dow = dayjs.tz(isoDate, BUCHAREST_TZ).day();
  return dow >= 1 && dow <= 5;
};

// ==========================================
// SLOT GENERATION & AVAILABILITY ENGINE
// ==========================================

/**
 * CORE SLOT GENERATION: Returns available HH:mm start times for a given date/doctor
 * 
 * CRITICAL: This function is the heart of the booking system and handles:
 * - Timezone-aware slot generation (BUCHAREST_TZ only)
 * - Dynamic lead time filtering (30 min today, 2 hours future)
 * - Conflict detection with existing appointments and blocked slots
 * - Multi-doctor load balancing when doctorIdOrAny === 'any'
 * 
 * @param doctorIdOrAny - Specific doctor ID or 'any' for load balancing
 * @param isoDate - Date in YYYY-MM-DD format (always interpreted in BUCHAREST_TZ)
 * @param durationMinutes - Service duration for slot size calculation
 * @returns Array of HH:mm strings representing available slot start times
 * 
 * USED BY:
 * - GET /api/busy-slots (complement calculation)
 * - WhatsApp state machine (awaiting_time state)
 * - Manual booking flow in dashboard
 * - Load balancing algorithm in processBooking()
 */
const getAvailableSlotsForDoctor = async (
  doctorIdOrAny: string,
  isoDate: string,
  durationMinutes: number,
  skipTempReservations: boolean = false
): Promise<string[]> => {
  const supabase = getSupabase();
  const clinicId = CLINIC_CONFIG.id;

  // DOCTOR FILTERING: Support both specific doctors and 'any' for load balancing
  const doctors =
    doctorIdOrAny === 'any'
      ? BUSINESS_CONFIG.resources.filter((d) => d.id !== 'any')
      : BUSINESS_CONFIG.resources.filter((d) => d.id === doctorIdOrAny);

  if (doctors.length === 0) return [];

  // CRITICAL: All date calculations MUST use BUCHAREST_TZ for Romanian business hours
  const dayOfWeek = dayjs.tz(isoDate, BUCHAREST_TZ).day(); // 0=Dum..6=Sat
  const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;

  // ORPHAN CLEANUP: Fire-and-forget cleanup of expired temp reservations
  supabase.from('temp_reservations').delete().lt('expires_at', new Date().toISOString())
    // no await - do not block the response

  // DATABASE QUERIES: Fetch existing bookings and blocked slots for conflict detection
  const { data: existingAppointments } = await supabase
    .from('appointments')
    .select('doctor_id, time, service')
    .eq('clinic_id', clinicId)
    .eq('date', isoDate)
    .in('status', ['Pending', 'Confirmed']); // Include both pending and confirmed

  const { data: blockedSlots } = await supabase
    .from('blocked_slots')
    .select('doctor_id, time_start, time_end')
    .eq('clinic_id', clinicId)
    .eq('date', isoDate);

  const { data: unlockedSlots } = await supabase
    .from('unlocked_slots')
    .select('doctor_id, time')
    .eq('date', isoDate);

  const { data: tempReservations } = await supabase
    .from('temp_reservations')
    .select('doctor_id, time_start, time_end')
    .eq('date', isoDate)
    .gt('expires_at', new Date().toISOString());

  const availableSlots: string[] = [];

  // SLOT GENERATION LOOP: Generate all possible time slots for each doctor
  for (const doctor of doctors) {
    // WORKING DAY CHECK: Skip doctors not working on this day
    if (!doctor.workingDays.includes(dayOfWeek)) continue;

    // WORKING HOURS PARSING: Extract doctor's working hours in minutes for calculations
    const startH = parseInt(doctor.workingHours.start.split(':')[0]);
    const startM = parseInt(doctor.workingHours.start.split(':')[1] || '0');
    const endH = parseInt(doctor.workingHours.end.split(':')[0]);
    const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');
    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;

    // TIME SLOT GENERATION: Create all possible slots (00:00-23:59) and filter by working hours unless unlocked
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        const slotStart = h * 60 + m;
        const slotEnd = slotStart + durationMinutes;

        const slotTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        // Check if this slot is unlocked for this doctor
        const isUnlocked = (unlockedSlots || []).some((slot: any) => 
          slot.doctor_id === doctor.id && slot.time === slotTime
        );

        // WORKING HOURS BOUNDARY: Ensure slot is within working hours, unless unlocked
        if (!isUnlocked) {
          // For normal slots, enforce working hours boundaries
          if (slotStart < startTotalMin || slotEnd > endTotalMin) continue;
        }

        // CRITICAL: TIMEZONE-AWARE LEAD TIME FILTERING
        // All time comparisons MUST use BUCHAREST_TZ for Romanian business hours
        const slotDt = dayjs.tz(`${isoDate} ${slotTime}`, 'YYYY-MM-DD HH:mm', BUCHAREST_TZ);
        const now = dayjs().tz(BUCHAREST_TZ);
        const isToday = slotDt.isSame(now, 'day');

        if (isToday) {
          // TODAY: Filter out past slots and slots within next 30 minutes (buffer for preparation)
          if (slotDt.isBefore(now.add(30, 'minute'))) continue;
        } else {
          // FUTURE: Keep existing 2-hour lead time requirement for advance bookings
          if (slotDt.isBefore(now.add(BUSINESS_CONFIG.scheduling.minLeadTimeHours, 'hour'))) continue;
        }

        // APPOINTMENT CONFLICT DETECTION: Check against existing bookings
        const hasBookingConflict = (existingAppointments || []).some((appt) => {
          if (appt.doctor_id !== doctor.id) return false;
          // Find service duration for existing appointment
          const existingSvc = BUSINESS_CONFIG.services.find(
            (s) => s.name === appt.service || s.id === appt.service
          );
          const existingDur = existingSvc?.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
          const [eH, eM] = appt.time.split(':').map(Number);
          const existStart = eH * 60 + eM;
          const existEnd = existStart + existingDur;
          // OVERLAP CHECK: Standard interval overlap detection
          return slotStart < existEnd && slotEnd > existStart;
        });

        if (hasBookingConflict) continue;

        // BLOCKED SLOTS CONFLICT DETECTION: Check against manually blocked time intervals
        const hasBlockConflict = (blockedSlots || []).some((block) => {
          // Skip blocks for other doctors (null = all doctors)
          if (block.doctor_id !== null && block.doctor_id !== doctor.id) return false;
          const [bsH, bsM] = block.time_start.split(':').map(Number);
          const [beH, beM] = block.time_end.split(':').map(Number);
          const blockStart = bsH * 60 + bsM;
          const blockEnd = beH * 60 + beM;
          // OVERLAP CHECK: Same interval overlap logic as appointments
          return slotStart < blockEnd && slotEnd > blockStart;
        });

        if (hasBlockConflict) continue;

        // TEMP RESERVATIONS CONFLICT DETECTION: Check against temporary reservations
        if (!skipTempReservations) {
          const hasTempReservationConflict = (tempReservations || []).some((tempRes) => {
            if (tempRes.doctor_id !== doctor.id) return false;
            const [tsH, tsM] = tempRes.time_start.split(':').map(Number);
            const [teH, teM] = tempRes.time_end.split(':').map(Number);
            const tempStart = tsH * 60 + tsM;
            const tempEnd = teH * 60 + teM;
            return slotStart < tempEnd && slotEnd > tempStart;
          });

          if (hasTempReservationConflict) continue;
        }

        // SLOT VALIDATION: Add slot if it passes all conflict checks
        // Deduplication prevents duplicate slots across multiple doctors
        if (!availableSlots.includes(slotTime)) {
          availableSlots.push(slotTime);
        }
      }
    }
  }

  // RETURN: Deduplicate and sort available slots for consistent UI presentation
  return [...new Set(availableSlots)].sort();
};

const sendEmail = async (to: string, subject: string, html: string, attachments?: any[]) => {
  try {
    const transporter = getTransporter();

    await transporter.sendMail({
      from: `"${BUSINESS_CONFIG.name}" <${process.env['SMTP_USER']}>`,
      to,
      subject,
      html,
      attachments
    });
    return true;
  } catch (error) {
    console.error('❌ Eroare Email:', error);
    return false;
  }
};

const sendSMS = async (phone: string, message: string): Promise<boolean> => {
  try {
    // Check if SMS provider is configured
    const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];
    
    if (!smsConfigured) {
      console.log(`[SMS SIMULATION] Phone: ${phone}, Message: ${message}`);
      return true;
    }

    // TODO: Implement actual SMS provider integration here
    // For now, simulate SMS sending
    console.log(`[SMS SENT] Phone: ${phone}, Message: ${message}`);
    return true;
  } catch (error) {
    console.error('❌ Eroare SMS:', error);
    return false;
  }
};

const generateICSAttachment = (appointment: {
  id: string;
  date: string;
  time: string;
  service: string;
  doctorName: string;
  firstName?: string;
  lastName?: string;
}) => {
  const dateParts = appointment.date.split('-').map(Number);
  const timeParts = appointment.time.split(':').map(Number);
  const service = BUSINESS_CONFIG.services.find(s => s.name === appointment.service || s.id === appointment.service);
  const durationMinutes = service?.durationMinutes || BUSINESS_CONFIG.scheduling.defaultServiceDuration;

  const event: ics.EventAttributes = {
    start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
    duration: { minutes: durationMinutes },
    title: `${appointment.service} - ${BUSINESS_CONFIG.name}`,
    description: `Programare la ${BUSINESS_CONFIG.name}. Doctor: ${appointment.doctorName}. Serviciu: ${appointment.service}.`,
    location: BUSINESS_CONFIG.location,
    uid: appointment.id,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    organizer: { name: BUSINESS_CONFIG.name, email: process.env['SMTP_USER'] || 'contact@dentalvoice.ro' },
  };

  const { error, value } = ics.createEvent(event);
  if (error) throw error;
  if (!value) throw new Error('Failed to generate ICS content');
  
  return { filename: 'programare.ics', content: value };
};

const getGoogleMapsLink = () => {
  const address = BUSINESS_CONFIG.location;
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
};

interface ProcessBookingPayload {
  phone: string;
  date: string;
  time: string;
  service: string;
  firstName: string;
  lastName: string;
  doctorId: string;
  email?: string;
  channel?: string;
}

// --- HELPER FUNCTIONS FOR LOAD BALANCING ---

/**
 * Get the start and end dates of the calendar week (Monday-Sunday) for a given date
 */
const getWeekBounds = (isoDate: string) => {
  const date = dayjs.tz(isoDate, BUCHAREST_TZ);
  const weekStart = date.startOf('week').day(1); // Force Monday as start
  const weekEnd = weekStart.add(6, 'days'); // Sunday as end
  return {
    weekStart: weekStart.format('YYYY-MM-DD'),
    weekEnd: weekEnd.format('YYYY-MM-DD')
  };
};

/**
 * Calculate total available working slots for a doctor in a specific week
 * Excludes blocked_slots from the denominator
 */
const calculateWeeklyAvailableSlots = async (doctorId: string, weekStart: string, weekEnd: string, durationMinutes: number = 30): Promise<number> => {
  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (!doctor) return 0;

  const supabase = getSupabase();
  const clinicId = CLINIC_INTEGRATION.clinicId;
  let totalSlots = 0;

  // Iterate through each day of the week
  for (let d = dayjs.tz(weekStart, BUCHAREST_TZ); d.isSameOrBefore(dayjs.tz(weekEnd, BUCHAREST_TZ)); d = d.add(1, 'day')) {
    const currentDay = d.format('YYYY-MM-DD');
    const dayOfWeek = d.day();

    // Check if doctor works on this day
    if (!doctor.workingDays.includes(dayOfWeek)) continue;

    // Get blocked slots for this doctor on this day
    const { data: blockedSlots } = await supabase
      .from('blocked_slots')
      .select('time_start, time_end')
      .eq('clinic_id', clinicId)
      .eq('doctor_id', doctorId)
      .eq('date', currentDay);

    // Calculate available slots for this day
    const startH = parseInt(doctor.workingHours.start.split(':')[0]);
    const startM = parseInt(doctor.workingHours.start.split(':')[1] || '0');
    const endH = parseInt(doctor.workingHours.end.split(':')[0]);
    const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');
    
    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;
    const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;

    // Generate all possible slots for this day
    for (let slotStart = startTotalMin; slotStart + durationMinutes <= endTotalMin; slotStart += step) {
      const slotEnd = slotStart + durationMinutes;

      // Check if this slot conflicts with any blocked slot
      const hasBlockConflict = (blockedSlots || []).some((block: any) => {
        const [bsH, bsM] = block.time_start.split(':').map(Number);
        const [beH, beM] = block.time_end.split(':').map(Number);
        const blockStart = bsH * 60 + bsM;
        const blockEnd = beH * 60 + beM;
        return slotStart < blockEnd && slotEnd > blockStart;
      });

      if (!hasBlockConflict) {
        totalSlots++;
      }
    }
  }

  return totalSlots;
};

/**
 * Calculate weekly occupancy rate for a doctor
 * Returns (confirmed appointments this week) / (available slots this week)
 */
const calculateWeeklyOccupancyRate = async (doctorId: string, weekStart: string, weekEnd: string, durationMinutes: number = 30): Promise<number> => {
  const supabase = getSupabase();
  const clinicId = CLINIC_INTEGRATION.clinicId;

  // Count confirmed appointments for this doctor in the week
  const { data: weekAppointments } = await supabase
    .from('appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('doctor_id', doctorId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .eq('status', 'Confirmed');

  const confirmedAppointments = weekAppointments?.length || 0;

  // Calculate total available slots for the week
  const availableSlots = await calculateWeeklyAvailableSlots(doctorId, weekStart, weekEnd, durationMinutes);

  // Return occupancy rate (0 if no available slots)
  return availableSlots > 0 ? confirmedAppointments / availableSlots : 0;
};

// ==========================================
// CORE BOOKING ENGINE - SINGLE SOURCE OF TRUTH
// ==========================================

/**
 * processBooking - THE SINGLE SOURCE OF TRUTH for all appointment bookings
 * 
 * CRITICAL: This function implements the Tank Architecture principles:
 * - Robustness: Optimistic locking, comprehensive validation, atomic transactions
 * - SaaS Multi-tenancy: Clinic-based isolation via CLINIC_INTEGRATION.clinicId
 * - Dynamic Parameters: Environment-driven limits and business rules
 * - Explicit Logic: Clear step-by-step booking process with documented validation
 * 
 * BOOKING FLOW:
 * 1. Phone sanitization & active booking limit enforcement
 * 2. Date/time validation in BUCHAREST_TZ
 * 3. Service resolution & duration calculation
 * 4. Slot availability verification
 * 5. Load balancing (3 rules) when doctorId === 'any'
 * 6. Optimistic locking: INSERT Pending -> catch duplicates
 * 7. Confirmation: UPDATE to Confirmed status
 * 
 * @param booking - Booking payload with all required fields
 * @returns Booking result with assigned doctor details
 * @throws ValidationError for any booking rule violation
 */
const processBooking = async (booking: ProcessBookingPayload) => {
  // STEP 1: PHONE VALIDATION & LIMIT ENFORCEMENT
  const sanitizedPhone = sanitizePhone(booking.phone);
  const activeBookingsCount = await countActiveBookings(sanitizedPhone);
  const MAX_BOOKINGS = BUSINESS_CONFIG.maxActiveBookingsPerPhone;
  
  // TEST PHONE BYPASS: Allows unlimited bookings for testing (configured via TEST_PHONE env)
  const isTestPhone = TEST_PHONE_NORMALIZED && sanitizePhone(booking.phone) === TEST_PHONE_NORMALIZED;
  if (!isTestPhone && activeBookingsCount >= MAX_BOOKINGS) {
    throw new Error(`Ne pare rau, dar a aparat o problema: Ait atins limita maxim de ${MAX_BOOKINGS} programri active. V rugm s verificai programrile active asociate acestui numar de telefon.`);
  }

  // STEP 2: CHANNEL VERIFICATION
  const channel = booking.channel || 'Web';
  let verified = channel === 'WhatsApp';

  // STEP 3: DATE/TIME VALIDATION (CRITICAL: BUCHAREST_TZ ONLY)
  const isoDate = parseRomanianDate(booking.date);
  if (!isoDate) throw new Error("Data programrii este indisponibil.");
  
  // STEP 4: SERVICE RESOLUTION & DURATION CALCULATION
  const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service || s.id === booking.service) || BUSINESS_CONFIG.services[0];
  const durationMinutes = service.durationMinutes || BUSINESS_CONFIG.scheduling.defaultServiceDuration;
  
  // CRITICAL: All datetime operations MUST use BUCHAREST_TZ
  const startDateTimeStr = `${isoDate}T${booking.time}:00`;
  const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
  if (!start.isValid()) throw new Error("Formatul datei/orei este indisponibil.");

  // STEP 5: DOCTOR ASSIGNMENT INITIALIZATION
  let targetDoctorName: string = "Echipa DentalVoice";
  let targetDoctorId: string = "any";

  const doctorId = booking.doctorId;
  
  // STEP 6: SLOT AVAILABILITY VERIFICATION
  const availableSlots = await getAvailableSlotsForDoctor(doctorId, isoDate, durationMinutes, true);
  if (!availableSlots.includes(booking.time)) {
    throw new Error("Ne pare rau, dar acest interval nu mai este disponibil.");
  }

  // Load balancing for 'any' doctor
  if (doctorId === 'any') {
    const availableDoctors = [];
    for (const d of BUSINESS_CONFIG.resources) {
      if (!isDoctorWorking(d, isoDate, booking.time, durationMinutes)) continue;

      // Check if this specific doctor has the slot available
      const doctorSlots = await getAvailableSlotsForDoctor(d.id, isoDate, durationMinutes, source === 'dashboard');
      if (doctorSlots.includes(booking.time)) {
        // Count existing bookings for load balancing
        const todayStart = dayjs.tz(`${isoDate}T00:00:00`, BUCHAREST_TZ).toISOString();
        const todayEnd = dayjs.tz(`${isoDate}T23:59:59`, BUCHAREST_TZ).toISOString();
        
        const { data: todayBookings } = await getSupabase()
          .from('appointments')
          .select('id')
          .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
          .eq('doctor_id', d.id)
          .eq('date', isoDate)
          .in('status', ['Pending', 'Confirmed']);

        availableDoctors.push({ 
          doctor: d, 
          todayLoad: todayBookings?.length || 0
        });
      }
    }
    
    if (availableDoctors.length > 0) {
      // Get week bounds for Rule 3 (weekly occupancy rate tiebreaker)
      const { weekStart, weekEnd } = getWeekBounds(isoDate);
      
      // Calculate weekly occupancy rates for all available doctors
      const doctorsWithWeeklyRate = await Promise.all(
        availableDoctors.map(async (doc) => {
          const weeklyOccupancyRate = await calculateWeeklyOccupancyRate(
            doc.doctor.id, 
            weekStart, 
            weekEnd, 
            durationMinutes
          );
          return {
            ...doc,
            weeklyOccupancyRate
          };
        })
      );

      // Load Balancing Algorithm with 3 rules:
      // Rule 1: Fewest bookings today (todayLoad)
      // Rule 2: Earlier availability (implicitly handled by order)
      // Rule 3: Lowest weekly occupancy rate as tiebreaker
      doctorsWithWeeklyRate.sort((a, b) => {
        // Rule 1: Primary sort by today's load
        if (a.todayLoad !== b.todayLoad) {
          return a.todayLoad - b.todayLoad;
        }
        
        // Rule 3: Tiebreaker by weekly occupancy rate (lower is better)
        return a.weeklyOccupancyRate - b.weeklyOccupancyRate;
      });

      const targetDoctor = doctorsWithWeeklyRate[0].doctor;
      targetDoctorName = targetDoctor.name;
      targetDoctorId = targetDoctor.id;
    }
  } else {
    const targetDoctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
    if (targetDoctor) {
      if (!isDoctorWorking(targetDoctor, isoDate, booking.time, durationMinutes)) {
        throw new Error("Medicul nu lucrează în acest interval.");
      }
      targetDoctorName = targetDoctor.name;
      targetDoctorId = targetDoctor.id;
    }
  }

  if (targetDoctorId === 'any') {
    throw new Error("Ne pare rău, dar niciun medic nu mai este disponibil pentru acest interval.");
  }

  const pendingRow = {
    clinic_id: CLINIC_INTEGRATION.clinicId,
    first_name: booking.firstName,
    last_name: booking.lastName,
    phone: booking.phone,
    phone_normalized: sanitizedPhone,
    email: booking.email ?? null,
    service: booking.service,
    doctor_id: targetDoctorId,
    doctor_name: targetDoctorName,
    date: isoDate,
    time: booking.time,
    google_event_id: null, // Always null in v3.0 - internal calendar only
    channel: booking.channel || 'Web',
    status: 'Pending',
  };

  const { error: lockError } = await getSupabase().from('appointments').insert([pendingRow]);

  if (lockError) {
    if (lockError.code === '23505') {
      throw new Error('Ne pare rău, acest slot tocmai a fost rezervat. Vă rugăm alegeți alt interval.');
    }
    throw new Error(lockError.message || 'Eroare la rezervare.');
  }

  // Confirm booking - no Google Calendar integration needed
  const { error: upErr } = await getSupabase()
    .from('appointments')
    .update({
      status: 'Confirmed',
    })
    .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
    .eq('doctor_id', targetDoctorId)
    .eq('date', isoDate)
    .eq('time', booking.time)
    .eq('status', 'Pending');

  if (upErr) {
    console.error('appointments confirm update failed:', upErr.message);
    // Rollback on confirmation failure
    await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('doctor_id', targetDoctorId)
      .eq('date', isoDate)
      .eq('time', booking.time)
      .eq('status', 'Pending');
    throw new Error('Eroare la confirmarea program\u0103rii.');
  }

  return {
    googleEventId: null, // Backward compatibility - always null in v3.0
    doctorName: targetDoctorName,
    doctorId: targetDoctorId,
    calendarId: null, // Backward compatibility - always null in v3.0
    assignedMessage: booking.doctorId === 'any' ? `A\u021bi fost repartizat(\u0103) la: ${targetDoctorName}` : undefined,
  };
};

// Debug Route for Environment Variables
app.get("/api/test-env", (req, res) => {
  const keys = Object.keys(process.env).filter(k => 
    !k.includes('SECURE') && 
    !k.includes('KEY') && 
    !k.includes('PASS') && 
    !k.includes('SECRET') &&
    !k.includes('JSON')
  );
  res.json({ 
    available_keys: keys,
    node_env: process.env.NODE_ENV,
    clinic_id: CLINIC_INTEGRATION.clinicId
  });
});

// Busy slots — thin wrapper over getAvailableSlotsForDoctor (grid-aligned busy intervals)
app.get("/api/busy-slots", async (req, res) => {
  try {
    const { doctorId, timeMin, timeMax } = req.query;

    if (!doctorId || !timeMin || !timeMax) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const durationMinutes = resolveDurationMinutesFromQuery(req.query);
    const isoDate = dayjs.tz(timeMin as string, BUCHAREST_TZ).format('YYYY-MM-DD');
    const slotStarts = buildClinicDaySlotStarts(isoDate, durationMinutes);

    const calendarId = getCalendarIdForDoctor(doctorId as string);
    if (doctorId !== 'any' && !calendarId) {
      console.error('❌ Error: Doctor configuration missing for:', doctorId);
      return res.status(400).json({
        error: "Doctor configuration missing",
        receivedId: doctorId,
      });
    }

    const available = await getAvailableSlotsForDoctor(doctorId as string, isoDate, durationMinutes);
    const availableSet = new Set(available);
    const busyForUi: { slot: string; start: string; end: string }[] = [];

    for (const slotHHmm of slotStarts) {
      if (!availableSet.has(slotHHmm)) {
        const ws = dayjs.tz(`${isoDate}T${slotHHmm}:00`, BUCHAREST_TZ);
        const we = ws.add(durationMinutes, 'minute');
        busyForUi.push({
          slot: slotHHmm,
          start: ws.toISOString(),
          end: we.toISOString(),
        });
      }
    }

    res.json(busyForUi);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Error fetching busy slots:', msg);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/config", async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data: doctors, error } = await supabase
      .from('doctors')
      .select('id, name, working_days, working_hours_start, working_hours_end')
      .eq('clinic_id', CLINIC_CONFIG.id)
      .eq('is_active', true)
      .order('id');

    if (error) throw error;

    const resources = [
      { id: 'any', name: 'Oricare medic disponibil', workingDays: [], workingHours: { start: '09:00', end: '18:00' } },
      ...(doctors || []).map(d => ({
        id: d.id,
        name: d.name,
        workingDays: d.working_days,
        workingHours: { start: d.working_hours_start, end: d.working_hours_end }
      }))
    ];

    res.json({
      id: CLINIC_CONFIG.id,
      name: BUSINESS_CONFIG.name,
      location: BUSINESS_CONFIG.location,
      clinicPhone: CLINIC_CONFIG.clinicPhone,
      whatsappNumber: CLINIC_INTEGRATION.whatsappNumber,
      whatsappText: CLINIC_INTEGRATION.whatsappText,
      facebookPageId: CLINIC_INTEGRATION.facebookPageId,
      messengerId: CLINIC_INTEGRATION.messengerId,
      resources,
      services: BUSINESS_CONFIG.services,
      scheduling: {
        slotStepMinutes: BUSINESS_CONFIG.scheduling.slotStepMinutes,
        workingHours: BUSINESS_CONFIG.scheduling.workingHours
      }
    });
  } catch (err: any) {
    console.error('[GET /api/config]', err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /api/config/all - returns all clinic config as key-value object (protected)
app.get("/api/config/all", protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clinic_config')
      .select('key, value')
      .order('key');

    if (error) throw error;

    // Convert array to key-value object
    const config = data.reduce((acc, item) => {
      acc[item.key] = item.value;
      return acc;
    }, {} as Record<string, string>);

    res.json(config);
  } catch (error: any) {
    console.error('Error fetching clinic config:', error);
    res.status(500).json({ error: 'Eroare la încărcarea configurației' });
  }
});

// PATCH /api/config - upsert clinic config value (protected)
app.patch("/api/config", protectRoute, async (req, res) => {
  try {
    const { key, value } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Cheie și valoare sunt obligatorii' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clinic_config')
      .upsert({ 
        key, 
        value, 
        updated_at: new Date().toISOString() 
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error updating clinic config:', error);
    res.status(500).json({ error: 'Eroare la salvarea configurației' });
  }
});

// GET /api/doctors - get all doctors (protected)
app.get("/api/doctors", protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .order('name');

    if (error) throw error;

    res.json(data);
  } catch (error: any) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Eroare la încărcarea medicilor' });
  }
});

// POST /api/doctors - create new doctor (protected)
app.post("/api/doctors", protectRoute, async (req, res) => {
  try {
    const { name, working_days, working_hours_start, working_hours_end } = req.body;
    
    if (!name || !working_days || !working_hours_start || !working_hours_end) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .insert({ 
        name, 
        working_days, 
        working_hours_start, 
        working_hours_end 
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: 'Eroare la adăugarea medicului' });
  }
});

// PATCH /api/doctors/:id - update doctor (protected)
app.patch("/api/doctors/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, working_days, working_hours_start, working_hours_end } = req.body;
    
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .update({ 
        name, 
        working_days, 
        working_hours_start, 
        working_hours_end 
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ error: 'Medicul nu a fost găsit' });
    }

    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'Eroare la actualizarea medicului' });
  }
});

// DELETE /api/doctors/:id - delete doctor (protected)
app.delete("/api/doctors/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();

    // Check if doctor has future appointments
    const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
    const { data: futureAppointments, error: appointmentsError } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', id)
      .gte('date', today)
      .in('status', ['Confirmed', 'Pending'])
      .limit(1);

    if (appointmentsError) throw appointmentsError;

    if (futureAppointments && futureAppointments.length > 0) {
      return res.status(400).json({ 
        error: 'Medicul are programări viitoare. Anulați-le înainte de a șterge medicul.' 
      });
    }

    // Delete the doctor
    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Eroare la ștergerea medicului' });
  }
});

app.post("/api/doctors", protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id, name, workingDays, workingHoursStart, workingHoursEnd } = req.body;

    if (!id || !name) {
      return res.status(400).json({ error: 'id și name sunt obligatorii' });
    }

    // Validate id format: only lowercase letters, numbers, no spaces
    if (!/^[a-z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'ID-ul poate conține doar litere mici și cifre' });
    }

    const { error } = await supabase
      .from('doctors')
      .insert({
        id,
        clinic_id: CLINIC_CONFIG.id,
        name,
        working_days: workingDays || [1, 2, 3, 4, 5],
        working_hours_start: workingHoursStart || '09:00',
        working_hours_end: workingHoursEnd || '18:00',
        is_active: true
      });

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ error: 'Un medic cu acest ID există deja' });
      }
      throw error;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error adding doctor:', error);
    res.status(500).json({ error: 'Eroare la adăugarea medicului' });
  }
});

app.patch("/api/doctors/:id", protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    const { name, workingDays, workingHoursStart, workingHoursEnd } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (workingDays !== undefined) updateData.working_days = workingDays;
    if (workingHoursStart !== undefined) updateData.working_hours_start = workingHoursStart;
    if (workingHoursEnd !== undefined) updateData.working_hours_end = workingHoursEnd;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'Niciun câmp de actualizat' });
    }

    const { error } = await supabase
      .from('doctors')
      .update(updateData)
      .eq('id', id)
      .eq('clinic_id', CLINIC_CONFIG.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating doctor:', error);
    res.status(500).json({ error: 'Eroare la actualizarea medicului' });
  }
});

// TODO: rate-limit
app.get("/api/bookings/search", async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: "Phone required." });
    }

    const phoneNormalized = normalizePhoneForSearch(phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: "Invalid phone number." });
    }

    const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');

    // Try exact match first, then try with padding
    let data = null;
    let error = null;

    const { data: exactMatch, error: exactError } = await getSupabase()
      .from('appointments')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('phone_normalized', phoneNormalized)
      .in('status', ['Confirmed', 'Pending'])
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(1)
      .single();

    if (!exactError && exactMatch) {
      data = exactMatch;
    } else {
      // Try with padded version
      const paddedPhone = phoneNormalized.padStart(9, '0');
      const { data: paddedMatch, error: paddedError } = await getSupabase()
        .from('appointments')
        .select('*')
        .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
        .eq('phone_normalized', paddedPhone)
        .in('status', ['Confirmed', 'Pending'])
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .single();
      
      data = paddedMatch;
      error = paddedError;
    }

    if (error || !data) {
      return res.status(404).json({ error: "Programarea nu a fost găsită." });
    }

    const calendarFromRow =
      typeof data.calendar_id === 'string' && data.calendar_id.length > 0
        ? data.calendar_id
        : getCalendarIdForDoctor(data.doctor_id);

    res.json({
      id: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      phone: data.phone,
      email: data.email,
      service: data.service,
      doctorId: data.doctor_id,
      doctorName: data.doctor_name,
      date: data.date,
      time: data.time,
      googleEventId: data.google_event_id,
      calendarId: calendarFromRow ?? null,
      status: data.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ error: message });
  }
});

/** Shared cancel logic for DELETE /api/delete-booking and WhatsApp flow */
const deleteAppointmentByPhoneDateTime = async (
  phoneRaw: string,
  date: string,
  time: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
  const sanitized = normalizePhoneForSearch(phoneRaw);
  if (!sanitized) {
    return { ok: false, status: 400, message: 'Numâr de telefon invalid.' };
  }

  // Try exact match first, then try with padding
  let appointment = null;
  let findError = null;

  // First try exact match
  const { data: exactMatch, error: exactError } = await getSupabase()
    .from('appointments')
    .select('*')
    .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
    .eq('phone_normalized', sanitized)
    .eq('date', date)
    .eq('time', time)
    .maybeSingle();

  if (!exactError && exactMatch) {
    appointment = exactMatch;
  } else {
    // Try with padded version
    const paddedPhone = sanitized.padStart(9, '0');
    const { data: paddedMatch, error: paddedError } = await getSupabase()
      .from('appointments')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('phone_normalized', paddedPhone)
      .eq('date', date)
      .eq('time', time)
      .maybeSingle();
    
    appointment = paddedMatch;
    findError = paddedError;
  }

  if (findError || !appointment) {
    return { ok: false, status: 404, message: 'Programarea nu a fost găsită.' };
  }

  // Google Calendar removed in v3.0 - no external calendar deletion needed

  const { error: deleteError } = await getSupabase().from('appointments').delete().eq('id', appointment.id);

  if (deleteError) {
    console.error('deleteAppointmentByPhoneDateTime:', deleteError.message);
    return { ok: false, status: 500, message: 'Nu am putut anula programarea. Încercați din nou.' };
  }

  return { ok: true };
};

app.delete("/api/delete-booking", async (req, res) => {
  try {
    const { phone, date, time } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone is required." });
    if (!date || !time) return res.status(400).json({ error: "Data și ora sunt necesare." });

    const result = await deleteAppointmentByPhoneDateTime(phone, date, time);
    if (result.ok === false) {
      return res.status(result.status).json({ error: result.message });
    }
    res.json({ success: true, message: "Programarea a fost anulată." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Eroare server';
    res.status(500).json({ error: msg });
  }
});

app.post("/api/leads", async (req, res) => {
  try {
    const { clinicName, contactPerson, phone, address, message, tierInteres } = req.body;
    if (!clinicName || !contactPerson || !phone) return res.status(400).json({ error: "Required fields missing." });

    const { error } = await getSupabase().from('leads').insert([{
      clinic_id: CLINIC_INTEGRATION.clinicId,
      clinic_name: clinicName,
      contact_person: contactPerson,
      phone,
      address: address || '',
      message: message || '',
      tier_interes: tierInteres || 'Custom',
      status: 'New'
    }]);

    if (error) throw error;
    res.status(201).json({ success: true, message: "Solicitarea a fost trimisă!" });
  } catch (error) {
    console.error('❌ Eroare Lead:', error);
    res.status(500).json({ error: "Eroare la salvarea solicitării." });
  }
});

app.get("/api/admin/leads", protectRoute, async (req, res) => {
  try {
    const { data, error } = await getSupabase().from('leads').select('*').eq('clinic_id', CLINIC_INTEGRATION.clinicId).order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data.map((l: any) => ({
      id: l.id,
      clinicName: l.clinic_name,
      contactPerson: l.contact_person,
      phone: l.phone,
      address: l.address,
      message: l.message,
      tierInteres: l.tier_interes,
      status: l.status,
      timestamp: l.created_at
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/admin/cleanup-pending", protectRoute, async (req, res) => {
  try {
    const staleBefore = dayjs().subtract(PENDING_APPOINTMENT_STALE_MINUTES, 'minute').toISOString();
    const { data, error } = await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('status', 'Pending')
      .lt('created_at', staleBefore)
      .select('id');

    if (error) throw error;

    res.json({
      success: true,
      deletedCount: data?.length ?? 0,
      staleBefore,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cleanup failed';
    console.error('cleanup-pending:', message);
    res.status(500).json({ error: message });
  }
});

app.post('/api/admin/cleanup-test-phone', protectRoute, async (req, res) => {
  try {
    const testPhone = TEST_PHONE_NORMALIZED;
    if (!testPhone) return res.status(400).json({ error: 'TEST_PHONE not configured.' });
    
    const { data, error } = await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('phone_normalized', testPhone)
      .select('id');
    
    if (error) throw error;
    console.log(`[ADMIN] Deleted ${data?.length ?? 0} test appointments for ${testPhone}`);
    return res.json({ success: true, deleted: data?.length ?? 0 });
  } catch (err: any) {
    console.error('cleanup-test-phone:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/run-archive", protectRoute, async (req, res) => {
  try {
    const result = await runArchive(CLINIC_INTEGRATION.clinicId);
    res.json({ success: true, ...result, ranAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// --- WhatsApp conversation engine (state in chat_sessions) ---

const WA_WELCOME_BUTTONS = [
  '📅 Vreau o programare',
  '📝 Editez sau anulez o programare',
  '📞 Contactez Recepția',
];

const waNormalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const waReceptionReply = () =>
  `Vă rugăm să ne contactați direct la ${CLINIC_CONFIG.clinicPhone}. Programul nostru: Luni-Vineri 09:00-18:00.`;

const waReceptionButtons = () => [
  `📲 Sună recepția: ${CLINIC_CONFIG.clinicPhone}`,
  '🔙 Înapoi la meniu',
];

const waIdleGreetingReply = () =>
  `Bună! 👋 Sunt Denti, asistentul virtual al ${BUSINESS_CONFIG.name}.\n\nPoți scrie „Bună", „Salut" sau „Programare" pentru a începe, sau folosește butoanele de mai jos pentru a alege rapid ce dorești.`;

/**
 * Creates a WhatsApp interactive message with call button
 * @param bodyText The message body text
 * @param buttonText The button text
 * @param phoneNumber The phone number to call
 * @returns Interactive message object for Meta Graph API
 */
const waCreateCallInteractiveMessage = (bodyText: string, buttonText: string, phoneNumber: string) => ({
  type: 'interactive',
  interactive: {
    type: 'button',
    body: {
      text: bodyText
    },
    action: {
      buttons: [
        {
          type: 'phone_number',
          text: buttonText,
          phone_number: phoneNumber
        }
      ]
    }
  }
});

const coerceChatSessionStep = (raw: string | undefined): ChatSessionStep => {
  if (!raw) return 'idle';
  if (raw === 'awaiting_name') return 'awaiting_full_name';
  if (raw === 'awaiting_name_first') return 'awaiting_full_name';
  if (raw === 'awaiting_name_last') return 'awaiting_full_name';
  const allowed: ChatSessionStep[] = [
    'idle',
    'awaiting_service',
    'awaiting_doctor',
    'awaiting_date',
    'awaiting_time',
    'awaiting_full_name',
    'awaiting_phone_confirm',
    'awaiting_manual_phone_input',
    'awaiting_booking_phone_verification_code',
    'awaiting_email',
    'confirming',
    'confirmed',
    'cancelling',
    'awaiting_cancel_phone',
    'awaiting_cancel_confirm',
    'awaiting_lookup_phone',
    'awaiting_sms_verification_code',
    'awaiting_cross_phone_input',
    'awaiting_cross_phone_otp',
  ];
  return (allowed.includes(raw as ChatSessionStep) ? raw : 'idle') as ChatSessionStep;
};

const waMatchesMenuReset = (t: string) => {
  const n = waNormalize(t);
  return ['meniu', 'start', 'restart', 'inceput'].some((k) => n === k || n.startsWith(`${k} `));
};

const waMatchesOperator = (t: string) => {
  const n = waNormalize(t);
  return (
    /\boperator\b/.test(n) ||
    /\bom\b/.test(n) ||
    n.includes('ajutor') ||
    n.includes('receptie') ||
    n.includes('recepție')
  );
};

const waMatchesGlobalCancel = (t: string) => {
  const n = waNormalize(t);
  // Must not match the menu button label ? only standalone cancel intent
  if (n.includes('editez sau anulez') || n.includes('editez sau anuleaza')) return false;
  if (n.includes('anulez programarea') || n.includes('anulez o programare')) return false;
  return n === 'anulare' || n === 'cancel' || n === 'anuleaza' || n.startsWith('anulare ');
};

const waMatchesIdleOpeners = (t: string) => {
  const n = waNormalize(t);
  return (
    n.includes('buna') ||
    n.includes('salut') ||
    n.includes('hello') ||
    n.includes('bun') ||
    n.includes('ajutor')
    // NOTE: do NOT include 'vreau', 'programare', 'anulez' here
    // Those are handled as specific actions in case 'idle' BEFORE this check
  );
};

const parseAndValidateFullName = (
  input: string
): { ok: true; firstName: string; lastName: string } | { ok: false; message: string } => {
  const cleanName = input.trim();
  const nameRegex = /^[a-zA-ZăâîșțĂÂÎȘȚ\s'\-]+$/;

  if (cleanName.length < 2) {
    return {
      ok: false,
      message: 'Numele trebuie să aibă cel puțin 2 caractere. Vă rugăm reintroduceți.',
    };
  }
  if (cleanName.length > 50) {
    return {
      ok: false,
      message: 'Numele este prea lung. Introduceți numele și prenumele dumneavoastră.',
    };
  }
  if (!nameRegex.test(cleanName)) {
    return {
      ok: false,
      message: 'Numele conține caractere nevalide. Folosiți doar litere, spații sau cratimă.',
    };
  }

  const parts = cleanName.split(/\s+/).filter(p => p.length > 0);
  if (parts.length < 2) {
    return {
      ok: false,
      message: 'Vă rugăm introduceți atât numele cât și prenumele (ex: "Ion Popescu").',
    };
  }

  const firstName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase();
  const lastName = parts.slice(1).join(' ').charAt(0).toUpperCase() + parts.slice(1).join(' ').slice(1).toLowerCase();
  
  return { ok: true, firstName, lastName };
};

const parseFlexibleUserDate = (raw: string): string | null => {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;

  const fromRoName = parseRomanianDate(t);
  if (fromRoName) return fromRoName;

  const n = waNormalize(t);

  if (n === 'maine' || n === 'mâine') {
    return dayjs().tz(BUCHAREST_TZ).add(1, 'day').format('YYYY-MM-DD');
  }
  if (n === 'poimaine' || n === 'poimâine') {
    return dayjs().tz(BUCHAREST_TZ).add(2, 'day').format('YYYY-MM-DD');
  }

  const dm = t.match(/^(\d{1,2})[\./](\d{1,2})(?:[\./](\d{2,4}))?$/);
  if (dm) {
    const d = parseInt(dm[1], 10);
    const m = parseInt(dm[2], 10);
    let y = dm[3] ? parseInt(dm[3], 10) : dayjs().tz(BUCHAREST_TZ).year();
    if (y < 100) y += 2000;
    const candidate = dayjs.tz(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T12:00:00`,
      BUCHAREST_TZ
    );
    if (candidate.isValid()) return candidate.format('YYYY-MM-DD');
  }

  const dayMap: Record<string, number> = {
    duminica: 0,
    luni: 1,
    marti: 2,
    miercuri: 3,
    joi: 4,
    vineri: 5,
    sambata: 6,
  };

  for (const [label, dow] of Object.entries(dayMap)) {
    if (n === label || n.startsWith(`${label} `)) {
      let cur = dayjs().tz(BUCHAREST_TZ).startOf('day');
      for (let i = 0; i < 21; i++) {
        if (cur.day() === dow) {
          return cur.format('YYYY-MM-DD');
        }
        cur = cur.add(1, 'day');
      }
    }
  }

  return null;
};

const filterSlotsMinLead = (isoDate: string, slots: string[]): string[] => {
  const minH = CLINIC_CONFIG.scheduling.minLeadTimeHours ?? 2;
  const now = dayjs().tz(BUCHAREST_TZ);
  const today = now.format('YYYY-MM-DD');
  if (isoDate !== today) return slots;
  const cutoff = now.add(minH, 'hour');
  return slots.filter((s) => dayjs.tz(`${isoDate}T${s}:00`, BUCHAREST_TZ).isAfter(cutoff));
};

const findActiveAppointmentForPhone = async (from: string) => {
  const phoneNormalized = sanitizePhone(from);
  if (!phoneNormalized) return null;
  const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
  const { data, error } = await getSupabase()
    .from('appointments')
    .select('*')
    .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
    .eq('phone_normalized', phoneNormalized)
    .in('status', ['Confirmed', 'Pending'])
    .gte('date', today)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1);

  if (error) {
    console.error('findActiveAppointmentForPhone:', error.message);
    return null;
  }
  return data?.[0] ?? null;
};

const matchServiceFromInput = (input: string) => {
  const trimmed = input.trim();
  const n = waNormalize(trimmed);
  const idx = /^\s*(\d+)\s*$/.exec(trimmed);
  if (idx) {
    const i = parseInt(idx[1], 10);
    if (i >= 1 && i <= BUSINESS_CONFIG.services.length) return BUSINESS_CONFIG.services[i - 1];
  }
  for (const s of BUSINESS_CONFIG.services) {
    const sn = waNormalize(s.name);
    if (n === sn) return s;
  }
  for (const s of BUSINESS_CONFIG.services) {
    const sn = waNormalize(s.name);
    if (sn.includes(n) || (n.length >= 3 && n.includes(sn.split(' ')[0]))) return s;
  }
  return null;
};

const matchDoctorFromInput = (input: string) => {
  const trimmed = input.trim();
  const n = waNormalize(trimmed);
  const idx = /^\s*(\d+)\s*$/.exec(trimmed);
  if (idx) {
    const i = parseInt(idx[1], 10);
    if (i === 1) return { id: 'any', name: 'Oricare medic disponibil' };
    if (i >= 2 && i <= BUSINESS_CONFIG.resources.length + 1) {
      const d = BUSINESS_CONFIG.resources[i - 2];
      return { id: d.id, name: d.name };
    }
  }
  if (
    n.includes('oricare') ||
    n.includes('orice medic') ||
    n === 'any' ||
    trimmed.includes('Oricare')
  ) {
    return { id: 'any', name: 'Oricare medic disponibil' };
  }
  for (const d of BUSINESS_CONFIG.resources) {
    const dn = waNormalize(d.name);
    if (n.includes(dn) || dn.includes(n)) return { id: d.id, name: d.name };
  }
  return null;
};

const buildServicePrompt = () => {
  const lines = BUSINESS_CONFIG.services.map(
    (s, i) => `${i + 1}. ${s.name}`
  );
  return `Ce serviciu doriți?\n\n${lines.join('\n')}`;
};

const buildDoctorPrompt = () => {
  const lines = [
    '1. Oricare medic disponibil (recomandat)',
    ...BUSINESS_CONFIG.resources.map((d, i) => `${i + 2}. ${d.name}`),
  ];
  return `Preferați un anumit medic?\n\n${lines.join('\n')}`;
};

const serviceQuickReplyLabels = () => BUSINESS_CONFIG.services.map((s) => s.name);

const doctorQuickReplyLabels = () => [
  'Oricare medic',
  ...BUSINESS_CONFIG.resources.map((d) => d.name),
];

const waMatchesConfirm = (t: string) => {
  const n = waNormalize(t);
  return n.includes('confirm') || t.includes('✅');
};

const waMatchesDeny = (t: string) => {
  const n = waNormalize(t);
  return n.includes('anulez') || t.includes('❌');
};

const waMatchesModify = (t: string) => {
  const n = waNormalize(t);
  return n.includes('modific') || t.includes('✏️');
};

const waMatchesSkipEmail = (t: string) => {
  const n = waNormalize(t);
  return n.includes('sari') || n === 'nu' || n.includes('skip') || t.includes('Sari peste');
};

const waMatchesYesCancel = (t: string) => {
  const n = waNormalize(t);
  return n.includes('da') && (n.includes('anulez') || t.includes('✅'));
};

const waMatchesNoCancel = (t: string) => {
  const n = waNormalize(t);
  return (
    n.includes('pastrez') ||
    n.includes('păstrez') ||
    n === 'nu' ||
    (t.includes('❌') && n.includes('nu'))
  );
};

// ==========================================
// FACEBOOK MESSENGER BOT
// ==========================================

// Facebook normalize (same logic as waNormalize — reuse it)
const fbNormalize = waNormalize; // alias, not a copy

// Send a text message via Facebook Graph API
const sendFacebookMessage = async (recipientId: string, text: string): Promise<void> => {
  const token = process.env['FACEBOOK_PAGE_ACCESS_TOKEN'];
  if (!token) {
    console.log(`[FB SIMULATION] To: ${recipientId} | Message: ${text}`);
    return;
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error('[sendFacebookMessage] Graph API error:', err);
    }
  } catch (e: any) {
    console.error('[sendFacebookMessage] Fetch error:', e.message);
  }
};

// Send quick replies (buttons) via Facebook Graph API
const sendFacebookQuickReplies = async (
  recipientId: string,
  text: string,
  buttons: string[]
): Promise<void> => {
  const token = process.env['FACEBOOK_PAGE_ACCESS_TOKEN'];
  if (!token || buttons.length === 0) {
    await sendFacebookMessage(recipientId, text);
    return;
  }
  // Facebook quick replies: max 13 items, max 20 chars each (truncate if needed)
  const quickReplies = buttons.slice(0, 13).map((label) => ({
    content_type: 'text',
    title: label.substring(0, 20),
    payload: label,
  }));
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text, quick_replies: quickReplies },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error('[sendFacebookQuickReplies] Graph API error:', err);
    }
  } catch (e: any) {
    console.error('[sendFacebookQuickReplies] Fetch error:', e.message);
  }
};

type WhatsappTurnResult = { reply: string; buttons: string[]; session: ChatSession; interactive?: any };

const runWhatsappStateMachine = async (from: string, text: string, session: ChatSession): Promise<WhatsappTurnResult> => {
  const applyGlobalInterrupts = async (): Promise<WhatsappTurnResult | null> => {
    if (waMatchesMenuReset(text)) {
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }
    if (waMatchesOperator(text)) {
      const interactiveMessage = waCreateCallInteractiveMessage(
        waReceptionReply(),
        'Suna\u021bi recep\u021bia',
        CLINIC_CONFIG.clinicPhone
      );
      return {
        reply: waReceptionReply(),
        buttons: [],
        session: { step: 'idle', data: {} },
        interactive: interactiveMessage,
      };
    }
    if (waMatchesGlobalCancel(text)) {
      const apt = await findActiveAppointmentForPhone(from);
      if (!apt) {
        return {
          reply:
            'Nu am găsit o programare activă asociată acestui număr. Dacă aveți nevoie de ajutor, contactați recepția.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: `Am găsit programarea:\n📅 ${formatDisplayDateRo(apt.date)} la ${apt.time}\n🦷 ${apt.service}\n👨‍⚕️ ${apt.doctor_name || 'Medic'}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: {
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };
    }
    return null;
  };

  if (session.step !== 'awaiting_cancel_confirm') {
    const g = await applyGlobalInterrupts();
    if (g) return g;
  } else {
    if (waMatchesMenuReset(text)) {
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }
  }

  switch (session.step) {
    case 'awaiting_cancel_confirm': {
      const norm = waNormalize(text);

      // "Modific data/ora" ? restart booking flow keeping same patient context
      if (norm.includes('modific data') || norm.includes('modific ora') || text.includes('?? Modific')) {
        return {
          reply: buildServicePrompt(),
          buttons: serviceQuickReplyLabels(),
          session: { step: 'awaiting_service', data: {} },
        };
      }

      // "napoi la meniu"
      if (norm.includes('inapoi') || norm.includes('napoi') || text.includes('??')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // "Anulez programarea" ? map to existing yes-cancel logic
      if (text.includes('?? Anulez programarea') || norm.includes('anulez programarea')) {
        // treat as waMatchesYesCancel = true ? reuse existing cancel confirm logic
      }

      if (waMatchesYesCancel(text)) {
        const d = session.data.cancelDate;
        const tm = session.data.cancelTime;
        if (!d || !tm) {
          return {
            reply: 'A apărut o inconsistență. Reîncepeți cu „Meniu”.',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        const del = await deleteAppointmentByPhoneDateTime(from, d, tm);
        if (del.ok === false) {
          return {
            reply: del.message,
            buttons: [],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: 'Programarea a fost anulată cu succes. Vă mai așteptăm!',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      if (waMatchesNoCancel(text)) {
        return {
          reply: 'Perfect, păstrăm programarea. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: 'Vă rugăm răspundeți cu „Da, anulez” sau „Nu, păstrez”.',
        buttons: ['?? Da, anulez', '?? Nu, păstrez'],
        session,
      };
    }

    case 'cancelling':
    case 'awaiting_cancel_phone': {
      return {
        reply: 'Folosiți „Anulare” pentru a anula o programare sau „Meniu” pentru a reîncepe.',
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }

    case 'awaiting_lookup_phone': {
      const phoneInput = text.trim();
      const sanitized = sanitizePhone(phoneInput);
      
      if (!sanitized || sanitized.length < 9) {
        return {
          reply: 'Numărul de telefon introdus este invalid. Vă rugăm introduceți un număr valid format 07xxxxxxxx.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      const apt = await findActiveAppointmentForPhone(sanitized);
      if (!apt) {
        return {
          reply: 'Nu am găsit nicio programare activă pentru acest număr de telefon.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Generate and send SMS verification code
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = dayjs().add(10, 'minute').toISOString();
      
      // Store verification code temporarily
      otpSessions.set(sanitized, code);
      
      // In production, this would send actual SMS
      console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
      
      return {
        reply: `Am găsit o programare pentru numărul ${sanitized}.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduceți codul pentru a continua.\n\n(Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_sms_verification_code',
          data: { 
            lookupPhone: sanitized,
            verificationCode: code,
            verificationExpires: expiresAt,
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };
    }

    case 'awaiting_sms_verification_code': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. Vă rugăm încercați din nou.',
          buttons: ['🔙 Înapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: 'Cod incorect. Vă rugăm introduceți codul primit prin SMS.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      // Code verified - proceed with cancel flow
      return {
        reply: `Cod verificat! Am găsit programarea:\n📅 ${formatDisplayDateRo(session.data.cancelDate || '')} la ${session.data.cancelTime}\n🦷 ${session.data.cancelService}\n👨‍⚕️ ${session.data.cancelDoctorName}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: session.data,
        },
      };
    }

    case 'awaiting_cross_phone_input': {
      const norm = waNormalize(text);
      
      // Handle back to menu
      if (norm.includes('inapoi') || norm.includes('napoi') || text.includes('??')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      // Option 1: Search on current phone number
      if (text.includes('1.') || norm.includes('caut pe acest numar') || norm.includes('acest numar')) {
        const apt = await findActiveAppointmentForPhone(from);
        if (!apt) {
          return {
            reply: 'Nu am g\u0103sit nicio programare activ\u0103 la acest num\u0103r de telefon.\n\nDori\u021bi s\u0103 \u00eenceerca\u021bi cu un alt num\u0103r de telefon?',
            buttons: ['2. Alt num\u0103r de telefon', '\ud83d\udd19 \u00cenapoi la meniu'],
            session: {
              step: 'awaiting_cross_phone_input',
              data: {},
            },
          };
        }
        
        // Generate and send SMS verification code for current phone
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = dayjs().add(10, 'minute').toISOString();
        const sanitized = sanitizePhone(from);
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am g\u0103sit o programare pentru num\u0103rul dumneavoastr\u0103.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduce\u021bi codul pentru a continua.\n\n(Cod de test: ${code})`,
          buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_otp',
            data: { 
              lookupPhone: sanitized,
              verificationCode: code,
              verificationExpires: expiresAt,
              cancelDate: apt.date,
              cancelTime: apt.time,
              cancelService: apt.service,
              cancelDoctorName: apt.doctor_name || '',
            },
          },
        };
      }
      
      // Option 2: Enter different phone number
      if (text.includes('2.') || norm.includes('alt numar') || norm.includes('alt telefon')) {
        return {
          reply: 'Introduce\u021bi num\u0103rul de telefon folosit la programare (format: 07xxxxxxxx):',
          buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_input',
            data: { ...session.data, awaitingPhoneInput: true },
          },
        };
      }
      
      // Handle phone number input
      if (session.data.awaitingPhoneInput) {
        const phoneInput = text.trim();
        const sanitized = sanitizePhone(phoneInput);
        
        if (!sanitized || sanitized.length < 9) {
          return {
            reply: 'Num\u0103rul de telefon introdus este invalid. V\u0103 rug\u0103m introduce\u021bi un num\u0103r valid format 07xxxxxxxx.',
            buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
            session: { ...session, data: { ...session.data, awaitingPhoneInput: false } },
          };
        }

        const apt = await findActiveAppointmentForPhone(sanitized);
        if (!apt) {
          return {
            reply: 'Nu am g\u0103sit nicio programare activ\u0103 pentru acest num\u0103r de telephone.',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }

        // Generate and send SMS verification code
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = dayjs().add(10, 'minute').toISOString();
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am g\u0103sit o programare pentru num\u0103rul ${sanitized}.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduce\u021bi codul pentru a continua.\n\n(Cod de test: ${code})`,
          buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_otp',
            data: { 
              lookupPhone: sanitized,
              verificationCode: code,
              verificationExpires: expiresAt,
              cancelDate: apt.date,
              cancelTime: apt.time,
              cancelService: apt.service,
              cancelDoctorName: apt.doctor_name || '',
            },
          },
        };
      }
      
      // Fallback
      return {
        reply: 'V\u0103 rug\u0103m alege\u021bi o op\u021biune:',
        buttons: ['1. Caut\u0103 pe acest num\u0103r', '2. Alt num\u0103r de telefon', '\ud83d\udd19 \u00cenapoi la meniu'],
        session,
      };
    }

    case 'awaiting_cross_phone_otp': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      const attempts = (session.data.otpAttempts || 0) + 1;
      
      // Handle back to menu
      if (waNormalize(text).includes('inapoi') || waNormalize(text).includes('napoi')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. V\u0103 rug\u0103m \u00eenceerca\u021bi din nou.',
          buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      // Check if max attempts reached
      if (attempts > 3) {
        return {
          reply: 'Prea multe \u00eencer\u0103ri gre\u0219ite. Pentru securitate, conversa\u021bia a fost resetat\u0103. V\u0103 rug\u0103m \u00eencepe\u021bi din nou.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: `Cod incorect. \u00cencer\u0103ri r\u0103mase: ${3 - attempts}. V\u0103 rug\u0103m introduce\u021bi codul primit prin SMS.`,
          buttons: ['\ud83d\udd19 \u00cenapoi la meniu'],
          session: { ...session, data: { ...session.data, otpAttempts: attempts } },
        };
      }

      // Code verified - proceed with cancel flow
      return {
        reply: `Cod verificat! Am g\u0103sit programarea:\n\ud83d\udcc5 ${formatDisplayDateRo(session.data.cancelDate || '')} la ${session.data.cancelTime}\n\ud83e\uddb5 ${session.data.cancelService}\n\ud83d\udc68\u200d\u2695\ufe0f ${session.data.cancelDoctorName}\n\nConfirma\u021bi anularea?`,
        buttons: ['\u2705 Da, anulez', '\u274c Nu, p\u0103strez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: session.data,
        },
      };
    }

    case 'confirmed': {
      if (waMatchesIdleOpeners(text)) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply:
          'Pentru o programare nouă, scrieți „Meniu” sau „Start”. Pentru anulare, scrieți „Anulare”.',
        buttons: [],
        session,
      };
    }

    case 'idle': {
      const norm = waNormalize(text);

      // "Vreau o programare" button or text
      if (
        text.includes('📅') ||
        norm.includes('vreau o programare') ||
        norm === 'vreau programare' ||
        norm === 'programare noua' ||
        norm === 'programare nou?'
      ) {
        return {
          reply: buildServicePrompt(),
          buttons: serviceQuickReplyLabels(),
          session: { step: 'awaiting_service', data: {} },
        };
      }

      // "Editez / Anulez o programare" button or text
      if (
        text.includes('❌') ||
        text.includes('❌ Anulez') ||
        norm.includes('anulez o programare') ||
        norm.includes('editez o programare') ||
        norm.includes('modific o programare') ||
        norm.includes('anulez programarea') ||
        norm.includes('editez programarea') ||
        norm.includes('modificare') ||
        norm.includes('editare') ||
        norm.includes('schimbare')
      ) {
        return {
          reply: 'Pentru a anula sau modifica o programare, alegeti o optiune:\n\n1. Caută programarea pe numărul acestui telefon\n2. Introdu un alt număr de telefon',
          buttons: ['1. Caută pe acest număr', '2. Alt număr de telefon', '🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_input',
            data: {},
          },
        };
      }

      // "Contactez Recepția" button or text
      if (
        text.includes('📞') ||
        norm.includes('contactez receptia') ||
        norm.includes('contactez receptia') ||
        norm.includes('receptie') ||
        norm.includes('recepție') ||
        norm.includes('suna') ||
        norm.includes('sunati')
      ) {
        return {
          reply: waReceptionReply(),
          buttons: waReceptionButtons(),
          session: { step: 'idle', data: {} },
        };
      }

      // Handle reception button responses
      if (text.includes('📲 Sună recepția') || text.includes('Sună recepția')) {
        return {
          reply: 'Vă rugăm apelați recepția direct.',
          buttons: waReceptionButtons(),
          session: { step: 'idle', data: {} },
        };
      }

      if (text.includes('🔙 Înapoi la meniu') || text.includes('Înapoi la meniu')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Generic opener AFTER specific actions
      if (waMatchesIdleOpeners(text)) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Fallback
      return {
        reply: 'Nu am înțeles. Scrieți "Bună" sau alegeți o opțiune:',
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }

    case 'awaiting_service': {
      const svc = matchServiceFromInput(text);
      if (!svc) {
        return {
          reply: 'Nu am recunoscut serviciul. Alegeți un număr din listă sau numele serviciului.',
          buttons: serviceQuickReplyLabels(),
          session,
        };
      }
      return {
        reply: buildDoctorPrompt(),
        buttons: doctorQuickReplyLabels(),
        session: {
          step: 'awaiting_doctor',
          data: {
            ...session.data,
            service: svc.name,
            serviceId: svc.id,
            durationMinutes: svc.durationMinutes,
          },
        },
      };
    }

    case 'awaiting_doctor': {
      const doc = matchDoctorFromInput(text);
      if (!doc) {
        return {
          reply: 'Nu am recunoscut medicul. Alegeți „Oricare medic” sau un nume din listă.',
          buttons: doctorQuickReplyLabels(),
          session,
        };
      }
      const dayOpts = await nextFiveWorkingDayOptions();
      return {
        reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie”\n• „14.04”\n• „mâine”\n• „luni”`,
        buttons: dayOpts.map((o) => o.label),
        session: {
          step: 'awaiting_date',
          data: {
            ...session.data,
            doctorId: doc.id,
            doctorName: doc.name,
          },
        },
      };
    }

    case 'awaiting_date': {
      // Handle "no slots" suggestion choices (from previous turn)
      const normalized = waNormalize(text);
      if (normalized.startsWith('da') || text.includes('✅ Da')) {
        const suggested = session.data.suggestedIsoDate;
        if (suggested) {
          // Accept suggestion immediately
          const duration = session.data.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
          const doctorKey = session.data.doctorId || 'any';
          let slots = await getAvailableSlotsForDoctor(doctorKey, suggested, duration);
          slots = filterSlotsMinLead(suggested, slots);

          if (slots.length === 0) {
            // Suggestion became unavailable; fall back to date choices
            const dayOpts = await nextFiveWorkingDayOptions();
            return {
              reply:
                'Între timp, disponibilitatea s-a schimbat. Vă rugăm alegeți o altă dată din opțiunile de mai jos.',
              buttons: dayOpts.map((o) => o.label),
              session: {
                step: 'awaiting_date',
                data: { ...session.data, suggestedIsoDate: undefined, suggestedDisplayDate: undefined, suggestedSlotsCount: undefined },
              },
            };
          }

          const display = formatDisplayDateRo(suggested);
          const shown = slots.slice(0, 8);
          const lines = shown.map((s, i) => `${i + 1}. ${s}`);

          return {
            reply: `Orele disponibile pentru ${display}:\n\n${lines.join('\n')}`,
            buttons: [...shown, '📅 Schimbă data aleasă'],
            session: {
              step: 'awaiting_time',
              data: {
                ...session.data,
                date: suggested,
                displayDate: display,
                availableSlots: slots,
                suggestedIsoDate: undefined,
                suggestedDisplayDate: undefined,
                suggestedSlotsCount: undefined,
                dateRetries: 0,
              },
            },
          };
        }
      }

      if (text.includes('📅') || normalized.includes('aleg alt')) {
        const dayOpts = await nextFiveWorkingDayOptions();
        return {
          reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie”\n• „14.04”\n• „mâine”\n• „luni”`,
          buttons: dayOpts.map((o) => o.label),
          session: {
            step: 'awaiting_date',
            data: { ...session.data, suggestedIsoDate: undefined, suggestedDisplayDate: undefined, suggestedSlotsCount: undefined },
          },
        };
      }

      if (text.includes('❌') || normalized.includes('renunt')) {
        return {
          reply: 'Am închis conversația. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      let iso: string | null = null;
      const dayOpts = await nextFiveWorkingDayOptions();
      const hit = dayOpts.find((o) => text.includes(o.label) || o.label === text.trim());
      if (hit) iso = hit.iso;
      else iso = parseFlexibleUserDate(text);

      if (!iso) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        const nextData = { ...session.data, dateRetries: retries };
        if (retries >= 3) {
          return {
            reply:
              'Am avut dificultăți în a înțelege data introdusă.\nVă rugăm alegeți o dată din opțiunile de mai jos sau scrieți în format „14 Aprilie”:',
            buttons: dayOpts.map((o) => o.label),
            session: { ...session, data: { ...nextData, dateRetries: 0 } },
          };
        }
        return {
          reply:
            'Nu am putut interpreta data. Încercați „mâine”, „luni”, „14.04” sau alegeți un buton.',
          buttons: dayOpts.map((o) => o.label),
          session: { ...session, data: nextData },
        };
      }

      const todayStart = dayjs().tz(BUCHAREST_TZ).startOf('day');
      const chosen = dayjs.tz(`${iso}T12:00:00`, BUCHAREST_TZ);
      
      // FORMAT/VALIDITY check first: Is the parsed date a real calendar date?
      if (!chosen.isValid()) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: 'Dată invalidă. Vă rugăm introduceți o dată corectă (ex: 25 aprilie sau 25.04).',
          buttons: dayOpts.map((o) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }
      
      if (chosen.isBefore(todayStart, 'day')) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: 'Data trebuie să fie astăzi sau în viitor. Alegeți altă dată.',
          buttons: dayOpts.map((o) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }
      
      // BOOKING HORIZON check third: Check if date exceeds maximum booking horizon
      const maxAllowedDate = dayjs().tz(BUCHAREST_TZ).add(MAX_BOOKING_HORIZON_MONTHS, 'month');
      if (chosen.isAfter(maxAllowedDate, 'day')) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: `Ne pare rău, programările se pot face cu maximum ${MAX_BOOKING_HORIZON_MONTHS} luni în avans. Vă rugăm alegeți o dată mai apropiată.`,
          buttons: dayOpts.map((o) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }

      const duration = session.data.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
      const doctorKey = session.data.doctorId || 'any';
      let slots = await getAvailableSlotsForDoctor(doctorKey, iso, duration);
      slots = filterSlotsMinLead(iso, slots);

      if (slots.length === 0) {
        // Search next 7 days (skip weekends) and suggest closest available date.
        let foundIso: string | null = null;
        let foundCount = 0;
        for (let add = 1; add <= 7; add++) {
          const candidate = dayjs.tz(`${iso}T12:00:00`, BUCHAREST_TZ).add(add, 'day').format('YYYY-MM-DD');
          if (!isWeekdayBucharest(candidate)) continue;
          let candSlots = await getAvailableSlotsForDoctor(doctorKey, candidate, duration);
          candSlots = filterSlotsMinLead(candidate, candSlots);
          if (candSlots.length > 0) {
            foundIso = candidate;
            foundCount = candSlots.length;
            break;
          }
        }

        if (!foundIso) {
          return {
            reply: `Ne pare rău, nu am găsit disponibilitate în următoarele 7 zile.\nVă rugăm să ne contactați direct la ${CLINIC_CONFIG.clinicPhone}.`,
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }

        const display = formatDisplayDateRo(iso);
        const nextDateLabel = formatQuickDayLabelRo(foundIso);
        return {
          reply: `Ne pare rău, nu există sloturi disponibile pentru ${display}.\n\nCea mai apropiată dată disponibilă este ${nextDateLabel}.\n\nDoriți să continuați?`,
          buttons: [`✅ Da, ${nextDateLabel}`, '📅 Aleg altă dată', '❌ Renunț'],
          session: {
            step: 'awaiting_date',
            data: {
              ...session.data,
              date: undefined,
              displayDate: undefined,
              availableSlots: undefined,
              suggestedIsoDate: foundIso,
              suggestedDisplayDate: nextDateLabel,
              suggestedSlotsCount: foundCount,
              dateRetries: 0,
            },
          },
        };
      }

      const display = formatDisplayDateRo(iso);
      const shown = slots.slice(0, 8);
      const lines = shown.map((s, i) => `${i + 1}. ${s}`);

      return {
        reply: `Orele disponibile pentru ${display}:\n\n${lines.join('\n')}`,
        buttons: [...shown, '📅 Schimbă data aleasă'],
        session: {
          step: 'awaiting_time',
          data: {
            ...session.data,
            date: iso,
            displayDate: display,
            availableSlots: slots,
            dateRetries: 0,
            suggestedIsoDate: undefined,
            suggestedDisplayDate: undefined,
            suggestedSlotsCount: undefined,
          },
        },
      };
    }

    case 'awaiting_time': {
      // ADD THIS BLOCK at the very top of the case, before existing logic:
      if (text === '📅 Schimbă data aleasă' || waNormalize(text).includes('schimba data')) {
        const dayOpts = await nextFiveWorkingDayOptions();
        return {
          reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie"\n• „14.04"\n• „mâine"\n• „luni"`,
          buttons: dayOpts.map((o) => o.label),
          session: {
            step: 'awaiting_date',
            data: { ...session.data, date: undefined, displayDate: undefined, availableSlots: undefined },
          },
        };
      }

      const slots = session.data.availableSlots || [];
      const shown = slots.slice(0, 8);
      const trimmed = text.trim();
      let picked: string | null = null;
      const num = /^\s*(\d+)\s*$/.exec(trimmed);
      if (num) {
        const i = parseInt(num[1], 10);
        if (i >= 1 && i <= shown.length) picked = shown[i - 1];
      }
      if (!picked) {
        const norm = trimmed.replace(/\s/g, '');
        const m = norm.match(/^(\d{1,2}):?(\d{2})?$/);
        if (m) {
          const hh = m[1].padStart(2, '0');
          const mm = (m[2] || '00').padStart(2, '0');
          const cand = `${hh}:${mm}`;
          if (slots.includes(cand)) picked = cand;
        }
      }
      if (!picked) {
        for (const s of slots) {
          if (trimmed === s || trimmed === s.replace(/^0/, '') || waNormalize(trimmed) === waNormalize(s)) {
            picked = s;
            break;
          }
        }
      }

      if (!picked) {
        const display = session.data.displayDate || '';
        const lines = shown.map((s, i) => `${i + 1}. ${s}`);
        return {
          reply: `Nu am recunoscut ora. Alegeți un număr sau ora în format HH:mm.\n\n${lines.join('\n')}`,
          buttons: [...shown, '📅 Schimbă data aleasă'],
          session,
        };
      }

      return {
        reply: 'Introduceți numele și prenumele.',
        buttons: [],
        session: {
          step: 'awaiting_full_name',
          data: { ...session.data, time: picked },
        },
      };
    }

    case 'awaiting_full_name': {
      const v = parseAndValidateFullName(text);
      if (v.ok === false) {
        return {
          reply: v.message,
          buttons: [],
          session,
        };
      }
      
      // Extract phone number from WhatsApp sender
      const phoneNumber = from;
      
      return {
        reply: `Numărul de telefon ${phoneNumber} este corect și poate fi folosit pentru programare?`,
        buttons: ['✅ Da, este corect', '✏️ Nu, introduc alt număr', '❌ Închide'],
        session: {
          step: 'awaiting_phone_confirm',
          data: { ...session.data, firstName: v.firstName, lastName: v.lastName, fullName: `${v.firstName} ${v.lastName}`, phoneNumber },
        },
      };
    }

    case 'awaiting_phone_confirm': {
      if (text.includes('✅ Da, este corect') || text.toLowerCase().includes('da, este corect')) {
        // User confirmed phone number - send SMS verification
        const phoneNumber = session.data.phoneNumber || from;
        const sanitized = sanitizePhone(phoneNumber);
        
        if (!sanitized) {
          return {
            reply: 'Numărul de telefon nu este valid. Vă rugăm încercați din nou.',
            buttons: ['🔙 Înapoi la meniu'],
            session: { step: 'idle', data: {} },
          };
        }

        // Check MAX_ACTIVE_BOOKINGS limit immediately after phone normalization
        const activeBookingsCount = await countActiveBookings(sanitized);
        const MAX_BOOKINGS = BUSINESS_CONFIG.maxActiveBookingsPerPhone;
        
        const isTestPhone = TEST_PHONE_NORMALIZED && sanitizePhone(phoneNumber) === TEST_PHONE_NORMALIZED;
        if (!isTestPhone && activeBookingsCount >= MAX_BOOKINGS) {
          return {
            reply: `Numărul ${phoneNumber} are deja ${activeBookingsCount} programări active, numărul maxim permis. Vă rugăm să anulați o programare existentă înainte de a face una nouă.`,
            buttons: ['🔙 Înapoi la meniu'],
            session: { step: 'idle', data: {} },
          };
        }

        // Generate and send SMS verification code
        const code = Math.floor(1000 + Math.random() * 9000).toString();
        const expiresAt = dayjs().add(10, 'minute').toISOString();
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // Check if SMS provider is configured
        const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];
        
      if (!smsConfigured) {
        console.log(`[SMS SIMULATION] Phone: ${sanitized}, Code: ${code}`);
        return {
          reply: `Am trimis un SMS cu codul de verificare la numărul ${phoneNumber}. (Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_booking_phone_verification_code',
            data: {
              ...session.data,
              verificationCode: code,
              verificationExpires: expiresAt,
              verifiedPhone: sanitized,
              phoneNumber: phoneNumber,
            },
          },
        };
      }
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_booking_phone_verification_code',
            data: { 
              ...session.data,
              verificationCode: code,
              verificationExpires: expiresAt,
              verifiedPhone: sanitized,
            },
          },
        };
      }
      
      if (text.includes('✏️ Nu, introduc alt număr') || text.toLowerCase().includes('nu, introduc alt număr')) {
        return {
          reply: 'Introduceți numărul de telefon pe care doriți să îl folosim pentru programare.',
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_manual_phone_input',
            data: session.data,
          },
        };
      }
      
      if (text.includes('❌ Închide') || text.toLowerCase().includes('închide')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      return {
        reply: 'Vă rugăm alegeți una dintre opțiunile disponibile.',
        buttons: ['✅ Da, este corect', '✏️ Nu, introduc alt număr', '❌ Închide'],
        session,
      };
    }

    case 'awaiting_manual_phone_input': {
      const phoneInput = text.trim();
      const sanitized = sanitizePhone(phoneInput);
      
      if (!sanitized) {
        return {
          reply: 'Numărul de telefon nu este valid. Vă rugăm introduceți un număr corect (ex: 07xxxxxxxxx).',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }
      
      // Generate and send SMS verification code
      const code = Math.floor(1000 + Math.random() * 9000).toString();
      const expiresAt = dayjs().add(10, 'minute').toISOString();
      
      // Store verification code temporarily
      otpSessions.set(sanitized, code);
      
      // Check if SMS provider is configured
      const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];
      
    if (!smsConfigured) {
      console.log(`[SMS SIMULATION] Phone: ${sanitized}, Code: ${code}`);
      return {
        reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_booking_phone_verification_code',
          data: {
            ...session.data,
            verificationCode: code,
            verificationExpires: expiresAt,
            verifiedPhone: sanitized,
            phoneNumber: phoneInput,
          },
        },
      };
    }
      
      // In production, this would send actual SMS
      console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
      
      return {
        reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_booking_phone_verification_code',
          data: { 
            ...session.data,
            verificationCode: code,
            verificationExpires: expiresAt,
            verifiedPhone: sanitized,
            phoneNumber: phoneInput,
          },
        },
      };
    }

    case 'awaiting_booking_phone_verification_code': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. Vă rugăm încercați din nou.',
          buttons: ['🔙 Înapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: 'Cod incorect. Vă rugăm introduceți codul primit prin SMS.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      // Code verified - proceed to booking summary
      const summary = `✅ Rezumat programare:\n\n👤 Nume: ${session.data.fullName}\n📱 Telefon: ${session.data.phoneNumber || session.data.verifiedPhone}\n📅 Data: ${session.data.displayDate}\n⏰ Ora: ${session.data.time}\n🦷 Serviciu: ${session.data.service}\n👨‍⚕️ Medic: ${session.data.doctorName}`;
      
      return {
        reply: `${summary}\n\nConfirmați programarea?`,
        buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
        session: {
          step: 'confirming',
          data: { ...session.data, phone: session.data.phoneNumber || session.data.verifiedPhone },
        },
      };
    }

    case 'confirming': {
      if (waMatchesModify(text)) {
        return {
          reply: buildServicePrompt(),
          buttons: serviceQuickReplyLabels(),
          session: {
            step: 'awaiting_service',
            data: {},
          },
        };
      }
      if (waMatchesDeny(text)) {
        return {
          reply: 'Am anulat rezervarea. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      if (!waMatchesConfirm(text)) {
        return {
          reply: 'Vă rugăm alegeți „Confirm”, „Anulez” sau „Modific”.',
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }

      const d = session.data.date;
      const tm = session.data.time;
      const svc = session.data.service;
      const docId = session.data.doctorId || 'any';
      if (!d || !tm || !svc || !session.data.firstName || !session.data.lastName) {
        return {
          reply: 'Date incomplete. Reîncepeți cu „Modific” sau „Meniu”.',
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }

      try {
        const result = await processBooking({
          phone: session.data.phone || session.data.phoneNumber || from,
          date: d,
          time: tm,
          service: svc,
          firstName: session.data.firstName,
          lastName: session.data.lastName,
          doctorId: docId,
          channel: 'WhatsApp',
        });

        const innerSummary = `👤 ${session.data.firstName} ${session.data.lastName}\n📅 ${session.data.displayDate}\n⏰ ${tm}\n🦷 ${svc}\n👨‍⚕️ ${result.doctorName}`;

        // Ask for email AFTER confirmation
        if (!session.data.email) {
          return {
            reply: `🎉 Programarea a fost confirmată!\n\n${innerSummary}\n📍 ${BUSINESS_CONFIG.location}\n\nDoriți să primiți confirmarea pe email? Dacă introduceți adresa de email, vă vom trimite confirmarea programării, adresa clinicii și un eveniment în calendar.`,
            buttons: ['Introdu email', 'Sari peste'],
            session: { step: 'awaiting_email', data: { ...session.data } },
          };
        }

        // Send email if already provided
        if (session.data.email) {
          const icsAttachment = generateICSAttachment({
            id: `wa-${session.data.phone}-${d}-${tm}`,
            date: d,
            time: tm,
            service: svc,
            doctorName: result.doctorName,
            firstName: session.data.firstName || '',
            lastName: session.data.lastName || ''
          });

          const mailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <p>Bună ziua, <strong>${session.data.firstName} ${session.data.lastName}</strong>,</p>
              <p>Programarea dumneavoastră la <strong>${BUSINESS_CONFIG.name}</strong> a fost confirmată.</p>
              <p><strong>Dată:</strong> ${d}<br/><strong>Ora:</strong> ${tm}<br/><strong>Serviciu:</strong> ${svc}<br/><strong>Medic:</strong> ${result.doctorName}</p>
              <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
              <div style="margin: 20px 0;">
                <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
              </div>
            </div>`;
          await sendEmail(session.data.email, `Confirmare programare — ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
        }

        return {
          reply: `🎉 Programarea a fost confirmată!\n\n${innerSummary}\n📍 ${BUSINESS_CONFIG.location}\n\nVă așteptăm! Dacă doriți să modificați sau să anulați programarea, răspundeți cu 'modificare' sau 'anulare' oricând.`,
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Eroare la rezervare.';
        if (msg.includes('limita') || msg.includes('maxim') || msg.includes('MAX_BOOKINGS')) {
          return {
            reply: `⚠️ Aveți deja ${BUSINESS_CONFIG.maxActiveBookingsPerPhone} programări active.\n\nPentru a face o programare nouă, anulați una existentă sau contactați recepția la ${CLINIC_CONFIG.clinicPhone}.`,
            buttons: ['❌ Anulez o programare', '📞 Contactează recepția', '🏠 Meniu principal'],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply:
            msg.startsWith('⚠️') || msg.startsWith('Ne pare')
              ? msg
              : `Ne pare rău, nu am putut finaliza programarea: ${msg}`,
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }
    }

    case 'awaiting_email': {
      // User tapped "Introdu email" or typed an email
      if (waMatchesSkipEmail(text) || text === 'Sari peste') {
        return {
          reply: 'În regulă! Vă așteptăm la clinică. Dacă doriți să modificați sau să anulați programarea, răspundeți cu \'modificare\' sau \'anulare\' oricând.',
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      }

      // User tapped "Introdu email" button — ask for the actual email address
      if (text === 'Introdu email') {
        return {
          reply: 'Introduceți adresa de email:',
          buttons: ['Sari peste'],
          session: { step: 'awaiting_email', data: { ...session.data } },
        };
      }

      // User typed an actual email address
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(text.trim())) {
        const email = text.trim();
        // Send confirmation email
        try {
          const d = session.data.date;
          const tm = session.data.time;
          const svc = session.data.service;
          const doctorName = session.data.doctorName || 'Medicul dumneavoastră';
          
          const icsAttachment = generateICSAttachment({
            id: `wa-${session.data.phone}-${d}-${tm}`,
            date: d,
            time: tm,
            service: svc,
            doctorName: doctorName,
            firstName: session.data.firstName || '',
            lastName: session.data.lastName || ''
          });

          const mailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <p>Bună ziua, <strong>${session.data.firstName} ${session.data.lastName}</strong>,</p>
              <p>Programarea dumneavoastră la <strong>${BUSINESS_CONFIG.name}</strong> a fost confirmată.</p>
              <p><strong>Dată:</strong> ${d}<br/><strong>Ora:</strong> ${tm}<br/><strong>Serviciu:</strong> ${svc}<br/><strong>Medic:</strong> ${doctorName}</p>
              <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
              <div style="margin: 20px 0;">
                <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
              </div>
            </div>`;
          await sendEmail(email, `Confirmare programare — ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
          return {
            reply: `✅ Am trimis confirmarea la ${email}. Vă așteptăm la clinică!`,
            buttons: [],
            session: { step: 'confirmed', data: {} },
          };
        } catch {
          return {
            reply: 'Nu am putut trimite emailul. Vă așteptăm la clinică!',
            buttons: [],
            session: { step: 'confirmed', data: {} },
          };
        }
      }

      // Invalid input
      return {
        reply: 'Introduceți o adresă de email validă (ex: nume@exemplu.ro) sau apăsați „Sari peste".',
        buttons: ['Sari peste'],
        session,
      };
    }

    default:
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
  }
};

// ==========================================
// FACEBOOK MESSENGER STATE MACHINE
// ==========================================

const runFacebookStateMachine = async (from: string, text: string, session: ChatSession): Promise<{ reply: string; buttons: string[]; session: ChatSession }> => {
  const applyGlobalInterrupts = async (): Promise<{ reply: string; buttons: string[]; session: ChatSession } | null> => {
    if (waMatchesMenuReset(text)) {
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }
    if (waMatchesOperator(text)) {
      return {
        reply: waReceptionReply(),
        buttons: [],
        session: { step: 'idle', data: {} },
      };
    }
    if (waMatchesGlobalCancel(text)) {
      const apt = await findActiveAppointmentForPhone(from);
      if (!apt) {
        return {
          reply: 'Nu am găsit o programare activă asociată acestui număr. Dacă aveți nevoie de ajutor, contactați recepția.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: `Am găsit programarea:\n📅 ${formatDisplayDateRo(apt.date)} la ${apt.time}\n🦷 ${apt.service}\n👨‍⚕️ ${apt.doctor_name || 'Medic'}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: {
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };
    }
    return null;
  };

  const globalResult = await applyGlobalInterrupts();
  if (globalResult) return globalResult;

  const n = fbNormalize(text);

  switch (session.step) {
    case 'idle':
      if (fbNormalize(text).includes('programare') || fbNormalize(text).includes('vreau') || fbNormalize(text).includes('rezervare')) {
        return {
          reply: 'Ce serviciu doriți?\n\nExemple: "curățare", "extracție", "consultatie", "detartraj"',
          buttons: [...serviceQuickReplyLabels],
          session: { step: 'awaiting_service', data: {} },
        };
      }
      if (waMatchesModify(text)) {
        return {
          reply: 'Pentru a modifica sau anula o programare, vă rog să introduceți numărul de telefon asociat programării:',
          buttons: [],
          session: { step: 'awaiting_lookup_phone', data: {} },
        };
      }
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };

    case 'awaiting_service':
      const svcMatch = matchServiceFromInput(text);
      if (svcMatch) {
        return {
          reply: `Ați ales: ${svcMatch.name}\n\nLa ce medic doriți să programați?`,
          buttons: [...doctorQuickReplyLabels],
          session: {
            step: 'awaiting_doctor',
            data: { ...session.data, service: svcMatch.name },
          },
        };
      }
      return {
        reply: 'Nu am recunoscut serviciul. Vă rog să alegeți din lista:',
        buttons: [...serviceQuickReplyLabels],
        session,
      };

    case 'awaiting_doctor':
      const doctorMatch = matchDoctorFromInput(text);
      if (doctorMatch) {
        const dateOptions = nextFiveWorkingDayOptions();
        return {
          reply: `Perfect. Ați ales medicul ${doctorMatch.name}.\n\nCe zi doriți?`,
          buttons: dateOptions,
          session: {
            step: 'awaiting_date',
            data: { ...session.data, doctorId: doctorMatch.id, doctorName: doctorMatch.name },
          },
        };
      }
      return {
        reply: 'Nu am recunoscut medicul. Vă rog să alegeți din lista:',
        buttons: [...doctorQuickReplyLabels],
        session,
      };

    case 'awaiting_date':
      const parsed = parseFlexibleUserDate(text);
      if (!parsed) {
        return {
          reply: 'Nu am înțeles data. Vă rog să introduceți o dată validă (ex: "azi", "mâine", "20 aprilie") sau să alegeți din opțiunile:',
          buttons: nextFiveWorkingDayOptions(),
          session,
        };
      }
      const dayOfWeek = parsed.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return {
          reply: 'Clinica nu lucrează în weekend. Vă rog să alegeți o zi lucrătoare:',
          buttons: nextFiveWorkingDayOptions(),
          session,
        };
      }
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (parsed < today) {
        return {
          reply: 'Nu puteți programa în trecut. Vă rog să alegeți o dată viitoare:',
          buttons: nextFiveWorkingDayOptions(),
          session,
        };
      }
      const dateStr = formatYMD(parsed);
      const doctorId = session.data.doctorId || 'any';
      const slots = await getAvailableSlots(dateStr, doctorId, session.data.service || 'consultatie');
      const filtered = filterSlotsMinLead(slots);
      if (filtered.length === 0) {
        return {
          reply: 'Nu sunt disponibile ore libere în această zi. Vă rog să alegeți altă dată:',
          buttons: nextFiveWorkingDayOptions(),
          session,
        };
      }
      return {
        reply: `Pentru ${formatDisplayDateRo(dateStr)} aveți următoarele ore disponibile:`,
        buttons: filtered,
        session: {
          step: 'awaiting_time',
          data: { ...session.data, date: dateStr, availableSlots: filtered },
        },
      };

    case 'awaiting_time':
      if (!session.data.availableSlots || !session.data.availableSlots.includes(text)) {
        return {
          reply: 'Ora selectată nu este disponibilă. Vă rog să alegeți din lista:',
          buttons: session.data.availableSlots || [],
          session,
        };
      }
      return {
        reply: 'Cum vă numiți?',
        buttons: [],
        session: {
          step: 'awaiting_full_name',
          data: { ...session.data, time: text },
        },
      };

    case 'awaiting_full_name':
      const nameResult = parseAndValidateFullName(text);
      if (!nameResult.valid) {
        return {
          reply: nameResult.error || 'Numele nu este valid. Vă rog să introduceți numele complet (prenume și nume):',
          buttons: [],
          session,
        };
      }
      return {
        reply: `Vă programăm cu numărul de Facebook ${from}? (Da / alt număr)`,
        buttons: ['Da', 'Alt număr'],
        session: {
          step: 'awaiting_phone_confirm',
          data: { ...session.data, firstName: nameResult.firstName, lastName: nameResult.lastName },
        },
      };

    case 'awaiting_phone_confirm':
      if (n.includes('da')) {
        const activeCount = await countActiveBookings(from);
        if (activeCount >= MAX_ACTIVE_BOOKINGS) {
          return {
            reply: `Ați atins limita maximă de ${MAX_ACTIVE_BOOKINGS} programări active. Pentru a programa o nouă consultație, vă rog să anulați una dintre programările existente.`,
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: 'Vă rog să introduceți adresa de email pentru confirmare (sau "Sari peste"):',
          buttons: ['Sari peste'],
          session: {
            step: 'awaiting_email',
            data: { ...session.data, phone: from },
          },
        };
      }
      return {
        reply: 'Vă rog să introduceți numărul de telefon:',
        buttons: [],
        session: { step: 'awaiting_booking_phone_verification_code', data: { ...session.data } },
      };

    case 'awaiting_booking_phone_verification_code':
      const phone = sanitizePhone(text);
      if (!phone || phone.length < 9) {
        return {
          reply: 'Numărul de telefon nu este valid. Vă rog să introduceți un număr românesc valid (ex: 07xxxxxxxx):',
          buttons: [],
          session,
        };
      }
      const activeCountPhone = await countActiveBookings(phone);
      if (activeCountPhone >= MAX_ACTIVE_BOOKINGS) {
        return {
          reply: `Ați atins limita maximă de ${MAX_ACTIVE_BOOKINGS} programări active. Pentru a programa o nouă consultație, vă rog să anulați una dintre programările existente.`,
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: 'Vă rog să introduceți adresa de email pentru confirmare (sau "Sari peste"):',
        buttons: ['Sari peste'],
        session: {
          step: 'awaiting_email',
          data: { ...session.data, phone },
        },
      };

    case 'awaiting_email':
      if (waMatchesSkipEmail(text)) {
        const bookingResult = await processBooking({
          clinicId: CLINIC_CONFIG.id,
          firstName: session.data.firstName || '',
          lastName: session.data.lastName || '',
          phone: session.data.phone || from,
          email: null,
          service: session.data.service || 'consultatie',
          doctorId: session.data.doctorId || 'any',
          date: session.data.date || '',
          time: session.data.time || '',
          channel: 'facebook',
        });
        if (!bookingResult.success) {
          return {
            reply: bookingResult.error || 'A apărut o eroare. Vă rog să încercați din nou.',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: `✅ Programare confirmată!\n\n📅 ${session.data.date} la ${session.data.time}\n🦷 ${session.data.service}\n👨‍⚕️ ${session.data.doctorName || 'Medic asignat'}\n📱 ${session.data.phone || from}\n\nVă așteptăm la clinică!`,
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      }
      const emailValidation = validateEmail(text);
      if (!emailValidation.valid) {
        return {
          reply: 'Adresa de email nu este validă. Vă rog să introduceți o adresă corectă (ex: nume@exemplu.ro) sau să apăsați "Sari peste":',
          buttons: ['Sari peste'],
          session,
        };
      }
      const bookingResultWithEmail = await processBooking({
        clinicId: CLINIC_CONFIG.id,
        firstName: session.data.firstName || '',
        lastName: session.data.lastName || '',
        phone: session.data.phone || from,
        email: text,
        service: session.data.service || 'consultatie',
        doctorId: session.data.doctorId || 'any',
        date: session.data.date || '',
        time: session.data.time || '',
        channel: 'facebook',
      });
      if (!bookingResultWithEmail.success) {
        return {
          reply: bookingResultWithEmail.error || 'A apărut o eroare. Vă rog să încercați din nou.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      try {
        const d = session.data.date || '';
        const tm = session.data.time || '';
        const svc = session.data.service || 'consultatie';
        const doctorName = session.data.doctorName || 'Medic asignat';
        const email = text;

        const icsAttachment = generateICSAttachment({
          id: `fb-${session.data.phone}-${d}-${tm}`,
          date: d,
          time: tm,
          service: svc,
          doctorName: doctorName,
          firstName: session.data.firstName || '',
          lastName: session.data.lastName || ''
        });

        const mailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <p>Bună ziua, <strong>${session.data.firstName} ${session.data.lastName}</strong>,</p>
            <p>Programarea dumneavoastră la <strong>${BUSINESS_CONFIG.name}</strong> a fost confirmată.</p>
            <p><strong>Dată:</strong> ${d}<br/><strong>Ora:</strong> ${tm}<br/><strong>Serviciu:</strong> ${svc}<br/><strong>Medic:</strong> ${doctorName}</p>
            <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
            <div style="margin: 20px 0;">
              <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
            </div>
          </div>`;
        await sendEmail(email, `Confirmare programare — ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
        return {
          reply: `✅ Am trimis confirmarea la ${email}. Vă așteptăm la clinică!`,
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      } catch {
        return {
          reply: 'Nu am putut trimite emailul. Vă așteptăm la clinică!',
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      }

    case 'confirming':
      if (n.includes('da') || text.includes('✅')) {
        const bookingResult = await processBooking({
          clinicId: CLINIC_CONFIG.id,
          firstName: session.data.firstName || '',
          lastName: session.data.lastName || '',
          phone: session.data.phone || from,
          email: session.data.email || null,
          service: session.data.service || 'consultatie',
          doctorId: session.data.doctorId || 'any',
          date: session.data.date || '',
          time: session.data.time || '',
          channel: 'facebook',
        });
        if (!bookingResult.success) {
          return {
            reply: bookingResult.error || 'A apărut o eroare. Vă rog să încercați din nou.',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: `✅ Programare confirmată!\n\n📅 ${session.data.date} la ${session.data.time}\n🦷 ${session.data.service}\n👨‍⚕️ ${session.data.doctorName || 'Medic asignat'}\n📱 ${session.data.phone || from}\n\nVă așteptăm la clinică!`,
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      }
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };

    case 'confirmed':
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };

    case 'awaiting_cancel_confirm':
      if (waMatchesYesCancel(text)) {
        const deleted = await deleteAppointmentByPhoneDateTime(
          session.data.phone || from,
          session.data.cancelDate,
          session.data.cancelTime
        );
        if (deleted) {
          return {
            reply: '✅ Programarea a fost anulată cu succes. Vă mulțumim!',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: 'Nu am putut anula programarea. Vă rog să contactați recepția.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      if (waMatchesNoCancel(text)) {
        return {
          reply: 'Păstrăm programarea. Mai puteți folosi butonul "Meniu" oricând.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: 'Confirmați anularea? (Da / Nu)',
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session,
      };

    case 'awaiting_lookup_phone':
      const lookupPhone = sanitizePhone(text);
      if (!lookupPhone || lookupPhone.length < 9) {
        return {
          reply: 'Numărul de telefon nu este valid. Vă rog să introduceți un număr românesc valid:',
          buttons: [],
          session,
        };
      }
      const apt = await findActiveAppointmentForPhone(lookupPhone);
      if (!apt) {
        return {
          reply: 'Nu am găsit nicio programare activă pentru acest număr de telefon.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: `Am găsit programarea:\n📅 ${formatDisplayDateRo(apt.date)} la ${apt.time}\n🦷 ${apt.service}\n👨‍⚕️ ${apt.doctor_name || 'Medic'}\n\nCe doriți să faceți?`,
        buttons: ['✅ Anulează programarea', 'Înapoi la meniu'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: {
            phone: lookupPhone,
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };

    default:
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
  }
};

// Meta WhatsApp webhook verification (challenge)
app.get('/api/webhook/whatsapp', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const verify =
      process.env['WHATSAPP_VERIFY_TOKEN'] || process.env['META_WEBHOOK_VERIFY_TOKEN'] || '';

    if (mode === 'subscribe' && verify && token === verify && typeof challenge === 'string') {
      res.status(200).send(challenge);
      return;
    }
    if (mode === 'subscribe') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.status(200).json({
      ok: true,
      message: 'WhatsApp webhook: folosiți GET cu hub.mode=subscribe pentru verificarea Meta.',
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

app.post("/api/webhook/whatsapp", protectRoute, async (req, res) => {
  try {
    const { from, text, reset } = req.body as { from?: string; text?: string; reset?: boolean };
    if (!from || typeof from !== 'string') {
      return res.status(400).json({ error: 'From is required.' });
    }

    if (reset === true) {
      await getSupabase()
        .from('chat_sessions')
        .delete()
        .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
        .eq('phone_number', from);

      return res.json({
        success: true,
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: 'idle',
        sessionActive: false,
      });
    }

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required.' });
    }

    const lowerText = text.toLowerCase();
    const requiresIntervention =
      lowerText.includes('operator') ||
      lowerText.includes('om') ||
      lowerText.includes('ajutor') ||
      lowerText.includes('recep');

    await getSupabase().from('live_traffic').insert([
      {
        clinic_id: CLINIC_INTEGRATION.clinicId,
        from_number: from,
        channel: 'WhatsApp',
        text,
        requires_intervention: requiresIntervention,
      },
    ]);
    
    const { data: sessionData } = await getSupabase()
      .from('chat_sessions')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('phone_number', from)
      .maybeSingle();

    let session: ChatSession = sessionData
      ? {
          step: coerceChatSessionStep(sessionData.step),
          data: (sessionData.data || {}) as ChatSession['data'],
        }
      : { step: 'idle', data: {} };

    // Session timeout guard (inactivity)
    let timeoutPrefix = '';
    const SESSION_TIMEOUT_MIN = parseInt(process.env['WA_SESSION_TIMEOUT_MIN'] || '30', 10);
    const updatedAt = sessionData?.updated_at ? dayjs(sessionData.updated_at) : null;
    const isTimedOut = updatedAt ? dayjs().diff(updatedAt, 'minute') > SESSION_TIMEOUT_MIN : false;

    if (isTimedOut && session.step !== 'idle' && session.step !== 'confirmed') {
      session = { step: 'idle', data: {} };
      timeoutPrefix = `Sesiunea anterioară a expirat (${SESSION_TIMEOUT_MIN} min de inactivitate).\n\n`;
    }

    const stateMachineResult = await runWhatsappStateMachine(from, text, session);
    const { reply, buttons, session: nextSession } = stateMachineResult;
    const { interactive } = stateMachineResult;
    const replyOut = timeoutPrefix ? `${timeoutPrefix}${reply}` : reply;

    await getSupabase().from('chat_sessions').upsert(
      {
        clinic_id: CLINIC_INTEGRATION.clinicId,
        phone_number: from,
        step: nextSession.step,
        data: nextSession.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,phone_number' }
    );

    const sessionActive = !['idle', 'confirmed'].includes(nextSession.step);

    const response: any = {
      success: true,
      reply: replyOut,
      buttons,
      session: nextSession.step,
      sessionActive,
    };
    
    // Include interactive message if present
    if (interactive) {
      response.interactive = interactive;
    }
    
    return res.json(response);
  } catch (err: unknown) {
    console.error('whatsapp webhook:', err);
    return res.status(500).json({
      error: 'A apărut o eroare. Încercați din nou în câteva momente.',
    });
  }
});

// ==========================================
// FACEBOOK MESSENGER WEBHOOK
// ==========================================

// GET /api/webhook/facebook — Webhook verification (required by Facebook)
app.get('/api/webhook/facebook', (req, res) => {
  const VERIFY_TOKEN = process.env['FACEBOOK_VERIFY_TOKEN'] || 'dentalvoice-fb-verify-2026';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Facebook Webhook] Verified successfully');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Verification failed' });
});

// POST /api/webhook/facebook — Receive messages from Facebook
app.post('/api/webhook/facebook', async (req, res) => {
  // Immediately respond 200 to Facebook (required within 20 seconds)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (body.object !== 'page') return;

    for (const entry of body.entry || []) {
      for (const event of entry.messaging || []) {
        if (!event.message || event.message.is_echo) continue;

        const senderId = event.sender?.id;
        const messageText = event.message?.text || event.message?.quick_reply?.payload || '';

        if (!senderId || !messageText) continue;

        console.log(`[Facebook] From: ${senderId} | Message: ${messageText}`);

        // Load session from Supabase (channel='facebook' to isolate from WhatsApp)
        const supabase = getSupabase();
        let session: ChatSession = { step: 'idle', data: {} };

        const { data: sessionRow } = await supabase
          .from('chat_sessions')
          .select('step, data')
          .eq('user_id', senderId)
          .eq('channel', 'facebook')
          .single();

        if (sessionRow) {
          session = {
            step: coerceChatSessionStep(sessionRow.step),
            data: sessionRow.data || {},
          };
        }

        // Run Facebook state machine
        const result = await runFacebookStateMachine(senderId, messageText, session);

        // Persist updated session
        await supabase
          .from('chat_sessions')
          .upsert(
            {
              user_id: senderId,
              channel: 'facebook',
              step: result.session.step,
              data: result.session.data,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,channel' }
          );

        // Send reply via Facebook Graph API
        if (result.buttons.length > 0) {
          await sendFacebookQuickReplies(senderId, result.reply, result.buttons);
        } else {
          await sendFacebookMessage(senderId, result.reply);
        }
      }
    }
  } catch (e: any) {
    console.error('[POST /api/webhook/facebook] Error:', e.message);
  }
});

// POST /api/messenger/simulate — Synchronous simulation for MessengerTest.tsx UI
app.post('/api/messenger/simulate', async (req, res) => {
  try {
    const { senderId = 'sim-user-fb-001', text } = req.body;
    if (!text) return res.status(400).json({ error: 'text required' });

    const supabase = getSupabase();
    let session: ChatSession = { step: 'idle', data: {} };

    const { data: sessionRow } = await supabase
      .from('chat_sessions')
      .select('step, data')
      .eq('user_id', senderId)
      .eq('channel', 'facebook')
      .single();

    if (sessionRow) {
      session = {
        step: coerceChatSessionStep(sessionRow.step),
        data: sessionRow.data || {},
      };
    }

    const result = await runFacebookStateMachine(senderId, text, session);

    await supabase
      .from('chat_sessions')
      .upsert(
        {
          user_id: senderId,
          channel: 'facebook',
          step: result.session.step,
          data: result.session.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,channel' }
      );

    return res.json({ reply: result.reply, buttons: result.buttons });
  } catch (e: any) {
    console.error('[POST /api/messenger/simulate]', e.message);
    return res.status(500).json({ error: 'Eroare internă' });
  }
});

app.post("/api/send-otp", (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Phone required." });
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    otpSessions.set(phone, code);
    console.log(`[OTP] ${phone}: ${code}`);
    res.json({ success: true, code });
  } catch (err: any) {
    res.status(500).json({ error: "Server Error", details: err.message });
  }
});

app.post("/api/bookings", protectRoute, async (req, res) => {
  const booking = req.body;
  try {
    if (booking.verificationCode) {
      const savedCode = otpSessions.get(booking.phone);
      if (!savedCode || savedCode !== booking.verificationCode) return res.status(401).json({ error: "Invalid OTP." });
      otpSessions.delete(booking.phone);
    }
    
    const result = await processBooking(booking);

    // Send SMS confirmation for manual bookings (channel === 'manual')
    if (booking.channel === 'manual') {
      const sanitizedPhone = sanitizePhone(booking.phone);
      const smsMessage = `🦷 Programare confirmata la ${BUSINESS_CONFIG.name}!\n\n` +
        `📅 Data: ${booking.date}\n` +
        `⏰ Ora: ${booking.time}\n` +
        `🦷 Serviciu: ${booking.service}\n` +
        `👨‍⚕️ Doctor: ${result.doctorName}\n` +
        `📍 Adresa: ${BUSINESS_CONFIG.location}\n\n` +
        `Va asteptam la clinica!`;
      
      await sendSMS(sanitizedPhone, smsMessage);
      
      // Send email if provided and sendEmail flag is true
      if (booking.email && booking.sendEmail) {
        const icsAttachment = generateICSAttachment({
          id: `manual-${booking.phone}-${booking.date}-${booking.time}`,
          date: booking.date,
          time: booking.time,
          service: booking.service,
          doctorName: result.doctorName,
          firstName: booking.firstName,
          lastName: booking.lastName
        });

        const mailHtml = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background-color: #2563eb; padding: 24px; text-align: center; color: white;">
              <h1 style="margin: 0; font-size: 24px;">Confirmare Programare</h1>
            </div>
            <div style="padding: 24px; color: #1e293b;">
              <p>Buna ziua, <strong>${booking.firstName} ${booking.lastName}</strong>,</p>
              <p>Va confirmam programarea la clinica <strong>${BUSINESS_CONFIG.name}</strong>:</p>
              <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
                <p><strong>Data:</strong> ${booking.date}</p>
                <p><strong>Ora:</strong> ${booking.time}</p>
                <p><strong>Serviciu:</strong> ${booking.service}</p>
                <p><strong>Medic:</strong> ${result.doctorName}</p>
              </div>
              <p><strong>Locatie:</strong> ${BUSINESS_CONFIG.location}</p>
              <div style="margin: 20px 0;">
                <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
                ${BUSINESS_CONFIG.wazeLink ? `<a href="${BUSINESS_CONFIG.wazeLink}" style="background-color: #33ccff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-left: 10px;">Waze</a>` : ''}
              </div>
            </div>
          </div>
        `;

        await sendEmail(booking.email, `Confirmare Programare - ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
      }
    }

    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/clinic/appointments", protectRoute, async (req, res) => {
  try {
    const { data, error } = await getSupabase().from('appointments').select('*').eq('clinic_id', CLINIC_INTEGRATION.clinicId).order('date', { ascending: true });
    if (error) throw error;
    res.json(data.map((a: any) => ({
      id: a.id,
      firstName: a.first_name,
      lastName: a.last_name,
      phone: a.phone,
      email: a.email,
      service: a.service,
      doctorName: a.doctor_name,
      date: a.date,
      time: a.time,
      status: a.status
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/send-confirmation", async (req, res) => {
  try {
    const { email, booking } = req.body;
    const user = process.env['SMTP_USER'];
    const pass = process.env['SMTP_PASS'];
    
    if (!user || !pass) {
      console.error("❌ SMTP Credentials missing in environment.");
      return res.status(500).json({ error: "SMTP configuration missing on server." });
    }

    const transporter = nodemailer.createTransport({
      host: TECH_CONFIG.email.host,
      port: TECH_CONFIG.email.port,
      secure: TECH_CONFIG.email.secure,
      auth: { user, pass },
    });

    const icsAttachment = generateICSAttachment({
      id: booking.id || 'manual-booking',
      date: booking.date,
      time: booking.time,
      service: booking.service,
      doctorName: booking.doctorName,
      firstName: booking.firstName,
      lastName: booking.lastName
    });

    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
        <div style="background-color: #2563eb; padding: 24px; text-align: center; color: white;">
          <h1 style="margin: 0; font-size: 24px;">Confirmare Programare</h1>
        </div>
        <div style="padding: 24px; color: #1e293b;">
          <p>Bună ziua, <strong>${booking.firstName} ${booking.lastName}</strong>,</p>
          <p>Vă confirmăm programarea la clinica <strong>${BUSINESS_CONFIG.name}</strong>:</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p><strong>📅 Dată:</strong> ${booking.date}</p>
            <p><strong>⏰ Oră:</strong> ${booking.time}</p>
            <p><strong>🦷 Serviciu:</strong> ${booking.service}</p>
            <p><strong>👨‍⚕️ Medic:</strong> ${booking.doctorName}</p>
          </div>
          <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
          <div style="margin: 20px 0;">
            <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
            ${BUSINESS_CONFIG.wazeLink ? `<a href="${BUSINESS_CONFIG.wazeLink}" style="background-color: #33ccff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-left: 10px;">Waze</a>` : ''}
          </div>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: `"${BUSINESS_CONFIG.name}" <${user}>`,
      to: email,
      subject: `Confirmare Programare - ${BUSINESS_CONFIG.name}`,
      html: mailHtml,
      attachments: [icsAttachment]
    });
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Eroare Email Confirmation:', error.message);
    res.status(500).json({ error: "Eroare la trimiterea email-ului.", details: error.message });
  }
});

// --- ARCHIVING LOGIC (Placeholder for Cron) ---
/**
 * archiveDailyBookings
 * Moves past bookings from Supabase to 'History' table.
 * This should be triggered by a Cron Job (e.g., every night at 00:00).
 */
const archiveDailyBookings = async () => {
  console.log('--- Starting Daily Archiving ---');
  try {
    const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const supabase = getSupabase();

    // Archive confirmed appointments from yesterday
    const { data: toArchive, error: fetchError } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .eq('status', 'Confirmed')
      .lte('date', yesterday);

    if (fetchError) throw fetchError;
    if (!toArchive || toArchive.length === 0) {
      console.log('No appointments to archive');
      return;
    }

    // Move to history table
    const historyData = toArchive.map(apt => ({
      clinic_id: apt.clinic_id,
      doctor_id: apt.doctor_id,
      event_id: apt.google_event_id, // Keep for backward compatibility
      summary: `${apt.first_name} ${apt.last_name} — ${apt.service}`,
      description: JSON.stringify(apt),
      start_time: `${apt.date}T${apt.time}:00`,
      end_time: dayjs.tz(`${apt.date}T${apt.time}:00`, BUCHAREST_TZ).add(30, 'minute').toISOString(),
      archived_at: new Date().toISOString()
    }));

    const { error: insertError } = await supabase.from('appointment_history').insert(historyData);
    if (insertError) throw insertError;

    // Delete from appointments
    const { error: deleteError } = await supabase
      .from('appointments')
      .delete()
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .lte('date', yesterday);

    if (deleteError) throw deleteError;

    console.log(`Archived ${toArchive.length} appointments`);
    console.log('--- Archiving Completed ---');
  } catch (e: any) {
    console.error('Archive error:', e.message);
  }
};

app.get('/api/calendar/slots', async (req, res) => {
  try {
    const { date, doctorId = 'any', durationMinutes = '30' } = req.query as Record<string, string>;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Parametru date invalid (YYYY-MM-DD)' });
    }

    // Check booking horizon - reject dates beyond maximum allowed period
    const requestedDate = dayjs.tz(`${date}T12:00:00`, BUCHAREST_TZ);
    const maxAllowedDate = dayjs().tz(BUCHAREST_TZ).add(MAX_BOOKING_HORIZON_MONTHS, 'month');
    if (requestedDate.isAfter(maxAllowedDate, 'day')) {
      return res.status(400).json({ 
        error: `Ne pare rău, programările se pot face cu maximum ${MAX_BOOKING_HORIZON_MONTHS} luni în avans.` 
      });
    }

    // Check if the requested date is fully blocked for all doctors
    if (doctorId === 'any') {
      const allDoctors = BUSINESS_CONFIG.resources.filter(d => d.id !== 'any');
      let allDoctorsBlocked = true;
      
      for (const doctor of allDoctors) {
        const isDayBlocked = await checkIfDayIsFullyBlocked(date, doctor.id);
        if (!isDayBlocked) {
          allDoctorsBlocked = false;
          break;
        }
      }
      
      if (allDoctorsBlocked) {
        return res.json({ date, doctorId, slots: [] });
      }
    }

    const source = (req.query['source'] as string) || '';
    const slots = await getAvailableSlotsForDoctor(doctorId, date, parseInt(durationMinutes), source === 'dashboard');
    return res.json({ date, doctorId, slots });
  } catch (e: any) {
    console.error('[GET /api/calendar/slots]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// GET /api/calendar/appointments?date=YYYY-MM-DD (protejat)
app.get('/api/calendar/appointments', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { date, dateFrom, dateTo, doctorId } = req.query as Record<string, string>;
    
    // Fetch appointments
    let appointmentsQuery = supabase
      .from('appointments')
      .select('id, first_name, last_name, phone, service, doctor_id, doctor_name, date, time, status, channel, notes, created_at')
      .eq('clinic_id', CLINIC_CONFIG.id)
      .in('status', ['Pending', 'Confirmed'])
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    // Fetch blocked slots
    let blockedQuery = supabase
      .from('blocked_slots')
      .select('id, doctor_id, date, time_start, time_end, reason, group_id')
      .eq('clinic_id', CLINIC_CONFIG.id)
      .order('date', { ascending: true })
      .order('time_start', { ascending: true });

    // Apply date filters
    if (date) {
      appointmentsQuery = appointmentsQuery.eq('date', date);
      blockedQuery = blockedQuery.eq('date', date);
    } else if (dateFrom && dateTo) {
      appointmentsQuery = appointmentsQuery.gte('date', dateFrom).lte('date', dateTo);
      blockedQuery = blockedQuery.gte('date', dateFrom).lte('date', dateTo);
    }
    
    // Apply doctor filter
    if (doctorId && doctorId !== 'all') {
      appointmentsQuery = appointmentsQuery.eq('doctor_id', doctorId);
      blockedQuery = blockedQuery.eq('doctor_id', doctorId);
    }

    // Execute both queries
    const [{ data: appointments, error: appointmentsError }, { data: blockedSlots, error: blockedError }] = await Promise.all([
      appointmentsQuery,
      blockedQuery
    ]);

    if (appointmentsError) throw appointmentsError;
    if (blockedError) throw blockedError;

    // Combine and format data
    const appointmentsWithType = (appointments || []).map((apt: any) => ({
      ...apt,
      type: 'appointment'
    }));

    const blockedWithType = (blockedSlots || []).map((blocked: any) => ({
      ...blocked,
      type: 'blocked',
      time: blocked.time_start,
      service: blocked.reason || 'Blocat'
    }));

    const combinedData = [...appointmentsWithType, ...blockedWithType];
    
    return res.json(combinedData);
  } catch (e: any) {
    console.error('[GET /api/calendar/appointments]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// POST /api/calendar/block (protejat) - blocheazä un interval
app.post('/api/calendar/block', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { doctorId, date, timeStart, timeEnd, reason, groupId } = req.body;
    if (!date || !timeStart || !timeEnd) {
      return res.status(400).json({ error: 'date, timeStart, timeEnd sunt obligatorii' });
    }
    const { data, error } = await supabase.from('blocked_slots').insert({
      clinic_id: CLINIC_CONFIG.id,
      doctor_id: doctorId,
      date,
      time_start: timeStart,
      time_end: timeEnd,
      reason,
      group_id: groupId || null
    }).select('id').single();
    if (error) throw error;
    return res.json({ success: true, id: data.id });
  } catch (e: any) {
    console.error('[POST /api/calendar/block]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// PATCH /api/calendar/block/:id (protejat) - modificä un blocaj existent
app.patch('/api/calendar/block/:id', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    const { doctorId, date, timeStart, timeEnd, reason } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'ID-ul este obligatoriu' });
    }

    const updateData: any = {};
    if (doctorId !== undefined) updateData.doctor_id = doctorId;
    if (date !== undefined) updateData.date = date;
    if (timeStart !== undefined) updateData.time_start = timeStart;
    if (timeEnd !== undefined) updateData.time_end = timeEnd;
    if (reason !== undefined) updateData.reason = reason;

    const { error } = await supabase
      .from('blocked_slots')
      .update(updateData)
      .eq('id', id)
      .eq('clinic_id', CLINIC_CONFIG.id);

    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[PATCH /api/calendar/block/:id]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// DELETE /api/calendar/block/:id (protejat) - șterge un blocaj
app.delete('/api/calendar/block/:id', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({ error: 'ID-ul este obligatoriu' });
    }

    const { error } = await supabase
      .from('blocked_slots')
      .delete()
      .eq('id', req.params.id)
      .eq('clinic_id', CLINIC_CONFIG.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('Delete block error:', e);
    console.error('[DELETE /api/calendar/block/:id]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// GET /api/calendar/blocks?groupId=UUID (protejat) - fetch all slots in a vacation block
app.get('/api/calendar/blocks', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { groupId } = req.query as Record<string, string>;
    
    if (!groupId) {
      return res.status(400).json({ error: 'groupId required' });
    }
    
    const { data, error } = await supabase
      .from('blocked_slots')
      .select('id, doctor_id, date, time_start, time_end, reason, group_id')
      .eq('group_id', groupId)
      .eq('clinic_id', CLINIC_CONFIG.id);
    
    if (error) throw error;
    return res.json({ slots: data || [] });
  } catch (e: any) {
    console.error('[GET /api/calendar/blocks]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// GET /api/calendar/unlocked-slots?date=YYYY-MM-DD&doctorId=dr1 (protejat)
app.get('/api/calendar/unlocked-slots', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { date, doctorId } = req.query as Record<string, string>;
    
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Dată invalidă' });
    }
    
    let query = supabase
      .from('unlocked_slots')
      .select('*')
      .eq('date', date);
    
    if (doctorId && doctorId !== 'all') {
      query = query.eq('doctor_id', doctorId);
    }
    
    const { data, error } = await query;
    
    if (error) throw error;
    return res.json({ unlockedSlots: data || [] });
  } catch (e: any) {
    console.error('[GET /api/calendar/unlocked-slots]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// POST /api/calendar/unlock-slot (protejat)
app.post('/api/calendar/unlock-slot', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { doctorId, date, time } = req.body;
    
    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'Parametri obligatorii lipsă' });
    }
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Dată invalidă' });
    }
    
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({ error: 'Oră invalidă' });
    }
    
    // Check if already unlocked
    const { data: existing, error: checkError } = await supabase
      .from('unlocked_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .eq('time', time)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    if (existing) {
      return res.status(409).json({ error: 'Slotul este deja deblocat' });
    }
    
    // Insert new unlocked slot
    const { data, error } = await supabase
      .from('unlocked_slots')
      .insert([{ doctor_id: doctorId, date, time }])
      .select()
      .single();
    
    if (error) throw error;
    return res.json({ success: true, unlockedSlot: data });
  } catch (e: any) {
    console.error('[POST /api/calendar/unlock-slot]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// POST /api/temp-reservation - Create temporary reservation
app.post('/api/temp-reservation', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { doctorId, date, time } = req.body;
    
    if (!doctorId || !date || !time) {
      return res.status(400).json({ error: 'doctorId, date, and time are required' });
    }

    // Get slot step from business config
    const slotStepMinutes = BUSINESS_CONFIG.scheduling.slotStepMinutes || 30;
    
    // Calculate time_end
    const [h, m] = time.split(':').map(Number);
    const endTotal = h * 60 + m + slotStepMinutes;
    const timeEnd = `${Math.floor(endTotal / 60).toString().padStart(2, '0')}:${(endTotal % 60).toString().padStart(2, '0')}`;
    
    // Create temp reservation with 10-minute expiration
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('temp_reservations')
      .insert({
        doctor_id: doctorId,
        date,
        time_start: time,
        time_end: timeEnd,
        expires_at: expiresAt
      })
      .select('id, expires_at')
      .single();

    if (error) throw error;
    
    return res.json({ id: data.id, expires_at: data.expires_at });
  } catch (e: any) {
    console.error('[POST /api/temp-reservation]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// DELETE /api/temp-reservation - Delete temporary reservation
app.delete('/api/temp-reservation', protectRoute, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ error: 'id is required' });
    }

    const { error } = await supabase
      .from('temp_reservations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[DELETE /api/temp-reservation]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

export default app;
