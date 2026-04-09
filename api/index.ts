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

const app = express();

// ==========================================
// 0. SUPABASE CONFIG
// ==========================================
const supabase = createClient(
  'https://gtnajfuoxnvyepxjluut.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0bmFqZnVveG52eWVweGpsdXV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTY3NjI5MSwiZXhwIjoyMDkxMjUyMjkxfQ.DrmPDdE-TclqOLEqkNhzLRpD6R9VYo5iCDEMZugzjV4',
  { auth: { persistSession: false } }
);

// ==========================================
// 1. SAAS CONFIG (Multi-Tenant Integration)
// ==========================================
const CLINIC_INTEGRATION = {
  clinicId: "beautiful-smile-demo", // Forced hardcoded clinic ID
  whatsappNumber: process.env.WHATSAPP_NUMBER || "YOUR_WA_NUMBER",
  facebookPageId: process.env.FACEBOOK_PAGE_ID || "YOUR_FB_PAGE_ID",
  messengerId: process.env.MESSENGER_ID || "YOUR_MESSENGER_ID",
  whatsappText: "Bună! Vreau o programare prin DentalVoice."
};

// ==========================================
// 2. BUSINESS_CONFIG (Clinic Logic)
// ==========================================
const BUSINESS_CONFIG = {
  name: "Beautiful Smile",
  location: "Strada Clinicilor nr. 24, București",
  mapsLink: "https://goo.gl/maps/example",
  maxActiveBookingsPerPhone: 2,
  resources: [
    { 
      id: 'ionescu', 
      name: 'Ion Ionescu', 
      calendarId: 'andreifiruarmin@gmail.com',
      workingDays: [1, 2, 3, 4, 5], // Mon-Fri
      workingHours: { start: '09:00', end: '17:00' }
    },
    { 
      id: 'andreescu', 
      name: 'Andrei Andreescu', 
      calendarId: '55f3c24f61550654972c78f3c14592b5c36cebec18e2c80e13890ebf869519aa@group.calendar.google.com',
      workingDays: [1, 3, 5], // Mon, Wed, Fri
      workingHours: { start: '10:00', end: '18:00' }
    },
    { 
      id: 'simonescu', 
      name: 'Simona Simonescu', 
      calendarId: '60b90247e539f2363cbb0bfe86daa1751fedae2de7b672a04e627d66d8575a2f@group.calendar.google.com',
      workingDays: [2, 4], // Tue, Thu
      workingHours: { start: '09:00', end: '15:00' }
    }
  ],
  services: [
    { id: "consultatie", name: "Consultație", durationMinutes: 30, description: "Evaluare inițială și plan de tratament." },
    { id: "igienizare", name: "Igienizare", durationMinutes: 45, description: "Detartraj, periaj profesional și airflow." },
    { id: "albire", name: "Albire Profesională", durationMinutes: 120, description: "Albire dentară cu lampă ZOOM pentru un zâmbet strălucitor." },
    { id: "control", name: "Control Periodic", durationMinutes: 30, description: "Verificarea stării de sănătate orală la 6 luni." },
    { id: "urgenta", name: "Urgență Stomatologică", durationMinutes: 30, description: "Intervenție rapidă pentru dureri acute sau traumatisme." }
  ],
  scheduling: {
    timezone: 'Europe/Bucharest',
    slotStepMinutes: 30,
    minLeadTimeHours: 2,
    workingHours: { start: '09:00', end: '18:00' }
  }
};

// ==========================================
// 2. TECH_CONFIG (Credentials & Integrations)
// ==========================================
const TECH_CONFIG = {
  google: {
    serviceAccount: process.env.GOOGLE_SERVICE_ACCOUNT ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT) : {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
  },
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '465'),
    secure: process.env.EMAIL_PORT === '587' ? false : true
  },
  channels: {
    whatsapp: { number: process.env.WHATSAPP_NUMBER || "40700000000", text: "Bună! Vreau o programare prin DentalVoice." },
    messenger: { pageId: process.env.FACEBOOK_PAGE_ID || "123456789" }
  },
  frontendUrl: process.env.FRONTEND_URL || 'https://dentalvoice.ro'
};

const BUCHAREST_TZ = BUSINESS_CONFIG.scheduling.timezone;

// ==========================================
// 3. SECURITY & DATABASE
// ==========================================
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "dv-secret-key-2026";

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

app.use(express.json());

// Configurare Google Calendar
const auth = new google.auth.GoogleAuth({
  credentials: TECH_CONFIG.google.serviceAccount,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});
const calendar = google.calendar({ version: 'v3', auth });

// Session storage pentru OTP (Short-lived, keeping in-memory for now or move to DB if requested)
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

// Live Traffic Interface
interface TrafficEvent {
  id: string;
  from: string;
  channel: 'WhatsApp' | 'Messenger' | 'Web';
  text: string;
  timestamp: string;
  requiresIntervention?: boolean;
}

// --- HELPER FUNCTIONS ---

const countActiveBookings = async (phone: string) => {
  const now = new Date().toISOString();
  const searchPromises = BUSINESS_CONFIG.resources.map(d => 
    calendar.events.list({
      calendarId: d.calendarId,
      timeMin: now,
      q: phone,
      singleEvents: true,
    })
  );

  const results = await Promise.all(searchPromises);
  let count = 0;
  for (const res of results) {
    const items = res.data.items || [];
    // Verificăm dacă numărul de telefon este într-adevăr în descriere
    count += items.filter(event => event.description?.includes(phone)).length;
  }
  return count;
};

const isDoctorWorking = (doctor: any, date: string, time: string, durationMinutes: number = 30) => {
  const dayOfWeek = dayjs.tz(date, BUCHAREST_TZ).day(); // 0=Sun, 1=Mon...
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
  // 1. Anti-Spam / Rate Limiting Logic (STRICTLY PRESERVED)
  const activeBookingsCount = await countActiveBookings(booking.phone);
  if (activeBookingsCount >= BUSINESS_CONFIG.maxActiveBookingsPerPhone) {
    throw new Error(`Ați atins limita maximă de ${BUSINESS_CONFIG.maxActiveBookingsPerPhone} programări active.`);
  }

  // Multichannel Verification Logic
  const channel = booking.channel || 'Web';
  let requires_sms_otp = false;
  let verified = false;

  if (channel === 'Web' || channel === 'Messenger') {
    requires_sms_otp = true;
  } else if (channel === 'WhatsApp') {
    verified = true;
  }

  const isoDate = parseRomanianDate(booking.date);
  if (!isoDate) throw new Error("Data programării este indisponibilă.");
  
  const doctorId = booking.doctorId;
  let targetDoctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  
  if (doctorId !== 'any' && !targetDoctor) {
    throw new Error("Medicul selectat este indisponibil.");
  }
  
  const startDateTimeStr = `${isoDate}T${booking.time}:00`;
  const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
  if (!start.isValid()) throw new Error("Formatul datei/orei este indisponibil.");
  
  const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service || s.id === booking.service) || BUSINESS_CONFIG.services[0];
  const durationMinutes = service.durationMinutes;
  const end = start.add(durationMinutes, 'minute');
  
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  // CORE LOGIC: Smart Routing & Dynamic Durations (STRICTLY PRESERVED)
  if (doctorId === 'any') {
    const availableDoctors = [];
    for (const d of BUSINESS_CONFIG.resources) {
      if (!isDoctorWorking(d, isoDate, booking.time, durationMinutes)) continue;

      const checkResponse = await calendar.events.list({
        calendarId: d.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });
      
      if (!checkResponse.data.items || checkResponse.data.items.length === 0) {
        const beforeStart = start.subtract(30, 'minute').toISOString();
        const beforeEnd = start.toISOString();
        const gapCheck = await calendar.events.list({
          calendarId: d.calendarId,
          timeMin: beforeStart,
          timeMax: beforeEnd,
          singleEvents: true,
        });
        const hasGap = !gapCheck.data.items || gapCheck.data.items.length === 0;
        
        const dayStart = dayjs.tz(`${isoDate}T00:00:00`, BUCHAREST_TZ).toISOString();
        const dayEnd = dayjs.tz(`${isoDate}T23:59:59`, BUCHAREST_TZ).toISOString();
        const loadCheck = await calendar.events.list({
          calendarId: d.calendarId,
          timeMin: dayStart,
          timeMax: dayEnd,
          singleEvents: true,
        });
        const totalLoad = loadCheck.data.items?.length || 0;
        
        availableDoctors.push({ doctor: d, hasGap, totalLoad });
      }
    }
    
    if (availableDoctors.length > 0) {
      availableDoctors.sort((a, b) => {
        if (a.hasGap !== b.hasGap) return a.hasGap ? -1 : 1;
        return a.totalLoad - b.totalLoad;
      });
      targetDoctor = availableDoctors[0].doctor;
    }
  } else {
    if (!isDoctorWorking(targetDoctor, isoDate, booking.time, durationMinutes)) {
      targetDoctor = undefined;
    } else {
      const checkResponse = await calendar.events.list({
        calendarId: targetDoctor!.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });
      if (checkResponse.data.items && checkResponse.data.items.length > 0) {
        targetDoctor = undefined;
      }
    }
  }

  if (!targetDoctor) {
    throw new Error("Ne pare rău, dar niciun medic nu mai este disponibil pentru acest interval.");
  }

  const event = {
    summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
    description: `📞 Telefon: ${booking.phone}\n📋 Serviciu: ${booking.service}\n👨‍⚕️ Medic: ${targetDoctor.name}\n🤖 Status: Programare prin DentalVoice AI (${channel})\n✅ Verificat: ${verified ? 'DA (WhatsApp)' : 'NU (Necesită SMS)'}`,
    start: { dateTime: start.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
    end: { dateTime: end.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
  };

  const response = await calendar.events.insert({
    calendarId: targetDoctor.calendarId,
    requestBody: event,
  });

  return {
    googleEventId: response.data.id,
    doctorName: targetDoctor.name,
    doctorId: targetDoctor.id,
    assignedMessage: doctorId === 'any' ? `Ați fost repartizat(ă) la: ${targetDoctor.name}` : undefined
  };
};

// --- RUTE API ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", business: BUSINESS_CONFIG.name });
});

// Public Config for Frontend (Dynamic Links)
app.get("/api/config", (req, res) => {
  try {
    res.json({
      clinicName: BUSINESS_CONFIG.name,
      whatsappNumber: CLINIC_INTEGRATION.whatsappNumber,
      whatsappText: CLINIC_INTEGRATION.whatsappText,
      facebookPageId: CLINIC_INTEGRATION.facebookPageId,
      messengerId: CLINIC_INTEGRATION.messengerId
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// --- LEADS API ---

app.post("/api/leads", async (req, res) => {
  try {
    const { clinicName, contactPerson, phone, address, message, tierInteres } = req.body;
    
    if (!clinicName || !contactPerson || !phone) {
      return res.status(400).json({ error: "Clinic name, contact person and phone are required." });
    }

    const { error } = await supabase
      .from('leads')
      .insert([{
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
    
    res.status(201).json({ success: true, message: "Solicitarea a fost trimisă! Te vom contacta în cel mai scurt timp." });
  } catch (error) {
    console.error('❌ Eroare Lead:', error);
    res.status(500).json({ error: "Eroare la salvarea solicitării." });
  }
});

app.get("/api/admin/leads", protectRoute, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .order('created_at', { ascending: false });
      
    if (error) throw error;

    // Map to camelCase for frontend compatibility
    const mappedLeads = data.map(l => ({
      id: l.id,
      clinicName: l.clinic_name,
      contactPerson: l.contact_person,
      phone: l.phone,
      address: l.address,
      message: l.message,
      tierInteres: l.tier_interes,
      status: l.status,
      timestamp: l.created_at
    }));

    res.json(mappedLeads);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Omnichannel Webhook Bridge
app.post("/api/webhook/messages", async (req, res) => {
  const { phone, message, channel, intent, data } = req.body;
  
  console.log(`[WEBHOOK] Mesaj primit de la ${phone} pe canalul ${channel}: ${message}`);

  try {
    // Boilerplate for intent routing
    if (intent === 'get_slots') {
      // Bridge to get-slots logic
      const { date, doctorId, serviceId } = data;
      // In a real scenario, this would call the logic from /api/busy-slots
      return res.json({ success: true, action: 'slots_requested', date });
    }

    if (intent === 'book') {
      // Bridge to Core Engine insert-event
      const result = await processBooking({
        ...data,
        phone,
        channel: channel || 'Webhook'
      });
      return res.json({ success: true, result });
    }

    res.json({ success: true, message: "Mesaj recepționat și procesat." });
  } catch (error: any) {
    console.error('[WEBHOOK ERROR]', error.message);
    res.status(400).json({ success: false, error: error.message });
  }
});

// WhatsApp Webhook Boilerplate (SaaS Model)
app.post("/api/webhook/whatsapp", protectRoute, async (req, res) => {
  try {
    const { from, text } = req.body;
    
    console.log("Supabase connection attempt for WhatsApp webhook...");
    
    if (!from || !text) {
      return res.status(400).json({ error: "From and text are required." });
    }

    const lowerText = text.toLowerCase();
    const requiresIntervention = lowerText.includes('operator') || lowerText.includes('om') || lowerText.includes('ajutor');

    // Track Live Traffic
    const { error: trafficError } = await supabase.from('live_traffic').insert([{
      clinic_id: 'beautiful-smile-demo',
      from_number: from,
      channel: 'WhatsApp',
      text,
      requires_intervention: requiresIntervention
    }]);

    if (trafficError) {
      console.error("Supabase Traffic Insert Error:", trafficError);
    }

    console.log(`[WHATSAPP] Mesaj de la ${from}: ${text} ${requiresIntervention ? '[INTERVENTION]' : ''}`);

    // Session Initialization from DB
    let { data: sessionData, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('clinic_id', 'beautiful-smile-demo')
      .eq('phone_number', from)
      .single();

    if (sessionError && sessionError.code !== 'PGRST116') {
      console.error('Error fetching session:', sessionError);
    }

    let session: ChatSession = sessionData ? {
      step: sessionData.step,
      data: sessionData.data || {}
    } : { step: 'idle', data: {} };

    let reply = "";

    // Simple NLU & Flow Handler
    const greetingKeywords = ['buna', 'salut', 'programare', 'programari', 'vrea sa vin', 'sloturi', 'buna ziua'];
    
    if (requiresIntervention) {
      reply = "Am înțeles. Un operator uman va prelua conversația în cel mai scurt timp. Te rugăm să aștepți.";
    } else if (greetingKeywords.some(k => lowerText.includes(k))) {
      reply = "Bună! Sunt Denti, asistentul tău virtual. Vrei să faci o programare astăzi?";
      session.step = 'idle';
    } else if (lowerText.includes('da') && session.step === 'idle') {
      reply = "Excelent! Ce serviciu te interesează? (Ex: Consultație, Albire, Igienizare)";
      session.step = 'awaiting_service';
    } else if (session.step === 'awaiting_service' || lowerText.includes('albire') || lowerText.includes('consult') || lowerText.includes('igienizare')) {
      const service = BUSINESS_CONFIG.services.find(s => 
        lowerText.includes(s.name.toLowerCase()) || lowerText.includes(s.id.toLowerCase())
      );
      
      if (service) {
        session.data.service = service.name;
        reply = `Am înțeles, ${service.name}. Pentru ce dată dorești programarea? (Ex: 15 Aprilie)`;
        session.step = 'awaiting_date';
      } else {
        reply = "Ne pare rău, nu am recunoscut serviciul. Te rugăm să alegi dintre: Consultație, Igienizare, Albire.";
      }
    } else if (session.step === 'awaiting_date') {
      const isoDate = parseRomanianDate(text);
      if (isoDate) {
        session.data.date = isoDate;
        reply = "Verific disponibilitatea... Te rog alege o oră: 09:00, 10:30, 14:00 sau 16:30?";
        session.step = 'awaiting_time';
      } else {
        reply = "Nu am înțeles data. Te rog folosește un format precum '15 Aprilie' sau '2026-04-15'.";
      }
    } else if (session.step === 'awaiting_time') {
      const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
      if (timeRegex.test(text)) {
        session.data.time = text;
        const doctorName = BUSINESS_CONFIG.resources[0].name; // Mocking first doctor for recap
        reply = `Perfect! Te-am notat pentru ${session.data.service} la data de ${session.data.date} ora ${session.data.time} cu Dr. ${doctorName}. Este corect?`;
        session.step = 'idle'; // Reset or move to confirmation
      } else {
        reply = "Te rugăm să alegi o oră validă (Ex: 09:00).";
      }
    } else {
      reply = "Scuze, nu am înțeles. Vrei o programare pentru Albire, Consultatie sau Igienizare? Scrie numele serviciului mai jos.";
    }

    // Save session back to DB
    const { error: upsertError } = await supabase
      .from('chat_sessions')
      .upsert({
        clinic_id: 'beautiful-smile-demo',
        phone_number: from,
        step: session.step,
        data: session.data,
        updated_at: new Date().toISOString()
      }, { onConflict: 'clinic_id,phone_number' });

    if (upsertError) console.error('Error saving session:', upsertError);

    return res.json({ success: true, reply, session: session.step });
  } catch (err: any) {
    console.error("WhatsApp Webhook Error:", err);
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.get("/api/admin/traffic", protectRoute, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('live_traffic')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error) throw error;

    res.json(data.map(t => ({
      id: t.id,
      from: t.from_number,
      channel: t.channel,
      text: t.text,
      timestamp: t.created_at,
      requiresIntervention: t.requires_intervention
    })));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Messenger Webhook Boilerplate (SaaS Model)
app.post("/api/webhook/messenger", async (req, res) => {
  // This endpoint handles incoming messages from Facebook Messenger
  const payload = req.body;
  console.log('[MESSENGER WEBHOOK] Payload:', JSON.stringify(payload));
  
  // Logic to handle page-scoped IDs and route to the Core Engine
  res.json({ success: true, status: 'received' });
});

app.post("/api/send-otp", (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: "Numărul de telefon este necesar." });

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    otpSessions.set(phone, code);

    console.log(`[OTP] Cod trimis către ${phone}: ${code}`);
    res.json({ success: true, code });
  } catch (error) {
    console.error('❌ Eroare OTP:', error);
    res.status(500).json({ error: "Eroare la trimiterea codului." });
  }
});

app.post("/api/bookings", protectRoute, async (req, res) => {
  const booking = req.body;
  
  try {
    // Verificare OTP
    if (booking.verificationCode) {
      const savedCode = otpSessions.get(booking.phone);
      if (!savedCode || savedCode !== booking.verificationCode) {
        return res.status(401).json({ error: "Codul de verificare este indisponibil sau a expirat." });
      }
      otpSessions.delete(booking.phone);
    }
    
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!booking.time || !timeRegex.test(booking.time)) {
      return res.status(400).json({ error: "Formatul orei este indisponibil." });
    }

    const result = await processBooking(booking);

    // Save to Supabase appointments table
    const { error: dbError } = await supabase
      .from('appointments')
      .insert([{
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

    if (dbError) console.error('Error saving appointment to DB:', dbError);

    res.status(201).json({ 
      success: true, 
      ...result
    });
  } catch (error: any) {
    console.error('❌ Eroare Booking:', error);
    res.status(error.message?.includes('limita maximă') ? 429 : 400).json({ error: error.message || "Eroare tehnică la procesarea programării." });
  }
});

// Clinic Dashboard Endpoints
app.get("/api/clinic/appointments", protectRoute, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', CLINIC_INTEGRATION.clinicId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });
      
    if (error) throw error;

    // Map to camelCase
    const mapped = data.map(a => ({
      id: a.id,
      firstName: a.first_name,
      lastName: a.last_name,
      phone: a.phone,
      email: a.email,
      service: a.service,
      doctorId: a.doctor_id,
      doctorName: a.doctor_name,
      date: a.date,
      time: a.time,
      googleEventId: a.google_event_id,
      channel: a.channel,
      status: a.status,
      createdAt: a.created_at
    }));

    res.json(mapped);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/clinic/appointments/:id/status", protectRoute, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  const { data, error } = await supabase
    .from('appointments')
    .update({ status })
    .eq('id', id)
    .select()
    .single();
    
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Fix the 'Cancel' Logic (CRITICAL)
app.delete("/api/bookings/:eventId", protectRoute, async (req, res) => {
  const { eventId } = req.params;
  const { doctorId, calendarId: queryCalendarId, email: patientEmail } = req.query;

  let targetCalendarId = queryCalendarId as string;
  let doctorName = "Echipa DentalVoice";

  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (doctor) {
    targetCalendarId = doctor.calendarId;
    doctorName = doctor.name;
  }

  if (!targetCalendarId) {
    return res.status(400).json({ error: "calendarId sau doctorId este necesar pentru anulare." });
  }

  console.log(`[DELETE] Se încearcă anularea evenimentului ${eventId} din calendarul ${targetCalendarId}`);

  try {
    // 1. Încercăm să obținem detaliile evenimentului înainte de ștergere pentru email
    let eventDetails: any = null;
    try {
      const getEvent = await calendar.events.get({
        calendarId: targetCalendarId,
        eventId: eventId
      });
      eventDetails = getEvent.data;
    } catch (e) {
      console.warn(`[DELETE] Nu s-au putut prelua detaliile evenimentului înainte de ștergere.`);
    }

    // 2. Ștergem evenimentul
    await calendar.events.delete({
      calendarId: targetCalendarId,
      eventId: eventId,
    });

    // 3. Trimitem email de confirmare pentru anulare dacă avem email-ul pacientului
    if (patientEmail && typeof patientEmail === 'string') {
      const dateStr = eventDetails?.start?.dateTime ? dayjs(eventDetails.start.dateTime).format('DD.MM.YYYY') : 'data stabilită';
      const timeStr = eventDetails?.start?.dateTime ? dayjs(eventDetails.start.dateTime).format('HH:mm') : '';
      
      const cancelHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #ef4444; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Programare Anulată</h1>
          </div>
          <div style="padding: 24px; color: #1e293b;">
            <p>Bună ziua,</p>
            <p>Programarea dumneavoastră la <strong>${doctorName}</strong> din data de <strong>${dateStr} ${timeStr}</strong> a fost anulată cu succes.</p>
            <p>Vă mulțumim și vă așteptăm cu altă ocazie!</p>
            <div style="margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              <p style="font-size: 14px; color: #64748b;">Echipa ${BUSINESS_CONFIG.name}</p>
            </div>
          </div>
        </div>
      `;
      
      await sendEmail(patientEmail, `❌ Programare Anulată - ${BUSINESS_CONFIG.name}`, cancelHtml);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Eroare Delete:', error);
    res.status(500).json({ error: "Nu am putut șterge programarea. Verificați dacă evenimentul mai există." });
  }
});

// CORE LOGIC: Global Search (Find/Edit)
app.get("/api/bookings/search", protectRoute, async (req, res) => {
  const { phone } = req.query;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: "Numărul de telefon este necesar." });
  }

  try {
    const searchPromises = BUSINESS_CONFIG.resources.map(d => 
      calendar.events.list({
        calendarId: d.calendarId,
        timeMin: new Date().toISOString(),
        q: phone,
        singleEvents: true,
      })
    );

    const results = await Promise.all(searchPromises);
    
    for (let i = 0; i < results.length; i++) {
      const items = results[i].data.items;
      if (items && items.length > 0) {
        const event = items[0];
        if (event.description?.includes(phone)) {
          return res.json({
            id: event.id,
            date: event.start?.dateTime?.split('T')[0] || event.start?.date,
            time: event.start?.dateTime?.split('T')[1]?.substring(0, 5),
            service: event.description?.split('\n').find(l => l.includes('Serviciu:'))?.split(': ')[1] || 'Serviciu',
            firstName: event.summary?.split(': ')[1]?.split(' ')[1] || '',
            lastName: event.summary?.split(': ')[1]?.split(' ')[0] || '',
            phone: phone,
            doctorId: BUSINESS_CONFIG.resources[i].id,
            doctorName: BUSINESS_CONFIG.resources[i].name,
            calendarId: BUSINESS_CONFIG.resources[i].calendarId, // Return calendarId for targeted deletion
            status: 'confirmed'
          });
        }
      }
    }

    res.status(404).json({ error: "Nu am găsit nicio programare activă." });
  } catch (error) {
    console.error('❌ Eroare Search:', error);
    res.status(500).json({ error: "Eroare la căutarea programării." });
  }
});

app.get("/api/busy-slots", async (req, res) => {
  const { date: dateQuery, doctorId, serviceId } = req.query;
  if (!dateQuery || typeof dateQuery !== 'string') {
    return res.status(400).json({ error: "Data este necesară." });
  }

  const date = parseRomanianDate(dateQuery);
  if (!date) {
    return res.status(400).json({ error: "Formatul datei este indisponibil." });
  }

  const service = BUSINESS_CONFIG.services.find(s => s.id === serviceId || s.name === serviceId) || BUSINESS_CONFIG.services[0];
  const durationMinutes = service.durationMinutes;

  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  try {
    const allPossibleSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30'];
    const busySlots: string[] = [];

    if (doctorId && doctorId !== 'any') {
      const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
      if (!doctor) return res.status(400).json({ error: "Medicul este indisponibil." });

      const response = await calendar.events.list({
        calendarId: doctor.calendarId,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });

      for (const slotTime of allPossibleSlots) {
        // Verificăm dacă medicul lucrează în acest slot pentru întreaga durată
        if (!isDoctorWorking(doctor, date, slotTime, durationMinutes)) {
          busySlots.push(slotTime);
          continue;
        }

        const slotStart = dayjs.tz(`${date}T${slotTime}:00`, BUCHAREST_TZ);
        const slotEnd = slotStart.add(durationMinutes, 'minute');

        const isBusy = response.data.items?.some(event => {
          const eventStart = dayjs(event.start?.dateTime || event.start?.date || "");
          const eventEnd = dayjs(event.end?.dateTime || event.end?.date || "");
          return (slotStart.isBefore(eventEnd) && slotEnd.isAfter(eventStart));
        });

        if (isBusy) busySlots.push(slotTime);
      }
    } else {
      const doctorResponses = await Promise.all(BUSINESS_CONFIG.resources.map(d => 
        calendar.events.list({
          calendarId: d.calendarId,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
        })
      ));

      for (const slotTime of allPossibleSlots) {
        const slotStart = dayjs.tz(`${date}T${slotTime}:00`, BUCHAREST_TZ);
        const slotEnd = slotStart.add(durationMinutes, 'minute');

        const doctorsBusyStatus = BUSINESS_CONFIG.resources.map((d, index) => {
          // Dacă medicul nu lucrează în acest slot pentru întreaga durată, este considerat "busy"
          if (!isDoctorWorking(d, date, slotTime, durationMinutes)) {
            return true;
          }

          const res = doctorResponses[index];
          return res.data.items?.some(event => {
            const eventStart = dayjs(event.start?.dateTime || event.start?.date || "");
            const eventEnd = dayjs(event.end?.dateTime || event.end?.date || "");
            return (slotStart.isBefore(eventEnd) && slotEnd.isAfter(eventStart));
          });
        });

        if (doctorsBusyStatus.every(status => status === true)) {
          busySlots.push(slotTime);
        }
      }
    }

    res.json({ busySlots });
  } catch (error) {
    console.error('❌ Eroare Busy-Slots:', error);
    res.status(500).json({ error: "Nu am putut citi calendarul." });
  }
});

app.post("/api/send-confirmation", async (req, res) => {
  const { email, booking } = req.body;

  if (!email || !booking) {
    return res.status(400).json({ error: "Email-ul și detaliile programării sunt necesare." });
  }

  try {
    const dateParts = booking.date.split('-').map(Number);
    const timeParts = booking.time.split(':').map(Number);
    
    const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service || s.id === booking.service) || BUSINESS_CONFIG.services[0];
    const durationMinutes = service.durationMinutes;

    const event: ics.EventAttributes = {
      start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
      duration: { minutes: durationMinutes },
      title: `🦷 Programare ${BUSINESS_CONFIG.name}: ${booking.service}`,
      description: `Programare pentru ${booking.firstName} ${booking.lastName} la clinica ${BUSINESS_CONFIG.name}. Medic: ${booking.doctorName || 'Echipa DentalVoice'}.`,
      location: BUSINESS_CONFIG.location,
      url: TECH_CONFIG.frontendUrl,
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: BUSINESS_CONFIG.name, email: TECH_CONFIG.email.user || 'contact@dentalvoice.ro' },
      startInputType: 'local',
      startOutputType: 'local'
    };

    const { error, value } = ics.createEvent(event);
    if (error) throw error;

    const assignedText = booking.doctorId === 'any' || !booking.doctorId ? `<p style="margin: 8px 0; color: #2563eb;"><strong>👨‍⚕️ Ați fost repartizat(ă) la:</strong> ${booking.doctorName || 'Echipa DentalVoice'}</p>` : `<p style="margin: 8px 0;"><strong>👨‍⚕️ Medic:</strong> ${booking.doctorName}</p>`;

    const mailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Confirmare Programare</h1>
          </div>
          <div style="padding: 24px; color: #1e293b;">
            <p>Bună ziua, <strong>${booking.firstName} ${booking.lastName}</strong>,</p>
            <p>Vă confirmăm programarea la clinica <strong>${BUSINESS_CONFIG.name}</strong>:</p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>📅 Dată:</strong> ${booking.date}</p>
              <p style="margin: 8px 0;"><strong>⏰ Oră:</strong> ${booking.time}</p>
              <p style="margin: 8px 0;"><strong>🦷 Serviciu:</strong> ${booking.service}</p>
              ${assignedText}
            </div>
            <p>📍 <strong>Locație:</strong> <a href="${BUSINESS_CONFIG.mapsLink}" style="color: #2563eb;">${BUSINESS_CONFIG.location}</a></p>
            <p style="margin-top: 24px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              💡 <em>Vă rugăm să veniți cu 10 minute mai devreme pentru formalități.</em>
            </p>
          </div>
        </div>
      `;

    await sendEmail(email, `🦷 Confirmare Programare - ${BUSINESS_CONFIG.name}`, mailHtml, [{ filename: 'programare.ics', content: value }]);
    res.json({ success: true, message: "Email trimis cu succes!" });
  } catch (error) {
    console.error('❌ Eroare Email:', error);
    res.status(500).json({ error: "Nu am putut trimite email-ul de confirmare." });
  }
});

export default app;
