import 'dotenv/config';
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import app from "./api/index.js"; // Use .js extension for ESM compatibility with tsx

async function startServer() {
  const PORT = 3000;

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
    console.log(`--------------------------------------------------`);
    console.log(`🚀 DentalVoice Server running on http://localhost:${PORT}`);
    console.log(`🔒 API Security Layer Active`);
    console.log(`--------------------------------------------------`);
  });
}

startServer().catch(err => {
  console.error("Eroare la pornirea serverului:", err);
});
