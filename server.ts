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

    // Folosim direct isoDate trimis de frontend (ex: 2026-04-13)
    const isoDate = booking.isoDate || booking.date; 
    
    // Acum va forma corect: 2026-04-13T09:00:00
    const startDateTime = `${isoDate}T${booking.time}:00`;
    const startISO = new Date(startDateTime).toISOString();
    
    // Calculăm finalul (peste 30 de minute)
    const endDate = new Date(new Date(startDateTime).getTime() + 30 * 60000);
    const endDateTime = endDate.toISOString();

    try {
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
    const { date } = req.query; // format YYYY-MM-DD
    const timeMin = `${date}T00:00:00Z`;
    const timeMax = `${date}T23:59:59Z`;

    try {
      const response = await calendar.events.list({
        calendarId: CALENDAR_ID,
        timeMin: timeMin,
        timeMax: timeMax,
        singleEvents: true,
      });

      const busySlots = response.data.items?.map(event => {
        const start = event.start?.dateTime || event.start?.date;
        return start ? new Date(start).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }) : null;
      }).filter(Boolean);

      res.json({ busySlots });
    } catch (error) {
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
