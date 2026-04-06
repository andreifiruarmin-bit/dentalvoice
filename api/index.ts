import express from "express";
import cors from "cors";
import { google } from 'googleapis';

const app = express();

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

// --- RUTE API ---

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Serverul DentalVoice (Vercel) este activ" });
});

app.post("/api/bookings", async (req, res) => {
  const booking = req.body;
  
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
  
  const startDateTime = `${isoDate}T${booking.time}:00`;
  
  try {
    const startDate = new Date(startDateTime);
    if (isNaN(startDate.getTime())) throw new Error("Invalid Date");
    const startISO = startDate.toISOString();
    const endDate = new Date(startDate.getTime() + 30 * 60000);
    const endDateTime = endDate.toISOString();

    const checkResponse = await calendar.events.list({
      calendarId: CALENDAR_ID,
      timeMin: startISO,
      timeMax: endDateTime,
      singleEvents: true,
    });

    if (checkResponse.data.items && checkResponse.data.items.length > 0) {
      return res.status(409).json({ error: "Slotul este deja ocupat." });
    }

    const event = {
      summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
      description: `📞 Telefon: ${booking.phone}\n📋 Serviciu: ${booking.service}\n🤖 Status: Programare prin DentalVoice AI`,
      start: { dateTime: startISO, timeZone: 'Europe/Bucharest' },
      end: { dateTime: endDateTime, timeZone: 'Europe/Bucharest' },
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
      const slotStart = new Date(`${date}T${slotTime}:00+03:00`);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60000);

      const isBusy = response.data.items?.some(event => {
        const eventStart = new Date(event.start?.dateTime || event.start?.date || "");
        const eventEnd = new Date(event.end?.dateTime || event.end?.date || "");
        if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return false;
        return (slotStart < eventEnd) && (slotEnd > eventStart);
      });

      if (isBusy) busySlots.push(slotTime);
    }

    res.json({ busySlots });
  } catch (error) {
    res.status(500).json({ error: "Nu am putut citi calendarul" });
  }
});

export default app;
