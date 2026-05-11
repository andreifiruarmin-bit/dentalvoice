// ==========================================
// WHATSAPP / FACEBOOK BOT FUNCTIONS
// ==========================================
// This module contains all WhatsApp/Facebook bot-related functions including:
// - Chat session types and state management
// - WhatsApp message normalization and matching
// - WhatsApp state machine for booking flow
// - Facebook messenger integration functions
// - OTP session management

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import 'dayjs/locale/ro.js';

import {
  BUCHAREST_TZ,
  CLINIC_CONFIG,
  BUSINESS_CONFIG,
  MAX_BOOKING_HORIZON_MONTHS,
  TEST_PHONE_NORMALIZED,
  formatDisplayDateRo,
  formatQuickDayLabelRo,
  isWeekdayBucharest,
  sanitizePhone,
  getServicesFromDB,
  getCachedDoctors,
  OTP_EXPIRY_MINUTES,
  OTP_CODE_LENGTH,
} from './shared.js';
import {
  getAvailableSlotsForDoctor,
  processBooking,
  filterSlotsMinLead,
  findActiveAppointmentForPhone,
  countActiveBookings,
  deleteAppointmentByPhoneDateTime,
  nextFiveWorkingDayOptions,
} from './booking.js';
import { generateICSAttachment, sendEmail, getGoogleMapsLink } from './notifications.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('ro');

// OTP sessions (in-memory for verification codes)
export const otpSessions = new Map<string, string>();

// WhatsApp / chat_sessions state (persisted in Supabase)
export type ChatSessionStep =
  | 'idle'
  | 'awaiting_service'
  | 'awaiting_doctor'
  | 'awaiting_date'
  | 'awaiting_time'
  | 'awaiting_full_name'
  | 'awaiting_phone_confirm'
  | 'awaiting_manual_phone_input'
  | 'awaiting_booking_phone_verification_code'
  | 'awaiting_email'
  | 'confirming'
  | 'confirmed'
  | 'cancelling'
  | 'awaiting_cancel_phone'
  | 'awaiting_cancel_confirm'
  | 'awaiting_lookup_phone'
  | 'awaiting_sms_verification_code'
  | 'awaiting_cross_phone_input'
  | 'awaiting_cross_phone_otp';

export interface ChatSession {
  step: ChatSessionStep;
  data: {
    service?: string;
    serviceId?: string;
    durationMinutes?: number;
    doctorId?: string;
    doctorName?: string;
    date?: string;
    displayDate?: string;
    time?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    availableSlots?: string[];
    availableDoctors?: { id: string; name: string }[];
    dateRetries?: number;
    suggestedIsoDate?: string;
    suggestedDisplayDate?: string;
    suggestedSlotsCount?: number;
    cancelDate?: string;
    cancelTime?: string;
    cancelService?: string;
    cancelDoctorName?: string;
    lookupPhone?: string;
    verificationCode?: string;
    verificationExpires?: string;
    phoneNumber?: string;
    verifiedPhone?: string;
    awaitingPhoneInput?: boolean;
    otpAttempts?: number;
    phone?: string;
  };
}

export const WA_WELCOME_BUTTONS = [
  '📅 Vreau o programare',
  '📝 Editez sau anulez o programare',
  '📞 Contactez Recepția',
];

export const waNormalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const waReceptionReply = () =>
  `Pentru programări sau informații, ne puteți contacta la: ${CLINIC_CONFIG.clinicPhone}`;

export const waReceptionButtons = () => ['📲 Sună recepția', '🔙 Înapoi la meniu'];

export const waIdleGreetingReply = () =>
  'Bună ziua! Vă pot ajuta cu o programare nouă, cu modificarea sau anularea unei programări existente, sau vă pot pune în legătură cu recepția.';

export const waCreateCallInteractiveMessage = (text: string, buttonLabel: string, phoneNumber: string) => ({
  type: 'button',
  body: {
    text,
  },
  action: {
    buttons: [
      {
        type: 'phone_number',
        text: buttonLabel,
        phone_number: phoneNumber,
      },
    ],
  },
});

export const coerceChatSessionStep = (step: string | unknown): ChatSessionStep => {
  const validSteps: ChatSessionStep[] = [
    'idle',
    'awaiting_service',
    'awaiting_doctor',
    'awaiting_date',
    'awaiting_time',
    'awaiting_full_name',
    'awaiting_phone_confirm',
    'awaiting_manual_phone_input',
    'awaiting_booking_phone_verification_code',
    'awaiting_email',
    'confirming',
    'confirmed',
    'cancelling',
    'awaiting_cancel_phone',
    'awaiting_cancel_confirm',
    'awaiting_lookup_phone',
    'awaiting_sms_verification_code',
    'awaiting_cross_phone_input',
    'awaiting_cross_phone_otp',
  ];
  if (typeof step === 'string' && validSteps.includes(step as ChatSessionStep)) {
    return step as ChatSessionStep;
  }
  return 'idle';
};

export const waMatchesMenuReset = (t: string) => {
  const n = waNormalize(t);
  return n === 'meniu' || n === 'menu' || n === 'start' || n === 'incepe' || n === 'reincepe';
};

export const waMatchesOperator = (t: string) => {
  const n = waNormalize(t);
  return n.includes('operator') || n.includes('om') || n.includes('ajutor') || n.includes('recept');
};

export const waMatchesGlobalCancel = (t: string) => {
  const n = waNormalize(t);
  return n.includes('anulez') || n.includes('anulare') || t.includes('❌');
};

export const waMatchesIdleOpeners = (t: string) => {
  const n = waNormalize(t);
  return (
    n === 'buna' ||
    n === 'bună' ||
    n === 'salut' ||
    n === 'bunaziua' ||
    n === 'bunăziua' ||
    n.includes('bună') ||
    n.includes('buna') ||
    n.includes('salut')
  );
};

export const parseAndValidateFullName = (text: string) => {
  const trimmed = text.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) {
    return { ok: false, message: 'Vă rugăm introduceți numele complet (prenume și nume).' };
  }
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  if (firstName.length < 2 || lastName.length < 2) {
    return { ok: false, message: 'Numele și prenumele trebuie să aibă cel puțin 2 caractere fiecare.' };
  }
  const nameRegex = /^[a-zA-ZăâîșțĂÂÎȘȚ\s\-]+$/;
  if (!nameRegex.test(firstName) || !nameRegex.test(lastName)) {
    return { ok: false, message: 'Numele poate conține doar litere, spații și cratime.' };
  }
  return { ok: true, firstName, lastName };
};

export const parseFlexibleUserDate = (text: string): string | null => {
  const n = waNormalize(text);
  const now = dayjs().tz(BUCHAREST_TZ);

  // Today
  if (n === 'azi' || n === 'astazi' || n === 'astăzi') {
    return now.format('YYYY-MM-DD');
  }

  // Tomorrow
  if (n === 'maine' || n === 'mâine') {
    return now.add(1, 'day').format('YYYY-MM-DD');
  }

  // Day names
  const dayMap: { [key: string]: number } = {
    luni: 1,
    marti: 2,
    marți: 2,
    miercuri: 3,
    joi: 4,
    vineri: 5,
    sambata: 6,
    sâmbătă: 6,
    duminica: 0,
    duminică: 0,
  };

  if (dayMap[n] !== undefined) {
    const targetDay = dayMap[n];
    const currentDay = now.day();
    let daysToAdd = targetDay - currentDay;
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }
    return now.add(daysToAdd, 'day').format('YYYY-MM-DD');
  }

  // DD.MM or DD/MM format
  const dateMatch = n.match(/^(\d{1,2})[.\-/](\d{1,2})$/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1], 10);
    const month = parseInt(dateMatch[2], 10);
    const year = now.year();
    const parsed = dayjs.tz(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, BUCHAREST_TZ);
    if (parsed.isValid() && parsed.isSame(now, 'year')) {
      // If the date has passed, assume next year
      if (parsed.isBefore(now, 'day')) {
        return parsed.add(1, 'year').format('YYYY-MM-DD');
      }
      return parsed.format('YYYY-MM-DD');
    }
  }

  // DD.MM.YYYY or DD/MM/YYYY format
  const fullDateMatch = n.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (fullDateMatch) {
    const day = parseInt(fullDateMatch[1], 10);
    const month = parseInt(fullDateMatch[2], 10);
    const year = parseInt(fullDateMatch[3], 10);
    const parsed = dayjs.tz(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, BUCHAREST_TZ);
    if (parsed.isValid()) {
      return parsed.format('YYYY-MM-DD');
    }
  }

  // Romanian date format: "14 aprilie" or "14 Aprilie"
  const romanianMonthMatch = n.match(/^(\d{1,2})\s+(ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie)$/i);
  if (romanianMonthMatch) {
    const day = parseInt(romanianMonthMatch[1], 10);
    const monthName = romanianMonthMatch[2].toLowerCase();
    const monthMap: { [key: string]: number } = {
      ianuarie: 1,
      februarie: 2,
      martie: 3,
      aprilie: 4,
      mai: 5,
      iunie: 6,
      iulie: 7,
      august: 8,
      septembrie: 9,
      octombrie: 10,
      noiembrie: 11,
      decembrie: 12,
    };
    const month = monthMap[monthName];
    if (month) {
      const year = now.year();
      const parsed = dayjs.tz(`${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`, BUCHAREST_TZ);
      if (parsed.isValid()) {
        // If the date has passed, assume next year
        if (parsed.isBefore(now, 'day')) {
          return parsed.add(1, 'year').format('YYYY-MM-DD');
        }
        return parsed.format('YYYY-MM-DD');
      }
    }
  }

  return null;
};

export const matchServiceFromInput = async (text: string, clinicId: string): Promise<{ name: string; id: string; durationMinutes: number } | null> => {
  const services = await getServicesFromDB(clinicId);
  if (!services || services.length === 0) return null;

  const trimmed = text.trim();

  // 1. Try parsing as 1-based index
  const idxMatch = /^\s*(\d+)\s*$/.exec(trimmed);
  if (idxMatch) {
    const idx = parseInt(idxMatch[1], 10);
    if (idx >= 1 && idx <= services.length) {
      const svc = services[idx - 1];
      return { name: svc.name, id: svc.id, durationMinutes: svc.durationMinutes };
    }
  }

  // Normalization helper for diacritic-insensitive matching
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const n = normalize(trimmed);

  // 2. Try exact case-insensitive match
  for (const svc of services) {
    if (svc.name.toLowerCase().trim() === trimmed.toLowerCase()) {
      return { name: svc.name, id: svc.id, durationMinutes: svc.durationMinutes };
    }
  }

  // 3. Try normalized (diacritic-insensitive) match
  for (const svc of services) {
    if (normalize(svc.name) === n) {
      return { name: svc.name, id: svc.id, durationMinutes: svc.durationMinutes };
    }
  }

  // 4. Try substring match (user input contained in service name or vice versa)
  for (const svc of services) {
    const svcNorm = normalize(svc.name);
    if (svcNorm.includes(n) || n.includes(svcNorm)) {
      return { name: svc.name, id: svc.id, durationMinutes: svc.durationMinutes };
    }
  }

  return null;
};

export const matchDoctorFromInput = async (text: string, clinicId: string) => {
  const n = waNormalize(text);
  const doctors = await getCachedDoctors(clinicId);
  const trimmed = text.trim();
  const idxMatch = /^\s*(\d+)\s*$/.exec(trimmed);
  if (idxMatch) {
    const i = parseInt(idxMatch[1], 10);
    if (i === 1) return { id: 'any', name: 'Oricare medic disponibil' };
    if (i >= 2 && i <= doctors.length + 1) {
      const d = doctors[i - 2];
      return { id: d.id, name: d.name };
    }
  }
  if (
    n.includes('oricare') ||
    n.includes('orice medic') ||
    n === 'any' ||
    trimmed.includes('Oricare')
  ) {
    return { id: 'any', name: 'Oricare medic disponibil' };
  }
  for (const d of doctors) {
    const dn = waNormalize(d.name);
    if (n.includes(dn) || dn.includes(n)) return { id: d.id, name: d.name };
  }
  return null;
};

export const buildServicePrompt = async () => {
  const services = await getServicesFromDB(CLINIC_CONFIG.id);
  const lines = services.map(
    (s, i) => `${i + 1}. ${s.name}`
  );
  return `Ce serviciu doriți?\n\n${lines.join('\n')}`;
};

export const buildDoctorPrompt = async (clinicId: string): Promise<string> => {
  const doctors = await getCachedDoctors(clinicId);
  const lines = [
    '1. Oricare medic disponibil (recomandat)',
    ...doctors.map((d, i) => `${i + 2}. ${d.name}`),
  ];
  return `Preferati un anumit medic?\n\n${lines.join('\n')}`;
};

export const serviceQuickReplyLabels = async () => {
  const services = await getServicesFromDB(CLINIC_CONFIG.id);
  return services.map((s) => s.name);
};

export const doctorQuickReplyLabels = async (clinicId: string): Promise<string[]> => {
  const doctors = await getCachedDoctors(clinicId);
  return ['Oricare medic', ...doctors.map((d) => d.name)];
};

export const waMatchesConfirm = (t: string) => {
  const n = waNormalize(t);
  return n.includes('confirm') || t.includes('✅');
};

export const waMatchesDeny = (t: string) => {
  const n = waNormalize(t);
  return n.includes('anulez') || t.includes('❌');
};

export const waMatchesModify = (t: string) => {
  const n = waNormalize(t);
  return n.includes('modific') || t.includes('✏️');
};

export const waMatchesSkipEmail = (t: string) => {
  const n = waNormalize(t);
  return n.includes('sari') || n === 'nu' || n.includes('skip') || t.includes('Sari peste');
};

export const waMatchesYesCancel = (t: string) => {
  const n = waNormalize(t);
  return n.includes('da') && (n.includes('anulez') || t.includes('✅'));
};

export const waMatchesNoCancel = (t: string) => {
  const n = waNormalize(t);
  return (
    n.includes('pastrez') ||
    n.includes('păstrez') ||
    n === 'nu' ||
    (t.includes('❌') && n.includes('nu'))
  );
};

// Facebook normalize (same logic as waNormalize — reuse it)
export const fbNormalize = waNormalize; // alias, not a copy

// Send a text message via Facebook Graph API
export const sendFacebookMessage = async (recipientId: string, text: string): Promise<void> => {
  const token = process.env['FACEBOOK_PAGE_ACCESS_TOKEN'];
  if (!token) {
    console.log(`[FB SIMULATION] To: ${recipientId} | Message: ${text}`);
    return;
  }
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error('[sendFacebookMessage] Graph API error:', err);
    }
  } catch (e: any) {
    console.error('[sendFacebookMessage] Fetch error:', e.message);
  }
};

// Send quick replies (buttons) via Facebook Graph API
export const sendFacebookQuickReplies = async (
  recipientId: string,
  text: string,
  buttons: string[]
): Promise<void> => {
  const token = process.env['FACEBOOK_PAGE_ACCESS_TOKEN'];
  if (!token || buttons.length === 0) {
    await sendFacebookMessage(recipientId, text);
    return;
  }
  // Facebook quick replies: max 13 items, max 20 chars each (truncate if needed)
  const quickReplies = buttons.slice(0, 13).map((label) => ({
    content_type: 'text',
    title: label.substring(0, 20),
    payload: label,
  }));
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: recipientId },
          message: { text, quick_replies: quickReplies },
        }),
      }
    );
    if (!response.ok) {
      const err = await response.text();
      console.error('[sendFacebookQuickReplies] Graph API error:', err);
    }
  } catch (e: any) {
    console.error('[sendFacebookQuickReplies] Fetch error:', e.message);
  }
};

export type WhatsappTurnResult = { reply: string; buttons: string[]; session: ChatSession; interactive?: any };

export const runWhatsappStateMachine = async (from: string, text: string, session: ChatSession): Promise<WhatsappTurnResult> => {
  const applyGlobalInterrupts = async (): Promise<WhatsappTurnResult | null> => {
    if (waMatchesMenuReset(text)) {
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }
    if (waMatchesOperator(text)) {
      const interactiveMessage = waCreateCallInteractiveMessage(
        waReceptionReply(),
        'Sunați recepția',
        CLINIC_CONFIG.clinicPhone
      );
      return {
        reply: waReceptionReply(),
        buttons: [],
        session: { step: 'idle', data: {} },
        interactive: interactiveMessage,
      };
    }
    if (waMatchesGlobalCancel(text)) {
      const apt = await findActiveAppointmentForPhone(from);
      if (!apt) {
        return {
          reply:
            'Nu am găsit o programare activă asociată acestui număr. Dacă aveți nevoie de ajutor, contactați recepția.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: `Am găsit programarea:\n📅 ${formatDisplayDateRo(apt.date)} la ${apt.time}\n🦷 ${apt.service}\n👨‍⚕️ ${apt.doctor_name || 'Medic'}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: {
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };
    }
    return null;
  };

  if (session.step !== 'awaiting_cancel_confirm') {
    const g = await applyGlobalInterrupts();
    if (g) return g;
  } else {
    if (waMatchesMenuReset(text)) {
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }
  }

  switch (session.step) {
    case 'awaiting_cancel_confirm': {
      const norm = waNormalize(text);

      // "Modific data/ora" ? restart booking flow keeping same patient context
      if (norm.includes('modific data') || norm.includes('modific ora') || text.includes('?? Modific')) {
        return {
          reply: await buildServicePrompt(),
          buttons: await serviceQuickReplyLabels(),
          session: { step: 'awaiting_service', data: {} },
        };
      }

      // "napoi la meniu"
      if (norm.includes('inapoi') || norm.includes('napoi') || text.includes('??')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // "Anulez programarea" ? map to existing yes-cancel logic
      if (text.includes('?? Anulez programarea') || norm.includes('anulez programarea')) {
        // treat as waMatchesYesCancel = true ? reuse existing cancel confirm logic
      }

      if (waMatchesYesCancel(text)) {
        const d = session.data.cancelDate;
        const tm = session.data.cancelTime;
        if (!d || !tm) {
          return {
            reply: 'A apărut o inconsistență. Reîncepeți cu „Meniu".',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }
        const del = await deleteAppointmentByPhoneDateTime(from, d, tm);
        if (del.ok === false) {
          return {
            reply: del.message,
            buttons: [],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply: 'Programarea a fost anulată cu succes. Vă mai așteptăm!',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      if (waMatchesNoCancel(text)) {
        return {
          reply: 'Perfect, păstrăm programarea. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply: 'Vă rugăm răspundeți cu „Da, anulez" sau „Nu, păstrez".',
        buttons: ['?? Da, anulez', '?? Nu, păstrez'],
        session,
      };
    }

    case 'cancelling':
    case 'awaiting_cancel_phone': {
      return {
        reply: 'Folosiți „Anulare" pentru a anula o programare sau „Meniu" pentru a reîncepe.',
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }

    case 'awaiting_lookup_phone': {
      const phoneInput = text.trim();
      const sanitized = sanitizePhone(phoneInput);
      
      if (!sanitized || sanitized.length < 9) {
        return {
          reply: 'Numărul de telefon introdus este invalid. Vă rugăm introduceți un număr valid format 07xxxxxxxx.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      const apt = await findActiveAppointmentForPhone(sanitized);
      if (!apt) {
        return {
          reply: 'Nu am găsit nicio programare activă pentru acest număr de telefon.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Generate and send SMS verification code
      const code = Math.floor(Math.pow(10, OTP_CODE_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_CODE_LENGTH - 1)).toString();
      const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toISOString();
      
      // Store verification code temporarily
      otpSessions.set(sanitized, code);
      
      // In production, this would send actual SMS
      console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
      
      return {
        reply: `Am găsit o programare pentru numărul ${sanitized}.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduceți codul pentru a continua.\n\n(Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_sms_verification_code',
          data: { 
            lookupPhone: sanitized,
            verificationCode: code,
            verificationExpires: expiresAt,
            cancelDate: apt.date,
            cancelTime: apt.time,
            cancelService: apt.service,
            cancelDoctorName: apt.doctor_name || '',
          },
        },
      };
    }

    case 'awaiting_sms_verification_code': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. Vă rugăm încercați din nou.',
          buttons: ['🔙 Înapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: 'Cod incorect. Vă rugăm introduceți codul primit prin SMS.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      // Code verified - proceed with cancel flow
      return {
        reply: `Cod verificat! Am găsit programarea:\n📅 ${formatDisplayDateRo(session.data.cancelDate || '')} la ${session.data.cancelTime}\n🦷 ${session.data.cancelService}\n👨‍⚕️ ${session.data.cancelDoctorName}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: session.data,
        },
      };
    }

    case 'awaiting_cross_phone_input': {
      const norm = waNormalize(text);
      
      // Handle back to menu
      if (norm.includes('inapoi') || norm.includes('napoi') || text.includes('??')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      // Option 1: Search on current phone number
      if (text.includes('1.') || norm.includes('caut pe acest numar') || norm.includes('acest numar')) {
        const apt = await findActiveAppointmentForPhone(from);
        if (!apt) {
          return {
            reply: 'Nu am găsit nicio programare activă la acest număr de telefon.\n\nDoriți să încercați cu un alt număr de telefon?',
            buttons: ['2. Alt număr de telefon', '🔙 Înapoi la meniu'],
            session: {
              step: 'awaiting_cross_phone_input',
              data: {},
            },
          };
        }
        
        // Generate and send SMS verification code for current phone
        const code = Math.floor(Math.pow(10, OTP_CODE_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_CODE_LENGTH - 1)).toString();
        const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toISOString();
        const sanitized = sanitizePhone(from);
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am găsit o programare pentru numărul dumneavoastră.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduceți codul pentru a continua.\n\n(Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_otp',
            data: { 
              lookupPhone: sanitized,
              verificationCode: code,
              verificationExpires: expiresAt,
              cancelDate: apt.date,
              cancelTime: apt.time,
              cancelService: apt.service,
              cancelDoctorName: apt.doctor_name || '',
            },
          },
        };
      }
      
      // Option 2: Enter different phone number
      if (text.includes('2.') || norm.includes('alt numar') || norm.includes('alt telefon')) {
        return {
          reply: 'Introduceți numărul de telefon folosit la programare (format: 07xxxxxxxx):',
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_input',
            data: { ...session.data, awaitingPhoneInput: true },
          },
        };
      }
      
      // Handle phone number input
      if (session.data.awaitingPhoneInput) {
        const phoneInput = text.trim();
        const sanitized = sanitizePhone(phoneInput);
        
        if (!sanitized || sanitized.length < 9) {
          return {
            reply: 'Numărul de telefon introdus este invalid. Vă rugăm introduceți un număr valid format 07xxxxxxxx.',
            buttons: ['🔙 Înapoi la meniu'],
            session: { ...session, data: { ...session.data, awaitingPhoneInput: false } },
          };
        }

        const apt = await findActiveAppointmentForPhone(sanitized);
        if (!apt) {
          return {
            reply: 'Nu am găsit nicio programare activă pentru acest număr de telephone.',
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }

        // Generate and send SMS verification code
        const code = Math.floor(Math.pow(10, OTP_CODE_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_CODE_LENGTH - 1)).toString();
        const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toISOString();
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am găsit o programare pentru numărul ${sanitized}.\n\nPentru securitate, am trimis un cod de verificare prin SMS. Introduceți codul pentru a continua.\n\n(Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_otp',
            data: { 
              lookupPhone: sanitized,
              verificationCode: code,
              verificationExpires: expiresAt,
              cancelDate: apt.date,
              cancelTime: apt.time,
              cancelService: apt.service,
              cancelDoctorName: apt.doctor_name || '',
            },
          },
        };
      }
      
      // Fallback
      return {
        reply: 'Vă rugăm alegeți o opțiune:',
        buttons: ['1. Caută pe acest număr', '2. Alt număr de telefon', '🔙 Înapoi la meniu'],
        session,
      };
    }

    case 'awaiting_cross_phone_otp': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      const attempts = (session.data.otpAttempts || 0) + 1;
      
      // Handle back to menu
      if (waNormalize(text).includes('inapoi') || waNormalize(text).includes('napoi')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. Vă rugăm încercați din nou.',
          buttons: ['🔙 Înapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      // Check if max attempts reached
      if (attempts > 3) {
        return {
          reply: 'Prea multe încercări greșite. Pentru securitate, conversația a fost resetată. Vă rugăm începeți din nou.',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: `Cod incorect. Încercări rămase: ${3 - attempts}. Vă rugăm introduceți codul primit prin SMS.`,
          buttons: ['🔙 Înapoi la meniu'],
          session: { ...session, data: { ...session.data, otpAttempts: attempts } },
        };
      }

      // Code verified - proceed with cancel flow
      return {
        reply: `Cod verificat! Am găsit programarea:\n📅 ${formatDisplayDateRo(session.data.cancelDate || '')} la ${session.data.cancelTime}\n🦷 ${session.data.cancelService}\n👨‍⚕️ ${session.data.cancelDoctorName}\n\nConfirmați anularea?`,
        buttons: ['✅ Da, anulez', '❌ Nu, păstrez'],
        session: {
          step: 'awaiting_cancel_confirm',
          data: session.data,
        },
      };
    }

    case 'confirmed': {
      if (waMatchesIdleOpeners(text)) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      return {
        reply:
          'Pentru o programare nouă, scrieți „Meniu" sau „Start". Pentru anulare, scrieți „Anulare".',
        buttons: [],
        session,
      };
    }

    case 'idle': {
      const norm = waNormalize(text);

      // "Vreau o programare" button or text
      if (
        text.includes('📅') ||
        norm.includes('vreau o programare') ||
        norm === 'vreau programare' ||
        norm === 'programare noua' ||
        norm === 'programare nou?'
      ) {
        return {
          reply: await buildServicePrompt(),
          buttons: await serviceQuickReplyLabels(),
          session: { step: 'awaiting_service', data: {} },
        };
      }

      // "Editez / Anulez o programare" button or text
      if (
        text.includes('❌') ||
        text.includes('❌ Anulez') ||
        norm.includes('anulez o programare') ||
        norm.includes('editez o programare') ||
        norm.includes('modific o programare') ||
        norm.includes('anulez programarea') ||
        norm.includes('editez programarea') ||
        norm.includes('modificare') ||
        norm.includes('editare') ||
        norm.includes('schimbare')
      ) {
        return {
          reply: 'Pentru a anula sau modifica o programare, alegeti o optiune:\n\n1. Caută programarea pe numărul acestui telefon\n2. Introdu un alt număr de telefon',
          buttons: ['1. Caută pe acest număr', '2. Alt număr de telefon', '🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_cross_phone_input',
            data: {},
          },
        };
      }

      // "Contactez Recepția" button or text
      if (
        text.includes('📞') ||
        norm.includes('contactez receptia') ||
        norm.includes('contactez receptia') ||
        norm.includes('receptie') ||
        norm.includes('recepție') ||
        norm.includes('suna') ||
        norm.includes('sunati')
      ) {
        return {
          reply: waReceptionReply(),
          buttons: waReceptionButtons(),
          session: { step: 'idle', data: {} },
        };
      }

      // Handle reception button responses
      if (text.includes('📲 Sună recepția') || text.includes('Sună recepția')) {
        return {
          reply: 'Vă rugăm apelați recepția direct.',
          buttons: waReceptionButtons(),
          session: { step: 'idle', data: {} },
        };
      }

      if (text.includes('🔙 Înapoi la meniu') || text.includes('Înapoi la meniu')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Generic opener AFTER specific actions
      if (waMatchesIdleOpeners(text)) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      // Fallback
      return {
        reply: 'Nu am înțeles. Scrieți "Bună" sau alegeți o opțiune:',
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
    }

    case 'awaiting_service': {
      const svc = await matchServiceFromInput(text, CLINIC_CONFIG.id);
      if (!svc) {
        return {
          reply: 'Nu am recunoscut serviciul. Alegeți un număr din listă sau numele serviciului.',
          buttons: await serviceQuickReplyLabels(),
          session,
        };
      }
      return {
        reply: await buildDoctorPrompt(CLINIC_CONFIG.id),
        buttons: await doctorQuickReplyLabels(CLINIC_CONFIG.id),
        session: {
          step: 'awaiting_doctor',
          data: {
            ...session.data,
            service: svc.name,
            serviceId: svc.id,
            durationMinutes: svc.durationMinutes,
          },
        },
      };
    }

    case 'awaiting_doctor': {
      const doc = await matchDoctorFromInput(text, CLINIC_CONFIG.id);
      if (!doc) {
        return {
          reply: 'Nu am recunoscut medicul. Alegeți "Oricare medic" sau un nume din listă.',
          buttons: await doctorQuickReplyLabels(CLINIC_CONFIG.id),
          session,
        };
      }
      // Get doctor's working days from DB to filter available dates
      let doctorWorkingDays: number[] | undefined = undefined;
      if (doc.id !== 'any') {
        const allDocs = await getCachedDoctors(CLINIC_CONFIG.id);
        const selectedDoc = allDocs.find((d: any) => d.id === doc.id);
        if (selectedDoc?.workingDays?.length) {
          doctorWorkingDays = selectedDoc.workingDays;
        }
      }
      const dayOpts = await nextFiveWorkingDayOptions(doctorWorkingDays);
      return {
        reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie"\n• „14.04"\n• „mâine"\n• „luni"`,
        buttons: dayOpts.map((o: { label: string }) => o.label),
        session: {
          step: 'awaiting_date',
          data: {
            ...session.data,
            doctorId: doc.id,
            doctorName: doc.name,
          },
        },
      };
    }

    case 'awaiting_date': {
      // Handle "no slots" suggestion choices (from previous turn)
      const normalized = waNormalize(text);
      if (normalized.startsWith('da') || text.includes('✅ Da')) {
        const suggested = session.data.suggestedIsoDate;
        if (suggested) {
          // Accept suggestion immediately
          const duration = session.data.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
          const doctorKey = session.data.doctorId || 'any';
          let slots = await getAvailableSlotsForDoctor(doctorKey, suggested, duration);
          slots = filterSlotsMinLead(suggested, slots);

          if (slots.length === 0) {
            // Suggestion became unavailable; fall back to date choices
            const dayOpts = await nextFiveWorkingDayOptions();
            return {
              reply:
                'Între timp, disponibilitatea s-a schimbat. Vă rugăm alegeți o altă dată din opțiunile de mai jos.',
              buttons: dayOpts.map((o: { label: string }) => o.label),
              session: {
                step: 'awaiting_date',
                data: { ...session.data, suggestedIsoDate: undefined as unknown as string, suggestedDisplayDate: undefined as unknown as string, suggestedSlotsCount: undefined as unknown as number },
              },
            };
          }

          const display = formatDisplayDateRo(suggested);
          const shown = slots.slice(0, 8);
          const lines = shown.map((s, i) => `${i + 1}. ${s}`);

          return {
            reply: `Orele disponibile pentru ${display}:\n\n${lines.join('\n')}`,
            buttons: [...shown, '📅 Schimbă data aleasă'],
            session: {
              step: 'awaiting_time',
              data: {
                ...session.data,
                date: suggested,
                displayDate: display,
                availableSlots: slots,
                suggestedIsoDate: undefined as unknown as string,
                suggestedDisplayDate: undefined as unknown as string,
                suggestedSlotsCount: undefined as unknown as number,
                dateRetries: 0,
              },
            },
          };
        }
      }

      if (text.includes('📅') || normalized.includes('aleg alt')) {
        const dayOpts = await nextFiveWorkingDayOptions();
        return {
          reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie"\n• „14.04"\n• „mâine"\n• „luni"`,
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: {
            step: 'awaiting_date',
            data: { ...session.data, suggestedIsoDate: undefined as unknown as string, suggestedDisplayDate: undefined as unknown as string, suggestedSlotsCount: undefined as unknown as number },
          },
        };
      }

      if (text.includes('❌') || normalized.includes('renunt')) {
        return {
          reply: 'Am închis conversația. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }

      let iso: string | null = null;
      const dayOpts = await nextFiveWorkingDayOptions();
      const hit = dayOpts.find((o: { label: string; iso: string }) => text.includes(o.label) || o.label === text.trim());
      if (hit) iso = hit.iso;
      else iso = parseFlexibleUserDate(text);

      if (!iso) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        const nextData = { ...session.data, dateRetries: retries };
        if (retries >= 3) {
          return {
            reply:
              'Am avut dificultăți în a înțelege data introdusă.\nVă rugăm alegeți o dată din opțiunile de mai jos sau scrieți în format „14 Aprilie":',
            buttons: dayOpts.map((o: { label: string }) => o.label),
            session: { ...session, data: { ...nextData, dateRetries: 0 } },
          };
        }
        return {
          reply:
            'Nu am putut interpreta data. Încercați „mâine", „luni", „14.04" sau alegeți un buton.',
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: { ...session, data: nextData },
        };
      }

      const todayStart = dayjs().tz(BUCHAREST_TZ).startOf('day');
      const chosen = dayjs.tz(`${iso}T12:00:00`, BUCHAREST_TZ);
      
      // FORMAT/VALIDITY check first: Is the parsed date a real calendar date?
      if (!chosen.isValid()) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: 'Dată invalidă. Vă rugăm introduceți o dată corectă (ex: 25 aprilie sau 25.04).',
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }
      
      if (chosen.isBefore(todayStart, 'day')) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: 'Data trebuie să fie astăzi sau în viitor. Alegeți altă dată.',
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }
      
      // BOOKING HORIZON check third: Check if date exceeds maximum booking horizon
      const maxAllowedDate = dayjs().tz(BUCHAREST_TZ).add(MAX_BOOKING_HORIZON_MONTHS, 'month');
      if (chosen.isAfter(maxAllowedDate, 'day')) {
        const retries = (session.data.dateRetries ?? 0) + 1;
        return {
          reply: `Ne pare rău, programările se pot face cu maximum ${MAX_BOOKING_HORIZON_MONTHS} luni în avans. Vă rugăm alegeți o dată mai apropiată.`,
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: { ...session, data: { ...session.data, dateRetries: retries } },
        };
      }

      // Validate that the chosen date matches the doctor's working days
      if (session.data.doctorId && session.data.doctorId !== 'any') {
        const allDocs = await getCachedDoctors(CLINIC_CONFIG.id);
        const chosenDoc = allDocs.find((d: any) => d.id === session.data.doctorId);
        if (chosenDoc?.workingDays?.length) {
          const chosenDow = chosen.day();
          if (!chosenDoc.workingDays.includes(chosenDow)) {
            const doctorDayOpts = await nextFiveWorkingDayOptions(chosenDoc.workingDays);
            return {
              reply: `Dr. ${session.data.doctorName} nu lucrează în ziua selectată. Alegeți una din zilele disponibile:`,
              buttons: doctorDayOpts.map((o: { label: string }) => o.label),
              session: { ...session, data: { ...session.data, dateRetries: 0 } },
            };
          }
        }
      }

      const duration = session.data.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
      const doctorKey = session.data.doctorId || 'any';
      let slots = await getAvailableSlotsForDoctor(doctorKey, iso, duration);
      slots = filterSlotsMinLead(iso, slots);

      if (slots.length === 0) {
        // Search next 7 days (skip weekends) and suggest closest available date.
        let foundIso: string | null = null;
        let foundCount = 0;
        for (let add = 1; add <= 7; add++) {
          const candidate = dayjs.tz(`${iso}T12:00:00`, BUCHAREST_TZ).add(add, 'day').format('YYYY-MM-DD');
          if (!isWeekdayBucharest(candidate)) continue;
          let candSlots = await getAvailableSlotsForDoctor(doctorKey, candidate, duration);
          candSlots = filterSlotsMinLead(candidate, candSlots);
          if (candSlots.length > 0) {
            foundIso = candidate;
            foundCount = candSlots.length;
            break;
          }
        }

        if (!foundIso) {
          return {
            reply: `Ne pare rău, nu am găsit disponibilitate în următoarele 7 zile.\nVă rugăm să ne contactați direct la ${CLINIC_CONFIG.clinicPhone}.`,
            buttons: [...WA_WELCOME_BUTTONS],
            session: { step: 'idle', data: {} },
          };
        }

        const display = formatDisplayDateRo(iso);
        const nextDateLabel = formatQuickDayLabelRo(foundIso);
        return {
          reply: `Ne pare rău, nu există sloturi disponibile pentru ${display}.\n\nCea mai apropiată dată disponibilă este ${nextDateLabel}.\n\nDoriți să continuați?`,
          buttons: [`✅ Da, ${nextDateLabel}`, '📅 Aleg altă dată', '❌ Renunț'],
          session: {
            step: 'awaiting_date',
            data: {
              ...session.data,
              date: undefined as unknown as string,
              displayDate: undefined as unknown as string,
              availableSlots: undefined as unknown as string[],
              suggestedIsoDate: foundIso,
              suggestedDisplayDate: nextDateLabel,
              suggestedSlotsCount: foundCount,
              dateRetries: 0,
            },
          },
        };
      }

      const display = formatDisplayDateRo(iso);
      const shown = slots.slice(0, 8);
      const lines = shown.map((s, i) => `${i + 1}. ${s}`);

      return {
        reply: `Orele disponibile pentru ${display}:\n\n${lines.join('\n')}`,
        buttons: [...shown, '📅 Schimbă data aleasă'],
        session: {
          step: 'awaiting_time',
          data: {
            ...session.data,
            date: iso,
            displayDate: display,
            availableSlots: slots,
            dateRetries: 0,
            suggestedIsoDate: undefined as unknown as string,
            suggestedDisplayDate: undefined as unknown as string,
            suggestedSlotsCount: undefined as unknown as number,
          },
        },
      };
    }

    case 'awaiting_time': {
      // ADD THIS BLOCK at the very top of the case, before existing logic:
      if (text === '📅 Schimbă data aleasă' || waNormalize(text).includes('schimba data')) {
        const dayOpts = await nextFiveWorkingDayOptions();
        return {
          reply: `Pentru ce dată doriți programarea?\n\nPuteți scrie data în orice format:\n• „14 aprilie"\n• „14.04"\n• „mâine"\n• „luni"`,
          buttons: dayOpts.map((o: { label: string }) => o.label),
          session: {
            step: 'awaiting_date',
            data: { ...session.data, date: undefined as unknown as string, displayDate: undefined as unknown as string, availableSlots: undefined as unknown as string[] },
          },
        };
      }

      const slots = session.data.availableSlots || [];
      const shown = slots.slice(0, 8);
      const trimmed = text.trim();
      let picked: string | null = null;
      const num = /^\s*(\d+)\s*$/.exec(trimmed);
      if (num) {
        const i = parseInt(num[1], 10);
        if (i >= 1 && i <= shown.length) picked = shown[i - 1];
      }
      if (!picked) {
        const norm = trimmed.replace(/\s/g, '');
        const m = norm.match(/^(\d{1,2}):?(\d{2})?$/);
        if (m) {
          const hh = m[1].padStart(2, '0');
          const mm = (m[2] || '00').padStart(2, '0');
          const cand = `${hh}:${mm}`;
          
          // Check if the parsed time is in the available slots
          if (slots.includes(cand)) {
            picked = cand;
          } else {
            // Time is valid format but not available
            const lines = shown.map((s, i) => `${i + 1}. ${s}`);
            return {
              reply: `Ora ${cand} nu este disponibilă. Vă rugăm să alegeți dintre orele libere:\n\n${lines.join('\n')}`,
              buttons: [...shown, '📅 Schimbă data aleasă'],
              session,
            };
          }
        }
      }
      
      if (!picked) {
        for (const s of slots) {
          if (trimmed === s || trimmed === s.replace(/^0/, '') || waNormalize(trimmed) === waNormalize(s)) {
            picked = s;
            break;
          }
        }
      }

      if (!picked) {
        const lines = shown.map((s, i) => `${i + 1}. ${s}`);
        return {
          reply: `Nu am recunoscut ora. Alegeți un număr sau ora în format HH:mm.\n\n${lines.join('\n')}`,
          buttons: [...shown, '📅 Schimbă data aleasă'],
          session,
        };
      }

      return {
        reply: 'Introduceți numele și prenumele.',
        buttons: [],
        session: {
          step: 'awaiting_full_name',
          data: { ...session.data, time: picked },
        },
      };
    }

    case 'awaiting_full_name': {
      const v = parseAndValidateFullName(text);
      if (v.ok === false) {
        return {
          reply: v.message ?? 'Eroare validare nume.',
          buttons: [],
          session,
        };
      }
      
      // Extract phone number from WhatsApp sender
      const phoneNumber = from;
      
      return {
        reply: `Numărul de telefon ${phoneNumber} este corect și poate fi folosit pentru programare?`,
        buttons: ['✅ Da, este corect', '✏️ Nu, introduc alt număr', '❌ Închide'],
        session: {
          step: 'awaiting_phone_confirm',
          data: { ...session.data, firstName: v.firstName ?? '', lastName: v.lastName ?? '', fullName: `${v.firstName ?? ''} ${v.lastName ?? ''}`, phoneNumber },
        },
      };
    }

    case 'awaiting_phone_confirm': {
      if (text.includes('✅ Da, este corect') || text.toLowerCase().includes('da, este corect')) {
        // User confirmed phone number - send SMS verification
        const phoneNumber = session.data.phoneNumber || from;
        const sanitized = sanitizePhone(phoneNumber);
        
        if (!sanitized) {
          return {
            reply: 'Numărul de telefon nu este valid. Vă rugăm încercați din nou.',
            buttons: ['🔙 Înapoi la meniu'],
            session: { step: 'idle', data: {} },
          };
        }

        // Check MAX_ACTIVE_BOOKINGS limit immediately after phone normalization
        const activeBookingsCount = await countActiveBookings(sanitized);
        const MAX_BOOKINGS = BUSINESS_CONFIG.maxActiveBookingsPerPhone;
        
        const isTestPhone = TEST_PHONE_NORMALIZED && sanitizePhone(phoneNumber) === TEST_PHONE_NORMALIZED;
        if (!isTestPhone && activeBookingsCount >= MAX_BOOKINGS) {
          return {
            reply: `Numărul ${phoneNumber} are deja ${activeBookingsCount} programări active, numărul maxim permis. Vă rugăm să anulați o programare existentă înainte de a face una nouă.`,
            buttons: ['🔙 Înapoi la meniu'],
            session: { step: 'idle', data: {} },
          };
        }

        // Generate and send SMS verification code
        const code = Math.floor(Math.pow(10, OTP_CODE_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_CODE_LENGTH - 1)).toString();
        const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toISOString();
        
        // Store verification code temporarily
        otpSessions.set(sanitized, code);
        
        // Check if SMS provider is configured
        const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];
        
      if (!smsConfigured) {
        console.log(`[SMS SIMULATION] Phone: ${sanitized}, Code: ${code}`);
        return {
          reply: `Am trimis un SMS cu codul de verificare la numărul ${phoneNumber}. (Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_booking_phone_verification_code',
            data: {
              ...session.data,
              verificationCode: code,
              verificationExpires: expiresAt,
              verifiedPhone: sanitized,
              phoneNumber: phoneNumber,
            },
          },
        };
      }
        
        // In production, this would send actual SMS
        console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
        
        return {
          reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_booking_phone_verification_code',
            data: { 
              ...session.data,
              verificationCode: code,
              verificationExpires: expiresAt,
              verifiedPhone: sanitized,
            },
          },
        };
      }
      
      if (text.includes('✏️ Nu, introduc alt număr') || text.toLowerCase().includes('nu, introduc alt număr')) {
        return {
          reply: 'Introduceți numărul de telefon pe care doriți să îl folosim pentru programare.',
          buttons: ['🔙 Înapoi la meniu'],
          session: {
            step: 'awaiting_manual_phone_input',
            data: session.data,
          },
        };
      }
      
      if (text.includes('❌ Închide') || text.toLowerCase().includes('închide')) {
        return {
          reply: waIdleGreetingReply(),
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      
      return {
        reply: 'Vă rugăm alegeți una dintre opțiunile disponibile.',
        buttons: ['✅ Da, este corect', '✏️ Nu, introduc alt număr', '❌ Închide'],
        session,
      };
    }

    case 'awaiting_manual_phone_input': {
      const phoneInput = text.trim();
      const sanitized = sanitizePhone(phoneInput);
      
      if (!sanitized) {
        return {
          reply: 'Numărul de telefon nu este valid. Vă rugăm introduceți un număr corect (ex: 07xxxxxxxxx).',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }
      
      // Generate and send SMS verification code
      const code = Math.floor(Math.pow(10, OTP_CODE_LENGTH - 1) + Math.random() * 9 * Math.pow(10, OTP_CODE_LENGTH - 1)).toString();
      const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toISOString();
      
      // Store verification code temporarily
      otpSessions.set(sanitized, code);
      
      // Check if SMS provider is configured
      const smsConfigured = process.env['SMS_PROVIDER'] && process.env['SMS_API_KEY'];
      
    if (!smsConfigured) {
      console.log(`[SMS SIMULATION] Phone: ${sanitized}, Code: ${code}`);
      return {
        reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_booking_phone_verification_code',
          data: {
            ...session.data,
            verificationCode: code,
            verificationExpires: expiresAt,
            verifiedPhone: sanitized,
            phoneNumber: phoneInput,
          },
        },
      };
    }
      
      // In production, this would send actual SMS
      console.log(`[SMS VERIFICATION] Phone: ${sanitized}, Code: ${code}`);
      
      return {
        reply: `Am trimis un SMS cu codul de verificare la numărul ${sanitized}. (Cod de test: ${code})`,
        buttons: ['🔙 Înapoi la meniu'],
        session: {
          step: 'awaiting_booking_phone_verification_code',
          data: { 
            ...session.data,
            verificationCode: code,
            verificationExpires: expiresAt,
            verifiedPhone: sanitized,
            phoneNumber: phoneInput,
          },
        },
      };
    }

    case 'awaiting_booking_phone_verification_code': {
      const inputCode = text.trim();
      const storedCode = session.data.verificationCode;
      const expiresAt = session.data.verificationExpires;
      
      // Check if code has expired
      if (expiresAt && dayjs().isAfter(dayjs(expiresAt))) {
        return {
          reply: 'Codul de verificare a expirat. Vă rugăm încercați din nou.',
          buttons: ['🔙 Înapoi la meniu'],
          session: { step: 'idle', data: {} },
        };
      }

      if (inputCode !== storedCode) {
        return {
          reply: 'Cod incorect. Vă rugăm introduceți codul primit prin SMS.',
          buttons: ['🔙 Înapoi la meniu'],
          session,
        };
      }

      // Code verified - proceed to booking summary
      const summary = `✅ Rezumat programare:\n\n👤 Nume: ${session.data.fullName}\n📱 Telefon: ${session.data.phoneNumber || session.data.verifiedPhone}\n📅 Data: ${session.data.displayDate}\n⏰ Ora: ${session.data.time}\n🦷 Serviciu: ${session.data.service}\n👨‍⚕️ Medic: ${session.data.doctorName}`;
      
      return {
        reply: `${summary}\n\nConfirmați programarea?`,
        buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
        session: {
          step: 'confirming',
          data: { ...session.data, ...(session.data.phoneNumber !== undefined && { phone: session.data.phoneNumber }), ...(session.data.verifiedPhone !== undefined && { phone: session.data.verifiedPhone }) },
        },
      };
    }

    case 'confirming': {
      if (waMatchesModify(text)) {
        return {
          reply: await buildServicePrompt(),
          buttons: await serviceQuickReplyLabels(),
          session: {
            step: 'awaiting_service',
            data: {},
          },
        };
      }
      if (waMatchesDeny(text)) {
        return {
          reply: 'Am anulat rezervarea. Cu ce vă mai putem ajuta?',
          buttons: [...WA_WELCOME_BUTTONS],
          session: { step: 'idle', data: {} },
        };
      }
      if (!waMatchesConfirm(text)) {
        return {
          reply: 'Vă rugăm alegeți „Confirm", „Anulez" sau „Modific".',
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }

      const d = session.data.date;
      const tm = session.data.time;
      const svc = session.data.service;
      const docId = session.data.doctorId || 'any';
      if (!d || !tm || !svc || !session.data.firstName || !session.data.lastName) {
        return {
          reply: 'Date incomplete. Reîncepeți cu „Modific" sau „Meniu".',
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }

      try {
        const result = await processBooking({
          phone: session.data.phone || session.data.phoneNumber || from,
          date: d,
          time: tm,
          service: svc,
          firstName: session.data.firstName,
          lastName: session.data.lastName,
          doctorId: docId,
          channel: 'WhatsApp',
        });

        const innerSummary = `👤 ${session.data.firstName} ${session.data.lastName}\n📅 ${session.data.displayDate}\n⏰ ${tm}\n🦷 ${svc}\n👨‍⚕️ ${result.doctorName}`;

        // Ask for email AFTER confirmation
        if (!session.data.email) {
          return {
            reply: `🎉 Programarea a fost confirmată!\n\n${innerSummary}\n📍 ${BUSINESS_CONFIG.location}\n\nDoriți să primiți confirmarea pe email? Dacă introduceți adresa de email, vă vom trimite confirmarea programării, adresa clinicii și un eveniment în calendar.`,
            buttons: ['Introdu email', 'Sari peste'],
            session: { step: 'awaiting_email', data: { ...session.data } },
          };
        }

        // Send email if already provided
        if (session.data.email) {
          const icsAttachment = generateICSAttachment({
            id: `wa-${session.data.phone}-${d}-${tm}`,
            date: d,
            time: tm,
            service: svc,
            doctorName: result.doctorName,
            firstName: session.data.firstName || '',
            lastName: session.data.lastName || ''
          });

          const mailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <p>Bună ziua, <strong>${session.data.firstName} ${session.data.lastName}</strong>,</p>
              <p>Programarea dumneavoastră la <strong>${BUSINESS_CONFIG.name}</strong> a fost confirmată.</p>
              <p><strong>Dată:</strong> ${d}<br/><strong>Ora:</strong> ${tm}<br/><strong>Serviciu:</strong> ${svc}<br/><strong>Medic:</strong> ${result.doctorName}</p>
              <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
              <div style="margin: 20px 0;">
                <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
              </div>
            </div>`;
          await sendEmail(session.data.email, `Confirmare programare — ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
        }

        return {
          reply: `🎉 Programarea a fost confirmată!\n\n${innerSummary}\n📍 ${BUSINESS_CONFIG.location}\n\nVă așteptăm! Dacă doriți să modificați sau să anulați programarea, răspundeți cu 'modificare' sau 'anulare' oricând.`,
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Eroare la rezervare.';
        if (msg.includes('limita') || msg.includes('maxim') || msg.includes('MAX_BOOKINGS')) {
          return {
            reply: `⚠️ Aveți deja ${BUSINESS_CONFIG.maxActiveBookingsPerPhone} programări active.\n\nPentru a face o programare nouă, anulați una existentă sau contactați recepția la ${CLINIC_CONFIG.clinicPhone}.`,
            buttons: ['❌ Anulez o programare', '📞 Contactează recepția', '🏠 Meniu principal'],
            session: { step: 'idle', data: {} },
          };
        }
        return {
          reply:
            msg.startsWith('⚠️') || msg.startsWith('Ne pare')
              ? msg
              : `Ne pare rău, nu am putut finaliza programarea: ${msg}`,
          buttons: ['✅ Confirm', '❌ Anulez', '✏️ Modific'],
          session,
        };
      }
    }

    case 'awaiting_email': {
      // User tapped "Introdu email" or typed an email
      if (waMatchesSkipEmail(text) || text === 'Sari peste') {
        return {
          reply: 'În regulă! Vă așteptăm la clinică. Dacă doriți să modificați sau să anulați programarea, răspundeți cu \'modificare\' sau \'anulare\' oricând.',
          buttons: [],
          session: { step: 'confirmed', data: {} },
        };
      }

      // User tapped "Introdu email" button — ask for the actual email address
      if (text === 'Introdu email') {
        return {
          reply: 'Introduceți adresa de email:',
          buttons: ['Sari peste'],
          session: { step: 'awaiting_email', data: { ...session.data } },
        };
      }

      // User typed an actual email address
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (emailRegex.test(text.trim())) {
        const email = text.trim();
        // Send confirmation email
        try {
          const d = session.data.date;
          const tm = session.data.time;
          const svc = session.data.service;
          const doctorName = session.data.doctorName || 'Medicul dumneavoastră';
          
          const icsAttachment = generateICSAttachment({
            id: `wa-${session.data.phone}-${d}-${tm}`,
            date: d ?? '',
            time: tm ?? '',
            service: svc ?? '',
            doctorName: doctorName,
            firstName: session.data.firstName || '',
            lastName: session.data.lastName || ''
          });

          const mailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <p>Bună ziua, <strong>${session.data.firstName} ${session.data.lastName}</strong>,</p>
              <p>Programarea dumneavoastră la <strong>${BUSINESS_CONFIG.name}</strong> a fost confirmată.</p>
              <p><strong>Dată:</strong> ${d}<br/><strong>Ora:</strong> ${tm}<br/><strong>Serviciu:</strong> ${svc}<br/><strong>Medic:</strong> ${doctorName}</p>
              <p>📍 <strong>Locație:</strong> ${BUSINESS_CONFIG.location}</p>
              <div style="margin: 20px 0;">
                <a href="${getGoogleMapsLink()}" style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Google Maps</a>
              </div>
            </div>`;
          await sendEmail(email, `Confirmare programare — ${BUSINESS_CONFIG.name}`, mailHtml, [icsAttachment]);
          return {
            reply: `✅ Am trimis confirmarea la ${email}. Vă așteptăm la clinică!`,
            buttons: [],
            session: { step: 'confirmed', data: {} },
          };
        } catch {
          return {
            reply: 'Nu am putut trimite emailul. Vă așteptăm la clinică!',
            buttons: [],
            session: { step: 'confirmed', data: {} },
          };
        }
      }

      // Invalid input
      return {
        reply: 'Introduceți o adresă de email validă (ex: nume@exemplu.ro) sau apăsați „Sari peste".',
        buttons: ['Sari peste'],
        session,
      };
    }

    default:
      return {
        reply: waIdleGreetingReply(),
        buttons: [...WA_WELCOME_BUTTONS],
        session: { step: 'idle', data: {} },
      };
  }
};
