# DentalVoice — Do Not Break (Guardrails)

Reguli consolidate din `history.cursorrules` și `.cursorrules` curent. **Încălcare = regresie producție.**

---

## 1. Timezone & date

- ❌ `toISOString()` pentru „data de azi” sau comparații dată
- ✅ `dayjs().tz('Europe/Bucharest')` / `BUCHAREST_TZ` în backend
- ✅ `format(date, 'yyyy-MM-dd')` (date-fns) în frontend
- ❌ Eroare „weekend” înainte de validarea existenței datei
- ❌ Sloturi trecute azi în `/api/calendar/slots` — filtrare ora București + buffer (`SLOT_BUFFER_TODAY_MINUTES`)

---

## 2. Multi-tenancy & baze de date

- ❌ Query/insert fără `clinic_id` pe: appointments, doctors, services, blocked_slots, temp_reservations, unlocked_slots, clinic_config, clinic_holidays, reminder_log
- ❌ Hardcod `beautiful-smile-demo` — folosiți `getClinicId()`
- ❌ `SUPABASE_ANON_KEY` în backend pentru tabele
- ❌ Grant SELECT/INSERT/UPDATE/DELETE către `anon` / `authenticated`
- ❌ RLS care permite acces direct din client
- ❌ Upsert `clinic_config` fără `clinic_id` și `onConflict: 'clinic_id,key'`
- ❌ Query Supabase direct din `SettingsSection` — folosiți `/api/doctors`, `/api/config`, etc.

---

## 3. Rezervări & sloturi

- ❌ Creare programări în afara `processBooking()`
- ❌ Duplicare logică `processBooking()` în alt fișier
- ❌ `BUSINESS_CONFIG.resources` sau `BUSINESS_CONFIG.services` ca sursă de adevăr — DB via `getCachedDoctors` / `getServicesFromDB`
- ❌ Deschidere Add Appointment **fără** `temp_reservations` în `onSlotClick`
- ❌ Uitare eliberare `tempReservationId` la close / success / conflict
- ❌ `blocked_slots` pentru rezervări temporare — doar `temp_reservations`
- ❌ Sărbătoare fără `blocked_slots` pentru toți medicii
- ❌ `.map()` pe răspunsul `/api/calendar/slots` — folosiți `data.slots`
- ❌ Stare nouă WhatsApp fără `case` în `runWhatsappStateMachine()`
- ❌ Confirmare WebBot/WhatsApp fără verificare disponibilitate slot înainte de stare confirmare
- ❌ `MAX_ACTIVE_BOOKINGS` doar la final — obligatoriu și la `awaiting_phone_confirm`
- ❌ Telefon raw în DB — `sanitizePhone` / `phone_normalized`
- ❌ `DELETE /api/delete-booking` cu `{ id }` — necesită `{ phone, date, time }`

---

## 4. Auth, securitate, API

- ❌ `VITE_ADMIN_API_KEY` în cod frontend sau bundle
- ❌ Rute admin fără `verifySupabaseJWT` (sau echivalent actual)
- ❌ `verifySupabaseJWT` pe `/api/webhook/whatsapp` sau WebBot public
- ❌ Stack traces în răspunsuri API producție
- ❌ Răspunsuri HTML la erori — doar JSON + middleware global
- ❌ `app.listen()` în `api/index.ts` pentru Vercel
- ❌ Import `api/` fără extensie `.js`
- ❌ Import din `../server/`
- ❌ Email confirmare fără atașament `.ics` și link Google Maps clinică

---

## 5. Widget embed

- ❌ Setare `iframe.src` la load pagină — doar la primul click
- ❌ Auth guard pe `/embed/chat`
- ❌ `embedded={false}` în `EmbedChatPage`
- ❌ Eliminare `frame-ancestors: *` pe `/embed/*` în `vercel.json`
- ❌ `baseUrl` hardcodat în `widget.js`

---

## 6. Remindere & cron

- ❌ Trimitere reminder fără `calculateReminderSendTime()` (respect ore lucru)
- ❌ Template reminder hardcodat — `clinic_config.reminder_message_template`
- ❌ INSERT `reminder_log` înainte de confirmarea trimiterii reușite
- ❌ Modificare `rawBody` / parsing urlencoded webhook Twilio fără review securitate

---

## 7. UI Settings & UX

- ❌ `alert()` în `SettingsSection`
- ❌ Carduri Settings în afara condiționalelor `activeTab`
- ❌ „Oricare medic disponibil” în dropdown filtru calendar header (`all` ≠ `any`)
- ❌ Schimbare flux GDPR ChatWidget: păstrați `isGdprChecked` vs `isGdprAccepted` separate

---

## 8. SEO / GEO / legal (critic marketing)

- ❌ Ștergere/modificare FAQ `#intrebari-frecvente` în `LandingPage.tsx` fără instrucțiune explicită
- ❌ Eliminare JSON-LD Schema.org din `index.html`
- ❌ Ștergere `public/llms.txt`
- ❌ Decomentare cod `// DEFERRED: facebook-channel` fără instrucțiune

---

## 9. Config & constante

- ❌ Magic numbers pentru OTP, buffer slot, cron window, greeting WhatsApp
- ❌ Timezone, adresă, telefon clinică hardcodate — env + `getConfig()` / `clinic_config`
- ❌ Dezactivare TypeScript strict pentru cod nou

---

## 10. Teste & refactor

- ❌ Modificare `api/index.ts` sau structură rute **doar** pentru a face testele să treacă, fără cerere explicită
- ✅ Rulează `npm run test -- --testPathPatterns=slot-availability` după schimbări pe disponibilitate sloturi
