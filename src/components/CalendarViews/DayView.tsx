import React from 'react';
import { motion } from 'motion/react';
import { Calendar, Clock, User, MoreVertical } from 'lucide-react';

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

interface DayViewProps {
  appointments: Appointment[];
  clinicConfig: any;
  currentDate: Date;
  selectedDoctor: string;
  onSlotClick: (doctorId: string, time: string) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export default function DayView({ 
  appointments, 
  clinicConfig, 
  currentDate, 
  selectedDoctor, 
  onSlotClick, 
  onAppointmentClick 
}: DayViewProps) {
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

  const getAppointmentsForSlot = (time: string) => {
    return appointments.filter(apt => apt.time === time);
  };

  const timeSlots = getTimeSlots();

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-4">
        {timeSlots.map(time => {
          const slotAppointments = getAppointmentsForSlot(time);
          
          return (
            <div key={time} className="flex items-center gap-4 p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
              <div className="flex items-center gap-2 min-w-[100px]">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-medium text-slate-700">{time}</span>
              </div>
              
              <div className="flex-1 flex gap-2">
                {clinicConfig?.resources
                  .filter(doctor => selectedDoctor === 'all' || doctor.id === selectedDoctor)
                  .map(doctor => {
                    const appointment = slotAppointments.find(apt => apt.doctor_id === doctor.id);
                    
                    return (
                      <div key={doctor.id} className="flex-1">
                        {appointment ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`p-3 rounded-lg border-2 cursor-pointer hover:shadow-md transition-all ${getStatusColor(appointment.status)}`}
                            onClick={() => onAppointmentClick(appointment)}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-sm">{doctor.name}</span>
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="text-sm">
                              <div className="font-medium">{appointment.first_name} {appointment.last_name}</div>
                              <div className="text-slate-600">{appointment.service}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className={`text-xs px-2 py-1 rounded-full ${getChannelColor(appointment.channel)}`}>
                                  {appointment.channel}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {appointment.phone}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ) : (
                          <button
                            onClick={() => onSlotClick(doctor.id, time)}
                            className="w-full p-3 border-2 border-dashed border-slate-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all group"
                          >
                            <div className="text-center text-slate-400 group-hover:text-blue-600">
                              <User className="w-4 h-4 mx-auto mb-1" />
                              <span className="text-xs font-medium">Libert</span>
                            </div>
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
