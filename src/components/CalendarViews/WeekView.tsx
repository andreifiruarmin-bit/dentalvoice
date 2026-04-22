import { motion } from 'motion/react';
import { Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface Appointment {
  id: string;
  date: string;
  displayDate?: string;
  time: string;
  service: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'confirmed' | 'cancelled';
  googleEventId?: string | null;
  calendarId?: string;
  doctorId?: string;
  doctorName?: string;
  notes?: string;
  doctor_id?: string;
  first_name?: string;
  last_name?: string;
  channel?: string;
  type?: 'appointment' | 'blocked';
  isPast?: boolean;
  isUnlocked?: boolean;
  time_start?: string;
  time_end?: string;
}

interface UnlockedSlot {
  id: string;
  doctor_id: string;
  date: string;
  time: string;
  created_at: string;
}

interface WeekViewProps {
  appointments: Appointment[];
  clinicConfig: any;
  currentDate: Date;
  selectedDoctor: string;
  unlockedSlots: UnlockedSlot[];
  onSlotClick: (doctorId: string, date: string, time: string) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onBlockedSlotClick?: (blockedSlot: Appointment) => void;
  onUnlockSlotClick?: (doctorId: string, date: string, time: string) => void;
}

export default function WeekView({ 
  appointments, 
  clinicConfig, 
  currentDate, 
  selectedDoctor, 
  unlockedSlots,
  onSlotClick, 
  onAppointmentClick,
  onBlockedSlotClick,
  onUnlockSlotClick
}: WeekViewProps) {
  const formatDateLocal = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const getWeekDays = () => {
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getTimeSlots = () => {
    if (!clinicConfig) return [];
    const slots = [];
    const startHour = parseInt(clinicConfig.scheduling.workingHours.start.split(':')[0]);
    const endHour = parseInt(clinicConfig.scheduling.workingHours.end.split(':')[0]);
    
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  
  const getStatusColor = (status: string, type?: string) => {
    if (type === 'blocked') {
      return 'border-orange-500 bg-orange-50 text-orange-800';
    }
    
    switch (status) {
      case 'Confirmed': return 'border-green-500';
      case 'Pending': return 'border-yellow-500';
      case 'Cancelled': return 'border-red-500';
      default: return 'border-gray-500';
    }
  };

    const isSlotPast = (date: string, time: string) => {
      const now = new Date();
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      if (date < todayLocal) return true;
      if (date > todayLocal) return false;

      const [hours, minutes] = time.split(':').map(Number);
      const slotTime = new Date();
      slotTime.setHours(hours, minutes, 0, 0);
      return slotTime < now;
    };

  const isSlotOutsideWorkingHours = (time: string, doctor: any) => {
    if (!doctor?.working_hours_start || !doctor?.working_hours_end) {
      return false;
    }
    
    const [hours, minutes] = time.split(':').map(Number);
    const slotMinutes = hours * 60 + minutes;
    
    const [startHours, startMinutes] = doctor.working_hours_start.split(':').map(Number);
    const [endHours, endMinutes] = doctor.working_hours_end.split(':').map(Number);
    const workStartMinutes = startHours * 60 + startMinutes;
    const workEndMinutes = endHours * 60 + endMinutes;
    
    return slotMinutes < workStartMinutes || slotMinutes >= workEndMinutes;
  };

  const isSlotUnlocked = (doctorId: string, date: string, time: string) => {
    return unlockedSlots.some(slot => 
      slot.doctor_id === doctorId && 
      slot.date === date && 
      slot.time === time
    );
  };

  const getAppointmentsForSlot = (date: string, time: string) => {
    const slotApps = appointments.filter(apt => {
      if (apt.date !== date) return false;
      
      // For regular appointments, match exact time
      if (apt.type !== 'blocked') {
        return apt.time === time;
      }
      // For blocked slots, check if time falls within blocked range
      if (apt.time_start && apt.time_end) {
        const slotMinutes = timeToMinutes(time);
        const startMinutes = timeToMinutes(apt.time_start);
        const endMinutes = timeToMinutes(apt.time_end);
        return slotMinutes >= startMinutes && slotMinutes < endMinutes;
      }
      // Fallback to exact time matching for backward compatibility
      return apt.time === time;
    });
    return slotApps;
  };

  const timeToMinutes = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + (minutes || 0);
  };

  // Get physical doctors for dynamic layout
  const physicalDoctors = clinicConfig?.resources?.filter((doctor: any) => doctor.id !== 'any') || [];
  const filteredDoctors = physicalDoctors.filter((doctor: any) => selectedDoctor === 'all' || doctor.id === selectedDoctor);

  const weekDays = getWeekDays();
  const timeSlots = getTimeSlots();
  const toLocalDateStr = (date: Date): string => {
  // Use local date components directly to avoid UTC conversion issues
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};  

  return (
    <div className="p-6">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            <div className="font-medium text-slate-600 text-sm">Ora</div>
            {weekDays.map(day => (
              <div key={formatDateLocal(day)} className="text-center">
                <div className="font-bold text-slate-900">
                  {format(day, 'EEEE', { locale: ro })}
                </div>
                <div className="text-sm text-slate-600">
                  {format(day, 'd MMM', { locale: ro })}
                </div>
              </div>
            ))}
          </div>

          {/* Time slots grid */}
          <div className="space-y-2">
            {timeSlots.map(time => (
              <div key={time} className="grid grid-cols-8 gap-2">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Clock className="w-4 h-4 text-slate-400" />
                  {time}
                </div>
                
                {weekDays.map(day => {
                  const dateStr = toLocalDateStr(day);
                  const slotAppointments = getAppointmentsForSlot(dateStr, time);
                  
                  return (
                    <div key={`${dateStr}-${time}`} className="min-h-[60px] border border-slate-200 rounded-lg p-2">
                      {filteredDoctors.map((doctor: any) => {
                          const appointment = slotAppointments.find(apt => apt.doctor_id === doctor.id && apt.type !== 'blocked');
                          const blockedSlot = slotAppointments.find(apt => apt.type === 'blocked' && apt.doctor_id === doctor.id);
                          const isPast = isSlotPast(dateStr, time);
                          const isOutsideHours = isSlotOutsideWorkingHours(time, doctor);
                          const isUnlocked = isSlotUnlocked(doctor.id, dateStr, time);
                          
                          return (
                            <div key={doctor.id} className="mb-1 last:mb-0">
                              {appointment ? (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`p-2 rounded border cursor-pointer hover:shadow-md transition-all text-xs ${getStatusColor(appointment.status, appointment.type)} ${isPast ? 'bg-gray-50 opacity-60' : ''}`}
                                  onClick={() => onAppointmentClick(appointment)}
                                >
                                  <div className="font-bold truncate">{doctor.name}</div>
                                  <div className="truncate">{appointment.first_name} {appointment.last_name}</div>
                                  <div className="text-slate-600 truncate">{appointment.service}</div>
                                </motion.div>
                              ) : blockedSlot ? (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`p-2 rounded border cursor-pointer hover:shadow-md transition-all text-xs ${getStatusColor(blockedSlot.status, blockedSlot.type)} ${isPast ? 'bg-gray-50 opacity-60' : ''}`}
                                  onClick={() => {
                                  console.log('WeekView: Blocked slot clicked:', blockedSlot);
                                  console.log('WeekView: Blocked slot ID:', blockedSlot.id);
                                  if (onBlockedSlotClick) {
                                    onBlockedSlotClick(blockedSlot);
                                  }
                                }}
                                >
                                  <div className="font-bold truncate">{doctor.name}</div>
                                  <div className="truncate">Blocat</div>
                                  <div className="text-slate-600 truncate">{blockedSlot.service}</div>
                                </motion.div>
                              ) : isOutsideHours && !isUnlocked ? (
                                <div className="w-full p-2 border border-gray-500 bg-gray-100 text-gray-500 rounded text-xs">
                                  <div className="text-center">
                                    <div className="font-bold truncate">{doctor.name}</div>
                                    <div className="truncate">Indisponibil</div>
                                    {onUnlockSlotClick && (
                                      <button
                                        onClick={() => onUnlockSlotClick(doctor.id, dateStr, time)}
                                        className="mt-1 text-xs bg-blue-500 text-white px-1 py-0.5 rounded hover:bg-blue-600 transition-colors"
                                      >
                                        Deblochează
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ) : isPast ? (
                                <div className="w-full p-2 border border-dashed border-gray-300 bg-gray-50 opacity-60 rounded text-xs">
                                  <div className="text-center text-gray-400">
                                    <User className="w-3 h-3 mx-auto mb-1" />
                                    Indisponibil
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => onSlotClick(doctor.id, dateStr, time)}
                                  className="w-full p-2 border border-dashed border-slate-300 rounded hover:border-blue-400 hover:bg-blue-50 transition-all group"
                                >
                                  <div className="text-center text-slate-400 group-hover:text-blue-600 text-xs">
                                    <User className="w-3 h-3 mx-auto mb-1" />
                                    Liber
                                  </div>
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
