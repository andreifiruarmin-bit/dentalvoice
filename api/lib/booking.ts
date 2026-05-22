/**
 * DentalVoice Booking Engine
 *
 * RESPONSIBILITY: Slot generation, availability checking, load balancing,
 * and the core processBooking workflow.
 *
 * IMPORTS: shared.ts for configuration, Supabase, and date utilities
 */

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore.js';
import 'dayjs/locale/ro.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isSameOrBefore);

import {
  BUCHAREST_TZ,
  BUSINESS_CONFIG,
  CLINIC_CONFIG,
  type DoctorResource,
  getSupabase,
  sanitizePhone,
  normalizePhoneForSearch,
  TEST_PHONE_NORMALIZED,
  PENDING_APPOINTMENT_STALE_MINUTES,
  getCachedDoctors,
  getDoctorsFromDB,
  parseRomanianDate,
  formatQuickDayLabelRo,
  getClinicId,
  SLOT_BUFFER_TODAY_MINUTES,
  NEXT_WORKING_DAYS_COUNT,
  MAX_DAY_SEARCH,
} from './shared.js';

// ==========================================
// ACTIVE BOOKING COUNT
// ==========================================

export const countActiveBookings = async (phone: string) => {
  const sanitized = sanitizePhone(phone);
  if (!sanitized) return 0;
  const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
  const staleThreshold = dayjs().tz(BUCHAREST_TZ).subtract(PENDING_APPOINTMENT_STALE_MINUTES, 'minute').toISOString();

  const { count, error } = await getSupabase()
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('clinic_id', getClinicId())
    .eq('phone_normalized', sanitized)
    .gte('date', today)
    .or(`status.in.(Confirmed),and(status.eq.Pending,created_at.gt.${staleThreshold})`);

  if (error) {
    console.error('countActiveBookings Supabase error:', error.message);
    return 0;
  }
  return count ?? 0;
};

// ==========================================
// DOCTOR AVAILABILITY HELPERS
// ==========================================

export const isDoctorWorking = (doctor: DoctorResource, date: string, time: string, durationMinutes: number = 30) => {
  const dayOfWeek = dayjs.tz(date, BUCHAREST_TZ).day();
  const workingDays = doctor.workingDays || [1, 2, 3, 4, 5];

  if (!workingDays.includes(dayOfWeek)) return false;

  const hours = doctor.workingHours || BUSINESS_CONFIG.scheduling.workingHours;

  const startDateTime = dayjs.tz(`${date}T${time}:00`, BUCHAREST_TZ);
  const endDateTime = startDateTime.add(durationMinutes, 'minute');

  const workingStart = dayjs.tz(`${date}T${hours.start}:00`, BUCHAREST_TZ);
  const workingEnd = dayjs.tz(`${date}T${hours.end}:00`, BUCHAREST_TZ);

  if (startDateTime.isBefore(workingStart) || endDateTime.isAfter(workingEnd)) return false;

  return true;
};

/** Google Calendar event shape for overlap checks */
type GcalEventLike = {
  start?: { dateTime?: string | null; date?: string | null };
  end?: { dateTime?: string | null; date?: string | null };
};

/** Google Calendar event bounds; all-day uses Europe/Bucharest midnight with exclusive end date. */
interface GcalInterval {
  start: dayjs.Dayjs;
  end: dayjs.Dayjs;
}

const parseGcalEventBounds = (ev: GcalEventLike): GcalInterval | null => {
  const s = ev.start?.dateTime || ev.start?.date;
  const e = ev.end?.dateTime || ev.end?.date;
  if (!s || !e) return null;
  if (ev.start?.dateTime && ev.end?.dateTime) {
    return { start: dayjs(ev.start.dateTime), end: dayjs(ev.end.dateTime) };
  }
  const start = dayjs.tz(s, BUCHAREST_TZ).startOf('day');
  const endExclusive = dayjs.tz(e, BUCHAREST_TZ).startOf('day');
  return { start, end: endExclusive };
};

const intervalsOverlap = (a: GcalInterval, b: GcalInterval): boolean =>
  a.start.isBefore(b.end) && a.end.isAfter(b.start);

const isWindowFreeOfEvents = (
  events: GcalEventLike[],
  windowStart: dayjs.Dayjs,
  windowEnd: dayjs.Dayjs
): boolean => {
  const win: GcalInterval = { start: windowStart, end: windowEnd };
  for (const ev of events) {
    const b = parseGcalEventBounds(ev);
    if (!b) continue;
    if (intervalsOverlap(b, win)) return false;
  }
  return true;
};

export const doctorCanAccommodateSlot = (
  doctor: DoctorResource,
  isoDate: string,
  slotTimeHHmm: string,
  durationMinutes: number,
  doctorDayEvents: GcalEventLike[]
): boolean => {
  if (!doctor.calendarId) return false;
  if (!isDoctorWorking(doctor, isoDate, slotTimeHHmm, durationMinutes)) return false;
  const windowStart = dayjs.tz(`${isoDate}T${slotTimeHHmm}:00`, BUCHAREST_TZ);
  const windowEnd = windowStart.add(durationMinutes, 'minute');
  return isWindowFreeOfEvents(doctorDayEvents, windowStart, windowEnd);
};

// ==========================================
// DATE & DAY UTILITIES
// ==========================================

export const nextFiveWorkingDayOptions = async (
  doctorWorkingDays?: number[],
  doctorId: string = 'any',
  durationMinutes: number = BUSINESS_CONFIG.scheduling.defaultServiceDuration
): Promise<{ label: string; iso: string }[]> => {
  const results: { label: string; iso: string }[] = [];
  let cur = dayjs().tz(BUCHAREST_TZ).startOf('day');
  let checked = 0;

  while (results.length < NEXT_WORKING_DAYS_COUNT && checked < MAX_DAY_SEARCH) {
    const isoDate = cur.format('YYYY-MM-DD');
    const dow = cur.day(); // 0=Sun, 1=Mon, ..., 6=Sat

    if (doctorWorkingDays && doctorWorkingDays.length > 0) {
      if (!doctorWorkingDays.includes(dow)) {
        cur = cur.add(1, 'day');
        checked++;
        continue;
      }
    } else if (dow === 0 || dow === 6) {
      cur = cur.add(1, 'day');
      checked++;
      continue;
    }

    const { data: holiday } = await getSupabase()
      .from('clinic_holidays')
      .select('id')
      .eq('clinic_id', getClinicId())
      .eq('date', isoDate)
      .limit(1);
    if (holiday && holiday.length > 0) {
      cur = cur.add(1, 'day');
      checked++;
      continue;
    }

    let slots = await getAvailableSlotsForDoctor(doctorId, isoDate, durationMinutes);
    slots = filterSlotsMinLead(isoDate, slots);
    if (slots.length === 0) {
      cur = cur.add(1, 'day');
      checked++;
      continue;
    }

    results.push({ label: formatQuickDayLabelRo(isoDate), iso: isoDate });
    cur = cur.add(1, 'day');
    checked++;
  }
  return results;
};

/** Resolve concrete doctor when booking flow uses load balancing (`any`). */
export const resolveDoctorIdForSlot = async (
  doctorIdOrAny: string,
  isoDate: string,
  slotTime: string,
  durationMinutes: number
): Promise<string | null> => {
  if (doctorIdOrAny !== 'any') return doctorIdOrAny;
  const allDoctors = await getDoctorsFromDB(getClinicId());
  for (const doctor of allDoctors.filter((d) => d.id !== 'any')) {
    let slots = await getAvailableSlotsForDoctor(doctor.id, isoDate, durationMinutes);
    slots = filterSlotsMinLead(isoDate, slots);
    if (slots.includes(slotTime)) return doctor.id;
  }
  return null;
};

const TEMP_HOLD_SECONDS = 90;

/** Create a 90-second ephemeral hold on a slot (WebBot / WhatsApp / dashboard). */
export const createTempReservationHold = async (
  doctorId: string,
  date: string,
  time: string,
  durationMinutes?: number
): Promise<{ id: string; expires_at: string } | null> => {
  const dur = durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
  const resolvedDoctorId =
    doctorId === 'any' ? await resolveDoctorIdForSlot('any', date, time, dur) : doctorId;
  if (!resolvedDoctorId) return null;

  const supabase = getSupabase();
  const clinicId = getClinicId();
  const slotStepMinutes = BUSINESS_CONFIG.scheduling.slotStepMinutes;
  const [h, m] = time.split(':').map(Number);
  const endTotal = h * 60 + m + slotStepMinutes;
  const timeEnd = `${Math.floor(endTotal / 60).toString().padStart(2, '0')}:${(endTotal % 60).toString().padStart(2, '0')}`;
  const expiresAt = new Date(Date.now() + TEMP_HOLD_SECONDS * 1000).toISOString();

  await supabase.from('temp_reservations').delete().lt('expires_at', new Date().toISOString());

  const { data, error } = await supabase
    .from('temp_reservations')
    .insert({
      clinic_id: clinicId,
      doctor_id: resolvedDoctorId,
      date,
      time_start: time,
      time_end: timeEnd,
      expires_at: expiresAt,
    })
    .select('id, expires_at')
    .single();

  if (error) return null;
  return { id: data.id, expires_at: data.expires_at };
};

export const releaseTempReservationHold = async (id: string): Promise<void> => {
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from('temp_reservations').delete().eq('id', id);
};

export const checkIfDayIsFullyBlocked = async (date: string, doctorId: string): Promise<boolean> => {
  const supabase = getSupabase();
  const clinicId = getClinicId();

  // Get doctor's working hours
  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (!doctor) return false;

  const startH = parseInt(doctor.workingHours.start.split(':')[0]);
  const endH = parseInt(doctor.workingHours.end.split(':')[0]);
  const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');
  const endTotalMin = endH * 60 + endM;

  // Generate all possible slots for this day
  const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;
  const slotStarts: string[] = [];
  for (let h = startH; h < endH; h++) {
    for (let m = 0; m < 60; m += step) {
      const slotStart = h * 60 + m;
      const slotEnd = slotStart + step;
      if (slotEnd > endTotalMin) continue;
      slotStarts.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
    }
  }

  // Check if each slot is covered by a blocked slot
  for (const slotTime of slotStarts) {
    const hasBlockConflict = await supabase
      .from('blocked_slots')
      .select('time_start, time_end')
      .eq('clinic_id', clinicId)
      .eq('doctor_id', doctorId)
      .eq('date', date)
      .or(
        `time_start.lte.${slotTime}`, // Block starts before or at this slot
        `time_end.gt.${slotTime}`   // Block ends after this slot
      )
      .maybeSingle();

    if (hasBlockConflict.data && hasBlockConflict.data.length > 0) {
      return true; // Day is fully blocked
    }
  }

  return false; // Day is not fully blocked
};

export const filterSlotsMinLead = (isoDate: string, slots: string[]): string[] => {
  const minH = CLINIC_CONFIG.scheduling.minLeadTimeHours ?? 2;
  const now = dayjs().tz(BUCHAREST_TZ);
  const today = now.format('YYYY-MM-DD');
  if (isoDate !== today) return slots;
  const cutoff = now.add(minH, 'hour');
  return slots.filter((s) => dayjs.tz(`${isoDate}T${s}:00`, BUCHAREST_TZ).isAfter(cutoff));
};

export const findActiveAppointmentForPhone = async (from: string) => {
  const phoneNormalized = sanitizePhone(from);
  if (!phoneNormalized) return null;
  const today = dayjs().tz(BUCHAREST_TZ).format('YYYY-MM-DD');
  const { data, error } = await getSupabase()
    .from('appointments')
    .select('*')
    .eq('clinic_id', getClinicId())
    .eq('phone_normalized', phoneNormalized)
    .in('status', ['Confirmed', 'Pending'])
    .gte('date', today)
    .order('date', { ascending: true })
    .order('time', { ascending: true })
    .limit(1);

  if (error) {
    console.error('findActiveAppointmentForPhone:', error.message);
    return null;
  }
  return data?.[0] ?? null;
};

// ==========================================
// SLOT GENERATION & AVAILABILITY ENGINE
// ==========================================

export const getAvailableSlotsForDoctor = async (
  doctorIdOrAny: string,
  isoDate: string,
  durationMinutes: number,
  skipTempReservations: boolean = false
): Promise<string[]> => {
  const supabase = getSupabase();
  const clinicId = getClinicId();

  // DOCTOR FILTERING: Support both specific doctors and 'any' for load balancing
  const allDoctors = await getDoctorsFromDB(clinicId);
  const doctors =
    doctorIdOrAny === 'any'
      ? allDoctors.filter((d: DoctorResource) => d.id !== 'any')
      : allDoctors.filter((d: DoctorResource) => d.id === doctorIdOrAny);

  if (doctors.length === 0) return [];

  // CRITICAL: All date calculations MUST use BUCHAREST_TZ for Romanian business hours
  const dayOfWeek = dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ).day(); // 0=Dum..6=Sat
  const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;

  // ORPHAN CLEANUP: Fire-and-forget cleanup of expired temp reservations
  supabase.from('temp_reservations').delete().lt('expires_at', new Date().toISOString())
    // no await - do not block the response

  // DATABASE QUERIES: Fetch existing bookings and blocked slots for conflict detection
  const { data: existingAppointments } = await supabase
    .from('appointments')
    .select('doctor_id, time, service')
    .eq('clinic_id', clinicId)
    .eq('date', isoDate)
    .in('status', ['Pending', 'Confirmed']); // Include both pending and confirmed

  const { data: blockedSlots } = await supabase
    .from('blocked_slots')
    .select('doctor_id, time_start, time_end')
    .eq('clinic_id', clinicId)
    .eq('date', isoDate);

  const { data: unlockedSlots } = await supabase
    .from('unlocked_slots')
    .select('doctor_id, time')
    .eq('date', isoDate);

  const { data: tempReservations } = await supabase
    .from('temp_reservations')
    .select('doctor_id, time_start, time_end')
    .eq('clinic_id', clinicId)
    .eq('date', isoDate)
    .gt('expires_at', new Date().toISOString());

  const availableSlots: string[] = [];

  // SLOT GENERATION LOOP: Generate all possible time slots for each doctor
  for (const doctor of doctors) {
    // WORKING DAY CHECK: Skip doctors not working on this day
    if (!doctor.workingDays.includes(dayOfWeek)) continue;

    // WORKING HOURS PARSING: Extract doctor's working hours in minutes for calculations
    const startH = parseInt(doctor.workingHours.start.split(':')[0]);
    const startM = parseInt(doctor.workingHours.start.split(':')[1] || '0');
    const endH = parseInt(doctor.workingHours.end.split(':')[0]);
    const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');
    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;

    // TIME SLOT GENERATION: Create all possible slots (00:00-23:59) and filter by working hours unless unlocked
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += step) {
        const slotStart = h * 60 + m;
        const slotEnd = slotStart + durationMinutes;

        const slotTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        // Check if this slot is unlocked for this doctor
        const isUnlocked = (unlockedSlots || []).some((slot: any) =>
          slot.doctor_id === doctor.id && slot.time === slotTime
        );

        // WORKING HOURS BOUNDARY: Ensure slot is within working hours, unless unlocked
        if (!isUnlocked) {
          // For normal slots, enforce working hours boundaries
          if (slotStart < startTotalMin || slotEnd > endTotalMin) continue;
        }

        // CRITICAL: TIMEZONE-AWARE LEAD TIME FILTERING
        // All time comparisons MUST use BUCHAREST_TZ for Romanian business hours
        const slotDt = dayjs.tz(`${isoDate} ${slotTime}`, 'YYYY-MM-DD HH:mm', BUCHAREST_TZ);
        const now = dayjs().tz(BUCHAREST_TZ);
        const isToday = slotDt.isSame(now, 'day');

        if (isToday) {
          const [slotHour, slotMinute] = slotTime.split(':').map(Number);
          const slotTotalMinutes = slotHour * 60 + slotMinute;
          const nowTotalMinutes = now.hour() * 60 + now.minute();
          const minLeadMin = (CLINIC_CONFIG.scheduling.minLeadTimeHours ?? 2) * 60;
          const bufferMin = Math.max(SLOT_BUFFER_TODAY_MINUTES, minLeadMin);
          if (slotTotalMinutes <= nowTotalMinutes + bufferMin) continue;
        }
        // For future dates: all slots are available (no lead time restriction)

        // APPOINTMENT CONFLICT DETECTION: Check against existing bookings
        const hasBookingConflict = (existingAppointments || []).some((appt: any) => {
          if (appt.doctor_id !== doctor.id) return false;
          // Find service duration for existing appointment
          const existingSvc = BUSINESS_CONFIG.services.find(
            (s) => s.name === appt.service || s.id === appt.service
          );
          const existingDur = existingSvc?.durationMinutes ?? BUSINESS_CONFIG.scheduling.defaultServiceDuration;
          const [eH, eM] = appt.time.split(':').map(Number);
          const existStart = eH * 60 + eM;
          const existEnd = existStart + existingDur;
          // OVERLAP CHECK: Standard interval overlap detection
          return slotStart < existEnd && slotEnd > existStart;
        });

        if (hasBookingConflict) continue;

        // BLOCKED SLOTS CONFLICT DETECTION: Check against manually blocked time intervals
        const hasBlockConflict = (blockedSlots || []).some((block: any) => {
          // Skip blocks for other doctors (null = all doctors)
          if (block.doctor_id !== null && block.doctor_id !== doctor.id) return false;
          const [bsH, bsM] = block.time_start.split(':').map(Number);
          const [beH, beM] = block.time_end.split(':').map(Number);
          const blockStart = bsH * 60 + bsM;
          const blockEnd = beH * 60 + beM;
          // OVERLAP CHECK: Same interval overlap logic as appointments
          return slotStart < blockEnd && slotEnd > blockStart;
        });

        if (hasBlockConflict) continue;

        // TEMP RESERVATIONS CONFLICT DETECTION: Check against temporary reservations
        if (!skipTempReservations) {
          const hasTempReservationConflict = (tempReservations || []).some((tempRes: any) => {
            if (tempRes.doctor_id !== doctor.id) return false;
            const [tsH, tsM] = tempRes.time_start.split(':').map(Number);
            const [teH, teM] = tempRes.time_end.split(':').map(Number);
            const tempStart = tsH * 60 + tsM;
            const tempEnd = teH * 60 + teM;
            return slotStart < tempEnd && slotEnd > tempStart;
          });

          if (hasTempReservationConflict) continue;
        }

        // SLOT VALIDATION: Add slot if it passes all conflict checks
        // Deduplication prevents duplicate slots across multiple doctors
        if (!availableSlots.includes(slotTime)) {
          availableSlots.push(slotTime);
        }
      }
    }
  }

  // RETURN: Deduplicate and sort available slots for consistent UI presentation
  return [...new Set(availableSlots)].sort();
};

// ==========================================
// LOAD BALANCING HELPERS
// ==========================================

const getWeekBounds = (isoDate: string) => {
  const date = dayjs.tz(`${isoDate}T12:00:00`, BUCHAREST_TZ);
  const weekStart = date.startOf('week').day(1); // Force Monday as start
  const weekEnd = weekStart.add(6, 'days'); // Sunday as end
  return {
    weekStart: weekStart.format('YYYY-MM-DD'),
    weekEnd: weekEnd.format('YYYY-MM-DD')
  };
};

const calculateWeeklyAvailableSlots = async (doctorId: string, weekStart: string, weekEnd: string, durationMinutes: number = 30): Promise<number> => {
  const doctor = BUSINESS_CONFIG.resources.find(d => d.id === doctorId);
  if (!doctor) return 0;

  const supabase = getSupabase();
  const clinicId = getClinicId();
  let totalSlots = 0;

  // Iterate through each day of the week
  for (let d = dayjs.tz(weekStart, BUCHAREST_TZ); d.isSameOrBefore(dayjs.tz(weekEnd, BUCHAREST_TZ)); d = d.add(1, 'day')) {
    const currentDay = d.format('YYYY-MM-DD');
    const dayOfWeek = d.day();

    // Check if doctor works on this day
    if (!doctor.workingDays.includes(dayOfWeek)) continue;

    // Get blocked slots for this doctor on this day
    const { data: blockedSlots } = await supabase
      .from('blocked_slots')
      .select('time_start, time_end')
      .eq('clinic_id', clinicId)
      .eq('doctor_id', doctorId)
      .eq('date', currentDay);

    // Calculate available slots for this day
    const startH = parseInt(doctor.workingHours.start.split(':')[0]);
    const startM = parseInt(doctor.workingHours.start.split(':')[1] || '0');
    const endH = parseInt(doctor.workingHours.end.split(':')[0]);
    const endM = parseInt(doctor.workingHours.end.split(':')[1] || '0');

    const startTotalMin = startH * 60 + startM;
    const endTotalMin = endH * 60 + endM;
    const step = BUSINESS_CONFIG.scheduling.slotStepMinutes;

    // Generate all possible slots for this day
    for (let slotStart = startTotalMin; slotStart + durationMinutes <= endTotalMin; slotStart += step) {
      const slotEnd = slotStart + durationMinutes;

      // Check if this slot conflicts with any blocked slot
      const hasBlockConflict = (blockedSlots || []).some((block: any) => {
        const [bsH, bsM] = block.time_start.split(':').map(Number);
        const [beH, beM] = block.time_end.split(':').map(Number);
        const blockStart = bsH * 60 + bsM;
        const blockEnd = beH * 60 + beM;
        return slotStart < blockEnd && slotEnd > blockStart;
      });

      if (!hasBlockConflict) {
        totalSlots++;
      }
    }
  }

  return totalSlots;
};

const calculateWeeklyOccupancyRate = async (doctorId: string, weekStart: string, weekEnd: string, durationMinutes: number = 30): Promise<number> => {
  const supabase = getSupabase();
  const clinicId = getClinicId();

  // Count confirmed appointments for this doctor in the week
  const { data: weekAppointments } = await supabase
    .from('appointments')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('doctor_id', doctorId)
    .gte('date', weekStart)
    .lte('date', weekEnd)
    .eq('status', 'Confirmed');

  const confirmedAppointments = weekAppointments?.length || 0;

  // Calculate total available slots for the week
  const availableSlots = await calculateWeeklyAvailableSlots(doctorId, weekStart, weekEnd, durationMinutes);

  // Return occupancy rate (0 if no available slots)
  return availableSlots > 0 ? confirmedAppointments / availableSlots : 0;
};

// ==========================================
// PROCESS BOOKING PAYLOAD
// ==========================================

export interface ProcessBookingPayload {
  phone: string;
  date: string;
  time: string;
  service: string;
  firstName: string;
  lastName: string;
  doctorId: string;
  email?: string;
  channel?: string;
}

// ==========================================
// CORE BOOKING ENGINE
// ==========================================

export const processBooking = async (booking: ProcessBookingPayload) => {
  // STEP 1: PHONE VALIDATION & LIMIT ENFORCEMENT
  const sanitizedPhone = sanitizePhone(booking.phone);
  const activeBookingsCount = await countActiveBookings(sanitizedPhone);
  const MAX_BOOKINGS = BUSINESS_CONFIG.maxActiveBookingsPerPhone;

  // TEST PHONE BYPASS: Allows unlimited bookings for testing (configured via TEST_PHONE env)
  const isTestPhone = TEST_PHONE_NORMALIZED && sanitizePhone(booking.phone) === TEST_PHONE_NORMALIZED;
  if (!isTestPhone && activeBookingsCount >= MAX_BOOKINGS) {
    throw new Error(`Ați atins numărul limită maxim de ${MAX_BOOKINGS} programări active. Vă rugăm să verificați programările active asociate acestui număr de telefon.`);
  }

  // STEP 3: DATE/TIME VALIDATION (CRITICAL: BUCHAREST_TZ ONLY)
  const isoDate = parseRomanianDate(booking.date);
  if (!isoDate) throw new Error("Data programrii este indisponibil.");

  // STEP 4: SERVICE RESOLUTION & DURATION CALCULATION
  const service = BUSINESS_CONFIG.services.find(s => s.name === booking.service || s.id === booking.service) || BUSINESS_CONFIG.services[0];
  const durationMinutes = service.durationMinutes || BUSINESS_CONFIG.scheduling.defaultServiceDuration;

  // CRITICAL: All datetime operations MUST use BUCHAREST_TZ
  const startDateTimeStr = `${isoDate}T${booking.time}:00`;
  const start = dayjs.tz(startDateTimeStr, BUCHAREST_TZ);
  if (!start.isValid()) throw new Error("Formatul datei/orei este indisponibil.");

  // STEP 5: DOCTOR ASSIGNMENT INITIALIZATION
  let targetDoctorName: string = "Echipa DentalVoice";
  let targetDoctorId: string = "any";

  const doctorId = booking.doctorId;

  // STEP 6: SLOT AVAILABILITY VERIFICATION
  const availableSlots = await getAvailableSlotsForDoctor(doctorId, isoDate, durationMinutes, true);
  if (!availableSlots.includes(booking.time)) {
    throw new Error("Ne pare rău, dar acest interval nu mai este disponibil.");
  }

  // Load balancing for 'any' doctor
  if (doctorId === 'any') {
    const availableDoctors = [];
    const activeDoctors = await getCachedDoctors(getClinicId());
    for (const d of activeDoctors) {
      if (!isDoctorWorking(d, isoDate, booking.time, durationMinutes)) continue;

      // Check if this specific doctor has the slot available
      const doctorSlots = await getAvailableSlotsForDoctor(d.id, isoDate, durationMinutes, true);
      if (doctorSlots.includes(booking.time)) {
        // Count existing bookings for load balancing
        const { data: todayBookings } = await getSupabase()
          .from('appointments')
          .select('id')
          .eq('clinic_id', getClinicId())
          .eq('doctor_id', d.id)
          .eq('date', isoDate)
          .in('status', ['Pending', 'Confirmed']);

        availableDoctors.push({
          doctor: d,
          todayLoad: todayBookings?.length || 0
        });
      }
    }

    if (availableDoctors.length > 0) {
      // Get week bounds for Rule 3 (weekly occupancy rate tiebreaker)
      const { weekStart, weekEnd } = getWeekBounds(isoDate);

      // Calculate weekly occupancy rates for all available doctors
      const doctorsWithWeeklyRate = await Promise.all(
        availableDoctors.map(async (doc) => {
          const weeklyOccupancyRate = await calculateWeeklyOccupancyRate(
            doc.doctor.id,
            weekStart,
            weekEnd,
            durationMinutes
          );
          return {
            ...doc,
            weeklyOccupancyRate
          };
        })
      );

      // Load Balancing Algorithm with 3 rules:
      // Rule 1: Fewest bookings today (todayLoad)
      // Rule 2: Earlier availability (implicitly handled by order)
      // Rule 3: Lowest weekly occupancy rate as tiebreaker
      doctorsWithWeeklyRate.sort((a, b) => {
        // Rule 1: Primary sort by today's load
        if (a.todayLoad !== b.todayLoad) {
          return a.todayLoad - b.todayLoad;
        }

        // Rule 3: Tiebreaker by weekly occupancy rate (lower is better)
        return a.weeklyOccupancyRate - b.weeklyOccupancyRate;
      });

      const targetDoctor = doctorsWithWeeklyRate[0].doctor;
      targetDoctorName = targetDoctor.name;
      targetDoctorId = targetDoctor.id;
    }
  } else {
    const allDoctors = await getCachedDoctors(getClinicId());
    const targetDoctor = allDoctors.find(d => d.id === doctorId);
    if (targetDoctor) {
      if (!isDoctorWorking(targetDoctor, isoDate, booking.time, durationMinutes)) {
        throw new Error("Medicul nu lucrează în acest interval.");
      }
      targetDoctorName = targetDoctor.name;
      targetDoctorId = targetDoctor.id;
    }
  }

  if (targetDoctorId === 'any') {
    throw new Error("Ne pare rău, dar niciun medic nu mai este disponibil pentru acest interval.");
  }

  const pendingRow = {
    clinic_id: getClinicId(),
    first_name: booking.firstName,
    last_name: booking.lastName,
    phone: booking.phone,
    phone_normalized: sanitizedPhone,
    email: booking.email ?? null,
    service: booking.service,
    doctor_id: targetDoctorId,
    doctor_name: targetDoctorName,
    date: isoDate,
    time: booking.time,
    google_event_id: null, // Always null in v3.0 - internal calendar only
    channel: booking.channel || 'Web',
    status: 'Pending',
  };

  const { error: lockError } = await getSupabase().from('appointments').insert([pendingRow]);

  if (lockError) {
    if (lockError.code === '23505') {
      throw new Error('Ne pare rău, acest slot tocmai a fost rezervat. Vă rugăm alegeți alt interval.');
    }
    throw new Error(lockError.message || 'Eroare la rezervare.');
  }

  // Confirm booking - no Google Calendar integration needed
  const { error: upErr } = await getSupabase()
    .from('appointments')
    .update({
      status: 'Confirmed',
    })
    .eq('clinic_id', getClinicId())
    .eq('doctor_id', targetDoctorId)
    .eq('date', isoDate)
    .eq('time', booking.time)
    .eq('status', 'Pending');

  if (upErr) {
    console.error('appointments confirm update failed:', upErr.message);
    // Rollback on confirmation failure
    await getSupabase()
      .from('appointments')
      .delete()
      .eq('clinic_id', getClinicId())
      .eq('doctor_id', targetDoctorId)
      .eq('date', isoDate)
      .eq('time', booking.time)
      .eq('status', 'Pending');
    throw new Error('Eroare la confirmarea programării.');
  }

  return {
    googleEventId: null, // Backward compatibility - always null in v3.0
    doctorName: targetDoctorName,
    doctorId: targetDoctorId,
    calendarId: null, // Backward compatibility - always null in v3.0
    assignedMessage: booking.doctorId === 'any' ? `Ați fost repartizat(ă) la: ${targetDoctorName}` : undefined,
  };
};

/** Shared cancel logic for DELETE /api/delete-booking and WhatsApp flow */
export const deleteAppointmentByPhoneDateTime = async (
  phoneRaw: string,
  date: string,
  time: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
  const sanitized = normalizePhoneForSearch(phoneRaw);
  if (!sanitized) {
    return { ok: false, status: 400, message: 'Număr de telefon invalid.' };
  }

  // Try exact match first, then try with padding
  let appointment = null;
  let findError = null;

  // First try exact match
  const { data: exactMatch, error: exactError } = await getSupabase()
    .from('appointments')
    .select('*')
    .eq('clinic_id', getClinicId())
    .eq('phone_normalized', sanitized)
    .eq('date', date)
    .eq('time', time)
    .maybeSingle();

  if (!exactError && exactMatch) {
    appointment = exactMatch;
  } else {
    // Try with padded version
    const paddedPhone = sanitized.padStart(9, '0');
    const { data: paddedMatch, error: paddedError } = await getSupabase()
      .from('appointments')
      .select('*')
      .eq('clinic_id', getClinicId())
      .eq('phone_normalized', paddedPhone)
      .eq('date', date)
      .eq('time', time)
      .maybeSingle();
    
    appointment = paddedMatch;
    findError = paddedError;
  }

  if (findError || !appointment) {
    return { ok: false, status: 404, message: 'Programarea nu a fost găsită.' };
  }

  // Google Calendar removed in v3.0 - no external calendar deletion needed

  const { error: deleteError } = await getSupabase().from('appointments').delete().eq('id', appointment.id);

  if (deleteError) {
    console.error('deleteAppointmentByPhoneDateTime:', deleteError.message);
    return { ok: false, status: 500, message: 'Nu am putut anula programarea. Încercați din nou.' };
  }

  return { ok: true };
};
