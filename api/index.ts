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

const app = express();

// ==========================================
// 1. BUSINESS_CONFIG (Clinic Logic)
// ==========================================
const BUSINESS_CONFIG = {
  name: "Beautiful Smile",
  location: "Strada Clinicilor nr. 24, București",
  mapsLink: "https://goo.gl/maps/example",
  resources: [
    { id: 'ionescu', name: 'Ion Ionescu', email: 'andreifiruarmin@gmail.com' },
    { id: 'andreescu', name: 'Andrei Andreescu', email: '55f3c24f61550654972c78f3c14592b5c36cebec18e2c80e13890ebf869519aa@group.calendar.google.com' },
    { id: 'simonescu', name: 'Simona Simonescu', email: '60b90247e539f2363cbb0bfe86daa1751fedae2de7b672a04e627d66d8575a2f@group.calendar.google.com' }
  ],
  services: [
    { name: "Consultație", durationMinutes: 30 },
    { name: "Igienizare", durationMinutes: 45 },
    { name: "Albire Profesională", durationMinutes: 60 },
    { name: "Control Periodic", durationMinutes: 30 },
    { name: "Urgență Stomatologică", durationMinutes: 30 }
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
  frontendUrl: process.env.FRONTEND_URL || 'https://dentalvoice.ro'
};

const BUCHAREST_TZ = BUSINESS_CONFIG.scheduling.timezone;

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

// Session storage pentru OTP
const otpSessions = new Map<string, string>();

// --- HELPER FUNCTIONS ---

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

// --- RUTE API ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", business: BUSINESS_CONFIG.name });
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

app.post("/api/bookings", async (req, res) => {
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

    const isoDate = parseRomanianDate(booking.date);
    if (!isoDate) {
      return res.status(400).json({ error: "Data programării este indisponibilă." });
    }
    
    const doctorId = booking.doctorId;
    let targetDoctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
    
    if (doctorId !== 'any' && !targetDoctor) {
      return res.status(400).json({ error: "Medicul selectat este indisponibil." });
    }
    
    const startDateTimeStr = `${isoDate}T${booking.time}:00`;
    const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
    if (!start.isValid()) throw new Error("Invalid Date");
    
    const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service) || BUSINESS_CONFIG.services[0];
    const end = start.add(service.durationMinutes, 'minute');
    
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();

    // CORE LOGIC: Smart Search ('Any Doctor')
    if (doctorId === 'any') {
      for (const d of BUSINESS_CONFIG.resources) {
        const checkResponse = await calendar.events.list({
          calendarId: d.email,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
        });
        
        if (!checkResponse.data.items || checkResponse.data.items.length === 0) {
          targetDoctor = d;
          break;
        }
      }
    } else {
      const checkResponse = await calendar.events.list({
        calendarId: targetDoctor!.email,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });
      if (checkResponse.data.items && checkResponse.data.items.length > 0) {
        targetDoctor = undefined;
      }
    }

    if (!targetDoctor) {
      return res.status(409).json({ error: "Ne pare rău, dar niciun medic nu mai este disponibil pentru acest interval." });
    }

    const event = {
      summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
      description: `📞 Telefon: ${booking.phone}\n📋 Serviciu: ${booking.service}\n👨‍⚕️ Medic: ${targetDoctor.name}\n🤖 Status: Programare prin DentalVoice AI`,
      start: { dateTime: start.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
      end: { dateTime: end.format('YYYY-MM-DDTHH:mm:ss'), timeZone: BUCHAREST_TZ },
    };

    const response = await calendar.events.insert({
      calendarId: targetDoctor.email,
      requestBody: event,
    });

    res.status(201).json({ 
      success: true, 
      googleEventId: response.data.id,
      doctorName: targetDoctor.name,
      doctorId: targetDoctor.id
    });
  } catch (error) {
    console.error('❌ Eroare Booking:', error);
    res.status(500).json({ error: "Eroare tehnică la procesarea programării." });
  }
});

app.delete("/api/bookings/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const { doctorId } = req.query;

  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (!doctor) {
    return res.status(400).json({ error: "Medicul este indisponibil." });
  }

  try {
    await calendar.events.delete({
      calendarId: doctor.email,
      eventId: eventId,
    });
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Eroare Delete:', error);
    res.status(500).json({ error: "Nu am putut șterge programarea." });
  }
});

// CORE LOGIC: Global Search (Find/Edit)
app.get("/api/bookings/search", async (req, res) => {
  const { phone } = req.query;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: "Numărul de telefon este necesar." });
  }

  try {
    const searchPromises = BUSINESS_CONFIG.resources.map(d => 
      calendar.events.list({
        calendarId: d.email,
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
  const { date: dateQuery, doctorId } = req.query;
  if (!dateQuery || typeof dateQuery !== 'string') {
    return res.status(400).json({ error: "Data este necesară." });
  }

  const date = parseRomanianDate(dateQuery);
  if (!date) {
    return res.status(400).json({ error: "Formatul datei este indisponibil." });
  }

  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  try {
    const allPossibleSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const busySlots: string[] = [];

    if (doctorId && doctorId !== 'any') {
      const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
      if (!doctor) return res.status(400).json({ error: "Medicul este indisponibil." });

      const response = await calendar.events.list({
        calendarId: doctor.email,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });

      for (const slotTime of allPossibleSlots) {
        const slotStart = dayjs.tz(`${date}T${slotTime}:00`, BUCHAREST_TZ);
        const slotEnd = slotStart.add(BUSINESS_CONFIG.scheduling.slotStepMinutes, 'minute');

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
          calendarId: d.email,
          timeMin: timeMin,
          timeMax: timeMax,
          singleEvents: true,
        })
      ));

      for (const slotTime of allPossibleSlots) {
        const slotStart = dayjs.tz(`${date}T${slotTime}:00`, BUCHAREST_TZ);
        const slotEnd = slotStart.add(BUSINESS_CONFIG.scheduling.slotStepMinutes, 'minute');

        const doctorsBusyStatus = doctorResponses.map(res => {
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
    
    const event: ics.EventAttributes = {
      start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
      duration: { minutes: 30 },
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

    const transporter = nodemailer.createTransport({
      host: TECH_CONFIG.email.host,
      port: TECH_CONFIG.email.port,
      secure: TECH_CONFIG.email.secure,
      auth: {
        user: TECH_CONFIG.email.user,
        pass: TECH_CONFIG.email.pass,
      },
    });

    const mailOptions = {
      from: `"${BUSINESS_CONFIG.name}" <${TECH_CONFIG.email.user}>`,
      to: email,
      subject: `🦷 Confirmare Programare - ${BUSINESS_CONFIG.name}`,
      html: `
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
              <p style="margin: 8px 0;"><strong>👨‍⚕️ Medic:</strong> ${booking.doctorName || 'Echipa DentalVoice'}</p>
            </div>
            <p>📍 <strong>Locație:</strong> <a href="${BUSINESS_CONFIG.mapsLink}" style="color: #2563eb;">${BUSINESS_CONFIG.location}</a></p>
            <p style="margin-top: 24px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              💡 <em>Vă rugăm să veniți cu 10 minute mai devreme pentru formalități.</em>
            </p>
          </div>
        </div>
      `,
      attachments: [{ filename: 'programare.ics', content: value }],
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email trimis cu succes!" });
  } catch (error) {
    console.error('❌ Eroare Email:', error);
    res.status(500).json({ error: "Nu am putut trimite email-ul de confirmare." });
  }
});

export default app;
