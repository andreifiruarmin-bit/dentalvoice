import type { VercelRequest, VercelResponse } from '@vercel/node';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
dayjs.extend(utc);
dayjs.extend(timezone);

import { 
  getSupabase, 
  CLINIC_CONFIG, 
  sendSmsReminder,
  calculateReminderSendTime,
  getCachedDoctors,
  getClinicId,
  CRON_WINDOW_MINUTES,
  BUCHAREST_TZ,
} from '../lib/shared.js';

const CRON_SECRET = process.env['CRON_SECRET'] || '';

// Romanian date formatting constants
const ZILE_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 
                 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

function buildReminderMessage(
  template: string,
  appointment: {
    patient_name?: string;
    first_name?: string;
    last_name?: string;
    time: string;
    doctor_name: string;
    service: string;
    date: string;
  },
  clinicName: string,
  clinicPhone: string,
  clinicAddress: string
): string {
  // Handle both new patient_name and legacy first_name/last_name
  const patientName = appointment.patient_name || 
    `${appointment.first_name || ''} ${appointment.last_name || ''}`.trim();
  
  // Format date in Romanian
  const dateObj = new Date(appointment.date);
  const dayName = ZILE_RO[dateObj.getDay()];
  const day = dateObj.getDate();
  const monthName = LUNI_RO[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  const formattedDate = `${dayName}, ${day} ${monthName} ${year}`;

  return template
    .replace(/\{\{PATIENT_NAME\}\}/gi, patientName || 'Pacient')
    .replace(/\{\{APPOINTMENT_DATE\}\}/gi, formattedDate)
    .replace(/\{\{APPOINTMENT_TIME\}\}/gi, appointment.time)
    .replace(/\{\{DOCTOR_NAME\}\}/gi, appointment.doctor_name || 'medicul dumneavoastră')
    .replace(/\{\{CLINIC_NAME\}\}/gi, clinicName)
    .replace(/\{\{CLINIC_PHONE\}\}/gi, clinicPhone)
    .replace(/\{\{CLINIC_ADDRESS\}\}/gi, clinicAddress);
}

  export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Luăm header-ul x-cron-secret
    const cronHeader = req.headers['x-cron-secret'];
    
    // Comparăm direct cu CRON_SECRET (fără "Bearer")
    if (!CRON_SECRET || cronHeader !== CRON_SECRET) {
      console.error('[AUTH FAIL] Header primit:', cronHeader, 'Expected:', CRON_SECRET);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const clinicId = getClinicId();
    const supabase = getSupabase();

    // Read reminder config from new columns
    const { data: configRows } = await supabase
      .from('clinic_config')
      .select('*')
      .eq('clinic_id', clinicId)
      .single();

    if (!configRows) {
      console.log('[Reminder Cron] No clinic config found, skipping');
      return res.json({ success: true, message: 'No clinic config found' });
    }

    // Check if reminders are enabled
    if (!configRows.reminder_enabled) {
      console.log('[Reminder Cron] Reminders disabled, skipping');
      return res.json({ success: true, message: 'Reminders disabled' });
    }

    const leadHours = configRows.reminder_lead_hours || 24;
    const template = configRows.reminder_message_template ||
      'Bună {{PATIENT_NAME}}! Ai o programare la {{CLINIC_NAME}} pe {{APPOINTMENT_DATE}} la ora {{APPOINTMENT_TIME}}. Te așteptăm la {{CLINIC_ADDRESS}}. Informații: {{CLINIC_PHONE}}';

    // Get clinic working hours from config
    const workingHoursStart = configRows.working_hours_start || '09:00';
    const workingHoursEnd = configRows.working_hours_end || '18:00';

    // Get working days from doctors (use clinic default if no doctor-specific days)
    const doctors = await getCachedDoctors(clinicId);
    const workingDays = doctors[0]?.workingDays?.length ? 
      doctors[0].workingDays.map((dayIndex: number) => ZILE_RO[dayIndex]) :
      ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri'];

    // Query appointments within next (leadHours + 48) hours
    const now = dayjs().tz(BUCHAREST_TZ);
    const maxDate = now.add(leadHours + 48, 'hour');
    const maxDateStr = maxDate.format('YYYY-MM-DD');

    const { data: appointments, error: aptsError } = await supabase
      .from('appointments')
      .select('id, first_name, last_name, patient_name, phone_normalized, date, time, service, doctor_name, doctor_id')
      .eq('clinic_id', clinicId)
      .in('status', ['confirmed', 'pending'])
      .not('phone_normalized', 'is', null)
      .gte('date', now.format('YYYY-MM-DD'))
      .lte('date', maxDateStr);

    if (aptsError) throw aptsError;

    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const cronWindowEnd = now.add(CRON_WINDOW_MINUTES, 'minute').toDate(); // Next 60 minutes

    for (const apt of appointments || []) {
      try {
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

        // Create appointment datetime
        const appointmentDatetime = new Date(`${apt.date}T${apt.time}:00`);

        // Calculate when to send the reminder
        const sendTime = calculateReminderSendTime(
          appointmentDatetime,
          leadHours,
          workingHoursStart,
          workingHoursEnd,
          workingDays
        );

        if (!sendTime) {
          console.log(`[Reminder Cron] No valid send time for appointment ${apt.id} (${apt.date} ${apt.time})`);
          skipped++;
          continue;
        }

        // Check if send time is within current cron window
        if (sendTime > cronWindowEnd) {
          console.log(`[Reminder Cron] Send time ${sendTime.toISOString()} is outside cron window for appointment ${apt.id}`);
          skipped++;
          continue;
        }

        // Build message
        const message = buildReminderMessage(
          template,
          apt,
          configRows.clinic_name || CLINIC_CONFIG.name,
          configRows.clinic_phone || CLINIC_CONFIG.clinicPhone,
          configRows.clinic_address || CLINIC_CONFIG.location
        );

        // Send SMS
        const result = await sendSmsReminder(apt.phone_normalized!, message, clinicId);

        if (result.success) {
          // Log successful send
          await supabase.from('reminder_log').insert({
            appointment_id: apt.id,
            clinic_id: clinicId,
            phone_normalized: apt.phone_normalized,
            sent_at: new Date().toISOString(),
          });
          
          console.log(`[Reminder Cron] Sent SMS to ${apt.phone_normalized} for appointment ${apt.id}`);
          sent++;
        } else {
          console.error(`[Reminder Cron] Failed to send SMS to ${apt.phone_normalized}: ${result.error}`);
          errors++;
        }
      } catch (err: any) {
        console.error(`[Reminder Cron] Error processing appointment ${apt.id}:`, err.message);
        errors++;
      }
    }

    return res.json({
      success: true,
      ranAt: new Date().toISOString(),
      leadHours,
      eligible: appointments?.length || 0,
      sent,
      skipped,
      errors,
      workingHours: { start: workingHoursStart, end: workingHoursEnd },
      workingDays,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Cron reminders failed';
    console.error('[cron/reminders]', msg);
    return res.status(500).json({ error: msg });
  }
}
