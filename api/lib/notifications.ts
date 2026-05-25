/**
 * DentalVoice Notification Services
 *
 * RESPONSIBILITY: Email, SMS, and ICS calendar attachment generation.
 * - Nodemailer transporter setup and email sending
 * - SMS simulation/stub (awaiting provider integration)
 * - .ics calendar file generation for booking confirmations
 * - Google Maps link generation for clinic address
 *
 * IMPORTS: shared.ts for TECH_CONFIG (SMTP) and getClinicConfig() for clinic details
 */

import nodemailer from 'nodemailer';
import * as ics from 'ics';
import { TECH_CONFIG, getClinicConfig, getClinicId, type ClinicConfig } from './shared.js';

const getTransporter = () => {
  const user = process.env['SMTP_USER'];
  const pass = process.env['SMTP_PASS'];

  if (!user || !pass) {
    throw new Error("SMTP credentials missing (SMTP_USER/SMTP_PASS)");
  }

  return nodemailer.createTransport({
    host: TECH_CONFIG.email.host,
    port: TECH_CONFIG.email.port,
    secure: TECH_CONFIG.email.secure,
    auth: { user, pass },
  });
};

const clinicConfigCache = new Map<string, { cfg: ClinicConfig; ts: number }>();
const CLINIC_CFG_TTL_MS = 60_000;

const resolveClinicConfig = async (clinic?: string | ClinicConfig): Promise<ClinicConfig> => {
  if (typeof clinic === 'object' && clinic) return clinic;
  const clinicId = typeof clinic === 'string' ? clinic : getClinicId();
  const cached = clinicConfigCache.get(clinicId);
  const now = Date.now();
  if (cached && now - cached.ts < CLINIC_CFG_TTL_MS) return cached.cfg;
  const cfg = await getClinicConfig(clinicId);
  clinicConfigCache.set(clinicId, { cfg, ts: now });
  return cfg;
};

/**
 * sendEmail — Send booking confirmation email with clinic-specific configuration
 * 
 * Uses getClinicConfig() to fetch clinic-specific sender name and email
 * Falls back to environment variables if DB unavailable
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  attachments?: any[],
  from?: { name?: string; address?: string },
  clinicId?: string
) => {
  try {
    const transporter = getTransporter();
    const currentClinicId = clinicId || getClinicId();
    const cfg = await resolveClinicConfig(currentClinicId);
    
    const fromAddress = from?.address?.trim() || cfg.senderEmail;
    const fromName = from?.name?.trim() || cfg.clinicName;

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      html,
      attachments
    });
    return true;
  } catch (error) {
    console.error('❌ Eroare Email:', error);
    return false;
  }
};

export async function sendSMS(to: string, message: string, clinic?: string | ClinicConfig): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    console.warn('[SMS] Twilio env vars missing — SMS skipped');
    return;
  }

  const cfg = await resolveClinicConfig(clinic);
  const fromNumber = cfg.twilioPhoneNumber;

  const twilio = (await import('twilio')).default;
  const client = twilio(accountSid, authToken);

  const toE164 = to.startsWith('+') ? to
    : to.startsWith('40') ? `+${to}`
    : to.startsWith('0') ? `+4${to}`
    : `+40${to}`;

  await client.messages.create({
    body: message,
    from: fromNumber,
    to: toE164,
  });
  console.log(`[SMS] Sent to ${toE164}`);
}

/**
 * sendWhatsAppMessage — Send a WhatsApp message via Twilio
 *
 * PARAMETRIZATION NOTE:
 * - Sender number read from TWILIO_WHATSAPP_NUMBER env var
 * - Sandbox:    TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
 * - Production: TWILIO_WHATSAPP_NUMBER=whatsapp:+40XXXXXXXXX  (change only env var, zero code change)
 * - Recipient 'to' must be E.164 format (e.g. +40721234567) — function adds whatsapp: prefix
 */
export async function sendWhatsAppMessage(to: string, message: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER; // e.g. whatsapp:+14155238886

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[WhatsApp] Twilio env vars missing — WhatsApp message skipped');
    return;
  }

  // Normalize to E.164 then add whatsapp: prefix
  const stripped = to.startsWith('whatsapp:') ? to.replace('whatsapp:', '') : to;
  const toE164 = stripped.startsWith('+') ? stripped
    : stripped.startsWith('40') ? `+${stripped}`
    : stripped.startsWith('0') ? `+4${stripped}`
    : `+40${stripped}`;
  const toFormatted = `whatsapp:${toE164}`;

  const twilio = (await import('twilio')).default;
  const client = twilio(accountSid, authToken);

  await client.messages.create({
    body: message,
    from: fromNumber,
    to: toFormatted,
  });

  console.log(`[WhatsApp] Sent to ${toFormatted}`);
}

/**
 * sendWhatsAppInteractive — Trimite mesaj WhatsApp cu butoane tap-abile
 *
 * Folosește Twilio Content API pentru Quick Reply buttons (≤3) sau
 * List Messages (4-10 butoane). Fallback automat la text simplu dacă API eșuează.
 *
 * SANDBOX → PRODUCȚIE: zero modificări cod — Content API funcționează identic.
 * Butoanele sunt create on-the-fly și cached în memorie pentru performanță.
 *
 * Când userul apasă un buton, Twilio trimite title-ul ca text simplu în Body —
 * state machine-ul existent procesează răspunsul fără nicio modificare.
 */

// Cache button combinations → Content Template SID (in-memory, refolosit per instanță)
const contentSidCache = new Map<string, string>();

export async function sendWhatsAppInteractive(
  to: string,
  body: string,
  buttons: string[]
): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.warn('[WhatsApp] Twilio env vars missing — skipped');
    return;
  }

  // Normalize recipient to E.164 + whatsapp: prefix
  const stripped = to.startsWith('whatsapp:') ? to.replace('whatsapp:', '') : to;
  const toE164 = stripped.startsWith('+') ? stripped
    : stripped.startsWith('40') ? `+${stripped}`
    : stripped.startsWith('0') ? `+4${stripped}`
    : `+40${stripped}`;
  const toFormatted = `whatsapp:${toE164}`;

  // Sanitize button labels: max 25 chars each, max 3 for quick reply
  const sanitizedButtons = buttons
    .slice(0, 10)
    .map(b => b.substring(0, 25));

  const twilio = (await import('twilio')).default;
  const client = twilio(accountSid, authToken);

  try {
    // Cache key: combination of body + buttons
    const cacheKey = `${sanitizedButtons.join('|')}`;
    let contentSid = contentSidCache.get(cacheKey);

    if (!contentSid) {
      if (sanitizedButtons.length <= 3) {
        // Quick Reply buttons (max 3)
        const content = await (client as any).content.v1.contents.create({
          friendlyName: `dv_qr_${Date.now()}`,
          language: 'ro',
          variables: {},
          types: {
            'twilio/quick-reply': {
              body: body,
              actions: sanitizedButtons.map(title => ({
                type: 'QUICK_REPLY',
                title,
              })),
            },
          },
        });
        contentSid = content.sid;
      } else {
        // List Message pentru 4-10 butoane
        const content = await (client as any).content.v1.contents.create({
          friendlyName: `dv_list_${Date.now()}`,
          language: 'ro',
          variables: {},
          types: {
            'twilio/list-picker': {
              body: body,
              button: 'Alege o opțiune',
              items: sanitizedButtons.map(title => ({
                item: title,
              })),
            },
          },
        });
        contentSid = content.sid;
      }
      contentSidCache.set(cacheKey, contentSid!);
      console.log(`[WhatsApp] Created Content Template: ${contentSid}`);
    }

    await client.messages.create({
      from: fromNumber,
      to: toFormatted,
      contentSid: contentSid!,
    } as any);

    console.log(`[WhatsApp Interactive] Sent to ${toFormatted} with ${sanitizedButtons.length} buttons`);

  } catch (err: any) {
    // Fallback la text simplu dacă Content API eșuează
    console.warn('[WhatsApp Interactive] Content API failed, falling back to text:', err.message);
    const numberedList = sanitizedButtons.map((b, i) => `${i + 1}. ${b}`).join('\n');
    await sendWhatsAppMessage(to, `${body}\n\n${numberedList}`);
  }
}

/**
 * generateICSAttachment — Generate calendar attachment with clinic-specific details
 * 
 * Uses getClinicConfig() to fetch clinic-specific name and location
 * Falls back to environment variables if DB unavailable
 */
export const generateICSAttachment = async (appointment: {
  id: string;
  date: string;
  time: string;
  service: string;
  doctorName: string;
  firstName?: string;
  lastName?: string;
  location?: string;
  clinicId?: string;
}, clinic?: string | ClinicConfig) => {
  const cfg = await resolveClinicConfig(clinic || appointment.clinicId);
  
  const dateParts = appointment.date.split('-').map(Number);
  const timeParts = appointment.time.split(':').map(Number);
  const durationMinutes = cfg.defaultServiceDuration;

  const event: ics.EventAttributes = {
    start: [dateParts[0], dateParts[1], dateParts[2], timeParts[0], timeParts[1]],
    duration: { minutes: durationMinutes },
    title: `${appointment.service} - ${cfg.clinicName}`,
    description: `Programare la ${cfg.clinicName}. Doctor: ${appointment.doctorName}. Serviciu: ${appointment.service}.`,
    location: appointment.location ?? cfg.clinicAddress,
    uid: appointment.id,
    status: 'CONFIRMED',
    busyStatus: 'BUSY',
    organizer: { name: cfg.clinicName, email: cfg.senderEmail },
  };

  const { error, value } = ics.createEvent(event);
  if (error) throw error;
  if (!value) throw new Error('Failed to generate ICS content');

  return { filename: 'programare.ics', content: value };
};

/**
 * getGoogleMapsLink — Generate Google Maps link with clinic-specific address
 * 
 * Uses getClinicConfig() to fetch clinic-specific address
 * Falls back to environment variables if DB unavailable
 */
export const getGoogleMapsLink = async (clinicId?: string) => {
  const resolvedClinicId = clinicId || getClinicId();
  const cfg = await resolveClinicConfig(resolvedClinicId);
  const mapsLink = cfg.mapsLink?.trim();
  if (mapsLink) return mapsLink;
  return `https://maps.google.com/?q=${encodeURIComponent(cfg.clinicAddress)}`;
};
