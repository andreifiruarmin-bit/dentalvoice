import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

// ==========================================
// Shared backend utilities (avoid circular imports)
// ==========================================

// ---------- Supabase (lazy init) ----------
let supabaseInstance: any = null;

export const getSupabase = () => {
  if (supabaseInstance) return supabaseInstance;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_ANON_KEY'];

  if (!url || !key) {
    throw new Error('Supabase URL or Key missing.');
  }

  supabaseInstance = createClient(url, key, {
    auth: { persistSession: false },
  });

  return supabaseInstance;
};

// ---------- Clinic config ----------
const getClinicConfig = () => ({
  id: process.env['CLINIC_ID'] || 'beautiful-smile-demo',
  name: process.env['CLINIC_NAME'] || 'Beautiful Smile',
  location: process.env['CLINIC_ADDRESS'] || 'Strada Clinicilor nr. 24, București',
  clinicPhone: process.env['CLINIC_PHONE'] || '0700 000 000',
  mapsLink: process.env['CLINIC_MAPS_LINK'] || 'https://goo.gl/maps/example',
  wazeLink: process.env['CLINIC_WAZE_LINK'] || 'https://waze.com/ul/example',
  whatsapp: {
    number: process.env['WHATSAPP_NUMBER'] || 'YOUR_WA_NUMBER',
    text: 'Bună! Vreau o programare prin DentalVoice.',
  },
  social: {
    facebookPageId: process.env['FACEBOOK_PAGE_ID'] || 'YOUR_FB_PAGE_ID',
    messengerId: process.env['MESSENGER_ID'] || 'YOUR_MESSENGER_ID',
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

export const CLINIC_INTEGRATION = {
  clinicId: CLINIC_CONFIG.id,
  whatsappNumber: CLINIC_CONFIG.whatsapp.number,
  facebookPageId: CLINIC_CONFIG.social.facebookPageId,
  messengerId: CLINIC_CONFIG.social.messengerId,
  whatsappText: CLINIC_CONFIG.whatsapp.text,
};

// ---------- Business config ----------
export interface DoctorResource {
  id: string;
  name: string;
  calendarId: string | undefined;
  workingDays: number[];
  workingHours: { start: string; end: string };
}

const buildDoctorsFromEnv = (): DoctorResource[] => {
  const count = parseInt(process.env['CLINIC_TOTAL_DR_COUNT'] || '1', 10);
  const doctors: DoctorResource[] = [];

  for (let i = 1; i <= count; i++) {
    const calendarId = process.env[`CALENDAR_ID_DR${i}`];
    if (!calendarId) {
      // Keep warnings local; index.ts has its own env audit too.
      continue;
    }

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
    throw new Error('CRITICAL: No doctors configured. Set CLINIC_TOTAL_DR_COUNT and CALENDAR_ID_DR1.');
  }

  return doctors;
};

export const BUSINESS_CONFIG = {
  name: CLINIC_CONFIG.name,
  location: CLINIC_CONFIG.location,
  mapsLink: CLINIC_CONFIG.mapsLink,
  wazeLink: CLINIC_CONFIG.wazeLink,
  maxActiveBookingsPerPhone: CLINIC_CONFIG.scheduling.maxActiveBookingsPerPhone,
  resources: buildDoctorsFromEnv(),
  services: [
    { id: 'consultatie', name: 'Consultație', durationMinutes: 30, description: 'Evaluare inițială și plan de tratament.' },
    { id: 'igienizare', name: 'Igienizare', durationMinutes: 45, description: 'Detartraj, periaj profesional și airflow.' },
    { id: 'albire', name: 'Albire Profesională', durationMinutes: 120, description: 'Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor.' },
    { id: 'control', name: 'Control Periodic', durationMinutes: 30, description: 'Verificarea stării de sănătate orală la 6 luni.' },
    { id: 'urgenta', name: 'Urgență Stomatologică', durationMinutes: 30, description: 'Intervenție rapidă pentru dureri acute sau traumatisme.' },
    { id: 'implant', name: 'Implant Dentar', durationMinutes: 60, description: 'Restaurare dentară prin implant.' },
  ],
  scheduling: CLINIC_CONFIG.scheduling,
};

export const BUCHAREST_TZ = BUSINESS_CONFIG.scheduling.timezone;

// ---------- Phone normalization ----------
export const sanitizePhone = (phone: string): string => {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits.slice(-9);
};

// ---------- Google Calendar ----------
export const getGoogleCredentials = () => {
  let googleCredentials = null;
  try {
    const json = process.env['GOOGLE_SERVICE_ACCOUNT_JSON'];
    if (json) {
      googleCredentials = JSON.parse(json);
    }
  } catch (e: any) {
    console.error('CRITICAL: Google JSON Parse Error', e.message);
  }
  return googleCredentials;
};

const auth = new google.auth.GoogleAuth({
  credentials: getGoogleCredentials(),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

export const calendar = google.calendar({ version: 'v3', auth });

