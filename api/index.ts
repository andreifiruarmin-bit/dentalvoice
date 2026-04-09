import express from "express";
import cors from "cors";
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import * as ics from 'ics';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

import { createClient } from '@supabase/supabase-js';

// ==========================================
// ENVIRONMENT AUDIT
// ==========================================
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'GOOGLE_SERVICE_ACCOUNT_JSON',
  'CALENDAR_ID_DR1',
  'CALENDAR_ID_DR2',
  'CALENDAR_ID_DR3',
  'SMTP_USER',
  'SMTP_PASS'
];

const auditEnvVars = () => {
  requiredEnvVars.forEach(v => {
    if (!process.env[v]) {
      console.warn(`⚠️ WARNING: Missing environment variable: ${v}`);
    }
  });
};
auditEnvVars();

const app = express();

// ==========================================
// 0. SUPABASE CONFIG (Lazy Initialization)
// ==========================================
let supabaseInstance: any = null;

const getSupabase = () => {
  if (!supabaseInstance) {
    const url = process.env['SUPABASE_URL'];
    const key = process.env['SUPABASE_SERVICE_ROLE_KEY'] || process.env['SUPABASE_ANON_KEY'];
    
    if (!url || !key) {
      console.error("❌ CRITICAL: Supabase URL or Key missing during lazy init.");
    }
    
    supabaseInstance = createClient(url || '', key || '', {
      auth: { persistSession: false }
    });
  }
  return supabaseInstance;
};

// ==========================================
// 1. SCALABLE CONFIG ENGINE
// ==========================================
const getClinicConfig = () => ({
  id: process.env['CLINIC_ID'] || "beautiful-smile-demo",
  name: process.env['CLINIC_NAME'] || "Beautiful Smile",
  location: process.env['CLINIC_ADDRESS'] || "Strada Clinicilor nr. 24, București",
  mapsLink: process.env['CLINIC_MAPS_LINK'] || "https://goo.gl/maps/example",
  wazeLink: process.env['CLINIC_WAZE_LINK'] || "https://waze.com/ul/example",
  whatsapp: {
    number: process.env['WHATSAPP_NUMBER'] || "YOUR_WA_NUMBER",
    text: "Bună! Vreau o programare prin DentalVoice."
  },
  social: {
    facebookPageId: process.env['FACEBOOK_PAGE_ID'] || "YOUR_FB_PAGE_ID",
    messengerId: process.env['MESSENGER_ID'] || "YOUR_MESSENGER_ID"
  },
  scheduling: {
    timezone: 'Europe/Bucharest',
    slotStepMinutes: 30,
    minLeadTimeHours: 2,
    workingHours: { start: '09:00', end: '18:00' },
    maxActiveBookingsPerPhone: 2
  }
});

const CLINIC_CONFIG = getClinicConfig();

// ==========================================
// 2. SAAS CONFIG (Multi-Tenant Integration)
// ==========================================
const CLINIC_INTEGRATION = {
  clinicId: CLINIC_CONFIG.id,
  whatsappNumber: CLINIC_CONFIG.whatsapp.number,
  facebookPageId: CLINIC_CONFIG.social.facebookPageId,
  messengerId: CLINIC_CONFIG.social.messengerId,
  whatsappText: CLINIC_CONFIG.whatsapp.text
};

// ==========================================
// 3. BUSINESS_CONFIG (Clinic Logic)
// ==========================================
const BUSINESS_CONFIG = {
  name: CLINIC_CONFIG.name,
  location: CLINIC_CONFIG.location,
  mapsLink: CLINIC_CONFIG.mapsLink,
  wazeLink: CLINIC_CONFIG.wazeLink,
  maxActiveBookingsPerPhone: CLINIC_CONFIG.scheduling.maxActiveBookingsPerPhone,
  resources: [
    { 
      id: 'dr1', 
      name: 'Dr. Ionescu', 
      calendarId: process.env['CALENDAR_ID_DR1'],
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      workingHours: { start: '09:00', end: '17:00' }
    },
    { 
      id: 'dr2', 
      name: 'Dr. Andreescu', 
      calendarId: process.env['CALENDAR_ID_DR2'],
      workingDays: [1, 3, 5], // Mon, Wed, Fri
      workingHours: { start: '10:00', end: '18:00' }
    },
    { 
      id: 'dr3', 
      name: 'Dr. Simonescu', 
      calendarId: process.env['CALENDAR_ID_DR3'],
      workingDays: [2, 4], // Tue, Thu
      workingHours: { start: '09:00', end: '15:00' }
    }
  ],
  services: [
    { id: "consultatie", name: "Consultație", durationMinutes: 30, description: "Evaluare inițială și plan de tratament." },
    { id: "igienizare", name: "Igienizare", durationMinutes: 45, description: "Detartraj, periaj profesional și airflow." },
    { id: "albire", name: "Albire Profesională", durationMinutes: 120, description: "Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor." },
    { id: "control", name: "Control Periodic", durationMinutes: 30, description: "Verificarea stării de sănătate orală la 6 luni." },
    { id: "urgenta", name: "Urgență Stomatologică", durationMinutes: 30, description: "Intervenție rapidă pentru dureri acute sau traumatisme." },
    { id: "implant", name: "Implant Dentar", durationMinutes: 60, description: "Restaurare dentară prin implant." }
  ],
  scheduling: CLINIC_CONFIG.scheduling
};

// ==========================================
// 2. TECH_CONFIG (Credentials & Integrations)
// ==========================================
const getGoogleCredentials = () => {
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

const TECH_CONFIG = {
  google: {
    serviceAccount: getGoogleCredentials(),
  },
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

const BUCHAREST_TZ = BUSINESS_CONFIG.scheduling.timezone;

// --- DOCTOR MAPPING HELPER ---
const getCalendarIdForDoctor = (frontendDoctorId: string) => {
  const doctorId = frontendDoctorId.toLowerCase();
  
  // 1. Check for specific doctor mapping in environment variables
  // Example: CALENDAR_ID_SIMONESCU
  const envKey = `CALENDAR_ID_${doctorId.toUpperCase()}`;
  let calendarId = process.env[envKey];
  
  // 2. Fallback to legacy mapping if env variable not found
  if (!calendarId) {
    const legacyMapping: { [key: string]: string | undefined } = {
      'dr1': process.env['CALENDAR_ID_DR1'],
      'dr2': process.env['CALENDAR_ID_DR2'],
      'dr3': process.env['CALENDAR_ID_DR3'],
      'ionescu': process.env['CALENDAR_ID_DR1'],
      'andreescu': process.env['CALENDAR_ID_DR2'],
      'simonescu': process.env['CALENDAR_ID_DR3']
    };
    calendarId = legacyMapping[doctorId];
  }

  // 3. Final fallback to main clinic calendar
  if (!calendarId) {
    calendarId = process.env['CALENDAR_ID_MAIN'] || process.env['CALENDAR_ID_DR1'];
  }
  
  console.log('Translated doctor', frontendDoctorId, 'to Calendar ID:', calendarId);
  return calendarId;
};

// ==========================================
// 3. SECURITY & DATABASE
// ==========================================
const ADMIN_API_KEY = process.env['ADMIN_API_KEY'] || "dv-secret-key-2026";

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

// Configurare Google Calendar
const auth = new google.auth.GoogleAuth({
  credentials: TECH_CONFIG.google.serviceAccount,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });

// Session storage pentru OTP
const otpSessions = new Map<string, string>();

// WhatsApp Session Memory Interface
interface ChatSession {
  step: 'idle' | 'awaiting_service' | 'awaiting_date' | 'awaiting_time' | 'awaiting_name';
  data: {
    service?: string;
    date?: string;
    time?: string;
    firstName?: string;
    lastName?: string;
  };
}

// --- HELPER FUNCTIONS ---

const countActiveBookings = async (phone: string) => {
  const now = new Date().toISOString();
  const searchPromises = BUSINESS_CONFIG.resources.map(d => {
    if (!d.calendarId) return Promise.resolve({ data: { items: [] } });
    return calendar.events.list({
      calendarId: d.calendarId,
      timeMin: now,
      q: phone,
      singleEvents: true,
    });
  });

  const results = await Promise.all(searchPromises);
  let count = 0;
  for (const res of results) {
    const items = res.data.items || [];
    count += items.filter(event => event.description?.includes(phone)).length;
  }
  return count;
};

const isDoctorWorking = (doctor: any, date: string, time: string, durationMinutes: number = 30) => {
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

const parseRomanianDate = (dateStr: string) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  const monthsMap: { [key: string]: string } = {
    'ianuarie': '01', 'februarie': '02', 'martie': '03', 'aprilie': '04',
    'mai': '05', 'iunie': '06', 'iulie': '07', 'august': '08',
    'septembrie': '09', 'octombrie': '10', 'noiembrie': '11', 'decembrie': '12'
  };
  
  const lowerDate = dateStr.toLowerCase();
  const parts = lowerDate.split(' ');
  const day = parts.find(p => /^\d+$/.test(p.replace(',', '')))?.replace(',', '').padStart(2, '0');
  const monthName = Object.keys(monthsMap).find(m => lowerDate.includes(m));
  
  if (day && monthName) {
    return `2026-${monthsMap[monthName]}-${day}`;
  }
  return null;
};

const sendEmail = async (to: string, subject: string, html: string, attachments?: any[]) => {
  try {
    const transporter = nodemailer.createTransport({
      host: TECH_CONFIG.email.host,
      port: TECH_CONFIG.email.port,
      secure: TECH_CONFIG.email.secure,
      auth: {
        user: TECH_CONFIG.email.user,
        pass: TECH_CONFIG.email.pass,
      },
    });

    await transporter.sendMail({
      from: `"${BUSINESS_CONFIG.name}" <${TECH_CONFIG.email.user}>`,
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

// --- CORE ENGINE: REUSABLE BOOKING LOGIC ---
const processBooking = async (booking: any) => {
  const activeBookingsCount = await countActiveBookings(booking.phone);
  if (activeBookingsCount >= BUSINESS_CONFIG.maxActiveBookingsPerPhone) {
    throw new Error(`Ați atins limita maximă de ${BUSINESS_CONFIG.maxActiveBookingsPerPhone} programări active.`);
  }

  const channel = booking.channel || 'Web';
  let verified = channel === 'WhatsApp';

  const isoDate = parseRomanianDate(booking.date);
  if (!isoDate) throw new Error("Data programării este indisponibilă.");
  
  const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service || s.id === booking.service) || BUSINESS_CONFIG.services[0];
  const durationMinutes = service.durationMinutes;
  
  const startDateTimeStr = `${isoDate}T${booking.time}:00`;
  const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
  if (!start.isValid()) throw new Error("Formatul datei/orei este indisponibil.");
  
  const end = start.add(durationMinutes, 'minute');
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  let targetCalendarId: string | undefined;
  let targetDoctorName: string = "Echipa DentalVoice";
  let targetDoctorId: string = "any";

  const doctorId = booking.doctorId;
  const calendarIdFromMapping = getCalendarIdForDoctor(doctorId);
  let targetDoctor = BUSINESS_CONFIG.resources.find(d => d.calendarId === calendarIdFromMapping);
  
  if (doctorId === 'any') {
    const availableDoctors = [];
    for (const d of BUSINESS_CONFIG.resources) {
      if (!d.calendarId) continue;
      if (!isDoctorWorking(d, isoDate, booking.time, durationMinutes)) continue;

      const checkResponse = await calendar.events.list({
        calendarId: d.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });
      
      if (!checkResponse.data.items || checkResponse.data.items.length === 0) {
        const dayStart = dayjs.tz(`${isoDate}T00:00:00`, BUCHAREST_TZ).toISOString();
        const dayEnd = dayjs.tz(`${isoDate}T23:59:59`, BUCHAREST_TZ).toISOString();
        const loadCheck = await calendar.events.list({
          calendarId: d.calendarId,
          timeMin: dayStart,
          timeMax: dayEnd,
          singleEvents: true,
        });
        const totalLoad = loadCheck.data.items?.length || 0;
        availableDoctors.push({ doctor: d, totalLoad });
      }
    }
    
    if (availableDoctors.length > 0) {
      availableDoctors.sort((a, b) => a.totalLoad - b.totalLoad);
      targetDoctor = availableDoctors[0].doctor;
    }
  } else {
    if (targetDoctor && !isDoctorWorking(targetDoctor, isoDate, booking.time, durationMinutes)) {
      targetDoctor = undefined;
    } else if (targetDoctor && targetDoctor.calendarId) {
      const checkResponse = await calendar.events.list({
        calendarId: targetDoctor.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });
      if (checkResponse.data.items && checkResponse.data.items.length > 0) {
        targetDoctor = undefined;
      }
    }
  }

  if (!targetDoctor || !targetDoctor.calendarId) {
    throw new Error("Ne pare rău, dar niciun medic nu mai este disponibil pentru acest interval.");
  }

  targetCalendarId = targetDoctor.calendarId;
  targetDoctorName = targetDoctor.name;
  targetDoctorId = targetDoctor.id;

  const event = {
    summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
    description: `📞 Telefon: ${booking.phone}\n📋 Serviciu: ${booking.service}\n👨‍⚕️ Medic: ${targetDoctorName}\n🤖 Status: Programare prin DentalVoice AI (${channel})\n✅ Verificat: ${verified ? 'DA (WhatsApp)' : 'NU (Necesită SMS)'}`,
    start: { dateTime: start.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
    end: { dateTime: end.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
  };

  const response = await calendar.events.insert({
    calendarId: targetCalendarId,
    requestBody: event,
  });

  return {
    googleEventId: response.data.id,
    doctorName: targetDoctorName,
    doctorId: targetDoctorId,
    calendarId: targetCalendarId,
    assignedMessage: booking.doctorId === 'any' ? `Ați fost repartizat(ă) la: ${targetDoctorName}` : undefined
  };
};

// --- RUTE API ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", business: BUSINESS_CONFIG.name });
});

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

// Verbose logging for busy slots
app.get("/api/busy-slots", async (req, res) => {
  const { doctorId, timeMin, timeMax } = req.query;
  
  if (!doctorId || !timeMin || !timeMax) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const calendarId = getCalendarIdForDoctor(doctorId as string);
  
  if (!calendarId) {
    console.error('❌ Error: Doctor configuration missing for:', doctorId);
    return res.status(400).json({ 
      error: "Doctor configuration missing", 
      receivedId: doctorId 
    });
  }

  try {
    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: timeMin as string,
      timeMax: timeMax as string,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = response.data.items?.map(event => ({
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
    })) || [];

    res.json(busySlots);
  } catch (error: any) {
    console.error('❌ Error fetching busy slots:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    clinicName: BUSINESS_CONFIG.name,
    whatsappNumber: CLINIC_INTEGRATION.whatsappNumber,
    whatsappText: CLINIC_INTEGRATION.whatsappText,
    facebookPageId: CLINIC_INTEGRATION.facebookPageId,
    messengerId: CLINIC_INTEGRATION.messengerId
  });
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

app.post("/api/webhook/whatsapp", protectRoute, async (req, res) => {
  try {
    const { from, text } = req.body;
    if (!from || !text) return res.status(400).json({ error: "From and text are required." });

    const lowerText = text.toLowerCase();
    const requiresIntervention = lowerText.includes('operator') || lowerText.includes('om') || lowerText.includes('ajutor');

    await getSupabase().from('live_traffic').insert([{
      clinic_id: CLINIC_INTEGRATION.clinicId,
      from_number: from,
      channel: 'WhatsApp',
      text,
      requires_intervention: requiresIntervention
    }]);

    let { data: sessionData } = await getSupabase().from('chat_sessions').select('*').eq('clinic_id', CLINIC_INTEGRATION.clinicId).eq('phone_number', from).single();
    let session: ChatSession = sessionData ? { step: sessionData.step, data: sessionData.data || {} } : { step: 'idle', data: {} };

    let reply = "Bună! Sunt Denti. Vrei să faci o programare?";
    // Simple logic for demo purposes
    if (lowerText.includes('da')) {
      reply = "Ce serviciu te interesează? (Consultație, Albire, Igienizare)";
      session.step = 'awaiting_service';
    }

    await getSupabase().from('chat_sessions').upsert({
      clinic_id: CLINIC_INTEGRATION.clinicId,
      phone_number: from,
      step: session.step,
      data: session.data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'clinic_id,phone_number' });

    return res.json({ success: true, reply, session: session.step });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/send-otp", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone required." });
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  otpSessions.set(phone, code);
  console.log(`[OTP] ${phone}: ${code}`);
  res.json({ success: true, code });
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
    await getSupabase().from('appointments').insert([{
      clinic_id: CLINIC_INTEGRATION.clinicId,
      first_name: booking.firstName,
      last_name: booking.lastName,
      phone: booking.phone,
      email: booking.email,
      service: booking.service,
      doctor_id: result.doctorId,
      doctor_name: result.doctorName,
      date: booking.date,
      time: booking.time,
      google_event_id: result.googleEventId,
      channel: booking.channel || 'Web',
      status: 'Confirmed'
    }]);

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

app.post("/api/send-confirmation", protectRoute, async (req, res) => {
  const { email, booking } = req.body;
  try {
    const dateParts = booking.date.split('-').map(Number);
    const timeParts = booking.time.split(':').map(Number);
    const durationMinutes = 30;

    const event: ics.EventAttributes = {
      start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
      duration: { minutes: durationMinutes },
      title: `🦷 Programare ${BUSINESS_CONFIG.name}: ${booking.service}`,
      description: `Programare pentru ${booking.firstName} ${booking.lastName}.`,
      location: BUSINESS_CONFIG.location,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: BUSINESS_CONFIG.name, email: TECH_CONFIG.email.user || 'contact@dentalvoice.ro' },
    };

    const { error, value } = ics.createEvent(event);
    if (error) throw error;

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
            <a href="${BUSINESS_CONFIG.mapsLink}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
            ${BUSINESS_CONFIG.wazeLink ? `<a href="${BUSINESS_CONFIG.wazeLink}" style="background-color: #33ccff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; margin-left: 10px;">Waze</a>` : ''}
          </div>
        </div>
      </div>
    `;

    await sendEmail(email, `Confirmare Programare - ${BUSINESS_CONFIG.name}`, mailHtml, [{ filename: 'programare.ics', content: value }]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Eroare la trimiterea email-ului." });
  }
});

export default app;
