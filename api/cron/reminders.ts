import type { VercelRequest, VercelResponse } from '@vercel/node';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import { getSupabase, CLINIC_CONFIG, BUCHAREST_TZ } from '../lib/shared.js';

const CRON_SECRET = process.env['CRON_SECRET'] || '';
const WA_TOKEN = process.env['WHATSAPP_TOKEN'] || process.env['WA_TOKEN'] || '';
const WA_PHONE_ID = process.env['WHATSAPP_PHONE_NUMBER_ID'] || process.env['WA_PHONE_NUMBER_ID'] || '';

async function sendWhatsAppReminder(toPhone: string, message: string): Promise<boolean> {
  if (!WA_TOKEN || !WA_PHONE_ID) {
    console.log(`[Reminder SIMULATION] To: ${toPhone} | ${message}`);
    return true;
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${WA_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WA_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: toPhone,
          type: 'text',
          text: { body: message },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('[Reminder] WhatsApp API error:', err);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Reminder] fetch error:', e.message);
    return false;
  }
}

function buildReminderMessage(
  template: string,
  appointment: {
    first_name: string;
    last_name: string;
    time: string;
    doctor_name: string;
    service: string;
    date: string;
  },
  clinicName: string,
  clinicAddress: string
): string {
  return template
    .replace(/\{nume\}/gi, `${appointment.first_name} ${appointment.last_name}`)
    .replace(/\{ora\}/gi, appointment.time)
    .replace(/\{doctor\}/gi, appointment.doctor_name || 'medicul dumneavoastra')
    .replace(/\{serviciu\}/gi, appointment.service)
    .replace(/\{data\}/gi, appointment.date)
    .replace(/\{clinica\}/gi, clinicName)
    .replace(/\{adresa\}/gi, clinicAddress);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = req.headers['authorization'];
    const expected = `Bearer ${CRON_SECRET}`;
    if (!CRON_SECRET || auth !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clinicId = CLINIC_CONFIG.id;
    const supabase = getSupabase();

    // Read reminder config from DB
    const { data: configRows } = await supabase
      .from('clinic_config')
      .select('key, value')
      .eq('clinic_id', clinicId)
      .in('key', ['REMINDER_LEAD_HOURS', 'REMINDER_MESSAGE_TEMPLATE', 'CLINIC_NAME', 'CLINIC_ADDRESS']);

    const configMap: Record<string, string> = {};
    (configRows || []).forEach((r: any) => { configMap[r.key] = r.value; });

    const leadHours = parseInt(configMap['REMINDER_LEAD_HOURS'] || '24', 10);
    const template = configMap['REMINDER_MESSAGE_TEMPLATE'] ||
      'Buna ziua {nume}! Va reamintim ca aveti o programare la {ora} cu {doctor} la {clinica}. Adresa: {adresa}.';
    const clinicName = configMap['CLINIC_NAME'] || CLINIC_CONFIG.name;
    const clinicAddress = configMap['CLINIC_ADDRESS'] || CLINIC_CONFIG.location;

    // Find appointments in reminder window: [leadHours - 0.5h, leadHours + 0.5h] from now
    const now = dayjs().tz(BUCHAREST_TZ);
    const windowStart = now.add(leadHours, 'hour').subtract(30, 'minute');
    const windowEnd = now.add(leadHours, 'hour').add(30, 'minute');

    const windowStartDate = windowStart.format('YYYY-MM-DD');
    const windowEndDate = windowEnd.format('YYYY-MM-DD');
    const windowStartTime = windowStart.format('HH:mm');
    const windowEndTime = windowEnd.format('HH:mm');

    // Fetch confirmed appointments in date window
    const { data: appointments, error: aptsError } = await supabase
      .from('appointments')
      .select('id, first_name, last_name, phone, phone_normalized, date, time, service, doctor_name')
      .eq('clinic_id', clinicId)
      .eq('status', 'Confirmed')
      .gte('date', windowStartDate)
      .lte('date', windowEndDate);

    if (aptsError) throw aptsError;

    const eligible = (appointments || []).filter((apt: any) => {
      const aptDateTime = dayjs.tz(`${apt.date}T${apt.time}:00`, BUCHAREST_TZ);
      return aptDateTime.isAfter(windowStart) && aptDateTime.isBefore(windowEnd);
    });

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const apt of eligible) {
      // Check if already sent
      const { data: alreadySent } = await supabase
        .from('reminder_log')
        .select('id')
        .eq('appointment_id', apt.id)
        .eq('clinic_id', clinicId)
        .limit(1);

      if (alreadySent && alreadySent.length > 0) {
        skipped++;
        continue;
      }

      // Build phone number for WhatsApp (needs country code)
      const phone = apt.phone || apt.phone_normalized || '';
      if (!phone) { errors++; continue; }

      // Normalize to international format for WhatsApp
      const digits = phone.replace(/\D/g, '');
      const waPhone = digits.startsWith('40') ? digits : digits.startsWith('0') ? `40${digits.slice(1)}` : `40${digits}`;

      const message = buildReminderMessage(template, apt, clinicName, clinicAddress);
      const success = await sendWhatsAppReminder(waPhone, message);

      if (success) {
        await supabase.from('reminder_log').insert({
          appointment_id: apt.id,
          clinic_id: clinicId,
        });
        sent++;
      } else {
        errors++;
      }
    }

    return res.json({
      success: true,
      ranAt: new Date().toISOString(),
      leadHours,
      eligible: eligible.length,
      sent,
      skipped,
      errors,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron reminders failed';
    console.error('[cron/reminders]', msg);
    return res.status(500).json({ error: msg });
  }
}
