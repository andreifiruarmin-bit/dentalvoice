import React from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, MoreVertical } from 'lucide-react';
import { format, addDays } from 'date-fns';
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
}

interface WeekViewProps {
  appointments: Appointment[];
  clinicConfig: any;
  currentDate: Date;
  selectedDoctor: string;
  onSlotClick: (doctorId: string, date: string, time: string) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export default function WeekView({ 
  appointments, 
  clinicConfig, 
  currentDate, 
  selectedDoctor, 
  onSlotClick, 
  onAppointmentClick 
}: WeekViewProps) {
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

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'web': return 'bg-blue-100 text-blue-600';
      case 'whatsapp': return 'bg-green-100 text-green-600';
      case 'manual': return 'bg-gray-100 text-gray-600';
      case 'facebook': return 'bg-indigo-100 text-indigo-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Confirmed': return 'border-green-500';
      case 'Pending': return 'border-yellow-500';
      case 'Cancelled': return 'border-red-500';
      default: return 'border-gray-500';
    }
  };

  const getAppointmentsForSlot = (date: string, time: string) => {
    return appointments.filter(apt => apt.date === date && apt.time === time);
  };

  const weekDays = getWeekDays();
  const timeSlots = getTimeSlots();

  return (
    <div className="p-6">
      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Header */}
          <div className="grid grid-cols-8 gap-2 mb-4">
            <div className="font-medium text-slate-600 text-sm">Ora</div>
            {weekDays.map(day => (
              <div key={day.toISOString()} className="text-center">
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
                  const dateStr = day.toISOString().split('T')[0];
                  const slotAppointments = getAppointmentsForSlot(dateStr, time);
                  
                  return (
                    <div key={`${dateStr}-${time}`} className="min-h-[60px] border border-slate-200 rounded-lg p-2">
                      {clinicConfig?.resources
                        .filter(doctor => selectedDoctor === 'all' || doctor.id === selectedDoctor)
                        .map(doctor => {
                          const appointment = slotAppointments.find(apt => apt.doctor_id === doctor.id);
                          
                          return (
                            <div key={doctor.id} className="mb-1 last:mb-0">
                              {appointment ? (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.9 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className={`p-2 rounded border cursor-pointer hover:shadow-md transition-all text-xs ${getStatusColor(appointment.status)}`}
                                  onClick={() => onAppointmentClick(appointment)}
                                >
                                  <div className="font-bold truncate">{doctor.name}</div>
                                  <div className="truncate">{appointment.first_name} {appointment.last_name}</div>
                                  <div className="text-slate-600 truncate">{appointment.service}</div>
                                </motion.div>
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
