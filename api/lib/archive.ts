import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';

dayjs.extend(utc);
dayjs.extend(timezone);

import { BUCHAREST_TZ, BUSINESS_CONFIG, calendar, getSupabase } from './shared';

export const runArchive = async (
  clinicId: string
): Promise<{ archived: number; errors: string[] }> => {
  const errors: string[] = [];

  const yesterday = dayjs.tz(dayjs(), BUCHAREST_TZ).subtract(1, 'day').format('YYYY-MM-DD');

  const { data: toArchive, error: fetchError } = await getSupabase()
    .from('appointments')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('status', 'Confirmed')
    .lte('date', yesterday);

  if (fetchError) {
    throw new Error(fetchError.message || 'Eroare la citirea programărilor pentru arhivare.');
  }

  if (!toArchive || toArchive.length === 0) {
    return { archived: 0, errors: [] };
  }

  let archived = 0;

  for (const row of toArchive as any[]) {
    try {
      const service = BUSINESS_CONFIG.services.find(
        (s) => s.name === row.service || s.id === row.service
      );
      const durationMinutes =
        service?.durationMinutes || BUSINESS_CONFIG.scheduling.defaultServiceDuration;

      const start = dayjs.tz(`${row.date}T${row.time}:00`, BUCHAREST_TZ);
      const end = start.add(durationMinutes, 'minute');

      const summary = `${row.first_name} ${row.last_name} — ${row.service}`;

      const { error: insertErr } = await getSupabase().from('appointment_history').insert([
        {
          clinic_id: clinicId,
          doctor_id: row.doctor_id,
          event_id: row.google_event_id,
          summary,
          description: JSON.stringify(row),
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          archived_at: new Date().toISOString(),
        },
      ]);

      if (insertErr) {
        throw new Error(`appointment_history insert failed: ${insertErr.message}`);
      }

      // Try to delete Google event (non-blocking)
      try {
        const doctor = BUSINESS_CONFIG.resources.find((d) => d.id === row.doctor_id);
        const calendarId = doctor?.calendarId;
        if (calendarId && row.google_event_id) {
          await calendar.events.delete({ calendarId, eventId: row.google_event_id });
        }
      } catch (gErr) {
        console.warn('[archive] Google delete failed:', gErr);
      }

      const { error: deleteErr } = await getSupabase()
        .from('appointments')
        .delete()
        .eq('id', row.id)
        .eq('clinic_id', clinicId);

      if (deleteErr) {
        throw new Error(`appointments delete failed: ${deleteErr.message}`);
      }

      archived += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      errors.push(`id=${row?.id ?? 'unknown'}: ${msg}`);
      continue;
    }
  }

  return { archived, errors };
};

