import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { google } from 'googleapis';

// 1. Configurare Google Calendar - Aceasta rămâne în afara funcției startServer
const auth = new google.auth.GoogleAuth({
  keyFile: './dental2-492404-6ab1e2b45e01.json', 
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });
const CALENDAR_ID = 'andreifiruarmin@gmail.com';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 2. Middleware-uri esențiale (ORDINEA CONTEAZĂ!)
  app.use(cors()); // Permite browser-ului să comunice cu serverul
  app.use(express.json()); // Permite serverului să citească datele JSON trimise de chatbot

  // --- RUTE API ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Serverul DentalVoice este activ" });
  });

// Ruta principală pentru Google Calendar
  app.post("/api/bookings", async (req, res) => {
    const booking = req.body;
    console.log('Date primite de la frontend:', booking);

    // 1. Validare Timp (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
    if (!booking.time || !timeRegex.test(booking.time)) {
      console.log('⚠️ Eroare: Format timp invalid:', booking.time);
      return res.status(400).json({ error: "Formatul orei este invalid. Vă rugăm să alegeți o oră validă." });
    }

    // 2. Parsare Dată
    let isoDate = booking.date; // Așteptăm YYYY-MM-DD de la frontend

    // Fallback: Dacă primim format românesc (ex: "marți, 7 aprilie")
    if (isoDate && !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      const monthsMap: { [key: string]: string } = {
        'ianuarie': '01', 'februarie': '02', 'martie': '03', 'aprilie': '04',
        'mai': '05', 'iunie': '06', 'iulie': '07', 'august': '08',
        'septembrie': '09', 'octombrie': '10', 'noiembrie': '11', 'decembrie': '12'
      };

      const parts = isoDate.toLowerCase().split(' ');
      // Căutăm ziua și luna în string
      const day = parts.find(p => /^\d+$/.test(p.replace(',', '')))?.replace(',', '').padStart(2, '0');
      const monthName = Object.keys(monthsMap).find(m => isoDate.toLowerCase().includes(m));
      
      if (day && monthName) {
        isoDate = `2026-${monthsMap[monthName]}-${day}`;
        console.log(`🔄 Conversie dată românească: "${booking.date}" -> ${isoDate}`);
      }
    }

    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
      console.log('⚠️ Eroare: Dată invalidă:', booking.date);
      return res.status(400).json({ error: "Data programării este invalidă." });
    }
    
    // Acum va forma corect: 2026-04-13T09:00:00
    const startDateTime = `${isoDate}T${booking.time}:00`;
    
    try {
      const startDate = new Date(startDateTime);
      if (isNaN(startDate.getTime())) {
        throw new Error("Invalid Date object created");
      }
      const startISO = startDate.toISOString();
      
      // Calculăm finalul (peste 30 de minute)
      const endDate = new Date(startDate.getTime() + 30 * 60000);
      const endDateTime = endDate.toISOString();

      // 1. Verificăm dacă slotul este deja ocupat
      const checkResponse = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: startISO,
        timeMax: endDateTime,
        singleEvents: true,
      });

      if (checkResponse.data.items && checkResponse.data.items.length > 0) {
        console.log('⚠️ Conflict: Slot deja ocupat în Google Calendar');
        return res.status(409).json({ 
          error: "Slotul este deja ocupat. Vă rugăm să alegeți altă oră." 
        });
      }

      const event = {
        summary: `🦷 Programare: ${booking.firstName} ${booking.lastName}`,
        description: `
          📞 Telefon: ${booking.phone}
          📋 Serviciu: ${booking.service}
          🤖 Status: Programare prin DentalVoice AI
        `,
        start: {
          dateTime: startISO,
          timeZone: 'Europe/Bucharest',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'Europe/Bucharest',
        },
      };

      const response = await calendar.events.insert({
        calendarId: CALENDAR_ID,
        requestBody: event,
      });

      console.log('✅ Succes! Programare adăugată în Google Calendar:', response.data.htmlLink);
      res.status(201).json({ 
        success: true, 
        message: "Programare salvată în Calendar!",
        link: response.data.htmlLink,
        googleEventId: response.data.id
      });
    } catch (error) {
      console.error('❌ Eroare la salvarea în Calendar:', error);
      res.status(500).json({ error: "Eroare tehnică la Google Calendar." });
    }
  });

  // Ruta pentru ștergerea programării din Google Calendar
  app.delete("/api/bookings/:eventId", async (req, res) => {
    const { eventId } = req.params;
    console.log(`[BACKEND] Ștergere eveniment: ${eventId}`);

    try {
      await calendar.events.delete({
        calendarId: CALENDAR_ID,
        eventId: eventId,
      });
      console.log(`✅ Succes! Evenimentul ${eventId} a fost șters.`);
      res.json({ success: true, message: "Programarea a fost ștearsă din Google Calendar." });
    } catch (error) {
      console.error('❌ Eroare la ștergerea din Calendar:', error);
      res.status(500).json({ error: "Nu am putut șterge programarea din Google Calendar." });
    }
  });

  // --- CONFIGURARE VITE (Interfața Grafică) ---
  app.get("/api/busy-slots", async (req, res) => {
    const dateQuery = req.query.date;
    
    if (!dateQuery || typeof dateQuery !== 'string') {
      return res.status(400).json({ error: "Data este necesară." });
    }

    let date = dateQuery;

    // Fallback: Dacă primim format românesc (ex: "marți, 7 aprilie")
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

      // Definim sloturile pe care le verificăm (cele folosite de frontend)
      const allPossibleSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
      const busySlots: string[] = [];

      for (const slotTime of allPossibleSlots) {
        // Creăm intervalul slotului în ora locală a României (EEST - UTC+3 în Aprilie)
        const slotStart = new Date(`${date}T${slotTime}:00+03:00`);
        const slotEnd = new Date(slotStart.getTime() + 30 * 60000); // Slot de 30 minute

        const isBusy = response.data.items?.some(event => {
          const eventStart = new Date(event.start?.dateTime || event.start?.date || "");
          const eventEnd = new Date(event.end?.dateTime || event.end?.date || "");
          
          if (isNaN(eventStart.getTime()) || isNaN(eventEnd.getTime())) return false;

          // Verificare suprapunere: (StartA < EndB) și (EndA > StartB)
          return (slotStart < eventEnd) && (slotEnd > eventStart);
        });

        if (isBusy) {
          busySlots.push(slotTime);
        }
      }

      res.json({ busySlots });
    } catch (error) {
      console.error('❌ Eroare la citirea calendarului:', error);
      res.status(500).json({ error: "Nu am putut citi calendarul" });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 Server activ la: http://localhost:${PORT}`);
    console.log(`🦷 Gata pentru programări DentalVoice!`);
    console.log(`--------------------------------------------------`);
  });
}

startServer().catch(err => {
  console.error("Eroare la pornirea serverului:", err);
});
