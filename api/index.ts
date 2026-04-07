import express from "express";
import cors from "cors";
import { google } from 'googleapis';
import nodemailer from 'nodemailer';
import * as ics from 'ics';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const app = express();
const BUCHAREST_TZ = 'Europe/Bucharest';

// Configurare CORS pentru domeniul specificat
app.use(cors({
  origin: ["https://dentalvoice.ro", "https://www.dentalvoice.ro", "http://localhost:3000"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
  credentials: true
}));

app.use(express.json());

// Configurare Google Calendar din variabila de mediu
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT || '{}');
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = 'andreifiruarmin@gmail.com';

// Session storage pentru OTP (în memorie - se resetează la restart serverless, dar OK pentru demo)
const otpSessions = new Map<string, string>();

// --- RUTE API ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Serverul DentalVoice (Vercel) este activ" });
});

app.post("/api/send-otp", (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Numărul de telefon este necesar." });

  // Generăm un cod de 4 cifre
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  otpSessions.set(phone, code);

  console.log(`[OTP] Cod trimis către ${phone}: ${code}`);
  
  // Returnăm codul pentru simulare (în producție reală, aici s-ar apela Twilio/SmsApi)
  res.json({ success: true, code });
});

app.post("/api/bookings", async (req, res) => {
  const booking = req.body;
  
  // Verificare OTP (opțional, dar recomandat pentru securitate)
  if (booking.verificationCode) {
    const savedCode = otpSessions.get(booking.phone);
    if (!savedCode || savedCode !== booking.verificationCode) {
      return res.status(401).json({ error: "Codul de verificare este invalid sau a expirat." });
    }
    // Ștergem codul după folosire
    otpSessions.delete(booking.phone);
  }
  
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!booking.time || !timeRegex.test(booking.time)) {
    return res.status(400).json({ error: "Formatul orei este invalid." });
  }

  let isoDate = booking.date;
  if (isoDate && !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    const monthsMap: { [key: string]: string } = {
      'ianuarie': '01', 'februarie': '02', 'martie': '03', 'aprilie': '04',
      'mai': '05', 'iunie': '06', 'iulie': '07', 'august': '08',
      'septembrie': '09', 'octombrie': '10', 'noiembrie': '11', 'decembrie': '12'
    };
    const parts = isoDate.toLowerCase().split(' ');
    const day = parts.find(p => /^\d+$/.test(p.replace(',', '')))?.replace(',', '').padStart(2, '0');
    const monthName = Object.keys(monthsMap).find(m => isoDate.toLowerCase().includes(m));
    if (day && monthName) {
      isoDate = `2026-${monthsMap[monthName]}-${day}`;
    }
  }

  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return res.status(400).json({ error: "Data programării este invalidă." });
  }
  
  const startDateTimeStr = `${isoDate}T${booking.time}:00`;
  
  try {
    // Forțăm interpretarea ca fiind ora locală a Bucureștiului
    const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
    if (!start.isValid()) throw new Error("Invalid Date");
    
    const end = start.add(30, 'minute');

    // Verificăm slotul folosind formatul ISO pentru interogare (care include offset-ul corect)
    const timeMin = start.toISOString();
    const timeMax = end.toISOString();

    const checkResponse = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
    });

    if (checkResponse.data.items && checkResponse.data.items.length > 0) {
      return res.status(409).json({ error: "Slotul este deja ocupat." });
    }

    const event = {
      summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
      description: `📞 Telefon: ${booking.phone}\n📋 Serviciu: ${booking.service}\n🤖 Status: Programare prin DentalVoice AI`,
      start: { 
        dateTime: start.format('YYYY-MM-DDTHH:mm:ss'), 
        timeZone: BUCHAREST_TZ 
      },
      end: { 
        dateTime: end.format('YYYY-MM-DDTHH:mm:ss'), 
        timeZone: BUCHAREST_TZ 
      },
    };

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: event,
    });

    res.status(201).json({ 
      success: true, 
      googleEventId: response.data.id
    });
  } catch (error) {
    console.error('❌ Eroare:', error);
    res.status(500).json({ error: "Eroare tehnică la Google Calendar." });
  }
});

app.delete("/api/bookings/:eventId", async (req, res) => {
  const { eventId } = req.params;
  try {
    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: eventId,
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Nu am putut șterge programarea." });
  }
});

app.get("/api/busy-slots", async (req, res) => {
  const dateQuery = req.query.date;
  if (!dateQuery || typeof dateQuery !== 'string') {
    return res.status(400).json({ error: "Data este necesară." });
  }

  let date = dateQuery;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const monthsMap: { [key: string]: string } = {
      'ianuarie': '01', 'februarie': '02', 'martie': '03', 'aprilie': '04',
      'mai': '05', 'iunie': '06', 'iulie': '07', 'august': '08',
      'septembrie': '09', 'octombrie': '10', 'noiembrie': '11', 'decembrie': '12'
    };
    const lowerDate = date.toLowerCase();
    const parts = lowerDate.split(' ');
    const day = parts.find(p => /^\d+$/.test(p.replace(',', '')))?.replace(',', '').padStart(2, '0');
    const monthName = Object.keys(monthsMap).find(m => lowerDate.includes(m));
    if (day && monthName) {
      date = `2026-${monthsMap[monthName]}-${day}`;
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Formatul datei este invalid." });
  }

  const timeMin = `${date}T00:00:00Z`;
  const timeMax = `${date}T23:59:59Z`;

  try {
    const response = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: timeMin,
      timeMax: timeMax,
      singleEvents: true,
    });

    const allPossibleSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    const busySlots: string[] = [];

    for (const slotTime of allPossibleSlots) {
      const slotStart = dayjs.tz(`${date}T${slotTime}:00`, BUCHAREST_TZ);
      const slotEnd = slotStart.add(30, 'minute');

      const isBusy = response.data.items?.some(event => {
        const eventStart = dayjs(event.start?.dateTime || event.start?.date || "");
        const eventEnd = dayjs(event.end?.dateTime || event.end?.date || "");
        if (!eventStart.isValid() || !eventEnd.isValid()) return false;
        return (slotStart.isBefore(eventEnd) && slotEnd.isAfter(eventStart));
      });

      if (isBusy) busySlots.push(slotTime);
    }

    res.json({ busySlots });
  } catch (error) {
    res.status(500).json({ error: "Nu am putut citi calendarul" });
  }
});

app.post("/api/send-confirmation", async (req, res) => {
  const { email, booking } = req.body;

  if (!email || !booking) {
    return res.status(400).json({ error: "Email-ul și detaliile programării sunt necesare." });
  }

  try {
    // 1. Generare fișier ICS
    const dateParts = booking.date.split('-').map(Number); // [2026, 4, 13]
    const timeParts = booking.time.split(':').map(Number); // [09, 00]
    
    const event: ics.EventAttributes = {
      start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
      duration: { minutes: 30 },
      title: `🦷 Programare DentalVoice: ${booking.service}`,
      description: `Programare pentru ${booking.firstName} ${booking.lastName} la clinica Beautiful Smile.`,
      location: 'Strada Clinicilor nr. 24, București',
      url: 'https://dentalvoice.ro',
      status: 'CONFIRMED',
      busyStatus: 'BUSY',
      organizer: { name: 'Beautiful Smile', email: process.env.EMAIL_USER || 'contact@dentalvoice.ro' },
      startInputType: 'local',
      startOutputType: 'local'
    };

    const { error, value } = ics.createEvent(event);
    if (error) throw error;

    // 2. Configurare Nodemailer
    // Sugestie: Pentru Vercel, Resend este excelent. 
    // Dacă folosiți Gmail, asigurați-vă că aveți "App Password" activat.
    const transporter = nodemailer.createTransport({
      service: 'gmail', // Schimbați cu host/port dacă folosiți Resend/SendGrid
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Beautiful Smile" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🦷 Confirmare Programare - DentalVoice',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #2563eb; padding: 24px; text-align: center; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Confirmare Programare</h1>
          </div>
          <div style="padding: 24px; color: #1e293b;">
            <p>Bună ziua, <strong>${booking.firstName} ${booking.lastName}</strong>,</p>
            <p>Vă confirmăm programarea la clinica <strong>Beautiful Smile</strong>:</p>
            <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 8px 0;"><strong>📅 Dată:</strong> ${booking.date}</p>
              <p style="margin: 8px 0;"><strong>⏰ Oră:</strong> ${booking.time}</p>
              <p style="margin: 8px 0;"><strong>🦷 Serviciu:</strong> ${booking.service}</p>
              <p style="margin: 8px 0;"><strong>👨‍⚕️ Medic:</strong> Dr. Ionescu (Echipa DentalVoice)</p>
            </div>
            <p>📍 <strong>Locație:</strong> <a href="https://goo.gl/maps/example" style="color: #2563eb;">Strada Clinicilor nr. 24, București</a></p>
            <p style="margin-top: 24px; font-size: 14px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              💡 <em>Vă rugăm să veniți cu 10 minute mai devreme pentru formalități.</em>
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: 'programare-dentalvoice.ics',
          content: value,
        },
      ],
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email trimis cu succes!" });
  } catch (error) {
    console.error('❌ Eroare trimitere email:', error);
    res.status(500).json({ error: "Nu am putut trimite email-ul de confirmare." });
  }
});

export default app;
