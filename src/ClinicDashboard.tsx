import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@supabase/supabase-js';
import { 
  Calendar, 
  Users, 
  Search, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  XCircle, 
  Clock,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Phone,
  Mail,
  Plus,
  X,
  User,
  Filter,
  AlertCircle,
  MoreVertical
} from 'lucide-react';


// Types
interface Appointment {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  service: string;
  doctor_id: string;
  doctor_name: string;
  date: string;
  time: string;
  status: 'Confirmed' | 'Pending' | 'Cancelled';
  channel: 'web' | 'whatsapp' | 'manual' | 'facebook';
  notes?: string;
  created_at: string;
}

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

interface Toast {
  id: string;
  type: 'success' | 'error';
  message: string;
}

// Supabase client
const supabase = createClient(
  (import.meta as any).env.VITE_SUPABASE_URL || '',
  (import.meta as any).env.VITE_SUPABASE_ANON_KEY || ''
);

// DEPLOYMENT NOTE: Requires VITE_ADMIN_API_KEY in Vercel env vars
// Value must match ADMIN_API_KEY on the backend
// Without this, all protected API calls return 401 Unauthorized

// API key
const _rawApiKey = (import.meta as any).env.VITE_ADMIN_API_KEY;
if (!_rawApiKey) {
  console.warn('⚠️ VITE_ADMIN_API_KEY not set — falling back to default key. Set this in Vercel env vars.');
}
const API_KEY = _rawApiKey || 'dv-secret-key-2026';

// Max concurrent appointments per time slot = number of active doctors
// This is enforced server-side by processBooking(); the UI simply allows clicking any slot
// The actual limit is derived from clinicConfig.resources.length at runtime

export default function ClinicDashboard() {
  // Auth state
  const [session, setSession] = React.useState<any>(null);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [authError, setAuthError] = React.useState('');

  // UI state
  const [activeSection, setActiveSection] = React.useState<'calendar' | 'appointments' | 'patients' | 'settings'>('calendar');
  const [calendarView, setCalendarView] = React.useState<'day' | 'week' | 'month'>('day');
  const [currentDate, setCurrentDate] = React.useState(new Date());
  const [selectedDoctor, setSelectedDoctor] = React.useState('all');
  const [isLoading, setIsLoading] = React.useState(true);
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  // Data state
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [clinicConfig, setClinicConfig] = React.useState<ClinicConfig | null>(null);
  const [availableSlots, setAvailableSlots] = React.useState<string[]>([]);

  // Modal states
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [showCancelRescheduleModal, setShowCancelRescheduleModal] = React.useState(false);
  const [showBlockDoctorModal, setShowBlockDoctorModal] = React.useState(false);
  const [selectedAppointment, setSelectedAppointment] = React.useState<Appointment | null>(null);
  const [modalMode, setModalMode] = React.useState<'cancel' | 'reschedule'>('cancel');

  // Form states
  const [newAppointment, setNewAppointment] = React.useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    service: '',
    doctorId: '',
    date: '',
    time: '',
    notes: ''
  });

  const [blockDoctorForm, setBlockDoctorForm] = React.useState({
    doctorId: '',
    dateFrom: '',
    dateTo: '',
    timeFrom: '09:00',
    timeTo: '18:00',
    reason: ''
  });

  // Search/filter states
  const [searchTerm, setSearchTerm] = React.useState('');
  const [appointmentFilter, setAppointmentFilter] = React.useState<'all' | 'confirmed' | 'pending' | 'cancelled'>('all');
  const [dateFilter, setDateFilter] = React.useState<'today' | 'week' | 'all'>('all');
  const [currentPage, setCurrentPage] = React.useState(1);

  // Toast helper
  const addToast = (type: 'success' | 'error', message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'success' ? 3000 : 5000);
  };

  // Auth effects
  React.useEffect(() => {
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
  React.useEffect(() => {
    if (session) {
      fetchClinicConfig();
    }
  }, [session]);

  React.useEffect(() => {
    if (session && clinicConfig) {
      fetchAppointments();
    }
  }, [session, clinicConfig, currentDate, calendarView, selectedDoctor]);

  // API functions
  const fetchClinicConfig = async () => {
    try {
      const response = await fetch('/api/config', {
        headers: { 'x-api-key': API_KEY }
      });
      if (response.ok) {
        const config = await response.json();
        setClinicConfig(config);
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
        url += `date=${currentDate.toISOString().split('T')[0]}`;
      } else if (calendarView === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        url += `dateFrom=${weekStart.toISOString().split('T')[0]}&dateTo=${weekEnd.toISOString().split('T')[0]}`;
      } else if (calendarView === 'month') {
        const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        url += `dateFrom=${monthStart.toISOString().split('T')[0]}&dateTo=${monthEnd.toISOString().split('T')[0]}`;
      }

      if (selectedDoctor !== 'all') {
        url += `&doctorId=${selectedDoctor}`;
      }

      const response = await fetch(url, {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchAvailableSlots = async (date: string, doctorId: string, durationMinutes: number) => {
    try {
      const response = await fetch(`/api/calendar/slots?date=${date}&doctorId=${doctorId}&durationMinutes=${durationMinutes}`, {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        // API returns { date, doctorId, slots: string[] }
        const slotsArray: string[] = Array.isArray(data) ? data : (data.slots ?? []);
        setAvailableSlots(slotsArray);
      }
    } catch (error) {
      console.error('Error fetching available slots:', error);
    }
  };

  // Auth handlers
  const handleLogin = async (e: React.FormEvent) => {
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

  // Appointment handlers
  const handleAddAppointment = async () => {
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
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
          notes: newAppointment.notes
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewAppointment({
          firstName: '',
          lastName: '',
          phone: '',
          email: '',
          service: '',
          doctorId: '',
          date: '',
          time: '',
          notes: ''
        });
        fetchAppointments();
        addToast('success', 'Programare adăugată cu succes');
      } else {
        const error = await response.json();
        addToast('error', error.message || 'Eroare la adăugarea programării');
      }
    } catch (error) {
      console.error('Error adding appointment:', error);
      addToast('error', 'Eroare la adăugarea programării');
    }
  };

  const handleCancelAppointment = async () => {
    if (!selectedAppointment) return;

    try {
      const response = await fetch('/api/delete-booking', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
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
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
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
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
          },
          body: JSON.stringify({
            firstName: selectedAppointment.first_name,
            lastName: selectedAppointment.last_name,
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
          setShowCancelRescheduleModal(false);
          setSelectedAppointment(null);
          fetchAppointments();
          addToast('success', 'Programare reprogramată cu succes');
        } else {
          addToast('error', 'Anulare efectuată dar reprogramarea a eșuat. Adăugați manual noua programare.');
        }
      }
    } catch (error) {
      console.error('Error rescheduling appointment:', error);
      addToast('error', 'Eroare la reprogramarea programării');
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
      
      const startDate = new Date(blockDoctorForm.dateFrom);
      const endDate = new Date(blockDoctorForm.dateTo);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      for (let i = 0; i < days; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        
        const response = await fetch('/api/calendar/block', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
          },
          body: JSON.stringify({
            doctorId: blockDoctorForm.doctorId,
            date: currentDate.toISOString().split('T')[0],
            timeStart: blockDoctorForm.timeFrom,
            timeEnd: blockDoctorForm.timeTo,
            reason: blockDoctorForm.reason
          })
        });

        if (!response.ok) {
          throw new Error('Eroare la blocarea doctorului');
        }
      }

      setShowBlockDoctorModal(false);
      setBlockDoctorForm({
        doctorId: '',
        dateFrom: '',
        dateTo: '',
        timeFrom: '09:00',
        timeTo: '18:00',
        reason: ''
      });
      fetchAppointments();
      addToast('success', 'Doctor blocat cu succes');
    } catch (error) {
      console.error('Error blocking doctor:', error);
      addToast('error', 'Eroare la blocarea doctorului');
    }
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
              className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-blue-600 transition-all shadow-lg active:scale-[0.98]"
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
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'calendar' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Calendar className="w-5 h-5" />
            Calendar
          </button>
          <button 
            onClick={() => setActiveSection('appointments')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'appointments' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Users className="w-5 h-5" />
            Programări
          </button>
          <button 
            onClick={() => setActiveSection('patients')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'patients' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Search className="w-5 h-5" />
            Pacienți
          </button>
          <button 
            onClick={() => setActiveSection('settings')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeSection === 'settings' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
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
                >
                  <option value="all">Toți doctorii</option>
                  {clinicConfig?.resources.map((doctor) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                  ))}
                </select>

                {/* Action buttons */}
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all flex items-center gap-2"
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
                  {calendarView === 'day' && currentDate.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {calendarView === 'week' && (
                    <>
                      {getWeekDays()[0].toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })} - {getWeekDays()[6].toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </>
                  )}
                  {calendarView === 'month' && currentDate.toLocaleDateString('ro-RO', { month: 'long', year: 'numeric' })}
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
                  appointments={appointments}
                  clinicConfig={clinicConfig}
                  currentDate={currentDate}
                  selectedDoctor={selectedDoctor}
                  onSlotClick={(doctorId, time) => {
                    setNewAppointment({
                      ...newAppointment,
                      doctorId,
                      date: currentDate.toISOString().split('T')[0],
                      time
                    });
                    setShowAddModal(true);
                  }}
                  onAppointmentClick={(appointment) => {
                    setSelectedAppointment(appointment);
                    setShowCancelRescheduleModal(true);
                  }}
                />
              )}
              
              {calendarView === 'week' && (
                <WeekView 
                  appointments={appointments}
                  clinicConfig={clinicConfig}
                  currentDate={currentDate}
                  selectedDoctor={selectedDoctor}
                  onSlotClick={(doctorId, date, time) => {
                    setNewAppointment({
                      ...newAppointment,
                      doctorId,
                      date,
                      time
                    });
                    setShowAddModal(true);
                  }}
                  onAppointmentClick={(appointment) => {
                    setSelectedAppointment(appointment);
                    setShowCancelRescheduleModal(true);
                  }}
                />
              )}
              
              {calendarView === 'month' && (
                <MonthView 
                  appointments={appointments}
                  currentDate={currentDate}
                  onDayClick={(date) => {
                    setCurrentDate(date);
                    setCalendarView('day');
                  }}
                />
              )}
            </div>
          </>
        )}

        {/* Appointments Section */}
        {activeSection === 'appointments' && (
          <AppointmentsSection 
            appointments={appointments}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            appointmentFilter={appointmentFilter}
            setAppointmentFilter={setAppointmentFilter}
            dateFilter={dateFilter}
            setDateFilter={setDateFilter}
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            onAppointmentClick={(appointment) => {
              setSelectedAppointment(appointment);
              setShowCancelRescheduleModal(true);
            }}
          />
        )}

        {/* Patients Section */}
        {activeSection === 'patients' && (
          <PatientsSection 
            API_KEY={API_KEY}
            onAppointmentClick={(appointment) => {
              setSelectedAppointment(appointment);
              setShowCancelRescheduleModal(true);
            }}
          />
        )}

        {/* Settings Section */}
        {activeSection === 'settings' && (
          <SettingsSection clinicConfig={clinicConfig} />
        )}
      </main>

      {/* Add Appointment Modal */}
      {showAddModal && (
        <AddAppointmentModal 
          newAppointment={newAppointment}
          setNewAppointment={setNewAppointment}
          clinicConfig={clinicConfig}
          availableSlots={availableSlots}
          onClose={() => setShowAddModal(false)}
          onSubmit={handleAddAppointment}
          onDateChange={(date, doctorId, serviceId) => {
            if (date && doctorId && serviceId) {
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
          modalMode={modalMode}
          setModalMode={setModalMode}
          newAppointment={newAppointment}
          setNewAppointment={setNewAppointment}
          clinicConfig={clinicConfig}
          availableSlots={availableSlots}
          onClose={() => {
            setShowCancelRescheduleModal(false);
            setSelectedAppointment(null);
            setModalMode('cancel');
          }}
          onCancel={handleCancelAppointment}
          onReschedule={handleRescheduleAppointment}
          onDateChange={(date, doctorId, serviceId) => {
            if (date && doctorId && serviceId) {
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
        />
      )}
    </div>
  );
}

// Day View Component
function DayView({ appointments, clinicConfig, currentDate, selectedDoctor, onSlotClick, onAppointmentClick }: any) {
  const timeSlots = React.useMemo(() => {
    if (!clinicConfig) return [];
    const slots = [];
    const startHour = parseInt(clinicConfig.scheduling.workingHours.start.split(':')[0]);
    const endHour = parseInt(clinicConfig.scheduling.workingHours.end.split(':')[0]);
    
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, [clinicConfig]);

  const doctors = React.useMemo(() => {
    if (!clinicConfig) return [];
    return selectedDoctor === 'all' 
      ? clinicConfig.resources 
      : clinicConfig.resources.filter((d: any) => d.id === selectedDoctor);
  }, [clinicConfig, selectedDoctor]);

  const getAppointmentForSlot = (doctorId: string, time: string) => {
    return appointments.find(apt => 
      apt.doctor_id === doctorId && 
      apt.date === currentDate.toISOString().split('T')[0] && 
      apt.time === time
    );
  };

  const getCurrentTimeIndicator = () => {
    const now = new Date();
    const isToday = currentDate.toDateString() === now.toDateString();
    if (!isToday) return null;

    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const totalMinutes = currentHour * 60 + currentMinute;
    const startHour = parseInt(clinicConfig?.scheduling.workingHours.start.split(':')[0] || '9');
    const startMinutes = startHour * 60;
    const position = ((totalMinutes - startMinutes) / 60) * 80; // 80px per hour

    return (
      <div 
        className="absolute left-0 right-0 h-0.5 bg-red-500 z-10"
        style={{ top: `${position + 60}px` }} // 60px for header
      >
        <div className="absolute -left-2 -top-1 w-4 h-4 bg-red-500 rounded-full" />
      </div>
    );
  };

  return (
    <div className="relative">
      {getCurrentTimeIndicator()}
      <div className="grid" style={{ gridTemplateColumns: '100px repeat(' + doctors.length + ', 1fr)' }}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 font-black text-[10px] text-slate-400 uppercase tracking-wider">
          Ora
        </div>
        {doctors.map((doctor: any) => (
          <div key={doctor.id} className="p-4 border-b border-slate-200 border-l border-slate-200">
            <div className="font-bold text-slate-900">{doctor.name}</div>
          </div>
        ))}

        {/* Time slots */}
        {timeSlots.map((time) => (
          <React.Fragment key={time}>
            <div className="p-4 border-b border-slate-200 font-bold text-slate-400 text-sm">
              {time}
            </div>
            {doctors.map((doctor: any) => {
              const appointment = getAppointmentForSlot(doctor.id, time);
              const isClickable = !appointment;
              
              return (
                <div 
                  key={doctor.id}
                  onClick={() => isClickable && onSlotClick(doctor.id, time)}
                  className={`p-2 border-b border-l border-slate-200 min-h-[80px] ${
                    isClickable ? 'cursor-pointer hover:bg-blue-50' : ''
                  }`}
                >
                  {appointment && (
                    <div 
                      className={`bg-white border-2 rounded-lg p-2 text-xs cursor-pointer hover:shadow-md transition-all ${getStatusColor(appointment.status)}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(appointment);
                      }}
                    >
                      <div className="font-bold text-slate-900">{appointment.first_name} {appointment.last_name}</div>
                      <div className="text-slate-600 text-xs">{appointment.service}</div>
                      <div className={`inline-block px-2 py-0.5 rounded text-[8px] font-medium mt-1 ${getChannelColor(appointment.channel)}`}>
                        {appointment.channel}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// Week View Component
function WeekView({ appointments, clinicConfig, currentDate, selectedDoctor, onSlotClick, onAppointmentClick }: any) {
  const timeSlots = React.useMemo(() => {
    if (!clinicConfig) return [];
    const slots = [];
    const startHour = parseInt(clinicConfig.scheduling.workingHours.start.split(':')[0]);
    const endHour = parseInt(clinicConfig.scheduling.workingHours.end.split(':')[0]);
    
    for (let hour = startHour; hour < endHour; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  }, [clinicConfig]);

  const weekDays = React.useMemo(() => {
    const weekStart = new Date(currentDate);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  }, [currentDate]);

  const getAppointmentForSlot = (date: string, time: string) => {
    return appointments.filter(apt => 
      apt.date === date && apt.time === time
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        <div className="grid" style={{ gridTemplateColumns: '100px repeat(7, 1fr)' }}>
          {/* Header */}
          <div className="p-4 border-b border-slate-200 font-black text-[10px] text-slate-400 uppercase tracking-wider">
            Ora
          </div>
          {weekDays.map((day, index) => (
            <div key={index} className="p-4 border-b border-l border-slate-200 text-center">
              <div className="font-black text-slate-900">{day.toLocaleDateString('ro-RO', { weekday: 'short' })}</div>
              <div className="text-sm text-slate-400">{day.getDate()}</div>
            </div>
          ))}

          {/* Time slots */}
          {timeSlots.map((time) => (
            <React.Fragment key={time}>
              <div className="p-4 border-b border-slate-200 font-bold text-slate-400 text-sm">
                {time}
              </div>
              {weekDays.map((day, dayIndex) => {
                const dateStr = day.toISOString().split('T')[0];
                const slotAppointments = getAppointmentForSlot(dateStr, time);
                
                return (
                  <div 
                    key={dayIndex}
                    onClick={() => onSlotClick('any', dateStr, time)}
                    className={`p-2 border-b border-l border-slate-200 min-h-[60px] cursor-pointer hover:bg-blue-50`}
                  >
                    {slotAppointments.length > 0 && (
                      <div className="space-y-1">
                        {slotAppointments.length === 1 ? (
                          <div 
                            className={`bg-white border-2 rounded-lg p-1 text-xs cursor-pointer hover:shadow-md transition-all ${getStatusColor(slotAppointments[0].status)}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAppointmentClick(slotAppointments[0]);
                            }}
                          >
                            <div className="font-bold text-slate-900 truncate">{slotAppointments[0].first_name} {slotAppointments[0].last_name}</div>
                            <div className="text-slate-600 text-xs truncate">{slotAppointments[0].service}</div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {slotAppointments.map((apt: any) => (
                              <div
                                key={apt.id}
                                className={`bg-white border-2 rounded-lg p-1 text-xs cursor-pointer hover:shadow-md transition-all ${getStatusColor(apt.status)}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAppointmentClick(apt);
                                }}
                              >
                                <div className="font-bold text-slate-900 truncate text-[10px]">{apt.doctor_name}</div>
                                <div className="text-slate-600 truncate text-[10px]">{apt.service}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// Month View Component
function MonthView({ appointments, currentDate, onDayClick }: any) {
  const monthDays = React.useMemo(() => {
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
  }, [currentDate]);

  const getAppointmentsForDay = (date: string) => {
    return appointments.filter(apt => apt.date === date);
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === currentDate.getMonth();
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-7 gap-px bg-slate-200">
        {/* Weekday headers */}
        {['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'].map((day) => (
          <div key={day} className="bg-slate-50 p-3 text-center font-black text-[10px] text-slate-400 uppercase tracking-wider">
            {day}
          </div>
        ))}
        
        {/* Days */}
        {monthDays.map((day, index) => {
          const dateStr = day.toISOString().split('T')[0];
          const dayAppointments = getAppointmentsForDay(dateStr);
          const isToday = day.toDateString() === new Date().toDateString();
          
          return (
            <div 
              key={index}
              onClick={() => isCurrentMonth(day) && onDayClick(day)}
              className={`bg-white p-3 min-h-[100px] cursor-pointer hover:bg-slate-50 transition-all ${
                !isCurrentMonth(day) ? 'text-slate-300 bg-slate-50' : ''
              } ${isToday ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className="font-bold text-sm mb-2">{day.getDate()}</div>
              {dayAppointments.length > 0 && (
                <div className="bg-blue-100 text-blue-600 rounded-full px-2 py-1 text-xs font-medium text-center">
                  {dayAppointments.length} programare{dayAppointments.length !== 1 ? 'i' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Add Appointment Modal Component
function AddAppointmentModal({ newAppointment, setNewAppointment, clinicConfig, availableSlots, onClose, onSubmit, onDateChange }: any) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (newAppointment.date && newAppointment.doctorId && newAppointment.service) {
      const service = clinicConfig?.services.find(s => s.id === newAppointment.service);
      if (service) {
        onDateChange(newAppointment.date, newAppointment.doctorId, newAppointment.service);
      }
    }
  }, [newAppointment.date, newAppointment.doctorId, newAppointment.service]);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
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
        
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Prenume *</label>
            <input
              type="text"
              value={newAppointment.firstName}
              onChange={(e) => setNewAppointment({...newAppointment, firstName: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              placeholder="Prenume"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Nume *</label>
            <input
              type="text"
              value={newAppointment.lastName}
              onChange={(e) => setNewAppointment({...newAppointment, lastName: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              placeholder="Nume"
              required
            />
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Telefon *</label>
          <input
            type="tel"
            value={newAppointment.phone}
            onChange={(e) => setNewAppointment({...newAppointment, phone: e.target.value})}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
            placeholder="07xx xxx xxx"
            required
          />
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
          <input
            type="email"
            value={newAppointment.email}
            onChange={(e) => setNewAppointment({...newAppointment, email: e.target.value})}
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
            placeholder="email@exemplu.ro"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Serviciu *</label>
            <select
              value={newAppointment.service}
              onChange={(e) => setNewAppointment({...newAppointment, service: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              required
            >
              <option value="">Selectează serviciu</option>
              {clinicConfig?.services.map((service: any) => (
                <option key={service.id} value={service.id}>{service.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
            <select
              value={newAppointment.doctorId}
              onChange={(e) => setNewAppointment({...newAppointment, doctorId: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              required
            >
              <option value="">Selectează doctor</option>
              <option key="any-doctor" value="any">Oricare medic disponibil</option>
              {clinicConfig?.resources
                .filter((doctor: any) => doctor.id !== 'any' && !doctor.name.toLowerCase().includes('oricare'))
                .map((doctor: any) => (
                  <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                ))}
            </select>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
            <input
              type="date"
              value={newAppointment.date}
              onChange={(e) => setNewAppointment({...newAppointment, date: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Ora *</label>
            <select
              value={newAppointment.time}
              onChange={(e) => setNewAppointment({...newAppointment, time: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              required
              disabled={!newAppointment.date || !newAppointment.doctorId || availableSlots.length === 0}
            >
              <option value="">Selectează ora</option>
              {availableSlots.map((slot: string) => (
                <option key={slot} value={slot}>{slot}</option>
              ))}
            </select>
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
            className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Se salvează...' : 'Salvează'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Cancel/Reschedule Modal Component
function CancelRescheduleModal({ appointment, modalMode, setModalMode, newAppointment, setNewAppointment, clinicConfig, availableSlots, onClose, onCancel, onReschedule, onDateChange }: any) {
  React.useEffect(() => {
    if (newAppointment.date && newAppointment.doctorId && appointment.service) {
      const service = clinicConfig?.services.find(s => s.name === appointment.service);
      if (service) {
        onDateChange(newAppointment.date, newAppointment.doctorId, service.id);
      }
    }
  }, [newAppointment.date, newAppointment.doctorId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
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
            <p className="text-slate-700 mb-6">Sigur doriți să anulați programarea lui {appointment.first_name} {appointment.last_name}?</p>
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
            <h4 className="font-bold text-slate-900 mb-4">Selectează noua dată și oră</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Data *</label>
                <input
                  type="date"
                  value={newAppointment.date}
                  onChange={(e) => setNewAppointment({...newAppointment, date: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Ora *</label>
                <select
                  value={newAppointment.time}
                  onChange={(e) => setNewAppointment({...newAppointment, time: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                  required
                  disabled={!newAppointment.date || !newAppointment.doctorId || availableSlots.length === 0}
                >
                  <option value="">Selectează ora</option>
                  {availableSlots.map((slot: string) => (
                    <option key={slot} value={slot}>{slot}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="mt-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
              <select
                value={newAppointment.doctorId}
                onChange={(e) => setNewAppointment({...newAppointment, doctorId: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                required
              >
                <option value="">Selectează doctor</option>
                <option key="any-doctor" value="any">Oricare medic disponibil</option>
                {clinicConfig?.resources
                  .filter((doctor: any) => doctor.id !== 'any' && !doctor.name.toLowerCase().includes('oricare'))
                  .map((doctor: any) => (
                    <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
                  ))}
              </select>
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
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-all"
              >
                Reprogramare
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// Block Doctor Modal Component
function BlockDoctorModal({ blockDoctorForm, setBlockDoctorForm, clinicConfig, onClose, onSubmit }: any) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-[2rem] p-8 max-w-md w-full"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-2xl font-black text-slate-900">Marchează Doctor Absent</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Doctor *</label>
            <select
              value={blockDoctorForm.doctorId}
              onChange={(e) => setBlockDoctorForm({...blockDoctorForm, doctorId: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              required
            >
              <option value="">Selectează doctor</option>
              {clinicConfig?.resources.map((doctor: any) => (
                <option key={doctor.id} value={doctor.id}>{doctor.name}</option>
              ))}
            </select>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Start *</label>
              <input
                type="date"
                value={blockDoctorForm.dateFrom}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, dateFrom: e.target.value, dateTo: blockDoctorForm.dateTo || e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Data Final *</label>
              <input
                type="date"
                value={blockDoctorForm.dateTo}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, dateTo: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
                min={blockDoctorForm.dateFrom}
                required
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ora Start</label>
              <input
                type="time"
                value={blockDoctorForm.timeFrom}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, timeFrom: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Ora Final</label>
              <input
                type="time"
                value={blockDoctorForm.timeTo}
                onChange={(e) => setBlockDoctorForm({...blockDoctorForm, timeTo: e.target.value})}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Motiv</label>
            <input
              type="text"
              value={blockDoctorForm.reason}
              onChange={(e) => setBlockDoctorForm({...blockDoctorForm, reason: e.target.value})}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-900 outline-none focus:border-blue-500"
              placeholder="Concediu, Conferință, etc."
            />
          </div>
        </div>
        
        <div className="flex gap-4 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-all"
          >
            Anulează
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-all"
          >
            Blochează
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Appointments Section Component
function AppointmentsSection({ appointments, searchTerm, setSearchTerm, appointmentFilter, setAppointmentFilter, dateFilter, setDateFilter, currentPage, setCurrentPage, onAppointmentClick }: any) {
  const filteredAppointments = React.useMemo(() => {
    let filtered = appointments;
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(app => 
        `${app.first_name} ${app.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        app.phone.includes(searchTerm)
      );
    }
    
    // Status filter
    if (appointmentFilter !== 'all') {
      filtered = filtered.filter(app => app.status.toLowerCase() === appointmentFilter);
    }
    
    // Date filter
    const today = new Date().toISOString().split('T')[0];
    if (dateFilter === 'today') {
      filtered = filtered.filter(app => app.date === today);
    } else if (dateFilter === 'week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      filtered = filtered.filter(app => {
        const appDate = new Date(app.date);
        return appDate >= weekStart && appDate <= weekEnd;
      });
    }
    
    return filtered;
  }, [appointments, searchTerm, appointmentFilter, dateFilter]);

  const paginatedAppointments = React.useMemo(() => {
    const startIndex = (currentPage - 1) * 20;
    return filteredAppointments.slice(startIndex, startIndex + 20);
  }, [filteredAppointments, currentPage]);

  const totalPages = Math.ceil(filteredAppointments.length / 20);

  return (
    <>
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Programări</h1>
          <p className="text-slate-400 font-bold">Lista tuturor programărilor pacienților.</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Caută pacient..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 font-medium text-slate-900 outline-none focus:border-blue-500 transition-all w-64"
            />
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Toate' },
            { value: 'confirmed', label: 'Confirmate' },
            { value: 'pending', label: 'În Așteptare' },
            { value: 'cancelled', label: 'Anulate' }
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setAppointmentFilter(filter.value)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                appointmentFilter === filter.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {[
            { value: 'all', label: 'Toate datele' },
            { value: 'today', label: 'Azi' },
            { value: 'week', label: 'Săptămâna aceasta' }
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => setDateFilter(filter.value)}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                dateFilter === filter.value
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Appointments Table */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Pacient</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Serviciu / Medic</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Data / Ora</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Canal</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-wider text-right">Acțiuni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedAppointments.map((appointment: any) => (
                <tr key={appointment.id} className="hover:bg-slate-50 transition-all">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-bold text-sm">
                        {appointment.first_name[0]}{appointment.last_name[0]}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{appointment.first_name} {appointment.last_name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                          <Phone className="w-3 h-3" /> {appointment.phone}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-bold text-slate-900">{appointment.service}</p>
                    <p className="text-[10px] text-blue-600 font-black uppercase tracking-wider">Dr. {appointment.doctor_name}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="font-bold text-slate-900">{appointment.date}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{appointment.time}</p>
                  </td>
                  <td className="px-8 py-6">
                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${getChannelColor(appointment.channel)}`}>
                      {appointment.channel}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${getStatusColor(appointment.status).replace('border-', 'bg-')}`} />
                      <span className="text-[10px] font-black text-slate-600 uppercase tracking-wider">{appointment.status}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button 
                      onClick={() => onAppointmentClick(appointment)}
                      className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {paginatedAppointments.length === 0 && (
          <div className="p-20 text-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <Calendar className="w-10 h-10 text-slate-200" />
            </div>
            <h4 className="text-xl font-black text-slate-900 mb-2">Nicio programare găsită</h4>
            <p className="text-slate-400 font-medium">Nu există date care să corespundă criteriilor de căutare.</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-6 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              Arată {((currentPage - 1) * 20) + 1}-{Math.min(currentPage * 20, filteredAppointments.length)} din {filteredAppointments.length} programări
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Anterior
              </button>
              <div className="flex gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`px-3 py-1 rounded-lg font-medium transition-all ${
                      currentPage === page
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {page}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg font-medium hover:bg-slate-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Următor
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Patients Section Component
function PatientsSection({ API_KEY, onAppointmentClick }: any) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<any[]>([]);
  const [selectedPatient, setSelectedPatient] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchType, setSearchType] = React.useState<'phone' | 'name'>('phone');

  const searchPatients = React.useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setSearchResults([]);
        setSelectedPatient(null);
        return;
      }

      setIsLoading(true);
      try {
        if (searchType === 'phone') {
          const response = await fetch(`/api/bookings/search?phone=${query}`, {
            headers: { 'x-api-key': API_KEY }
          });
          
          if (response.ok) {
            const data = await response.json();
            setSearchResults(data);
          }
        } else {
          // For name search, we'll use appointments endpoint and filter client-side
          const response = await fetch('/api/clinic/appointments', {
            headers: { 'x-api-key': API_KEY }
          });
          
          if (response.ok) {
            const data = await response.json();
            const filtered = data.filter((app: any) => 
              `${app.first_name} ${app.last_name}`.toLowerCase().includes(query.toLowerCase())
            );
            
            // Group by patient
            const patientsMap = new Map();
            filtered.forEach((app: any) => {
              const key = `${app.phone}`;
              if (!patientsMap.has(key)) {
                patientsMap.set(key, {
                  firstName: app.first_name,
                  lastName: app.last_name,
                  phone: app.phone,
                  email: app.email,
                  appointments: []
                });
              }
              patientsMap.get(key).appointments.push(app);
            });
            
            setSearchResults(Array.from(patientsMap.values()));
          }
        }
      } catch (error) {
        console.error('Error searching patients:', error);
      } finally {
        setIsLoading(false);
      }
    },
    [searchType, API_KEY]
  );

  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      searchPatients(searchTerm);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchTerm, searchPatients]);

  return (
    <>
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Pacienți</h1>
          <p className="text-slate-400 font-bold">Căutați pacienți după nume sau telefon.</p>
        </div>
      </header>

      {/* Search */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex gap-4 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setSearchType('phone')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                searchType === 'phone'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Căutare după telefon
            </button>
            <button
              onClick={() => setSearchType('name')}
              className={`px-4 py-2 rounded-xl font-medium transition-all ${
                searchType === 'name'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Căutare după nume
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text" 
            placeholder={searchType === 'phone' ? "Introduceți numărul de telefon..." : "Introduceți numele pacientului..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-6 py-4 font-medium text-slate-900 outline-none focus:border-blue-500 transition-all"
          />
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Search Results */}
      {searchResults.length > 0 && !isLoading && (
        <div className="space-y-4">
          {searchResults.map((patient: any, index) => (
            <div key={index} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{patient.firstName} {patient.lastName}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-slate-600">
                    <div className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      {patient.phone}
                    </div>
                    {patient.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="w-4 h-4" />
                        {patient.email}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPatient(selectedPatient === patient ? null : patient)}
                  className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                >
                  <ChevronRight className={`w-5 h-5 transition-transform ${selectedPatient === patient ? 'rotate-90' : ''}`} />
                </button>
              </div>

              {/* Patient Appointments */}
              {selectedPatient === patient && (
                <div className="border-t border-slate-100 pt-4">
                  <h4 className="font-bold text-slate-900 mb-3">Istoric Programări</h4>
                  <div className="space-y-2">
                    {patient.appointments.map((appointment: any) => (
                      <div key={appointment.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="font-medium text-slate-900">{appointment.service}</p>
                            <p className="text-sm text-slate-600">{appointment.date} la {appointment.time}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-medium ${getChannelColor(appointment.channel)}`}>
                              {appointment.channel}
                            </span>
                            <span className={`px-2 py-1 rounded-lg text-[8px] font-medium ${getStatusColor(appointment.status).replace('border-', 'bg-').replace('-500', '-100 text-')}`}>
                              {appointment.status}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => onAppointmentClick(appointment)}
                          className="p-2 bg-white text-slate-400 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {searchResults.length === 0 && searchTerm && !isLoading && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-20 text-center">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Search className="w-10 h-10 text-slate-200" />
          </div>
          <h4 className="text-xl font-black text-slate-900 mb-2">Niciun pacient găsit</h4>
          <p className="text-slate-400 font-medium">Nu există pacienți care să corespundă criteriilor de căutare.</p>
        </div>
      )}
    </>
  );
}

// Settings Section Component
function SettingsSection({ clinicConfig }: any) {
  if (!clinicConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <>
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Setări</h1>
          <p className="text-slate-400 font-bold">Configurarea clinicii (doar citire).</p>
        </div>
      </header>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <p className="text-blue-800 font-medium">
          <strong>Notă:</strong> Pentru modificarea configurației, contactați administratorul DentalVoice.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Clinic Info */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
          <h2 className="text-xl font-black text-slate-900 mb-6">Informații Clinică</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Nume Clinică</label>
              <p className="font-bold text-slate-900">{clinicConfig.name}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Adresă</label>
              <p className="font-bold text-slate-900">{clinicConfig.location}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Telefon</label>
              <p className="font-bold text-slate-900">{clinicConfig.clinicPhone}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Program Lucru</label>
              <p className="font-bold text-slate-900">
                {clinicConfig.scheduling.workingHours.start} - {clinicConfig.scheduling.workingHours.end}
              </p>
            </div>
          </div>
        </div>

        {/* Doctors */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
          <h2 className="text-xl font-black text-slate-900 mb-6">Doctori</h2>
          <div className="space-y-4">
            {clinicConfig.resources.map((doctor: any) => (
              <div key={doctor.id} className="p-4 bg-slate-50 rounded-xl">
                <h3 className="font-bold text-slate-900">{doctor.name}</h3>
                <p className="text-sm text-slate-600">
                  Program: {doctor.workingHours.start} - {doctor.workingHours.end}
                </p>
                <p className="text-sm text-slate-600">
                  Zile lucrătoare: {doctor.workingDays.map((day: number) => ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'][day - 1]).join(', ')}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Services */}
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8 col-span-2">
          <h2 className="text-xl font-black text-slate-900 mb-6">Servicii</h2>
          <div className="grid grid-cols-2 gap-4">
            {clinicConfig.services.map((service: any) => (
              <div key={service.id} className="p-4 bg-slate-50 rounded-xl">
                <h3 className="font-bold text-slate-900">{service.name}</h3>
                <p className="text-sm text-slate-600 mb-2">{service.description}</p>
                <p className="text-sm font-medium text-blue-600">
                  Durată: {service.durationMinutes} minute
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

// Helper functions
function getChannelColor(channel: string) {
  switch (channel) {
    case 'web': return 'bg-blue-100 text-blue-600';
    case 'whatsapp': return 'bg-green-100 text-green-600';
    case 'manual': return 'bg-gray-100 text-gray-600';
    case 'facebook': return 'bg-indigo-100 text-indigo-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case 'Confirmed': return 'border-green-500';
    case 'Pending': return 'border-yellow-500';
    case 'Cancelled': return 'border-red-500';
    default: return 'border-gray-500';
  }
}
