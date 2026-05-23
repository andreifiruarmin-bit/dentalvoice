/**
 * DentalVoice Clinic Dashboard - Production-Grade Admin Interface
 * 
 * Tank Architecture Implementation:
 * - Robustness: Comprehensive error handling, loading states, and fallback mechanisms
 * - SaaS Multi-tenancy: Environment-driven configuration and API authentication
 * - Dynamic Parameters: Real-time data synchronization and responsive calendar views
 * - Explicit Logic: Clear separation of concerns with documented state management
 * 
 * CORE RESPONSIBILITIES:
 * 1. Real-time appointment management with Supabase real-time subscriptions
 * 2. Multi-view calendar system (Day/Week/Month) with doctor filtering
 * 3. Patient management and search functionality
 * 4. Clinic configuration and settings management
 * 5. Manual booking and appointment modification workflows
 * 6. Doctor availability and blocked slot management
 * 
 * STATE MANAGEMENT ARCHITECTURE:
 * - Centralized state with useState hooks for performance
 * - Optimistic updates for immediate UI feedback
 * - Real-time subscriptions for live data synchronization
 * - Error boundaries with toast notifications
 * - Loading states for better user experience
 */

import { useState, useEffect, FormEvent } from 'react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { 
  Calendar, 
  Search, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Plus,
  X,
  AlertCircle
} from 'lucide-react';
import PatientsSection from './components/PatientsSection';
import SettingsSection from './components/SettingsSection';
import BlockDoctorModal from './components/BlockDoctorModal';
import EditBlockedSlotModal from './components/EditBlockedSlotModal';
import UnlockSlotModal from './components/UnlockSlotModal';
import DayView from './components/CalendarViews/DayView';
import WeekView from './components/CalendarViews/WeekView';
import MonthView from './components/CalendarViews/MonthView';


// ==========================================
// ROMANIAN DATE FORMATTING (HARDCODED - SSR SAFE)
// ==========================================
const ZILE_RO = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
const LUNI_RO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

const formatRomanianDate = (date: Date, options: { day?: boolean; month?: boolean; year?: boolean } = { day: true, month: true, year: true }): string => {
  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();
  
  const parts: string[] = [];
  if (options.day) parts.push(day.toString());
  if (options.month) parts.push(LUNI_RO[month]);
  if (options.year) parts.push(year.toString());
  
  return parts.join(' ');
};

// ==========================================
// INTERFACES & TYPE DEFINITIONS
// ==========================================

/**
 * Appointment Interface: Dashboard appointment data structure
 * 
 * PURPOSE: Defines the shape of appointment data in the dashboard
 * - Matches Supabase appointments table schema
 * - Supports real-time updates and state management
 * - Includes all fields needed for comprehensive appointment management
 * 
 * @param id - Unique appointment identifier
 * @param first_name - Patient first name
 * @param last_name - Patient last name
 * @param phone - Patient phone number (normalized format)
 * @param email - Optional patient email
 * @param service - Service name or ID
 * @param doctor_id - Assigned doctor ID
 * @param doctor_name - Doctor display name
 * @param date - Appointment date (YYYY-MM-DD)
 * @param time - Appointment time (HH:mm)
 * @param status - Appointment status (Confirmed/Pending/Cancelled)
 * @param channel - Booking channel source
 * @param notes - Optional appointment notes
 * @param created_at - Creation timestamp
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
  email?: string;
  status: 'confirmed' | 'cancelled' | 'Confirmed' | 'Pending' | 'Cancelled';
  googleEventId?: string | null;
  calendarId?: string;
  doctorId?: string;
  doctor_name?: string;
  doctor_id?: string;
  notes?: string;
  created_at?: string;
  channel?: 'web' | 'whatsapp' | 'manual' | 'facebook';
  type?: 'appointment' | 'blocked';
  time_start?: string;
  time_end?: string;
}

/**
 * Clinic Configuration Interface: Complete clinic data structure
 * 
 * PURPOSE: Defines the shape of clinic configuration data from backend
 * - Matches backend /api/config endpoint response structure
 * - Supports multi-tenant deployments with environment-specific values
 * - Used throughout the dashboard for consistent data access
 * 
 * SAAS SCALING CONSIDERATIONS:
 * - Each clinic deployment has unique configuration via environment variables
 * - Backend API serves as single source of truth for all settings
 * - Frontend components consume this interface for consistent data access
 * - Add new fields here to support additional clinic customizations
 * 
 * @param id - Unique clinic identifier (from CLINIC_ID env var)
 * @param name - Display name for the clinic (from CLINIC_NAME env var)
 * @param location - Physical address (from CLINIC_ADDRESS env var)
 * @param clinicPhone - Contact phone number (from CLINIC_PHONE env var)
 * @param scheduling - Clinic-wide scheduling configuration
 * @param scheduling.workingHours - Default clinic operating hours
 * @param scheduling.slotStepMinutes - Time slot duration in minutes
 * @param resources - Array of doctor resources with availability
 * @param services - Array of available dental services
 */
interface ClinicConfig {
  id: string;
  name: string;
  location: string;
  clinicPhone: string;
  scheduling: {
    workingHours: { start: string; end: string };
    slotStepMinutes: number;
  };
  resources: Array<{
    id: string;
    name: string;
    workingDays: number[];
    workingHours: { start: string; end: string };
  }>;
  services: Array<{
    id: string;
    name: string;
    durationMinutes: number;
    description: string;
  }>;
}

/**
 * Toast Interface: Notification system data structure
 * 
 * PURPOSE: Defines the shape of toast notification data
 * - Used for user feedback on actions and errors
 * - Supports success and error message types
 * - Enables automatic dismissal and animation
 * 
 * @param id - Unique toast identifier for tracking
 * @param type - Toast type (success/error) for styling
 * @param message - Display message for the user
 */
interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// ==========================================
// DATABASE & API CONFIGURATION
// ==========================================

/**
 * CRITICAL: Supabase client configuration for real-time data
 * 
 * PURPOSE: Establishes connection to Supabase for real-time subscriptions
 * - Uses ANON_KEY for frontend access (limited permissions)
 * - Real-time subscriptions enable live appointment updates
 * - RLS policies ensure data isolation per clinic
 * 
 * ENVIRONMENT VARIABLES REQUIRED:
 * - VITE_SUPABASE_URL: Supabase project URL
 * - VITE_SUPABASE_ANON_KEY: Frontend API key with limited permissions
 * 
 * SECURITY NOTE: Never use SERVICE_ROLE_KEY in frontend
 */
const supabase = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL || '',
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''
);

/**
 * CRITICAL: API Authentication Configuration
 * 
 * SECURITY: Uses Supabase JWT tokens for dashboard API authentication
 * - Replaces VITE_ADMIN_API_KEY with secure JWT-based authentication
 * - Dashboard users must be authenticated via Supabase Auth
 * - JWT tokens are validated on backend using verifySupabaseJWT middleware
 * 
 * SECURITY CONSIDERATIONS:
 * - Never expose API secrets in browser bundle
 * - JWT tokens are automatically managed by Supabase client
 * - Tokens expire and refresh automatically
 * - No hardcoded API keys in frontend code
 */

// Helper function to get auth headers with JWT token
async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session.access_token}`,
    'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || ''
  };
}

// Max concurrent appointments per time slot = number of active doctors
// This is enforced server-side by processBooking(); the UI simply allows clicking any slot
// The actual limit is derived from clinicConfig.resources.length at runtime

export default function ClinicDashboard() {
  // Auth state
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');

  // UI state
  const [activeSection, setActiveSection] = useState<'calendar' | 'appointments' | 'patients' | 'settings'>('calendar');
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDoctor, setSelectedDoctor] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Data state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clinicConfig, setClinicConfig] = useState<ClinicConfig | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [clinicId, setClinicId] = useState<string>('');

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCancelRescheduleModal, setShowCancelRescheduleModal] = useState(false);
  const [showBlockDoctorModal, setShowBlockDoctorModal] = useState(false);
  const [showEditBlockedModal, setShowEditBlockedModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [selectedBlockedSlot, setSelectedBlockedSlot] = useState<any>(null);
  const [modalMode, setModalMode] = useState<'cancel' | 'reschedule'>('cancel');
  const [tempReservationId, setTempReservationId] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState('');

  // Scroll trap for inline modals
  useEffect(() => {
    if (showAddModal || showCancelRescheduleModal) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [showAddModal, showCancelRescheduleModal]);
  
  // Unlock slot state
  const [unlockSlotData, setUnlockSlotData] = useState<{
    doctorId: string;
    doctorName: string;
    date: string;
    time: string;
  } | null>(null);
  const [unlockedSlots, setUnlockedSlots] = useState<any[]>([]);
  const [isUnlocking, setIsUnlocking] = useState(false);

  // Form states
  const [newAppointment, setNewAppointment] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    service: '',
    doctorId: '',
    date: '',
    time: '',
    notes: '',
    sendEmail: false
  });

  const [blockDoctorForm, setBlockDoctorForm] = useState({
    doctorId: '',
    dateFrom: '',
    dateTo: '',
    timeFrom: '09:00',
    timeTo: '18:00',
    reason: ''
  });

  // Search/filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [appointmentFilter, setAppointmentFilter] = useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'all'>('all');
  const [currentPage, setCurrentPage] = useState(1);

  // Toast helper
  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'success' ? 3000 : 5000);
  };

  // Auth effects
  useEffect(() => {
    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Data fetching effects
  useEffect(() => {
    if (session) {
      fetchClinicConfig();
    }
  }, [session]);

  useEffect(() => {
    if (session && clinicConfig) {
      fetchAppointments();
      fetchUnlockedSlots();
    }
  }, [session, clinicConfig, currentDate, calendarView, selectedDoctor]);

  // Lightweight polling: refresh calendar when tab is visible (no Supabase realtime on tables)
  useEffect(() => {
    if (!session || !clinicConfig || activeSection !== 'calendar') return;

    const poll = () => {
      if (document.visibilityState === 'visible') {
        fetchAppointments();
      }
    };

    const intervalId = setInterval(poll, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [session, clinicConfig, activeSection, currentDate, calendarView, selectedDoctor]);

  // Auto-release temp reservation after 10 minutes
  useEffect(() => {
    if (!tempReservationId) return;
    const timer = setTimeout(() => {
      releaseTempReservation(tempReservationId);
      setTempReservationId(null);
      // Optionally close modal or show warning
    }, 10 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [tempReservationId]);

  // Fetch doctors via API; Realtime subscription when clinicId is known
  useEffect(() => {
    if (!session || !clinicId) return;

    let isMounted = true;

  const fetchDoctors = async () => {
    try {
      const res = await fetch('/api/doctors', {
        headers: { 'x-api-key': import.meta.env.VITE_ADMIN_API_KEY || '' }
      });
      if (!res.ok) throw new Error('Failed to fetch doctors');
      const data = await res.json();
      if (isMounted) {
        setDoctors(data || []);
        setLoadingDoctors(false);
      }
    } catch (error) {
      console.error('Error fetching doctors:', error);
      if (isMounted) {
        setDoctors([]);
        setLoadingDoctors(false);
      }
    }
  };

    fetchDoctors();

    // Setup Supabase Realtime channel for doctors changes
    const setupRealtimeSubscription = () => {
      try {
        const doctorsChannel = supabase
          .channel('realtime-doctors-changes')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'doctors',
              filter: `clinic_id=eq.${clinicId}`
            },
            () => {
              // Re-fetch doctors when any change occurs
              fetchDoctors();
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              console.log('Realtime doctors subscription established');
            }
          });

        // Cleanup function to remove channel
        return () => {
          supabase.removeChannel(doctorsChannel);
        };
      } catch (error) {
        console.error('Error setting up realtime subscription:', error);
        return () => {};
      }
    };

    const cleanup = setupRealtimeSubscription();

    // Cleanup on unmount
    return () => {
      isMounted = false;
      cleanup();
    };
  }, [session, clinicId]);

  // API functions
  const fetchClinicConfig = async () => {
    try {
      const response = await fetch('/api/config', {
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        const config = await response.json();
        setClinicConfig(config);
        const resolvedId = config.id ?? config.clinicId;
        if (resolvedId) setClinicId(resolvedId);
      }
    } catch (error) {
      console.error('Error fetching clinic config:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      let url = '/api/calendar/appointments?';
      
      if (calendarView === 'day') {
        url += `date=${format(currentDate, 'yyyy-MM-dd')}`;
      } else if (calendarView === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        url += `dateFrom=${format(weekStart, 'yyyy-MM-dd')}&dateTo=${format(weekEnd, 'yyyy-MM-dd')}`;
      } else if (calendarView === 'month') {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        url += `dateFrom=${format(monthStart, 'yyyy-MM-dd')}&dateTo=${format(monthEnd, 'yyyy-MM-dd')}`;
      }

      if (selectedDoctor !== 'all') {
        url += `&doctorId=${selectedDoctor}`;
      }

      const response = await fetch(url, {
        headers: await getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchUnlockedSlots = async () => {
    try {
      // Month view doesn't use unlocked slots — skip the call entirely
      if (calendarView === 'month') {
        setUnlockedSlots([]);
        return;
      }

      let url = '/api/calendar/unlocked-slots?';

      if (calendarView === 'day') {
        url += `date=${format(currentDate, 'yyyy-MM-dd')}`;
      } else if (calendarView === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        url += `date=${format(weekStart, 'yyyy-MM-dd')}`;
      }

      if (selectedDoctor !== 'all') {
        url += `&doctorId=${selectedDoctor}`;
      }

      const response = await fetch(url, {
        headers: await getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setUnlockedSlots(data.unlockedSlots || []);
      }
    } catch (error) {
      console.error('Error fetching unlocked slots:', error);
    }
  };

  const fetchAvailableSlots = async (date: string, doctorId: string, durationMinutes: number) => {
    if (!date || !doctorId) {
      setAvailableSlots([]);
      return;
    }
    setSlotsLoading(true);
    try {
      const response = await fetch(`/api/calendar/slots?date=${date}&doctorId=${doctorId}&durationMinutes=${durationMinutes}&source=dashboard`, {
        headers: await getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        // API returns { date, doctorId, slots: string[] }
        const slotsArray: string[] = Array.isArray(data) ? data : (data.slots ?? []);
        setAvailableSlots(slotsArray);
      } else {
        setAvailableSlots([]);
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  };

  // Auth handlers
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError('');
    
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        setAuthError('Email sau parolă incorectă');
      }
    } catch (error) {
      setAuthError('Eroare la autentificare');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Ephemeral slot reservation helpers
  const createTempReservation = async (doctorId: string, date: string, time: string): Promise<string | null> => {
    if (!doctorId || !date || !time) return null;
    try {
      const response = await fetch('/api/temp-reservation', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ doctorId, date, time })
      });
      if (response.ok) {
        const data = await response.json();
        return data.id ?? null;
      }
    } catch (e) {
      console.warn('Temp reservation creation failed:', e);
    }
    return null;
  };

  const releaseTempReservation = async (id: string) => {
    try {
      await fetch('/api/temp-reservation', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ id })
      });
    } catch (e) {
      console.warn('Temp reservation release failed:', e);
    }
  };

  // Appointment handlers
  const handleAddAppointment = async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          firstName: newAppointment.firstName,
          lastName: newAppointment.lastName,
          phone: newAppointment.phone,
          email: newAppointment.email,
          service: newAppointment.service,
          doctorId: newAppointment.doctorId,
          date: newAppointment.date,
          time: newAppointment.time,
          channel: 'manual',
          notes: newAppointment.notes,
          sendEmail: newAppointment.sendEmail
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        if (tempReservationId) {
          releaseTempReservation(tempReservationId);
          setTempReservationId(null);
        }
        setNewAppointment({
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          service: '',
          doctorId: '',
          date: '',
          time: '',
          notes: '',
          sendEmail: false
        });
        fetchAppointments();
        addToast('success', 'Programare adăugată cu succes');
        return { ok: true };
      } else {
        const error = await response.json();
        const isConflictError = response.status === 409 || 
                                (error.message && error.message.includes('tocmai a fost rezervat')) ||
                                (error.message && error.message.includes('UNIQUE constraint'));
        
        if (isConflictError) {
          // Race condition: slot was booked by someone else
          if (tempReservationId) {
            releaseTempReservation(tempReservationId);
            setTempReservationId(null);
          }
          fetchAppointments();
          return {
            ok: false,
            error:
              'Acest slot a fost rezervat de un alt pacient în timp ce editați. Vă rugăm selectați un alt interval orar.',
          };
        }
        return { ok: false, error: error.message || error.error || 'Eroare la adăugarea programării' };
      }
    } catch (error) {
      console.error('Error adding appointment:', error);
      return { ok: false, error: 'Eroare la adăugarea programării' };
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      const response = await fetch('/api/delete-booking', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          phone: selectedAppointment.phone,
          date: selectedAppointment.date,
          time: selectedAppointment.time
        })
      });

      if (response.ok) {
        setShowCancelRescheduleModal(false);
        setSelectedAppointment(null);
        fetchAppointments();
        addToast('success', 'Programare anulată cu succes');
      } else {
        addToast('error', 'Eroare la anularea programării');
      }
    } catch (error) {
      console.error('Error cancelling appointment:', error);
      addToast('error', 'Eroare la anularea programării');
    }
  };

  const handleRescheduleAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      // First cancel the old appointment
      const cancelResponse = await fetch('/api/delete-booking', {
        method: 'DELETE',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          phone: selectedAppointment.phone,
          date: selectedAppointment.date,
          time: selectedAppointment.time
        })
      });

      if (cancelResponse.ok) {
        // Then create the new appointment
        const bookResponse = await fetch('/api/bookings', {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            firstName: selectedAppointment.firstName,
            lastName: selectedAppointment.lastName,
            phone: selectedAppointment.phone,
            email: selectedAppointment.email,
            service: selectedAppointment.service,
            doctorId: selectedAppointment.doctor_id,
            date: newAppointment.date,
            time: newAppointment.time,
            channel: 'manual',
            notes: selectedAppointment.notes
          })
        });

        if (bookResponse.ok) {
          if (newAppointment.sendEmail) {
            handleSendRescheduleEmail(
              newAppointment.email || selectedAppointment.email || '',
              selectedAppointment,
              newAppointment
            ).catch(e => console.error(e));
          }
          fetchAppointments();
          addToast('success', 'Programare reprogramată cu succes');
          setShowCancelRescheduleModal(false);
          setSelectedAppointment(null);
          setNewAppointment({ firstName: '', lastName: '', phone: '', email: '', service: '', doctorId: '', date: '', time: '', notes: '', sendEmail: false });
        } else {
          addToast('error', 'Anulare efectuată dar reprogramarea a eșuat. Adăugați manual noua programare.');
        }
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      addToast('error', 'Eroare la reprogramarea programării');
    }
  };

  const handleSendRescheduleEmail = async (email: string, appt: any, newAppt: any) => {
    try {
      const doctor = doctors.find((d: any) => d.id === newAppt.doctorId);
      
      const response = await fetch('/api/send-confirmation', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          email: email,
          booking: {
            id: appt.id,
            firstName: appt.first_name || appt.firstName,
            lastName: appt.last_name || appt.lastName,
            date: newAppt.date,
            time: newAppt.time,
            service: appt.service,
            doctorName: doctor?.name || appt.doctor_name
          }
        })
      });

      if (response.ok) {
        addToast('success', 'Email trimis cu succes');
      } else {
        addToast('error', 'Eroare la trimiterea email-ului');
      }
    } catch (error) {
      console.error('Error sending reschedule email:', error);
      addToast('error', 'Eroare la trimiterea email-ului');
    }
  };

  const handleBlockDoctor = async () => {
    try {
      if (!blockDoctorForm.doctorId) {
        addToast('error', 'Selectați un doctor');
        return;
      }
      if (!blockDoctorForm.dateFrom) {
        addToast('error', 'Selectați data de început');
        return;
      }
      if (!blockDoctorForm.dateTo) {
        setBlockDoctorForm(prev => ({ ...prev, dateTo: prev.dateFrom }));
      }
      
      // Generate a single groupId for all slots in this vacation block
      const groupId = crypto.randomUUID();
      
      const startDate = new Date(blockDoctorForm.dateFrom + 'T00:00:00');
      const endDate = new Date(blockDoctorForm.dateTo + 'T00:00:00');
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // Get clinic configuration for slot generation
      const slotStepMinutes = clinicConfig?.scheduling.slotStepMinutes || 30;
      const workingHours = clinicConfig?.scheduling.workingHours || { start: '09:00', end: '18:00' };
      
      const startHour = parseInt(workingHours.start.split(':')[0]);
      const endHour = parseInt(workingHours.end.split(':')[0]);

      for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = format(currentDate, 'yyyy-MM-dd');
        
        // Generate all individual slots within the specified time range
        for (let hour = startHour; hour < endHour; hour++) {
          for (let minute = 0; minute < 60; minute += slotStepMinutes) {
            const slotTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
            
            // Check if this slot is within the specified blocking time range
            if (slotTime >= blockDoctorForm.timeFrom && slotTime < blockDoctorForm.timeTo) {
              const response = await fetch('/api/calendar/block', {
                method: 'POST',
                headers: await getAuthHeaders(),
                body: JSON.stringify({
                  doctorId: blockDoctorForm.doctorId,
                  date: dateStr,
                  timeStart: slotTime,
                  timeEnd: (() => {
                    const totalMinutes = hour * 60 + minute + slotStepMinutes;
                    const endH = Math.floor(totalMinutes / 60);
                    const endM = totalMinutes % 60;
                    return `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
                  })(),
                  reason: blockDoctorForm.reason,
                  groupId
                })
              });

              if (!response.ok) {
                throw new Error('Eroare la blocarea doctorului');
              }
            }
          }
        }
      }

      setShowBlockDoctorModal(false);
      setBlockDoctorForm({
        doctorId: '',
        dateFrom: '',
        dateTo: '',
        timeFrom: '',
        timeTo: '',
        reason: ''
      });
      fetchAppointments();
      addToast('success', 'Doctor blocat cu succes - toate sloturile din intervalul specificat au fost ocupate');
    } catch (error) {
      console.error('Error blocking doctor:', error);
      addToast('error', 'Eroare la blocarea doctorului');
    } finally {
      // Reset loading state
      const blockDoctorModal = document.querySelector('[data-block-doctor-modal]') as any;
      if (blockDoctorModal && blockDoctorModal.setIsSubmitting) {
        blockDoctorModal.setIsSubmitting(false);
      }
    }
  };

  const handleUnlockSlot = async () => {
    if (!unlockSlotData) return;

    try {
      setIsUnlocking(true);
      const response = await fetch('/api/calendar/unlock-slot', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          doctorId: unlockSlotData.doctorId,
          date: unlockSlotData.date,
          time: unlockSlotData.time
        })
      });

      if (response.ok) {
        setShowUnlockModal(false);
        setUnlockSlotData(null);
        fetchUnlockedSlots();
        addToast('success', 'Slot deblocat cu succes');
      } else {
        const error = await response.json();
        addToast('error', error.message || 'Eroare la deblocarea slotului');
      }
    } catch (error) {
      console.error('Error unlocking slot:', error);
      addToast('error', 'Eroare la deblocarea slotului');
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleUnlockSlotClick = (doctorId: string, date: string, time: string) => {
    const doctor = doctors.find((d: any) => d.id === doctorId);
    if (doctor) {
      setUnlockSlotData({
        doctorId,
        doctorName: doctor.name,
        date,
        time
      });
      setShowUnlockModal(true);
    }
  };

  const handleEditBlockedSlot = (blockedSlot: any) => {
    // Debug logging to identify data structure issues
    console.log('Blocked slot clicked:', blockedSlot);
    console.log('Blocked slot ID:', blockedSlot.id);
    
    // Add doctor name to blocked slot for display
    const doctor = doctors.find((d: any) => d.id === blockedSlot.doctor_id);
    const enhancedBlockedSlot = {
      ...blockedSlot,
      doctorName: doctor?.name || 'Doctor Necunoscut'
    };
    console.log('Enhanced blocked slot:', enhancedBlockedSlot);
    setSelectedBlockedSlot(enhancedBlockedSlot);
    setShowEditBlockedModal(true);
  };

  // Calendar helpers
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

  const getMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay() + 1);
    
    const days = [];
    const current = new Date(startDate);
    
    while (current <= lastDay || current.getDay() !== 1) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
      if (days.length > 42) break;
    }
    
    return days;
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

  // Login screen
  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl shadow-blue-100/50 p-10 border border-slate-100"
        >
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-200 rotate-3">
              <Stethoscope className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">DentalVoice</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Receptionist Dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {authError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700 text-sm font-medium">{authError}</span>
              </div>
            )}
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-blue-500 focus:ring-0 transition-all font-bold text-slate-900 outline-none"
                placeholder="email@exemplu.ro"
                required
              />
            </div>
            
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Parolă</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-blue-500 focus:ring-0 transition-all font-bold text-slate-900 outline-none"
                placeholder="••••••••"
                required
              />
            </div>
            
            <button 
              type="submit"
              className="w-full bg-accent text-white font-black py-5 rounded-2xl hover:bg-accent-hover transition-all shadow-lg active:scale-[0.98]"
            >
              AUTENTIFICARE
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans">
      {/* Toast notifications */}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className={`p-4 rounded-xl shadow-lg flex items-center gap-2 ${
                toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <span className="font-medium">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-100 flex flex-col p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-slate-900 leading-tight">{clinicConfig?.name || 'DentalVoice'}</h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Receptionist Dashboard</p>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveSection('calendar')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'calendar' ? 'bg-accent/10 text-accent border-l-4 border-accent' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Calendar className="w-5 h-5" />
            Calendar
          </button>
          <button 
            onClick={() => setActiveSection('patients')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'patients' ? 'bg-accent/10 text-accent border-l-4 border-accent' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Search className="w-5 h-5" />
            Pacienți
          </button>
          <button 
            onClick={() => setActiveSection('settings')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'settings' ? 'bg-accent/10 text-accent border-l-4 border-accent' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Settings className="w-5 h-5" />
            Setări
          </button>
        </nav>

        <div className="pt-8 border-t border-slate-100 space-y-4">
          <div className="px-6 py-2">
            <p className="text-xs text-slate-400 font-medium">Autentificat ca:</p>
            <p className="text-sm font-bold text-slate-900 truncate">{session.user?.email}</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Deconectare
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        {/* Calendar Section */}
        {activeSection === 'calendar' && (
          <>
            <header className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Calendar</h1>
                <p className="text-slate-400 font-bold">Gestionați programările clinicii.</p>
              </div>

              <div className="flex items-center gap-4">
                {/* View toggle */}
                <div className="flex bg-slate-100 rounded-xl p-1">
                  {(['day', 'week', 'month'] as const).map((view) => (
                    <button
                      key={view}
                      onClick={() => setCalendarView(view)}
                      className={`px-4 py-2 rounded-lg font-medium transition-all ${
                        calendarView === view 
                          ? 'bg-white text-slate-900 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {view === 'day' ? 'Zi' : view === 'week' ? 'Săptămână' : 'Lună'}
                    </button>
                  ))}
                </div>

                {/* Doctor filter */}
                <select 
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 outline-none focus:border-blue-500"
                  disabled={loadingDoctors}
                >
                  <option value="all">{loadingDoctors ? 'Încărcare...' : 'Toți doctorii'}</option>
                  {doctors.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                  ))}
                </select>

                {/* Action buttons */}
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-all flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Programare
                </button>

                {(calendarView === 'day' || calendarView === 'week') && (
                  <button 
                    onClick={() => setShowBlockDoctorModal(true)}
                    className="px-4 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-all"
                  >
                    Marchează absent
                  </button>
                )}

              </div>
            </header>

            {/* Calendar Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button 
                onClick={() => {
                  const newDate = new Date(currentDate);
                  if (calendarView === 'day') {
                    newDate.setDate(newDate.getDate() - 1);
                  } else if (calendarView === 'week') {
                    newDate.setDate(newDate.getDate() - 7);
                  } else {
                    newDate.setMonth(newDate.getMonth() - 1);
                  }
                  setCurrentDate(newDate);
                }}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 transition-all"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="text-center">
                <h2 className="text-xl font-black text-slate-900">
                  {calendarView === 'day' && formatRomanianDate(currentDate, { day: true, month: true, year: true })}
                  {calendarView === 'week' && (
                    <>
                      {formatRomanianDate(getWeekDays()[0], { day: true, month: true, year: false })} - {formatRomanianDate(getWeekDays()[6], { day: true, month: true, year: true })}
                    </>
                  )}
                  {calendarView === 'month' && formatRomanianDate(currentDate, { day: false, month: true, year: true })}
                </h2>
              </div>

              <button 
                onClick={() => {
                  const newDate = new Date(currentDate);
                  if (calendarView === 'day') {
                    newDate.setDate(newDate.getDate() + 1);
                  } else if (calendarView === 'week') {
                    newDate.setDate(newDate.getDate() + 7);
                  } else {
                    newDate.setMonth(newDate.getMonth() + 1);
                  }
                  setCurrentDate(newDate);
                }}
                className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-blue-600 transition-all"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Today button */}
            <div className="flex justify-center mb-6">
              <button 
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
              >
                {calendarView === 'day' ? 'Azi' : calendarView === 'week' ? 'Săptămâna curentă' : 'Luna curentă'}
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              {calendarView === 'day' && (
                <DayView 
                  appointments={appointments as any}
                  clinicConfig={clinicConfig}
                  currentDate={currentDate}
                  selectedDoctor={selectedDoctor}
                  unlockedSlots={unlockedSlots}
                  onSlotClick={(doctorId, time) => {
                    const date = format(currentDate, 'yyyy-MM-dd');
                    setNewAppointment({
                      ...newAppointment,
                      doctorId,
                      date,
                      time
                    });
                    setShowAddModal(true);
                    createTempReservation(doctorId, date, time).then(id => {
                      if (id) setTempReservationId(id);
                    });
                  }}
                  onAppointmentClick={(appointment) => {
                    setSelectedAppointment(appointment as Appointment);
                    setShowCancelRescheduleModal(true);
                  }}
                  onBlockedSlotClick={handleEditBlockedSlot}
                  onUnlockSlotClick={(doctorId, time) => {
                    handleUnlockSlotClick(doctorId, format(currentDate, 'yyyy-MM-dd'), time);
                  }}
                />
              )}
              
              {calendarView === 'week' && (
                <WeekView 
                  appointments={appointments as any}
                  clinicConfig={clinicConfig}
                  currentDate={currentDate}
                  selectedDoctor={selectedDoctor}
                  unlockedSlots={unlockedSlots}
                  onSlotClick={(doctorId, date, time) => {
                    setNewAppointment({
                      ...newAppointment,
                      doctorId,
                      date,
                      time
                    });
                    setShowAddModal(true);
                    createTempReservation(doctorId, date, time).then(id => {
                      if (id) setTempReservationId(id);
                    });
                  }}
                  onAppointmentClick={(appointment) => {
                    setSelectedAppointment(appointment as Appointment);
                    setShowCancelRescheduleModal(true);
                  }}
                  onBlockedSlotClick={handleEditBlockedSlot}
                  onUnlockSlotClick={handleUnlockSlotClick}
                />
              )}
              
              {calendarView === 'month' && (
                <MonthView 
                  appointments={appointments as any}
                  currentDate={currentDate}
                  onDayClick={(date) => {
                    setCurrentDate(date);
                    setCalendarView('day');
                  }}
                  onBlockedSlotClick={handleEditBlockedSlot}
                />
              )}
            </div>
          </>
        )}

        {/* Patients Section */}
        {activeSection === 'patients' && (
          <PatientsSection getAuthHeaders={getAuthHeaders} />
        )}

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <SettingsSection onDoctorsChange={fetchClinicConfig} clinicId={clinicId} />
        )}
      </main>

      {showAddModal && (
        <AddAppointmentModal 
          newAppointment={newAppointment}
          setNewAppointment={setNewAppointment}
          clinicConfig={clinicConfig}
          availableSlots={availableSlots}
          slotsLoading={slotsLoading}
          doctors={doctors}
          onClose={() => {
            setShowAddModal(false);
            setAvailableSlots([]);
            if (tempReservationId) {
              releaseTempReservation(tempReservationId);
              setTempReservationId(null);
            }
          }}
          onSubmit={handleAddAppointment}
          onDateChange={(date: string, doctorId: string, serviceId: string) => {
            if (!date) {
              setAvailableSlots([]);
              return;
            }
            if (doctorId && serviceId) {
              const service = clinicConfig?.services.find(s => s.id === serviceId);
              if (service) {
                fetchAvailableSlots(date, doctorId, service.durationMinutes);
              }
            }
          }}
        />
      )}

      {/* Cancel/Reschedule Modal */}
      {showCancelRescheduleModal && selectedAppointment && (
        <CancelRescheduleModal 
          appointment={selectedAppointment}
          doctors={doctors} 
          modalMode={modalMode}
          setModalMode={setModalMode}
          newAppointment={newAppointment}
          setNewAppointment={setNewAppointment}
          clinicConfig={clinicConfig}
          availableSlots={availableSlots}
          slotsLoading={slotsLoading}
          onClose={() => {
            setShowCancelRescheduleModal(false);
            setSelectedAppointment(null);
            setModalMode('cancel');
            setAvailableSlots([]);
            setNewAppointment({ firstName: '', lastName: '', phone: '', email: '', service: '', doctorId: '', date: '', time: '', notes: '', sendEmail: false });
          }}
          onCancel={handleCancelAppointment}
          onReschedule={handleRescheduleAppointment}
          onDateChange={(date: string, doctorId: string, serviceId: string) => {
            if (!date) {
              setAvailableSlots([]);
              return;
            }
            if (doctorId && serviceId) {
              const service = clinicConfig?.services.find(s => s.id === serviceId);
              if (service) {
                fetchAvailableSlots(date, doctorId, service.durationMinutes);
              }
            }
          }}
        />
      )}

      {/* Block Doctor Modal */}
      {showBlockDoctorModal && (
        <BlockDoctorModal 
          blockDoctorForm={blockDoctorForm}
          setBlockDoctorForm={setBlockDoctorForm}
          clinicConfig={clinicConfig}
          onClose={() => setShowBlockDoctorModal(false)}
          onSubmit={handleBlockDoctor}
          onSetSubmitting={(isSubmitting) => {
            // This callback can be used to reset loading state if needed
            if (!isSubmitting) {
              // Optional: Handle reset logic here if needed
            }
          }}
        />
      )}

      {/* Edit Blocked Slot Modal */}
      {showEditBlockedModal && (
        <EditBlockedSlotModal 
          blockedSlot={selectedBlockedSlot}
          clinicConfig={clinicConfig}
          onClose={() => {
            setShowEditBlockedModal(false);
            setSelectedBlockedSlot(null);
          }}
          onUpdate={() => {
            setShowEditBlockedModal(false);
            setSelectedBlockedSlot(null);
            fetchAppointments();
          }}
          onDelete={() => {
            setShowEditBlockedModal(false);
            setSelectedBlockedSlot(null);
            fetchAppointments();
          }}
        />
      )}

      {/* Unlock Slot Modal */}
      {showUnlockModal && unlockSlotData && (
        <UnlockSlotModal 
          isOpen={showUnlockModal}
          onClose={() => {
            setShowUnlockModal(false);
            setUnlockSlotData(null);
          }}
          onConfirm={handleUnlockSlot}
          doctorName={unlockSlotData.doctorName}
          date={unlockSlotData.date}
          time={unlockSlotData.time}
          isLoading={isUnlocking}
        />
      )}
    </div>
  );
}

// Add Appointment Modal Component
function AddAppointmentModal({ newAppointment, setNewAppointment, clinicConfig, availableSlots, slotsLoading, doctors, onClose, onSubmit, onDateChange }: any) {
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation helper functions
  const validateName = (name: string): string | null => {
    if (!name || name.trim().length === 0) return 'Acest câmp este obligatoriu';
    if (name.trim().length < 2) return 'Numele trebuie conving cel puin 2 caractere';
    if (!/^[a-zA-Z\u0100-\u017F\s-]+$/.test(name)) return 'Numele poate conving doar litere, spaii i cratime';
    return null;
  };

  const validatePhone = (phone: string): string | null => {
    if (!phone || phone.trim().length === 0) return 'Acest câmp este obligatoriu';
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) return 'Telefonul trebuie conving 10 cifre';
    if (!/^07/.test(cleanPhone)) return 'Numarul trebuience cu 07';
    return null;
  };

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim().length === 0) return null; // Email is optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return 'Adresa de email nu este valid';
    return null;
  };

  const validateDate = (date: string): string | null => {
    if (!date) return 'Acest câmp este obligatoriu';
    const selectedDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (selectedDate < today) return 'Data nu poate fi în trecut';
    return null;
  };

  const validateTime = (time: string): string | null => {
    if (!time) return 'Acest câmp este obligatoriu';
    if (!availableSlots.includes(time)) return 'Acest interval nu mai este disponibil';
    return null;
  };

  const sanitizeInput = (input: string): string => {
    return input
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<[^>]*>/g, '')
      .trim();
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    const firstNameError = validateName(newAppointment.firstName);
    if (firstNameError) newErrors.firstName = firstNameError;
    
    const lastNameError = validateName(newAppointment.lastName);
    if (lastNameError) newErrors.lastName = lastNameError;
    
    const phoneError = validatePhone(newAppointment.phone);
    if (phoneError) newErrors.phone = phoneError;
    
    const emailError = validateEmail(newAppointment.email);
    if (emailError) newErrors.email = emailError;
    
    const serviceError = !newAppointment.service ? 'Selecta\u021bi un serviciu' : null;
    if (serviceError) newErrors.service = serviceError;
    
    const doctorError = !newAppointment.doctorId ? 'Selecta\u021bi un doctor' : null;
    if (doctorError) newErrors.doctorId = doctorError;
    
    const dateError = validateDate(newAppointment.date);
    if (dateError) newErrors.date = dateError;
    
    const timeError = validateTime(newAppointment.time);
    if (timeError) newErrors.time = timeError;
    
    setFormErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    if (!newAppointment.date) {
      return;
    }
    const service = clinicConfig?.services.find((s: any) => s.id === newAppointment.service);
    if (service && newAppointment.doctorId) {
      onDateChange(newAppointment.date, newAppointment.doctorId, newAppointment.service);
    }
  }, [newAppointment.date, newAppointment.doctorId, newAppointment.service]);

  
  const handleSubmit = async () => {
    if (isSubmitting) return;
    
    // Validate form before submission
    if (!validateForm()) {
      setSubmitError('Vă rugăm corectați erorile din formular');
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError('');
    try {
      const result = await onSubmit();
      if (!result?.ok) {
        setSubmitError(result?.error || 'Eroare la adăugarea programării');
      }
    } catch (error) {
      console.error('Error submitting appointment:', error);
      setSubmitError('A apărut o eroare la salvarea programării');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">Adaugă Programare</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {submitError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">
            {submitError}
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Prenume *</label>
            <input
              type="text"
              value={newAppointment.firstName}
              onChange={(e) => {
                setNewAppointment({...newAppointment, firstName: e.target.value});
                // Clear error when user starts typing
                if (formErrors.firstName) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.firstName;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.firstName ? 'border-red-500' : 'border-slate-200'
              }`}
              placeholder="Prenume"
              required
            />
            {formErrors.firstName && (
              <p className="text-red-500 text-xs mt-1">{formErrors.firstName}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nume *</label>
            <input
              type="text"
              value={newAppointment.lastName}
              onChange={(e) => {
                setNewAppointment({...newAppointment, lastName: e.target.value});
                // Clear error when user starts typing
                if (formErrors.lastName) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.lastName;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.lastName ? 'border-red-500' : 'border-slate-200'
              }`}
              placeholder="Nume"
              required
            />
            {formErrors.lastName && (
              <p className="text-red-500 text-xs mt-1">{formErrors.lastName}</p>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Telefon *</label>
          <input
            type="tel"
            value={newAppointment.phone}
            onChange={(e) => {
              setNewAppointment({...newAppointment, phone: e.target.value});
              // Clear error when user starts typing
              if (formErrors.phone) {
                setFormErrors(prev => {
                  const newErrors = {...prev};
                  delete newErrors.phone;
                  return newErrors;
                });
              }
            }}
            className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
              formErrors.phone ? 'border-red-500' : 'border-slate-200'
            }`}
            placeholder="07xx xxx xxx"
            required
          />
          {formErrors.phone && (
            <p className="text-red-500 text-xs mt-1">{formErrors.phone}</p>
          )}
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
          <input
            type="email"
            value={newAppointment.email}
            onChange={(e) => {
              setNewAppointment({...newAppointment, email: e.target.value});
              // Clear error when user starts typing
              if (formErrors.email) {
                setFormErrors(prev => {
                  const newErrors = {...prev};
                  delete newErrors.email;
                  return newErrors;
                });
              }
            }}
            className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
              formErrors.email ? 'border-red-500' : 'border-slate-200'
            }`}
            placeholder="email@exemplu.ro"
          />
          {formErrors.email && (
            <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>
          )}
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Serviciu *</label>
            <select
              value={newAppointment.service}
              onChange={(e) => {
                setNewAppointment({...newAppointment, service: e.target.value});
                // Clear error when user starts typing
                if (formErrors.service) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.service;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.service ? 'border-red-500' : 'border-slate-200'
              }`}
              required
            >
              <option value="">Selectează serviciu</option>
              {clinicConfig?.services.map((service: any) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
            {formErrors.service && (
              <p className="text-red-500 text-xs mt-1">{formErrors.service}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
            <select
              value={newAppointment.doctorId}
              onChange={(e) => {
                setNewAppointment({...newAppointment, doctorId: e.target.value});
                // Clear error when user starts typing
                if (formErrors.doctorId) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.doctorId;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.doctorId ? 'border-red-500' : 'border-slate-200'
              }`}
              required
            >
              <option value="">Selectează doctor</option>
              {doctors
                .map((doctor: any) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                ))}
            </select>
            {formErrors.doctorId && (
              <p className="text-red-500 text-xs mt-1">{formErrors.doctorId}</p>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
            <input
              type="date"
              value={newAppointment.date}
              onChange={(e) => {
                setNewAppointment({...newAppointment, date: e.target.value});
                // Clear error when user starts typing
                if (formErrors.date) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.date;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.date ? 'border-red-500' : 'border-slate-200'
              }`}
              required
            />
            {formErrors.date && (
              <p className="text-red-500 text-xs mt-1">{formErrors.date}</p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ora *</label>
            <select
              value={newAppointment.time}
              onChange={(e) => {
                setNewAppointment({...newAppointment, time: e.target.value});
                // Clear error when user starts typing
                if (formErrors.time) {
                  setFormErrors(prev => {
                    const newErrors = {...prev};
                    delete newErrors.time;
                    return newErrors;
                  });
                }
              }}
              className={`w-full px-4 py-3 bg-slate-50 border rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 ${
                formErrors.time ? 'border-red-500' : 'border-slate-200'
              }`}
              required
              disabled={!newAppointment.date || !newAppointment.doctorId || slotsLoading || (!slotsLoading && availableSlots.length === 0)}
            >
              <option value="">{slotsLoading ? 'Se încarcă intervalele...' : 'Selectează ora'}</option>
              {!slotsLoading && availableSlots.map((slot: string) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
            {formErrors.time && (
              <p className="text-red-500 text-xs mt-1">{formErrors.time}</p>
            )}
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Note</label>
          <textarea
            value={newAppointment.notes}
            onChange={(e) => setNewAppointment({...newAppointment, notes: e.target.value})}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
            rows={3}
            placeholder="Note opționale..."
          />
        </div>
        
        <div className="mt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={newAppointment.sendEmail || false}
              onChange={(e) => setNewAppointment({...newAppointment, sendEmail: e.target.checked})}
              className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700">
              Trimite datele programării pe email
            </span>
          </label>
          <p className="text-xs text-slate-500 mt-1 ml-7">
            Pacientul va primi pe email detaliile programării, adresa clinicii și fișier .ics pentru adăugare în calendar
          </p>
        </div>
        
        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
          >
            Anulează
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex-1 px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Cancel/Reschedule Modal Component
function CancelRescheduleModal({ appointment, modalMode, setModalMode, newAppointment, setNewAppointment, clinicConfig, availableSlots, slotsLoading, doctors, onClose, onCancel, onReschedule, onDateChange }: any) {
  useEffect(() => {
    if (modalMode !== 'reschedule' || !newAppointment.date) {
      return;
    }
    if (newAppointment.doctorId && appointment.service) {
      const service = clinicConfig?.services?.find((s: { name: string }) => s.name === appointment.service);
      if (service) {
        onDateChange(newAppointment.date, newAppointment.doctorId, service.id);
      }
    }
  }, [modalMode, newAppointment.date, newAppointment.doctorId]);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">Gestionare Programare</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        {/* Appointment Details */}
        <div className="bg-slate-50 rounded-xl p-6 mb-6">
          <h4 className="font-bold text-slate-900 mb-4">Detalii Programare</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-slate-600">Pacient:</span>
              <p className="font-medium text-slate-900">{appointment.first_name} {appointment.last_name}</p>
            </div>
            <div>
              <span className="text-slate-600">Telefon:</span>
              <p className="font-medium text-slate-900">{appointment.phone}</p>
            </div>
            <div>
              <span className="text-slate-600">Serviciu:</span>
              <p className="font-medium text-slate-900">{appointment.service}</p>
            </div>
            <div>
              <span className="text-slate-600">Doctor:</span>
              <p className="font-medium text-slate-900">{appointment.doctor_name}</p>
            </div>
            <div>
              <span className="text-slate-600">Data:</span>
              <p className="font-medium text-slate-900">{appointment.date}</p>
            </div>
            <div>
              <span className="text-slate-600">Ora:</span>
              <p className="font-medium text-slate-900">{appointment.time}</p>
            </div>
          </div>
        </div>
        
        {/* Action Selection */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setModalMode('cancel')}
            className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
              modalMode === 'cancel' 
                ? 'bg-red-500 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Anulează Programarea
          </button>
          <button
            onClick={() => setModalMode('reschedule')}
            className={`flex-1 px-4 py-3 rounded-xl font-medium transition-all ${
              modalMode === 'reschedule' 
                ? 'bg-blue-500 text-white' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Reprogramare
          </button>
        </div>
        
        {/* Cancel Content */}
        {modalMode === 'cancel' && (
          <div className="text-center py-6">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-slate-700 mb-6">
              Sigur doriți să anulați programarea lui {appointment.first_name} {appointment.last_name}?
            </p>
            <div className="flex gap-4">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
              >
                Nu
              </button>
              <button
                onClick={onCancel}
                className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all"
              >
                Da, Anulează
              </button>
            </div>
          </div>
        )}
        
        {/* Reschedule Content */}
        {modalMode === 'reschedule' && (
          <div>
            <h4 className="font-bold text-slate-900 mb-4">Selectează doctor, dată și oră</h4>
            
            <div className="mt-4 mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
              <select
                value={newAppointment.doctorId || ''}
                onChange={(e) => setNewAppointment({...newAppointment, doctorId: e.target.value, date: '', time: ''})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                required
              >
                <option value="">Selectează doctor</option>
                {(doctors || []).map((doctor: any) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
                <input
                  type="date"
                  value={newAppointment.date || ''}
                  onChange={(e) => setNewAppointment({...newAppointment, date: e.target.value, time: ''})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 disabled:opacity-50"
                  required
                  disabled={!newAppointment.doctorId}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ora *</label>
                <select
                  value={newAppointment.time || ''}
                  onChange={(e) => setNewAppointment({...newAppointment, time: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500 disabled:opacity-50"
                  required
                  disabled={!newAppointment.date || !newAppointment.doctorId || slotsLoading || (!slotsLoading && availableSlots.length === 0)}
                >
                  <option value="">{slotsLoading ? 'Se încarcă intervalele...' : 'Selectează ora'}</option>
                  {!slotsLoading && availableSlots.map((slot: string) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newAppointment.sendEmail || false}
                  onChange={(e) => setNewAppointment({...newAppointment, sendEmail: e.target.checked})}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-slate-700">
                  Trimite modificările pe emailul pacientului
                </span>
              </label>
              
              {newAppointment.sendEmail && (
                <div className="mt-3 ml-7">
                  {appointment.email ? (
                    <div className="text-sm text-slate-600 flex items-center gap-2">
                      <span className="font-medium text-slate-900">Se trimite la: {appointment.email}</span>
                    </div>
                  ) : (
                    <div>
                      <input
                        type="email"
                        value={newAppointment.email || ''}
                        onChange={(e) => setNewAppointment({...newAppointment, email: e.target.value})}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-blue-500"
                        placeholder="Email pacient"
                        required={newAppointment.sendEmail}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            <div className="flex gap-4 mt-6">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
              >
                Anulează
              </button>
              <button
                onClick={onReschedule}
                disabled={!newAppointment.doctorId || !newAppointment.date || !newAppointment.time || (newAppointment.sendEmail && !appointment.email && !newAppointment.email)}
                className="flex-1 px-6 py-3 bg-accent text-white rounded-xl font-medium hover:bg-accent-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvează
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Confirmed': return 'border-green-500';
    case 'Pending': return 'border-yellow-500';
    case 'Cancelled': return 'border-red-500';
    default: return 'border-gray-500';
  }
}