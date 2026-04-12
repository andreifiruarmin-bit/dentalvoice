import { createClient } from '@supabase/supabase-js';

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
  location: process.env['CLINIC_ADDRESS'] || 'Strada Clinicilor nr. 24, Bucuresti',
  clinicPhone: process.env['CLINIC_PHONE'] || '0700 000 000',
  mapsLink: process.env['CLINIC_MAPS_LINK'] || 'https://goo.gl/maps/example',
  wazeLink: process.env['CLINIC_WAZE_LINK'] || 'https://waze.com/ul/example',
  whatsapp: {
    number: process.env['WHATSAPP_NUMBER'] || 'YOUR_WA_NUMBER',
    text: 'Buna! Vreau o programare prin DentalVoice.',
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

export const BUSINESS_CONFIG = {
  name: CLINIC_CONFIG.name,
  location: CLINIC_CONFIG.location,
  mapsLink: CLINIC_CONFIG.mapsLink,
  wazeLink: CLINIC_CONFIG.wazeLink,
  maxActiveBookingsPerPhone: CLINIC_CONFIG.scheduling.maxActiveBookingsPerPhone,
  resources: buildDoctorsFromEnv(),
  services: [
    { id: 'consultatie', name: 'Consultaie', durationMinutes: 30, description: 'Evaluare iniialä i plan de tratament.' },
    { id: 'igienizare', name: 'Igienizare', durationMinutes: 45, description: 'Detartraj, periaj profesional i airflow.' },
    { id: 'albire', name: 'Albire Profesionalä', durationMinutes: 120, description: 'Albire dentarä cu lampä ZOOM pentru un zâmbet strälucitor.' },
    { id: 'control', name: 'Control Periodic', durationMinutes: 30, description: 'Verificarea stärii de säntate oralä la 6 luni.' },
    { id: 'urgenta', name: 'Urgenä Stomatologicä', durationMinutes: 30, description: 'Intervenie rapidä pentru dureri acute sau traumatisme.' },
    { id: 'implant', name: 'Implant Dentar', durationMinutes: 60, description: 'Restaurare dentarä prin implant.' },
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
