# DentalVoice — Vision & Scope

## Scopul produsului

DentalVoice este o platformă de producție concepută ca **asistent digital de recepție** pentru clinici și cabinete stomatologice. Scopul principal:

- gestionarea programărilor printr-un calendar intern (fără Google Calendar);
- dashboard pentru recepție (calendar, programări, pacienți, setări);
- rezervări automate prin WebBot (widget embed) și WhatsApp (Twilio);
- remindere SMS/WhatsApp conform programului de lucru al clinicii;
- multi-tenant la nivel de `clinic_id` (o instanță Vercel = o clinică).

## Public țintă

| Segment | Rol |
|--------|-----|
| Recepționeri / administratori clinică | Utilizatori dashboard: calendar, programări, pacienți, setări |
| Medici | Resurse cu program, zile lucrătoare și sloturi; load balancing la `doctorId === 'any'` |
| Pacienți | Widget web (`/embed/chat`) sau WhatsApp pentru programări |

## Ce NU face produsul

- **Fără Google Calendar** — eliminat în v3.0; calendar intern Supabase; `google_event_id` rămâne null.
- **Fără Facebook Messenger** — cod comentat `// DEFERRED: facebook-channel`; nu implementați fără instrucțiune explicită.
- **Fără acces direct la DB din frontend** — tabele protejate RLS deny-all; doar backend cu `SERVICE_ROLE_KEY`.
- **Fără director `server/`** — tot backend-ul este în `/api` (Vercel serverless).
- **Fără expunere chei admin în browser** — `VITE_ADMIN_API_KEY` nu se folosește în frontend (v4.1+); auth prin Supabase JWT.
- **Nu este EMR/PMS complet** — nu înlocuiește fișa medicală, facturare sau inventar.

## Priorități funcționale

1. **Disponibilitate sloturi în timp real** — `temp_reservations`, verificare înainte de confirmare (WebBot/WhatsApp + API).
2. **Motor unic de rezervare** — `processBooking()` în `api/lib/booking.ts` ca singură sursă de adevăr.
3. **Multi-tenancy strict** — `clinic_id` pe toate operațiunile; `getClinicId()` din env.
4. **Remindere în ore de lucru** — `calculateReminderSendTime()`; SMS/WhatsApp via Twilio.
5. **Securitate producție** — JWT pe rute admin, rate limiting, JSON-only errors, fără stack traces în prod.
6. **Widget embed** — `public/widget.js`, lazy-load iframe, `/embed/chat` public.
7. **GEO / vizibilitate AI** — FAQ LandingPage, Schema.org, `public/llms.txt` (vezi `do-not-break.md`).

## Funcționalități amânate

- **Facebook Messenger** — păstrat comentat; nu decomentați fără cerere explicită.
- **Analytics avansat în dashboard** — pe roadmap, neimplementat.
- **Design mobile-first complet** — dashboard optimizat 1280px+; responsive extins = viitor.

## Context legal & încredere (v4.3)

- Pagini: `src/Confidentialitate.tsx`, `src/Termeni.tsx` (GDPR, română, contact: andrei@dentalvoice.ro).
- Footer LandingPage: linkuri `/confidentialitate`, `/termeni`.
- WebBot: consimțământ GDPR în formular; ChatWidget: separare `isGdprChecked` / `isGdprAccepted`.
