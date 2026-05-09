/**
 * DentalVoice Day View Calendar Component
 * 
 * Tank Architecture Implementation:
 * - Robustness: Comprehensive appointment filtering and error handling
 * - SaaS Multi-tenancy: Doctor-specific filtering and clinic configuration
 * - Dynamic Parameters: Responsive time slot generation and availability
 * - Explicit Logic: Clear separation between appointment types and user interactions
 * 
 * CORE RESPONSIBILITIES:
 * 1. Single day calendar view with time-based layout
 * 2. Doctor filtering with "Any Available Doctor" logic
 * 3. Manual booking flow through slot selection
 * 4. Appointment and blocked slot visualization
 * 5. Unlock slot functionality for manual overrides
 * 
 * CRITICAL FILTER LOGIC:
 * - Removes "Any Available Doctor" (doctorId: 'any') from visual columns
 * - Shows only specific doctors in the calendar grid
 * - Handles load balancing results from backend
 * - Supports blocked slot and unlocked slot display
 */

import { motion } from 'motion/react';
import { format } from 'date-fns';
import { Clock, User, MoreVertical } from 'lucide-react';

// ==========================================
// INTERFACES & TYPE DEFINITIONS
// ==========================================

/**
 * Appointment Interface: Day view appointment data structure
 * 
 * PURPOSE: Defines the shape of appointment data for day view rendering
 * - Supports both regular appointments and blocked slots
 * - Includes legacy fields for backward compatibility
 * - Handles different appointment types and states
 * 
 * CRITICAL: This interface supports multiple data sources:
 * - Backend appointments table (regular appointments)
 * - Blocked slots table (doctor availability blocks)
 * - Unlocked slots table (manual availability overrides)
 * 
 * @param id - Unique identifier
 * @param date - Appointment date (YYYY-MM-DD)
 * @param displayDate - Formatted date for display
 * @param time - Appointment time (HH:mm)
 * @param service - Service name or appointment type
 * @param firstName - Patient first name
 * @param lastName - Patient last name
 * @param phone - Patient phone number
 * @param status - Appointment status (confirmed/cancelled)
 * @param doctorId - Assigned doctor ID
 * @param doctorName - Doctor display name
 * @param type - Appointment type (appointment/blocked)
 * @param isPast - Indicates if time slot is in the past
 * @param isUnlocked - Indicates if slot is manually unlocked
 */
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

/**
 * Unlocked Slot Interface: Manual availability override data
 * 
 * PURPOSE: Defines the shape of unlocked slot data
 * - Used for manual availability overrides
 * - Allows receptionists to unlock specific time slots
 * - Overrides blocked slot restrictions temporarily
 * 
 * @param id - Unique unlock identifier
 * @param doctor_id - Doctor ID for the unlocked slot
 * @param date - Date of the unlocked slot
 * @param time - Time of the unlocked slot
 * @param created_at - Creation timestamp
 */
interface UnlockedSlot {
  id: string;
  doctor_id: string;
  date: string;
  time: string;
  created_at: string;
}

/**
 * Day View Props Interface: Component properties
 * 
 * PURPOSE: Defines the properties required for DayView component
 * - Includes all data needed for rendering and interactions
 * - Supports callback functions for user interactions
 * - Enables flexible integration with parent dashboard
 * 
 * @param appointments - Array of appointments and blocked slots
 * @param clinicConfig - Clinic configuration with doctor resources
 * @param currentDate - Current date being displayed
 * @param selectedDoctor - Currently selected doctor filter
 * @param unlockedSlots - Array of manually unlocked slots
 * @param onSlotClick - Callback for available slot selection (manual booking)
 * @param onAppointmentClick - Callback for appointment interaction
 * @param onBlockedSlotClick - Callback for blocked slot interaction
 * @param onUnlockSlotClick - Callback for unlocking slots
 */
interface DayViewProps {
  appointments: Appointment[];
  clinicConfig: any;
  currentDate: Date;
  selectedDoctor: string;
  unlockedSlots: UnlockedSlot[];
  onSlotClick: (doctorId: string, time: string) => void;
  onAppointmentClick: (appointment: Appointment) => void;
  onBlockedSlotClick?: (blockedSlot: Appointment) => void;
  onUnlockSlotClick?: (doctorId: string, time: string) => void;
}

export default function DayView({ 
  appointments, 
  clinicConfig, 
  currentDate, 
  selectedDoctor, 
  unlockedSlots,
  onSlotClick, 
  onAppointmentClick,
  onBlockedSlotClick,
  onUnlockSlotClick
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

    const isSlotPast = (time: string) => {
      const now = new Date();
      // Folosim data locală (Romania), nu UTC
      const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const viewDateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;

      if (viewDateString < todayLocal) return true;  // zile trecute = toate indisponibile
      if (viewDateString > todayLocal) return false; // zile viitoare = toate disponibile

      // Aceeași zi: compară ora
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

  const getAppointmentsForSlot = (time: string) => {
    const slotApps = appointments.filter(apt => {
      // For regular appointments, match exact time
      if (apt.type !== 'blocked') {
        return apt.time === time;
      }
      // For blocked slots, check if the time falls within the blocked range
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

  const timeSlots = getTimeSlots();

  // ==========================================
// CRITICAL FILTER LOGIC - DOCTOR VISUALIZATION
// ==========================================

/**
 * CRITICAL: Doctor Filtering Logic for Calendar Grid Layout
 * 
 * PURPOSE: Removes "Any Available Doctor" from visual columns while preserving load balancing
 * 
 * WHY THIS IS CRITICAL:
 * - Backend uses doctorId: 'any' for load balancing in processBooking()
 * - Frontend must show only specific doctors in calendar grid for clarity
 * - Load balancing happens server-side, frontend displays results
 * - Patients see "Any Available Doctor" option in booking flow
 * - Staff see specific doctor columns for manual management
 * 
 * FILTER LOGIC EXPLAINED:
 * 1. physicalDoctors: Removes 'any' from clinicConfig.resources
 *    - Backend resources include 'any' for load balancing
 *    - Frontend displays only actual doctors (dr1, dr2, etc.)
 *    - Prevents "Any Available Doctor" column in calendar grid
 * 
 * 2. filteredDoctors: Applies user's doctor selection
 *    - 'all': Show all physical doctors
 *    - Specific ID: Show only that doctor
 *    - Enables doctor-specific filtering in dashboard
 * 
 * MANUAL BOOKING FLOW:
 * - Staff click available slots for specific doctors
 * - Backend still uses load balancing if doctorId === 'any'
 * - Frontend shows which doctor was actually assigned
 * - Provides transparency in manual booking process
 * 
 * SCALING CONSIDERATIONS:
 * - New doctors automatically appear when added to backend config
 * - Filter logic adapts to any number of doctors
 * - No hardcoded doctor limits in frontend
 */
// Get physical doctors for dynamic layout
const physicalDoctors = clinicConfig?.resources?.filter((doctor: any) => doctor.id !== 'any') || [];
const filteredDoctors = physicalDoctors.filter((doctor: any) => selectedDoctor === 'all' || doctor.id === selectedDoctor);

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-3">
        {timeSlots.map(time => {
          const slotAppointments = getAppointmentsForSlot(time);
          
          return (
            <div key={time} className="flex items-start gap-4 p-4 bg-white border-2 border-slate-200 rounded-xl hover:shadow-sm transition-all">
              <div className="flex items-center gap-3 min-w-[120px] py-2">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-4 h-4 text-blue-600" />
                </div>
                <span className="font-bold text-slate-800 text-lg">{time}</span>
              </div>
              
              <div 
                className="flex gap-3 py-2"
                style={{
                  gridTemplateColumns: `repeat(${filteredDoctors.length}, 1fr)`,
                  display: 'grid'
                }}
              >
                {filteredDoctors.map((doctor: any) => {
                    const appointment = slotAppointments.find(apt => apt.doctor_id === doctor.id && apt.type !== 'blocked');
                    const blockedSlot = slotAppointments.find(apt => apt.type === 'blocked' && apt.doctor_id === doctor.id);
                    const isPast = isSlotPast(time);
                    const isOutsideHours = isSlotOutsideWorkingHours(time, doctor);
                    const dateStr = format(currentDate, 'yyyy-MM-dd');
                    const isUnlocked = isSlotUnlocked(doctor.id, dateStr, time);
                    
                    return (
                      <div key={doctor.id} className="flex-1 min-w-[200px]">
                        {appointment ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`p-4 rounded-xl border-2 cursor-pointer hover:shadow-lg transition-all ${getStatusColor(appointment.status, appointment.type)} ${isPast ? 'bg-gray-50 opacity-60' : ''}`}
                            onClick={() => onAppointmentClick(appointment)}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-bold text-sm text-slate-900">{doctor.name}</span>
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="text-sm">
                              <div className="font-semibold text-slate-800">{appointment.first_name} {appointment.last_name}</div>
                              <div className="text-slate-600 text-xs mt-1">{appointment.service}</div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={`text-xs px-2 py-1 rounded-full font-medium ${getChannelColor(appointment.channel || 'manual')}`}>
                                  {appointment.channel}
                                </span>
                                <span className="text-xs text-slate-500">
                                  {appointment.phone}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ) : blockedSlot ? (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`p-4 rounded-xl border-2 cursor-pointer hover:shadow-lg transition-all ${getStatusColor(blockedSlot.status, blockedSlot.type)} ${isPast ? 'bg-gray-50 opacity-60' : ''}`}
                            onClick={() => {
                              console.log('DayView: Blocked slot clicked:', blockedSlot);
                              console.log('DayView: Blocked slot ID:', blockedSlot.id);
                              if (onBlockedSlotClick) {
                                onBlockedSlotClick(blockedSlot);
                              }
                            }}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <span className="font-bold text-sm text-slate-900">{doctor.name}</span>
                              <MoreVertical className="w-4 h-4 text-slate-400" />
                            </div>
                            <div className="text-sm">
                              <div className="font-semibold text-slate-800">Blocat</div>
                              <div className="text-slate-600 text-xs mt-1">{blockedSlot.service}</div>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-800">
                                  {blockedSlot.service}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ) : isOutsideHours && !isUnlocked ? (
                          <div className="w-full p-4 border-2 border-gray-500 bg-gray-100 text-gray-500 rounded-xl">
                            <div className="text-center">
                              <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <User className="w-4 h-4 text-gray-400" />
                              </div>
                              <span className="text-xs font-medium text-gray-500">Indisponibil</span>
                              {onUnlockSlotClick && (
                                <button
                                  onClick={() => onUnlockSlotClick(doctor.id, time)}
                                  className="mt-2 text-xs bg-blue-500 text-white px-2 py-1 rounded hover:bg-blue-600 transition-colors"
                                >
                                  Deblochează
                                </button>
                              )}
                            </div>
                          </div>
                        ) : isPast ? (
                          <div className="w-full p-4 border-2 border-dashed border-gray-300 bg-gray-50 opacity-60 rounded-xl">
                            <div className="text-center">
                              <div className="w-8 h-8 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-2">
                                <User className="w-4 h-4 text-gray-400" />
                              </div>
                              <span className="text-xs font-medium text-gray-400">Indisponibil</span>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => onSlotClick(doctor.id, time)}
                            className="w-full p-4 border-2 border-dashed border-slate-300 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
                          >
                            <div className="text-center">
                              <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-100 transition-colors">
                                <User className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
                              </div>
                              <span className="text-xs font-medium text-slate-500 group-hover:text-blue-600 transition-colors">Programează</span>
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
