import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Mock Google Sheets API endpoints
  app.get("/api/availability", (req, res) => {
    const { date } = req.query;
    // In a real implementation:
    // 1. Authenticate with Google API
    // 2. Fetch rows from the sheet
    // 3. Filter by date and status
    // 4. Return available slots
    res.json({ slots: ['09:00', '11:00', '14:00', '16:00'] });
  });

  app.post("/api/bookings", (req, res) => {
    const booking = req.body;
    // In a real implementation with googleapis:
    // const auth = new google.auth.GoogleAuth({ ... });
    // const sheets = google.sheets({ version: 'v4', auth });
    // await sheets.spreadsheets.values.append({
    //   spreadsheetId: 'YOUR_SHEET_ID',
    //   range: 'Sheet1!A:G',
    //   valueInputOption: 'USER_ENTERED',
    //   requestBody: { values: [[booking.date, booking.time, booking.service, booking.firstName, booking.lastName, booking.phone, booking.status]] }
    // });
    console.log('Booking saved to Google Sheets (Mock):', booking);
    res.status(201).json({ success: true, booking });
  });

  app.post("/api/bookings/:id/cancel", (req, res) => {
    const { id } = req.params;
    console.log(`Booking ${id} cancelled in Google Sheets (Mock)`);
    res.json({ success: true });
  });

  // Vite middleware for development
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
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
