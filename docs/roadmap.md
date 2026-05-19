# DentalVoice — Roadmap & Status

**Versiune curentă documentație:** v4.3.0 (Mai 2026)  
**Sursă istoric:** `history.cursorrules` (v3.0 → v4.2) + `.cursorrules` (fixes testare)

---

## Status actual (Mai 2026)

| Zonă | Status |
|------|--------|
| Calendar intern Supabase | ✅ Producție |
| Dashboard recepție (4 secțiuni, RO) | ✅ Producție |
| Supabase Auth + JWT pe rute admin | ✅ v4.1 |
| WhatsApp via Twilio (nu Meta) | ✅ v4.2 |
| Widget embed + lazy iframe | ✅ v4.0 |
| Parametrizare env (`getConfig`) | ✅ v3.9 |
| Multi-tenant `clinic_id` + RLS deny-all | ✅ v3.8 |
| Remindere SMS/WhatsApp + working hours | ✅ v3.7+ |
| Rate limiting API | ✅ |
| TypeScript `tsc --noEmit` | ✅ 0 erori (Mai 2026) |
| Jest slot-availability | ✅ 7 teste (18 Mai 2026) |
| Pagini legale GDPR | ✅ v4.3 |
| Stabilizare sprint 09.05.2026 | ✅ Complet |

### Fixuri recente (fază testare Windsurf)

- **WhatsApp webhook:** `rawBody` pentru urlencoded; `verifyTwilioSignature` skip fără header (simulator); `TWILIO_WEBHOOK_URL` în Vercel
- **SettingsSection:** fără query Supabase direct; medici prin `/api/doctors`; `clinic_id` din props
- **ChatWidget:** „Oricare medic disponibil” + fix GDPR checkbox/popup
- **Securitate:** `protectRoute` pe send-confirmation, messenger simulate; rate limit OTP/search

---

## Completat (istoric condensat)

- v3.0 — Eliminare Google Calendar; tabele doctors/services/blocked_slots
- v3.1 — Supabase Auth; LandingPage servicii; Messenger amânat
- v3.2 — Split componente; TS strict; Jest; default Week view
- v3.3 — RLS + SERVICE_ROLE; phone normalization îmbunătățit
- v3.4 — Load balancing Rule 3; unlocked_slots; cross-phone OTP
- v3.5 — Concedii `group_id`; temp_reservations; parolă Settings
- v3.6 — CRUD doctors/services/holidays; remindere WhatsApp; cache medici
- v3.7 — Remindere SMS + template; cron reminders
- v3.8 — `clinic_id` pe unlocked/temp; `getClinicId()`
- v3.9 — Parametrizare magic numbers
- v4.0 — widget.js, `/embed/chat`
- v4.1 — JWT în loc de cheie admin în frontend
- v4.2 — Migrare Twilio WhatsApp
- v4.3 — Confidentialitate/Termeni; footer links

---

## Următorii pași (priorități reale)

1. **Analytics în dashboard** — metrici programări, canale, conversie
2. **Mobile responsive** — layout recepție pe tablete/telefoane
3. **Acoperire teste** — extindere dincolo de slot-availability (booking, calendar views)
4. **SMS confirmări** — integrare completă flux OTP/confirm (parțial pregătit în shared)

*Notă roadmap vechi „WhatsApp API integration” — înlocuit de Twilio v4.2; considerați itemul închis.*

---

## Taskuri mici utile (backlog)

- [ ] Teste componente `WeekView` / `DayView` după fixuri timezone
- [ ] Documentare env per tenant în README deploy
- [ ] Verificare periodică `npm audit` după upgrade `@vercel/node`
- [ ] `WhatsappTest.tsx` — aliniere tipuri rămase din audit (non-blocant)

---

## Infrastructură & deploy

- Cron: **cron-job.org** + `CRON_SECRET` (nu Vercel crons în `vercel.json`)
- `api/tsconfig.json`: NodeNext; frontend strict în `src/`
- Scripts: `npm run test`, `test:watch`, `test:coverage`
- `noUnusedLocals/Parameters: false` — intenționat în fază dev
- `exactOptionalPropertyTypes` — eliminat intenționat

---

## Referință sprint stabilizare (2026-05-09)

Grupuri finalizate din `AUDIT_2025-05-09.md`:

1. TypeScript cleanup (`Appointment` unificat, `bookingData`, `doctorFormData.id`)
2. Timezone — `dayjs.tz` backend, `date-fns` frontend
3. Locale RO — `ZILE_RO` / `LUNI_RO` / `formatRomanianDate()`
4. Auth — `verifySupabaseJWT` pe holidays, config, admin routes
5. Security — semnătură webhook (ulterior migrat Twilio), eliminare cod Google Calendar mort
