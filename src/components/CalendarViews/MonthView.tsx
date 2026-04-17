import React from 'react';
import { motion } from 'motion/react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday } from 'date-fns';
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
  type?: 'appointment' | 'blocked';
}

interface MonthViewProps {
  appointments: Appointment[];
  currentDate: Date;
  onDayClick: (date: Date) => void;
  onBlockedSlotClick?: (blockedSlot: Appointment) => void;
}

export default function MonthView({ 
  appointments, 
  currentDate, 
  onDayClick,
  onBlockedSlotClick
}: MonthViewProps) {
  const getMonthDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const start = new Date(monthStart);
    start.setDate(start.getDate() - start.getDay() + 1);
    
    const days = [];
    const current = new Date(start);
    
    while (current <= monthEnd || current.getDay() !== 1) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      if (days.length > 42) break;
    }
    
    return days;
  };

  const getAppointmentsForDay = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    return appointments.filter(apt => apt.date === dateStr);
  };

  const monthDays = getMonthDays();
  const weekDays = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];

  const getStatusColor = (status: string, type?: string) => {
    if (type === 'blocked') {
      return 'border-orange-400 bg-orange-50 text-orange-800';
    }
    
    switch (status) {
      case 'Confirmed': return 'border-green-500';
      case 'Pending': return 'border-yellow-500';
      case 'Cancelled': return 'border-red-500';
      default: return 'border-gray-500';
    }
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-2">
        {/* Week day headers */}
        {weekDays.map(day => (
          <div key={day} className="text-center font-bold text-slate-700 text-sm py-2">
            {day}
          </div>
        ))}
        
        {/* Calendar days */}
        {monthDays.map((day, index) => {
          const dayAppointments = getAppointmentsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay = isToday(day);
          
          return (
            <motion.div
              key={day.toISOString()}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.01 }}
              onClick={() => isCurrentMonth && onDayClick(day)}
              className={`
                min-h-[80px] p-2 border rounded-lg cursor-pointer transition-all
                ${isCurrentMonth 
                  ? 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300' 
                  : 'border-slate-100 bg-slate-50 text-slate-400'
                }
                ${isCurrentDay ? 'ring-2 ring-blue-500 bg-blue-50' : ''}
              `}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-medium ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                  {format(day, 'd')}
                </span>
                {dayAppointments.length > 0 && (
                  <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {dayAppointments.length}
                  </span>
                )}
              </div>
              
              <div className="space-y-1">
                {dayAppointments.slice(0, 2).map((apt, idx) => {
                  const isBlocked = apt.type === 'blocked';
                  return (
                    <div
                      key={apt.id}
                      className={`text-xs p-1 rounded truncate cursor-pointer ${isBlocked ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}
                      title={`${apt.time} - ${apt.service}`}
                      onClick={() => isBlocked && onBlockedSlotClick && onBlockedSlotClick(apt)}
                    >
                      {isBlocked ? 'Blocat' : `${apt.time} ${apt.service}`}
                    </div>
                  );
                })}
                {dayAppointments.length > 2 && (
                  <div className="text-xs text-slate-500 italic">
                    +{dayAppointments.length - 2} mai multe
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
