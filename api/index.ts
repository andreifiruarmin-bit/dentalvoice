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
import rateLimit from 'express-rate-limit';
import nodemailer from 'nodemailer';
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
  CLINIC_INTEGRATION,
  getSupabase,
  sanitizePhone,
  normalizePhoneForSearch,
  getServicesFromDB,
  getClinicConfigFromDB,
  getCachedDoctors,
  invalidateDoctorCache,
  TECH_CONFIG,
  protectRoute,
  PENDING_APPOINTMENT_STALE_MINUTES,
  TEST_PHONE_NORMALIZED,
  MAX_BOOKING_HORIZON_MONTHS,
  getClinicId,
  buildClinicDaySlotStarts,
  resolveDurationMinutesFromQuery,
} from './lib/shared.js';
import { runArchive } from './lib/archive.js';
import {
  sendEmail,
  sendSMS,
  sendWhatsAppMessage,
  sendWhatsAppInteractive,
  generateICSAttachment,
  getGoogleMapsLink,
} from './lib/notifications.js';
import {
  getAvailableSlotsForDoctor,
  checkIfDayIsFullyBlocked,
  processBooking,
  deleteAppointmentByPhoneDateTime,
} from './lib/booking.js';
import {
  type ChatSession,
  WA_WELCOME_BUTTONS,
  waIdleGreetingReply,
  coerceChatSessionStep,
  runWhatsappStateMachine,
} from './lib/whatsapp.js';

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
// SUPABASE JWT AUTHENTICATION MIDDLEWARE
// ==========================================

/**
 * verifySupabaseJWT - Validates Supabase JWT tokens for dashboard API authentication
 * 
 * PURPOSE: Replace x-api-key header authentication with secure JWT tokens
 * - Extracts Bearer token from Authorization header
 * - Validates token using Supabase admin client
 * - Ensures only authenticated dashboard users can access admin routes
 * 
 * SECURITY: Never expose ADMIN_API_KEY to browser bundle
 */
async function verifySupabaseJWT(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  const token = authHeader.split(' ')[1];
  const supabaseAdmin = getSupabase();
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
}

// ==========================================
// CRON PROTECTION MIDDLEWARE
// ==========================================

/**
 * protectCron - Validates cron secret for cron job endpoints
 * 
 * PURPOSE: Protect cron endpoints from unauthorized access
 * - Checks x-cron-secret header against CRON_SECRET env var
 * - Used by external cron-job.org to trigger scheduled tasks
 */
const protectCron = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const secret = req.headers['x-cron-secret'];
  const envSecret = process.env.CRON_SECRET;
  console.log('[CRON_DEBUG] received header x-cron-secret:', JSON.stringify(secret));
  console.log('[CRON_DEBUG] env CRON_SECRET defined:', !!envSecret, '| length:', envSecret?.length ?? 0);
  console.log('[CRON_DEBUG] match:', secret === envSecret);
  if (!secret || secret !== envSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Accepts EITHER x-api-key (bot/widget) OR Supabase JWT (dashboard)
const protectRouteOrJWT = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.ADMIN_API_KEY) {
    return next();
  }
  return verifySupabaseJWT(req, res, next);
};

// ==========================================
// WHATSAPP WEBHOOK SIGNATURE VERIFICATION
// ==========================================

/**
 * verifyTwilioSignature - Validates incoming Twilio webhook requests
 *
 * PURPOSE: Ensure webhook POSTs are genuinely from Twilio, not spoofed
 * - Uses TWILIO_AUTH_TOKEN + X-Twilio-Signature header
 * - If TWILIO_AUTH_TOKEN not set: development/simulator mode, skip verification
 * - URL must match exactly what Twilio has configured in the console
 *
 * PARAMETRIZATION: TWILIO_WEBHOOK_URL env var → full URL of this endpoint
 * e.g. TWILIO_WEBHOOK_URL=https://dentalvoice.ro/api/webhook/whatsapp
 */
const verifyTwilioSignature = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!authToken) {
    return next();
  }

  // Simulator requests (JSON content-type) bypass signature check
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('application/json')) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL || '';

  if (!twilioSignature || !webhookUrl) {
    console.warn('[Twilio Webhook] Missing signature or TWILIO_WEBHOOK_URL env var');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const twilio = (await import('twilio')).default;
    const isValid = twilio.validateRequest(authToken, twilioSignature, webhookUrl, req.body);
    if (!isValid) {
      console.warn('[Twilio Webhook] Invalid signature — possible spoofing attempt');
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    next();
  } catch (e) {
    console.warn('[Twilio Webhook] Signature validation error:', e);
    return res.status(401).json({ error: 'Signature validation failed' });
  }
};

// ==========================================
// ROMANIAN DATE FORMATTING CONSTANTS
// ==========================================

const ZILE_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
                 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

/**
 * replaceTokens - Replace template variables with actual values
 * 
 * Tokens supported:
 * - {{PATIENT_NAME}} → patient name
 * - {{CLINIC_NAME}} → clinic name
 * - {{APPOINTMENT_DATE}} → formatted date in Romanian
 * - {{APPOINTMENT_TIME}} → appointment time
 * - {{CLINIC_ADDRESS}} → clinic address
 * - {{CLINIC_PHONE}} → clinic phone
 */
const replaceTokens = (template: string, tokens: Record<string, string>): string => {
  return Object.entries(tokens).reduce(
    (s, [k, v]) => s.replaceAll('{{' + k + '}}', v ?? ''),
    template
  );
};

// ==========================================
// EXPRESS APP INITIALIZATION
// ==========================================

const app = express();


// Configurare CORS
app.use(cors({
  origin: [TECH_CONFIG.frontendUrl, "https://www.dentalvoice.ro", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
}));

// ── Rate Limiting ────────────────────────────────────────────────
// Applied to public endpoints only. Dashboard and booking routes unaffected.

// Strict: /api/leads — prevents spam submissions
const leadsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe cereri. Încearcă din nou peste 15 minute.' },
});

// Moderate: /api/webhook/whatsapp — Twilio sends legitimate bursts
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe cereri. Încearcă din nou imediat.' },
});

// Moderate: /api/sms/send-otp — prevent OTP flooding
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe cereri OTP. Încearcă din nou peste 15 minute.' },
});

// Moderate: embed widget routes
const embedLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Prea multe cereri. Încearcă din nou imediat.' },
});
// ── End Rate Limiting ────────────────────────────────────────────

// Force JSON headers for all responses
app.use((_req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use(express.json());

// Twilio sends webhooks as application/x-www-form-urlencoded
app.use('/api/webhook/whatsapp', express.urlencoded({ extended: false }));

// Global error handling middleware - ensures all errors return JSON
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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

// Debug Route for Environment Variables
app.get("/api/test-env", (_req, res) => {
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
    clinic_id: getClinicId()
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

app.get("/api/config", protectRouteOrJWT, async (_req, res) => {
  try {
    const clinicId = getClinicId();
    const supabase = getSupabase();

    // Doctors from DB (existing logic - keep as-is)
    const { data: doctorsData } = await supabase
      .from('doctors')
      .select('id, name, working_days, working_hours_start, working_hours_end')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('id');

    const resources = [
      { id: 'any', name: 'Oricare medic disponibil', workingDays: [], workingHours: { start: '09:00', end: '18:00' } },
      ...(doctorsData || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        workingDays: d.working_days,
        workingHours: { start: d.working_hours_start, end: d.working_hours_end },
      }))
    ];

    // Clinic profile from DB with env var fallback
    const dbConfig = await getClinicConfigFromDB(clinicId);

    // Services from DB with hardcoded fallback
    const services = await getServicesFromDB(clinicId);

    res.json({
      id: clinicId,
      name: dbConfig.name,
      location: dbConfig.location,
      clinicPhone: dbConfig.clinicPhone,
      whatsappNumber: CLINIC_INTEGRATION.whatsappNumber,
      whatsappText: CLINIC_INTEGRATION.whatsappText,
      // facebookPageId: CLINIC_INTEGRATION.facebookPageId, // DEFERRED: facebook-channel
      // messengerId: CLINIC_INTEGRATION.messengerId, // DEFERRED: facebook-channel
      resources,
      services,
      scheduling: {
        slotStepMinutes: BUSINESS_CONFIG.scheduling.slotStepMinutes,
        workingHours: { start: dbConfig.startHour, end: dbConfig.endHour }
      }
    });
  } catch (err: any) {
    console.error('[GET /api/config]', err.message);
    res.status(500).json({ error: "Server Error" });
  }
});

// GET /api/config/reminder - returns reminder config for Settings UI (protected)
app.get("/api/config/reminder", verifySupabaseJWT, async (_req, res) => {
  try {
    const clinicId = getClinicId();
    const supabase = getSupabase();
    
    // Try to get from new column structure first
    const { data: configRow, error: configError } = await supabase
      .from('clinic_config')
      .select('reminder_enabled, reminder_channel, reminder_lead_hours, reminder_message_template, reminder_custom_hours')
      .eq('clinic_id', clinicId)
      .single();

    let config: any = {};
    
    if (configError || !configRow) {
      // Fallback to old key-value structure for backward compatibility
      const { data: kvData, error: kvError } = await supabase
        .from('clinic_config')
        .select('key, value')
        .eq('clinic_id', clinicId)
        .in('key', ['REMINDER_LEAD_HOURS', 'REMINDER_MESSAGE_TEMPLATE']);
      
      if (!kvError && kvData) {
        const map: Record<string, string> = {};
        kvData.forEach((r: any) => { map[r.key] = r.value; });
        
        config = {
          enabled: true, // Default enabled for backward compatibility
          channel: 'sms',
          leadHours: parseInt(map['REMINDER_LEAD_HOURS'] || '24', 10),
          messageTemplate: map['REMINDER_MESSAGE_TEMPLATE'] || 'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}',
          customHours: null
        };
      } else {
        // Default fallback
        config = {
          enabled: true,
          channel: 'sms',
          leadHours: 24,
          messageTemplate: 'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}',
          customHours: null
        };
      }
    } else {
      // Use new column structure
      config = {
        enabled: configRow.reminder_enabled !== false,
        channel: configRow.reminder_channel || 'sms',
        leadHours: configRow.reminder_lead_hours || 24,
        messageTemplate: configRow.reminder_message_template || 'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}',
        customHours: configRow.reminder_custom_hours
      };
    }

    res.json(config);
  } catch (error: any) {
    console.error('Error fetching reminder config:', error);
    res.status(500).json({ error: 'Eroare la încărcarea configurației reminder' });
  }
});

// POST /api/cron/archive - Archive daily bookings (cron protected)
app.post("/api/cron/archive", protectCron, async (_req, res) => {
  try {
    await archiveDailyBookings();
    res.json({ success: true, message: "Archive completed" });
  } catch (error: any) {
    console.error('Error in archive cron:', error);
    res.status(500).json({ error: error.message || 'Archive failed' });
  }
});

// POST /api/cron/reminders - Send appointment reminders (cron protected)
// Run in Supabase SQL Editor:
// ALTER TABLE appointments
//   ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ DEFAULT NULL;
app.post("/api/cron/reminders", protectCron, async (_req, res) => {
  try {
    const clinicId = getClinicId();
    const supabase = getSupabase();

    // Step 1: Read clinic config from clinic_config table
    const { data: configRows, error: configError } = await supabase
      .from('clinic_config')
      .select('key, value')
      .eq('clinic_id', clinicId)
      .in('key', [
        'REMINDER_ENABLED', 'REMINDER_CHANNEL', 'REMINDER_LEAD_HOURS',
        'REMINDER_MESSAGE_TEMPLATE', 'REMINDER_CUSTOM_HOURS',
        'WORKING_HOURS_START', 'WORKING_HOURS_END',
        'CLINIC_NAME', 'CLINIC_ADDRESS', 'CLINIC_PHONE'
      ]);

    if (configError) {
      console.error('Error fetching clinic config:', configError);
      return res.status(500).json({ error: 'Failed to fetch clinic config' });
    }

    // Build a map from key-value rows
    const cfg: Record<string, string> = Object.fromEntries(
      (configRows || []).map((r: any) => [r.key, r.value])
    );

    // Step 2: Check if reminders are enabled
    if (cfg.REMINDER_ENABLED === 'false') {
      return res.json({ skipped: true, reason: 'reminders disabled' });
    }

    // Step 3: Working hours guard (prevents sending at night)
    const now = dayjs().tz(BUCHAREST_TZ);
    const currentHHmm = now.format('HH:mm');
    const workStart = cfg.WORKING_HOURS_START || '08:00';
    const workEnd = cfg.WORKING_HOURS_END || '20:00';

    if (currentHHmm < workStart || currentHHmm > workEnd) {
      return res.json({
        skipped: true,
        reason: 'outside working hours',
        current: currentHHmm,
        window: workStart + '-' + workEnd
      });
    }

    // Step 4: Calculate appointment time window
    const leadHours = parseInt(cfg.REMINDER_CUSTOM_HOURS || cfg.REMINDER_LEAD_HOURS || '24', 10);
    const windowStart = now.add(leadHours, 'hour').subtract(30, 'minute');
    const windowEnd = now.add(leadHours, 'hour').add(30, 'minute');

    // Step 5: Query appointments to remind
    const { data: appointments, error: aptError } = await supabase
      .from('appointments')
      .select('id, first_name, last_name, phone, email, date, time, doctor_name, service')
      .eq('clinic_id', clinicId)
      .eq('status', 'Confirmed')
      .is('reminder_sent_at', null)
      .eq('date', windowStart.format('YYYY-MM-DD'))
      .gte('time', windowStart.format('HH:mm'))
      .lte('time', windowEnd.format('HH:mm'));

    if (aptError) {
      console.error('Error fetching appointments:', aptError);
      return res.status(500).json({ error: 'Failed to fetch appointments' });
    }

    let sent = 0;
    let skippedNoEmail = 0;

    // Get email transporter config
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const transporter = user && pass ? nodemailer.createTransport({
      host: TECH_CONFIG.email.host,
      port: TECH_CONFIG.email.port,
      secure: TECH_CONFIG.email.secure,
      auth: { user, pass }
    }) : null;

    // Step 6: Process each appointment
    for (const apt of appointments || []) {
      try {
        // a) Build patient name
        const patientName = `${apt.first_name || ''} ${apt.last_name || ''}`.trim();

        // b) Format date in Romanian
        const d = dayjs.tz(apt.date + 'T12:00:00', BUCHAREST_TZ);
        const dateRO = ZILE_RO[d.day()] + ', ' + d.date() + ' ' + LUNI_RO[d.month()];

        // c) Build message using replaceTokens helper
        const tokens: Record<string, string> = {
          PATIENT_NAME: patientName,
          CLINIC_NAME: cfg.CLINIC_NAME || '',
          APPOINTMENT_DATE: dateRO,
          APPOINTMENT_TIME: apt.time,
          CLINIC_ADDRESS: cfg.CLINIC_ADDRESS || '',
          CLINIC_PHONE: cfg.CLINIC_PHONE || ''
        };
        const template = cfg.REMINDER_MESSAGE_TEMPLATE ||
          'Bună {{PATIENT_NAME}}! Ai programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}.';
        const message = replaceTokens(template, tokens);

        // d) Send based on REMINDER_CHANNEL
        const channel = cfg.REMINDER_CHANNEL || 'sms';
        if (channel === 'email') {
          if (!apt.email || !transporter) {
            skippedNoEmail++;
            continue;
          }
          await transporter.sendMail({
            from: `"${cfg.CLINIC_NAME || 'Clinică'}" <${user}>`,
            to: apt.email,
            subject: 'Reminder programare - ' + (cfg.CLINIC_NAME || 'Clinică'),
            text: message
          });
        } else if (channel === 'whatsapp') {
          const sanitizedPhone = sanitizePhone(apt.phone);
          await sendWhatsAppMessage(sanitizedPhone, message);
        } else if (channel === 'sms') {
          const sanitizedPhone = sanitizePhone(apt.phone);
          await sendSMS(sanitizedPhone, message);
        } else {
          console.log('STUB unknown channel:', message);
        }

        // e) After send attempt — update both tracking mechanisms
        await supabase
          .from('appointments')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', apt.id)
          .eq('clinic_id', clinicId);

        await supabase
          .from('reminder_log')
          .insert({
            appointment_id: apt.id,
            clinic_id: clinicId,
            sent_at: new Date().toISOString()
          });

        sent++;
      } catch (err: any) {
        console.error(`Error processing reminder for appointment ${apt.id}:`, err.message);
        skippedNoEmail++;
      }
    }

    // Step 7: Return results
    res.json({ success: true, sent, skippedNoEmail, total: appointments?.length || 0 });
  } catch (error: any) {
    console.error('Error in reminders cron:', error);
    res.status(500).json({ error: error.message || 'Reminders failed' });
  }
});

// POST /api/sms/send-otp — generate and send SMS OTP (public, rate limit via phone)
app.post('/api/sms/send-otp', otpLimiter, async (req, res) => {
  try {
    const { phone, clinic_id } = req.body;
    if (!phone || !clinic_id) {
      return res.status(400).json({ error: 'phone și clinic_id sunt obligatorii' });
    }

    const phoneNormalized = sanitizePhone(phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: 'Număr de telefon invalid' });
    }

    const supabase = getSupabase();

    // Invalidate any existing unused OTP for this phone+clinic
    await supabase
      .from('otp_codes')
      .update({ used: true })
      .eq('phone_normalized', phoneNormalized)
      .eq('clinic_id', clinic_id)
      .eq('used', false);

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Save to DB
    const { error: insertError } = await supabase
      .from('otp_codes')
      .insert({ phone_normalized: phoneNormalized, clinic_id, code, expires_at: expiresAt });

    if (insertError) throw insertError;

    // Send real SMS
    await sendSMS(phoneNormalized, `Codul tau DentalVoice: ${code}. Valabil 5 minute. Nu il impartasi nimanui.`);

    return res.json({ success: true, message: 'SMS trimis' });
  } catch (err: any) {
    console.error('[POST /api/sms/send-otp]', err.message);
    return res.status(500).json({ error: 'Nu am putut trimite SMS-ul. Incearca din nou.' });
  }
});

// POST /api/sms/verify-otp — verify SMS OTP code
app.post('/api/sms/verify-otp', async (req, res) => {
  try {
    const { phone, code, clinic_id } = req.body;
    if (!phone || !code || !clinic_id) {
      return res.status(400).json({ error: 'phone, code și clinic_id sunt obligatorii' });
    }

    const phoneNormalized = sanitizePhone(phone);
    if (!phoneNormalized) {
      return res.status(400).json({ error: 'Număr de telefon invalid' });
    }

    const supabase = getSupabase();

    // Find latest valid OTP
    const { data: otpRow, error: findError } = await supabase
      .from('otp_codes')
      .select('id, code, attempts, expires_at')
      .eq('phone_normalized', phoneNormalized)
      .eq('clinic_id', clinic_id)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (findError || !otpRow) {
      return res.status(400).json({ error: 'Cod expirat sau inexistent. Solicita un cod nou.' });
    }

    // Increment attempts
    await supabase
      .from('otp_codes')
      .update({ attempts: otpRow.attempts + 1 })
      .eq('id', otpRow.id);

    if (otpRow.attempts >= 3) {
      // Mark as used to force new OTP request
      await supabase.from('otp_codes').update({ used: true }).eq('id', otpRow.id);
      return res.status(400).json({ error: 'Prea multe incercari. Solicita un cod nou.' });
    }

    if (otpRow.code !== code) {
      const attemptsLeft = 3 - (otpRow.attempts + 1);
      return res.status(400).json({ error: 'Cod incorect', attemptsLeft });
    }

    // Valid — mark as used
    await supabase.from('otp_codes').update({ used: true }).eq('id', otpRow.id);

    return res.json({ success: true, verified: true });
  } catch (err: any) {
    console.error('[POST /api/sms/verify-otp]', err.message);
    return res.status(500).json({ error: 'Eroare la verificarea codului' });
  }
});

// GET /api/config/all - returns all clinic config as key-value object (protected)
app.get("/api/config/all", verifySupabaseJWT, async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clinic_config')
      .select('key, value')
      .order('key');

    if (error) throw error;

    // Convert array to key-value object
    const config = data.reduce((acc: Record<string, string>, item: { key: string; value: string }) => {
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
    const { key, value, reminderEnabled, reminderLeadHours, reminderMessageTemplate, reminderChannel, reminderCustomHours } = req.body;
    const supabase = getSupabase();

    // Handle reminder configuration (new column structure)
    if (reminderEnabled !== undefined || reminderLeadHours !== undefined || reminderMessageTemplate !== undefined || reminderChannel !== undefined || reminderCustomHours !== undefined) {
      // Build update object with only provided reminder fields
      const reminderUpdate: any = {};
      if (reminderEnabled !== undefined) reminderUpdate.reminder_enabled = reminderEnabled;
      if (reminderLeadHours !== undefined) reminderUpdate.reminder_lead_hours = reminderLeadHours;
      if (reminderMessageTemplate !== undefined) reminderUpdate.reminder_message_template = reminderMessageTemplate;
      if (reminderChannel !== undefined) reminderUpdate.reminder_channel = reminderChannel;
      if (reminderCustomHours !== undefined) reminderUpdate.reminder_custom_hours = reminderCustomHours;

      const { data, error } = await supabase
        .from('clinic_config')
        .upsert({ 
          clinic_id: getClinicId(),
          ...reminderUpdate,
          updated_at: new Date().toISOString() 
        },
        { onConflict: 'clinic_id' })
        .select()
        .single();

      if (error) throw error;
      return res.json({ success: true, data });
    }

    // Handle simple key-value pairs (backward compatibility)
    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Cheie și valoare sunt obligatorii' });
    }

    const { data, error } = await supabase
      .from('clinic_config')
      .upsert({ 
        clinic_id: getClinicId(),
        key, 
        value, 
        updated_at: new Date().toISOString() 
      },
      { onConflict: 'clinic_id,key' })
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
app.get("/api/doctors", protectRoute, async (_req, res) => {
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
    const { name, workingDays, workingHoursStart, workingHoursEnd } = req.body;

    if (!name || !workingDays || !workingHoursStart || !workingHoursEnd) {
      return res.status(400).json({ error: 'Toate câmpurile sunt obligatorii' });
    }

    const clinicId = getClinicId();
    const supabase = getSupabase();

    // ID recycling: find lowest available drN slot
    const { data: existingDoctors } = await supabase
      .from('doctors')
      .select('id')
      .eq('clinic_id', clinicId);

    const usedIds = new Set((existingDoctors || []).map((d: any) => d.id));
    let newId = '';
    for (let n = 1; n <= 100; n++) {
      const candidate = `dr${n}`;
      if (!usedIds.has(candidate)) {
        newId = candidate;
        break;
      }
    }
    if (!newId) {
      return res.status(400).json({ error: 'Nu se pot adăuga mai mult de 100 de medici' });
    }

    const { data, error } = await supabase
      .from('doctors')
      .insert({
        id: newId,
        clinic_id: clinicId,
        name,
        working_days: workingDays,
        working_hours_start: workingHoursStart,
        working_hours_end: workingHoursEnd,
        is_active: true
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
    invalidateDoctorCache();
  } catch (error: any) {
    console.error('Error creating doctor:', error);
    res.status(500).json({ error: 'Eroare la adăugarea medicului' });
  }
});

// PATCH /api/doctors/:id - update doctor (protected)
app.patch("/api/doctors/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, workingDays, workingHoursStart, workingHoursEnd } = req.body;

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (workingDays !== undefined) updates.working_days = workingDays;
    if (workingHoursStart !== undefined) updates.working_hours_start = workingHoursStart;
    if (workingHoursEnd !== undefined) updates.working_hours_end = workingHoursEnd;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Niciun câmp de actualizat' });
    }

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('doctors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, data });
    invalidateDoctorCache();
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

    // Check for future confirmed/pending appointments
    const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
    const { data: futureAppointments } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', id)
      .gte('date', today)
      .in('status', ['Confirmed', 'Pending'])
      .limit(1);

    if (futureAppointments && futureAppointments.length > 0) {
      return res.status(409).json({
        error: 'Medicul are programări viitoare. Anulați sau reprogramați-le înainte de ștergere.'
      });
    }

    const { error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
    invalidateDoctorCache();
  } catch (error: any) {
    console.error('Error deleting doctor:', error);
    res.status(500).json({ error: 'Eroare la ștergerea medicului' });
  }
});

// GET /api/services - list all services for clinic (protected)
app.get("/api/services", protectRoute, async (_req, res) => {
  try {
    const clinicId = getClinicId();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('services')
      .select('id, name, duration_minutes, description, price_range, is_active')
      .eq('clinic_id', clinicId)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Eroare la incarcarea serviciilor' });
  }
});

// POST /api/services - create service (protected)
app.post("/api/services", protectRoute, async (req, res) => {
  try {
    const { name, durationMinutes, description, priceRange } = req.body;
    if (!name || !durationMinutes) {
      return res.status(400).json({ error: 'Numele si durata sunt obligatorii' });
    }
    const clinicId = getClinicId();
    const slug = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_')
      .replace(/^_|_$/g, '').substring(0, 20);
    const uniqueId = slug + '_' + Date.now().toString(36);
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('services')
      .insert({
        id: uniqueId,
        clinic_id: clinicId,
        name,
        duration_minutes: durationMinutes,
        description: description || '',
        price_range: priceRange || null,
        is_active: true
      })
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Eroare la adaugarea serviciului' });
  }
});

// PATCH /api/services/:id - update service (protected)
app.patch("/api/services/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, durationMinutes, description, priceRange, isActive } = req.body;
    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = name;
    if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes;
    if (description !== undefined) updates.description = description;
    if (priceRange !== undefined) updates.price_range = priceRange;
    if (isActive !== undefined) updates.is_active = isActive;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Niciun camp de actualizat' });
    }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('services')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Eroare la actualizarea serviciului' });
  }
});

// DELETE /api/services/:id - delete service (protected)
app.delete("/api/services/:id", protectRoute, async (req, res) => {
  try {
    const { id } = req.params;
    const supabase = getSupabase();
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Eroare la stergerea serviciului' });
  }
});

// GET /api/holidays - list clinic holidays (protected)
app.get("/api/holidays", verifySupabaseJWT, async (_req, res) => {
  try {
    const clinicId = getClinicId();
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('clinic_holidays')
      .select('id, date, name')
      .eq('clinic_id', clinicId)
      .order('date');
    if (error) throw error;
    res.json(data || []);
  } catch (error: any) {
    console.error('Error fetching holidays:', error);
    res.status(500).json({ error: 'Eroare la incarcarea zilelor libere' });
  }
});

// POST /api/holidays - add holiday (protected)
app.post("/api/holidays", verifySupabaseJWT, async (req, res) => {
  try {
    const { date, name } = req.body;
    if (!date || !name) {
      return res.status(400).json({ error: 'Data si denumirea sunt obligatorii' });
    }
    const clinicId = getClinicId();
    const supabase = getSupabase();

    // Insert holiday
    const { data: holidayData, error: holidayError } = await supabase
      .from('clinic_holidays')
      .insert({ clinic_id: clinicId, date, name })
      .select()
      .single();

    if (holidayError) {
      if (holidayError.code === '23505') {
        return res.status(409).json({ error: 'Aceasta zi este deja marcata ca libera' });
      }
      throw holidayError;
    }

    // Block all active doctors for this entire day
    const doctors = await getCachedDoctors(clinicId);
    const blockPromises = doctors.map(async (doctor) => {
      // Check if block already exists
      const { data: existing } = await supabase
        .from('blocked_slots')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('doctor_id', doctor.id)
        .eq('date', date)
        .limit(1);
      if (existing && existing.length > 0) return;
      await supabase.from('blocked_slots').insert({
        clinic_id: clinicId,
        doctor_id: doctor.id,
        date,
        time_start: '00:00',
        time_end: '23:59',
        reason: `Zi libera: ${name}`,
      });
    });
    await Promise.all(blockPromises);

    res.json({ success: true, data: holidayData });
  } catch (error: any) {
    console.error('Error adding holiday:', error);
    res.status(500).json({ error: 'Eroare la adaugarea zilei libere' });
  }
});

// DELETE /api/holidays/:id - remove holiday (protected)
app.delete("/api/holidays/:id", verifySupabaseJWT, async (req, res) => {
  try {
    const { id } = req.params;
    const clinicId = getClinicId();
    const supabase = getSupabase();

    // Get the holiday date before deleting
    const { data: holiday } = await supabase
      .from('clinic_holidays')
      .select('date, name')
      .eq('id', id)
      .single();

    if (!holiday) {
      return res.status(404).json({ error: 'Ziua libera nu a fost gasita' });
    }

    // Delete the holiday
    const { error } = await supabase
      .from('clinic_holidays')
      .delete()
      .eq('id', id);
    if (error) throw error;

    // Remove all-day blocked_slots created for this holiday
    await supabase
      .from('blocked_slots')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('date', holiday.date)
      .eq('time_start', '00:00')
      .eq('time_end', '23:59')
      .like('reason', `Zi libera:%`);

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting holiday:', error);
    res.status(500).json({ error: 'Eroare la stergerea zilei libere' });
  }
});

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
      .eq('clinic_id', getClinicId())
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
        .eq('clinic_id', getClinicId())
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
      googleEventId: null, // Google Calendar removed in v3.0
      calendarId: null,    // Internal calendar used instead
      status: data.status,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    res.status(500).json({ error: message });
  }
});

app.delete("/api/delete-booking", verifySupabaseJWT, async (req, res) => {
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
      clinic_id: getClinicId(),
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

app.get("/api/admin/leads", verifySupabaseJWT, async (_req, res) => {
  try {
    const { data, error } = await getSupabase().from('leads').select('*').eq('clinic_id', getClinicId()).order('created_at', { ascending: false });
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

app.post("/api/admin/cleanup-pending", verifySupabaseJWT, async (_req, res) => {
  try {
    const staleBefore = dayjs().subtract(PENDING_APPOINTMENT_STALE_MINUTES, 'minute').toISOString();
    const { data, error } = await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', getClinicId())
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

app.post('/api/admin/cleanup-test-phone', verifySupabaseJWT, async (_req, res) => {
  try {
    const testPhone = TEST_PHONE_NORMALIZED;
    if (!testPhone) return res.status(400).json({ error: 'TEST_PHONE not configured.' });
    
    const { data, error } = await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', getClinicId())
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

app.post("/api/admin/run-archive", verifySupabaseJWT, async (_req, res) => {
  try {
    const result = await runArchive(getClinicId());
    res.json({ success: true, ...result, ranAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/webhook/whatsapp — health check (Twilio does not require GET challenge)
app.get('/api/webhook/whatsapp', (_req, res) => {
  res.status(200).json({ ok: true, channel: 'whatsapp', provider: 'twilio' });
});

app.post("/api/webhook/whatsapp", webhookLimiter, verifyTwilioSignature, async (req, res) => {
  try {
    // Support both Twilio real format (From/Body) and simulator format (from/text/reset)
    // Twilio sends: From = "whatsapp:+40721234567", Body = "message text"
    // Simulator sends: { from: "...", text: "...", reset: true/false }
    const isTwilioFormat = !!req.body.From;

    const from: string = isTwilioFormat
      ? req.body.From.replace('whatsapp:', '') // strip prefix → "+40721234567"
      : req.body.from;

    const text: string | undefined = isTwilioFormat ? req.body.Body : req.body.text;
    const reset: boolean = isTwilioFormat ? false : (req.body.reset === true);

    if (!from || typeof from !== 'string') {
      return res.status(400).json({ error: 'From is required.' });
    }

    if (reset === true) {
      await getSupabase()
        .from('chat_sessions')
        .delete()
        .eq('clinic_id', getClinicId())
        .eq('phone_number', from);

      const resetReply = waIdleGreetingReply();

      // For Twilio real format: send reply via Twilio API, return 200 empty
      if (isTwilioFormat) {
        await sendWhatsAppMessage(from, resetReply);
        return res.status(200).send('');
      }

      // For simulator: return JSON as before
      return res.json({
        success: true,
        reply: resetReply,
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

    await getSupabase().from('live_traffic').insert([{
      clinic_id: getClinicId(),
      from_number: from,
      channel: 'WhatsApp',
      text,
      requires_intervention: requiresIntervention,
    }]);

    const { data: sessionData } = await getSupabase()
      .from('chat_sessions')
      .select('*')
      .eq('clinic_id', getClinicId())
      .eq('phone_number', from)
      .maybeSingle();

    let session: ChatSession = sessionData
      ? { step: coerceChatSessionStep(sessionData.step), data: (sessionData.data || {}) as ChatSession['data'] }
      : { step: 'idle', data: {} };

    // Session timeout guard
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
        clinic_id: getClinicId(),
        phone_number: from,
        step: nextSession.step,
        data: nextSession.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clinic_id,phone_number' }
    );

    const sessionActive = !['idle', 'confirmed'].includes(nextSession.step);

    // For Twilio real format: send reply via Twilio API, return 200 empty to Twilio
    if (isTwilioFormat) {
      if (buttons && buttons.length > 0) {
        await sendWhatsAppInteractive(from, replyOut, buttons.map(
          (b: string | { label: string; value: string }) =>
            typeof b === 'string' ? b : b.label
        ));
      } else {
        await sendWhatsAppMessage(from, replyOut);
      }
      return res.status(200).send('');
    }

    // For simulator: return JSON as before (WhatsappTest.tsx compatibility)
    const response: any = { success: true, reply: replyOut, buttons, session: nextSession.step, sessionActive };
    if (interactive) response.interactive = interactive;
    return res.json(response);

  } catch (err: unknown) {
    console.error('whatsapp webhook:', err);
    return res.status(500).json({ error: 'A apărut o eroare. Încercați din nou în câteva momente.' });
  }
});

/* DEFERRED: facebook-channel
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
*/

app.post("/api/bookings", protectRoute, async (req, res) => {
  const booking = req.body;
  try {
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

app.get("/api/clinic/appointments", verifySupabaseJWT, async (_req, res) => {
  try {
    const { data, error } = await getSupabase().from('appointments').select('*').eq('clinic_id', getClinicId()).order('date', { ascending: true });
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
      .eq('clinic_id', getClinicId())
      .eq('status', 'Confirmed')
      .lte('date', yesterday);

    if (fetchError) throw fetchError;
    if (!toArchive || toArchive.length === 0) {
      console.log('No appointments to archive');
      return;
    }

    // Move to history table
    const historyData = toArchive.map((apt: any) => ({
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
      .eq('clinic_id', getClinicId())
      .lte('date', yesterday);

    if (deleteError) throw deleteError;

    console.log(`Archived ${toArchive.length} appointments`);
    console.log('--- Archiving Completed ---');
  } catch (e: any) {
    console.error('Archive error:', e.message);
  }
};

app.get('/api/calendar/slots', verifySupabaseJWT, async (req, res) => {
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
app.get('/api/calendar/appointments', verifySupabaseJWT, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { date, dateFrom, dateTo, doctorId } = req.query as Record<string, string>;
    
    // Fetch appointments
    let appointmentsQuery = supabase
      .from('appointments')
      .select('id, first_name, last_name, phone, service, doctor_id, doctor_name, date, time, status, channel, notes, created_at')
      .eq('clinic_id', getClinicId())
      .in('status', ['Pending', 'Confirmed'])
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    // Fetch blocked slots
    let blockedQuery = supabase
      .from('blocked_slots')
      .select('id, doctor_id, date, time_start, time_end, reason, group_id')
      .eq('clinic_id', getClinicId())
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
app.post('/api/calendar/block', verifySupabaseJWT, async (req, res) => {
  try {
    const supabase = getSupabase();
    const { doctorId, date, timeStart, timeEnd, reason, groupId } = req.body;
    if (!date || !timeStart || !timeEnd) {
      return res.status(400).json({ error: 'date, timeStart, timeEnd sunt obligatorii' });
    }
    const { data, error } = await supabase.from('blocked_slots').insert({
      clinic_id: getClinicId(),
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
app.patch('/api/calendar/block/:id', verifySupabaseJWT, async (req, res) => {
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
      .eq('clinic_id', getClinicId());

    if (error) throw error;
    return res.json({ success: true });
  } catch (e: any) {
    console.error('[PATCH /api/calendar/block/:id]', e.message);
    return res.status(500).json({ error: 'Eroare internä' });
  }
});

// DELETE /api/calendar/block/:id (protejat) - șterge un blocaj
app.delete('/api/calendar/block/:id', verifySupabaseJWT, async (req, res) => {
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
      .eq('clinic_id', getClinicId());
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
      .eq('clinic_id', getClinicId());
    
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
