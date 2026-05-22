import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Clock, X, User, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ro } from 'date-fns/locale';

interface Appointment {
  id: string;
  date: string;
  time: string;
  service: string;
  first_name: string;
  last_name: string;
  status: string;
  doctor_id?: string;
  doctor_name?: string;
  type?: 'appointment' | 'blocked' | 'temp_hold';
}

interface ClinicConfig {
  resources: Array<{ id: string; name: string; working_hours_start?: string; working_hours_end?: string }>;
  scheduling: {
    workingHours: {
      start: string;
      end: string;
    };
  };
}

interface MiniCalendarWidgetProps {
  apiKey: string;
}

export default function MiniCalendarWidget({ apiKey }: MiniCalendarWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  const currentDate = new Date();

  // Fetch clinic config and appointments
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch config
      const configResponse = await fetch('/api/config', {
        headers: { 'x-api-key': apiKey }
      });
      if (configResponse.ok) {
        const config = await configResponse.json();
        setClinicConfig(config);
      }

      // Fetch appointments for current week
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const appointmentsResponse = await fetch(
        `/api/calendar/appointments?date=${format(weekStart, 'yyyy-MM-dd')}&endDate=${format(weekEnd, 'yyyy-MM-dd')}`,
        {
          headers: { 'x-api-key': apiKey }
        }
      );
      
      if (appointmentsResponse.ok) {
        const data = await appointmentsResponse.json();
        setAppointments(data);
      }
      
      setLastUpdate(new Date());
      setSecondsSinceUpdate(0);
    } catch (error) {
      console.error('Error fetching calendar data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and polling every 30 seconds
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update seconds counter
  useEffect(() => {
    const counter = setInterval(() => {
      setSecondsSinceUpdate(prev => prev + 1);
    }, 1000);
    return () => clearInterval(counter);
  }, []);

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

  const getAppointmentsForSlot = (date: string, time: string) => {
    return appointments.filter(apt => apt.date === date && apt.time === time);
  };

  const getStatusColor = (status: string, type?: string) => {
    if (type === 'temp_hold') {
      return 'border-amber-400 bg-amber-50 text-amber-900';
    }
    if (type === 'blocked') {
      return 'border-orange-500 bg-orange-50 text-orange-800';
    }
    
    switch (status) {
      case 'Confirmed': return 'border-green-500 bg-green-50 text-green-800';
      case 'Pending': return 'border-yellow-500 bg-yellow-50 text-yellow-800';
      case 'Cancelled': return 'border-red-500 bg-red-50 text-red-800';
      default: return 'border-gray-500 bg-gray-50 text-gray-800';
    }
  };

  const weekDays = getWeekDays();
  const timeSlots = getTimeSlots();
  const physicalDoctors = clinicConfig?.resources?.filter((d: any) => d.id !== 'any') || [];

  const formatDateLocal = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return (
    <>
      {/* Toggle Button - Desktop */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="hidden md:flex fixed right-4 top-4 z-50 items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-slate-200 hover:shadow-xl transition-all"
      >
        <Calendar className="w-4 h-4 text-[#f43e01]" />
        <span className="text-sm font-bold text-slate-700">Calendar Live</span>
        <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Toggle Button - Mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed right-4 bottom-4 z-50 w-14 h-14 bg-[#f43e01] rounded-full shadow-lg flex items-center justify-center text-white hover:bg-[#d63500] transition-all"
      >
        <Calendar className="w-6 h-6" />
      </button>

      {/* Panel - Desktop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="hidden md:flex fixed right-0 top-0 h-full w-[380px] bg-white shadow-2xl z-40 flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#f43e01]" />
                  <h2 className="font-bold text-slate-900">Calendar Clinică — Live</h2>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>
              <p className="text-xs text-slate-500">
                {format(weekDays[0], 'd MMM', { locale: ro })} - {format(weekDays[6], 'd MMM yyyy', { locale: ro })}
              </p>
            </div>

            {/* Calendar Content */}
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full text-slate-400">
                  <div className="text-center">
                    <div className="w-8 h-8 border-2 border-slate-300 border-t-[#f43e01] rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-sm">Se încarcă...</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Day headers */}
                  <div className="grid grid-cols-8 gap-1 mb-2">
                    <div className="text-xs font-medium text-slate-400">Ora</div>
                    {weekDays.map(day => (
                      <div key={formatDateLocal(day)} className="text-center">
                        <div className="text-xs font-bold text-slate-700">
                          {format(day, 'EEE', { locale: ro })}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {format(day, 'd MMM', { locale: ro })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Time slots */}
                  {timeSlots.map(time => (
                    <div key={time} className="grid grid-cols-8 gap-1">
                      <div className="flex items-center justify-center text-[10px] font-medium text-slate-500">
                        <Clock className="w-3 h-3 mr-1" />
                        {time}
                      </div>
                      
                      {weekDays.map(day => {
                        const dateStr = formatDateLocal(day);
                        const slotApps = getAppointmentsForSlot(dateStr, time);
                        
                        return (
                          <div key={`${dateStr}-${time}`} className="min-h-[40px] border border-slate-200 rounded p-1">
                            {physicalDoctors.map((doctor: any) => {
                              const appointment = slotApps.find(
                                (apt) => apt.doctor_id === doctor.id && apt.type !== 'blocked' && apt.type !== 'temp_hold'
                              );
                              const tempHold = slotApps.find(
                                (apt) => apt.type === 'temp_hold' && apt.doctor_id === doctor.id
                              );
                              const blockedSlot = slotApps.find(apt => apt.type === 'blocked' && apt.doctor_id === doctor.id);
                              
                              return (
                                <div key={doctor.id} className="mb-0.5 last:mb-0">
                                  {appointment ? (
                                    <div className={`p-1 rounded border text-[9px] ${getStatusColor(appointment.status, appointment.type)}`}>
                                      <div className="font-bold truncate">{doctor.name}</div>
                                      <div className="truncate">{appointment.first_name} {appointment.last_name}</div>
                                    </div>
                                  ) : tempHold ? (
                                    <div className={`p-1 rounded border border-dashed text-[9px] ${getStatusColor(tempHold.status, tempHold.type)}`}>
                                      <div className="font-bold truncate">{doctor.name}</div>
                                      <div className="truncate text-amber-800">În rezervare</div>
                                    </div>
                                  ) : blockedSlot ? (
                                    <div className={`p-1 rounded border text-[9px] ${getStatusColor(blockedSlot.status, blockedSlot.type)}`}>
                                      <div className="font-bold truncate">{doctor.name}</div>
                                      <div className="truncate">Blocat</div>
                                    </div>
                                  ) : (
                                    <div className="w-full p-1 border border-dashed border-slate-300 rounded text-center text-slate-300 text-[9px]">
                                      <User className="w-3 h-3 mx-auto" />
                                    </div>
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
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50">
              <p className="text-[10px] text-slate-500 text-center">
                Actualizat acum {secondsSinceUpdate} sec
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Panel - Mobile (Bottom Sheet) */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="md:hidden fixed inset-0 bg-black/50 z-30"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="md:hidden fixed bottom-0 left-0 right-0 h-[70vh] bg-white rounded-t-3xl shadow-2xl z-40 flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#f43e01]" />
                    <h2 className="font-bold text-slate-900">Calendar Clinică — Live</h2>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 hover:bg-slate-100 rounded-full transition-colors"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {format(weekDays[0], 'd MMM', { locale: ro })} - {format(weekDays[6], 'd MMM yyyy', { locale: ro })}
                </p>
              </div>

              {/* Calendar Content */}
              <div className="flex-1 overflow-y-auto p-4">
                {loading ? (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-slate-300 border-t-[#f43e01] rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-sm">Se încarcă...</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Day headers */}
                    <div className="grid grid-cols-8 gap-1 mb-2">
                      <div className="text-xs font-medium text-slate-400">Ora</div>
                      {weekDays.map(day => (
                        <div key={formatDateLocal(day)} className="text-center">
                          <div className="text-xs font-bold text-slate-700">
                            {format(day, 'EEE', { locale: ro })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {format(day, 'd MMM', { locale: ro })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Time slots */}
                    {timeSlots.map(time => (
                      <div key={time} className="grid grid-cols-8 gap-1">
                        <div className="flex items-center justify-center text-[10px] font-medium text-slate-500">
                          <Clock className="w-3 h-3 mr-1" />
                          {time}
                        </div>
                        
                        {weekDays.map(day => {
                          const dateStr = formatDateLocal(day);
                          const slotApps = getAppointmentsForSlot(dateStr, time);
                          
                          return (
                            <div key={`${dateStr}-${time}`} className="min-h-[40px] border border-slate-200 rounded p-1">
                              {physicalDoctors.map((doctor: any) => {
                                const appointment = slotApps.find(
                                  (apt) => apt.doctor_id === doctor.id && apt.type !== 'blocked' && apt.type !== 'temp_hold'
                                );
                                const tempHold = slotApps.find(
                                  (apt) => apt.type === 'temp_hold' && apt.doctor_id === doctor.id
                                );
                                const blockedSlot = slotApps.find(apt => apt.type === 'blocked' && apt.doctor_id === doctor.id);
                                
                                return (
                                  <div key={doctor.id} className="mb-0.5 last:mb-0">
                                    {appointment ? (
                                      <div className={`p-1 rounded border text-[9px] ${getStatusColor(appointment.status, appointment.type)}`}>
                                        <div className="font-bold truncate">{doctor.name}</div>
                                        <div className="truncate">{appointment.first_name} {appointment.last_name}</div>
                                      </div>
                                    ) : tempHold ? (
                                      <div className={`p-1 rounded border border-dashed text-[9px] ${getStatusColor(tempHold.status, tempHold.type)}`}>
                                        <div className="font-bold truncate">{doctor.name}</div>
                                        <div className="truncate text-amber-800">În rezervare</div>
                                      </div>
                                    ) : blockedSlot ? (
                                      <div className={`p-1 rounded border text-[9px] ${getStatusColor(blockedSlot.status, blockedSlot.type)}`}>
                                        <div className="font-bold truncate">{doctor.name}</div>
                                        <div className="truncate">Blocat</div>
                                      </div>
                                    ) : (
                                      <div className="w-full p-1 border border-dashed border-slate-300 rounded text-center text-slate-300 text-[9px]">
                                        <User className="w-3 h-3 mx-auto" />
                                      </div>
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
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-200 bg-slate-50">
                <p className="text-[10px] text-slate-500 text-center">
                  Actualizat acum {secondsSinceUpdate} sec
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
