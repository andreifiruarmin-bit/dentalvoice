import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Users, 
  MessageSquare, 
  Settings, 
  LogOut, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search,
  Filter,
  ChevronRight,
  Stethoscope,
  Phone,
  Mail,
  MoreVertical
} from 'lucide-react';

interface Appointment {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  service: string;
  doctorName: string;
  date: string;
  time: string;
  status: 'Confirmed' | 'Cancelled' | 'Completed';
  channel: string;
  createdAt: string;
}

export default function ClinicDashboard() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [appointments, setAppointments] = React.useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<'appointments' | 'calendar' | 'messages'>('appointments');
  
  // Calendar state
  const [currentWeek, setCurrentWeek] = React.useState(new Date());
  const [calendarAppointments, setCalendarAppointments] = React.useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = React.useState('all');
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [newAppointment, setNewAppointment] = React.useState({
    firstName: '',
    lastName: '',
    phone: '',
    service: '',
    doctorId: 'dr1',
    date: '',
    time: ''
  });

  const API_KEY = "dv-secret-key-2026";

  const fetchAppointments = async () => {
    try {
      const response = await fetch('/api/clinic/appointments', {
        headers: { 'x-api-key': API_KEY }
      });
      if (response.ok) {
        const data = await response.json();
        setAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const response = await fetch(`/api/clinic/appointments/${id}/status`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-api-key': API_KEY 
        },
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        fetchAppointments();
      }
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  React.useEffect(() => {
    if (isLoggedIn) {
      fetchAppointments();
      if (activeTab === 'calendar') {
        fetchCalendarAppointments();
      }
    }
  }, [isLoggedIn, activeTab, currentWeek, selectedDoctor]);

  const fetchCalendarAppointments = async () => {
    try {
      const weekStart = new Date(currentWeek);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
      
      const params = new URLSearchParams();
      if (selectedDoctor !== 'all') params.append('doctorId', selectedDoctor);
      
      const response = await fetch(`/api/calendar/appointments?${params.toString()}`, {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCalendarAppointments(data);
      }
    } catch (error) {
      console.error('Error fetching calendar appointments:', error);
    }
  };

  const getWeekDays = () => {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const getTimeSlots = () => {
    const slots = [];
    for (let hour = 9; hour <= 17; hour++) {
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  const getAppointmentForSlot = (date: string, time: string) => {
    return calendarAppointments.find(apt => 
      apt.date === date && apt.time === time
    );
  };

  const handleAddAppointment = async () => {
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY
        },
        body: JSON.stringify({
          ...newAppointment,
          doctorId: newAppointment.doctorId,
          channel: 'Dashboard'
        })
      });

      if (response.ok) {
        setShowAddModal(false);
        setNewAppointment({
          firstName: '',
          lastName: '',
          phone: '',
          service: '',
          doctorId: 'dr1',
          date: '',
          time: ''
        });
        fetchCalendarAppointments();
      }
    } catch (error) {
      console.error('Error adding appointment:', error);
    }
  };

  const navigateWeek = (direction: 'prev' | 'next') => {
    const newWeek = new Date(currentWeek);
    newWeek.setDate(newWeek.getDate() + (direction === 'next' ? 7 : -7));
    setCurrentWeek(newWeek);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === 'smile2026') {
      setIsLoggedIn(true);
    } else {
      alert('Parolă incorectă');
    }
  };

  if (!isLoggedIn) {
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
            <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">Beautiful Smile</h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em]">Clinic Dashboard</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Parolă Acces</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-4 focus:border-blue-500 focus:ring-0 transition-all font-bold text-slate-900 outline-none"
                placeholder="••••••••"
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

  const filteredAppointments = appointments.filter(app => 
    `${app.firstName} ${app.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.phone.includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-slate-100 flex flex-col p-8 sticky top-0 h-screen">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
            <Stethoscope className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-black text-slate-900 leading-tight">Beautiful Smile</h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Clinic Partner</p>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          <button 
            onClick={() => setActiveTab('appointments')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeTab === 'appointments' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Calendar className="w-5 h-5" />
            Programări
          </button>
          <button 
            onClick={() => setActiveTab('calendar')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeTab === 'calendar' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <Clock className="w-5 h-5" />
            Calendar Vizual
          </button>
          <button 
            onClick={() => setActiveTab('messages')}
            className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold transition-all ${activeTab === 'messages' ? 'bg-blue-50 text-blue-600' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
          >
            <MessageSquare className="w-5 h-5" />
            Mesaje Bot
          </button>
        </nav>

        <div className="pt-8 border-t border-slate-100">
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="w-full flex items-center gap-4 px-6 py-4 rounded-2xl font-bold text-red-400 hover:bg-red-50 hover:text-red-50 transition-all"
          >
            <LogOut className="w-5 h-5" />
            Deconectare
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-12 overflow-y-auto">
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">
              {activeTab === 'appointments' ? 'Programări Pacienți' : activeTab === 'calendar' ? 'Calendar Clinică' : 'Istoric Conversații'}
            </h1>
            <p className="text-slate-400 font-bold">Gestionați activitatea generată de DentalVoice AI.</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="w-5 h-5 text-slate-300 absolute left-4 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Caută pacient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-white border border-slate-100 rounded-2xl pl-12 pr-6 py-3 font-bold text-slate-900 outline-none focus:border-blue-500 transition-all w-64"
              />
            </div>
            <button className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-blue-600 transition-all">
              <Filter className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-12">
          {[
            { label: 'Total Programări', value: appointments.length, icon: Calendar, color: 'blue' },
            { label: 'Azi', value: appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length, icon: Clock, color: 'emerald' },
            { label: 'Confirmate', value: appointments.filter(a => a.status === 'Confirmed').length, icon: CheckCircle2, color: 'indigo' },
            { label: 'Rata Conversie', value: '84%', icon: Users, color: 'orange' },
          ].map((stat, i) => (
            <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
              <div className={`w-12 h-12 bg-${stat.color}-50 rounded-2xl flex items-center justify-center mb-6`}>
                <stat.icon className={`w-6 h-6 text-${stat.color}-600`} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <h3 className="text-3xl font-black text-slate-900">{stat.value}</h3>
            </div>
          ))}
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-xl">Listă Pacienți</h3>
            <div className="flex gap-2">
              <span className="px-4 py-1.5 bg-slate-50 text-slate-400 rounded-full text-[10px] font-black uppercase tracking-wider">Toate</span>
              <span className="px-4 py-1.5 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-wider">Noi</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pacient</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Serviciu / Medic</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data / Ora</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Canal</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                  <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Acțiuni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                <AnimatePresence>
                  {filteredAppointments.map((app) => (
                    <motion.tr 
                      key={app.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-slate-50/50 transition-all group"
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600 font-black text-xs">
                            {app.firstName[0]}{app.lastName[0]}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{app.firstName} {app.lastName}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold">
                              <Phone className="w-3 h-3" /> {app.phone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="font-bold text-slate-900">{app.service}</p>
                        <p className="text-[10px] text-blue-600 font-black uppercase tracking-wider">Dr. {app.doctorName}</p>
                      </td>
                      <td className="px-8 py-6">
                        <p className="font-bold text-slate-900">{app.date}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{app.time}</p>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${
                          app.channel === 'WhatsApp' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                        }`}>
                          {app.channel}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            app.status === 'Confirmed' ? 'bg-emerald-500' : app.status === 'Cancelled' ? 'bg-red-500' : 'bg-blue-500'
                          }`} />
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{app.status}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                          {app.status === 'Confirmed' && (
                            <>
                              <button 
                                onClick={() => updateStatus(app.id, 'Completed')}
                                className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-600 hover:text-white transition-all"
                                title="Finalizează"
                              >
                                <CheckCircle2 className="w-5 h-5" />
                              </button>
                              <button 
                                onClick={() => updateStatus(app.id, 'Cancelled')}
                                className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                                title="Anulează"
                              >
                                <XCircle className="w-5 h-5" />
                              </button>
                            </>
                          )}
                          <button className="p-2 bg-slate-50 text-slate-400 rounded-xl hover:bg-slate-900 hover:text-white transition-all">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>

          {filteredAppointments.length === 0 && (
            <div className="p-20 text-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Calendar className="w-10 h-10 text-slate-200" />
              </div>
              <h4 className="text-xl font-black text-slate-900 mb-2">Nicio programare găsită</h4>
              <p className="text-slate-400 font-bold">Nu există date care să corespundă criteriilor de căutare.</p>
            </div>
          )}
        </div>

        {/* Calendar View */}
        {activeTab === 'calendar' && (
          <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <h3 className="font-black text-slate-900 text-xl">Calendar Saptamanal</h3>
                <select 
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500"
                >
                  <option value="all">Toti doctorii</option>
                  <option value="dr1">Dr. 1</option>
                  <option value="dr2">Dr. 2</option>
                  <option value="dr3">Dr. 3</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => navigateWeek('prev')}
                  className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-blue-600 transition-all"
                >
                  <ChevronRight className="w-5 h-5 rotate-180" />
                </button>
                <span className="px-4 py-2 font-bold text-slate-700">
                  {getWeekDays()[0].toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })} - {getWeekDays()[6].toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })}
                </span>
                <button 
                  onClick={() => navigateWeek('next')}
                  className="p-2 bg-slate-50 border border-slate-100 rounded-xl text-slate-400 hover:text-blue-600 transition-all"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                >
                  Adaugä Programare
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[800px]">
                {/* Header */}
                <div className="grid grid-cols-8 border-b border-slate-100">
                  <div className="p-4 font-black text-[10px] text-slate-400 uppercase tracking-wider">Ora</div>
                  {getWeekDays().map((day, index) => (
                    <div key={index} className="p-4 text-center">
                      <div className="font-black text-slate-900">{day.toLocaleDateString('ro-RO', { weekday: 'short' })}</div>
                      <div className="text-sm text-slate-400">{day.getDate()}</div>
                    </div>
                  ))}
                </div>

                {/* Time slots */}
                {getTimeSlots().map((time) => (
                  <div key={time} className="grid grid-cols-8 border-b border-slate-50">
                    <div className="p-4 font-bold text-slate-400 text-sm">{time}</div>
                    {getWeekDays().map((day, dayIndex) => {
                      const dateStr = day.toISOString().split('T')[0];
                      const appointment = getAppointmentForSlot(dateStr, time);
                      const isClickable = !appointment;
                      
                      return (
                        <div 
                          key={dayIndex}
                          onClick={() => isClickable && setShowAddModal(true)}
                          className={`p-2 border-l border-slate-50 min-h-[60px] ${
                            isClickable ? 'cursor-pointer hover:bg-blue-50' : ''
                          }`}
                        >
                          {appointment && (
                            <div className="bg-blue-100 rounded-lg p-2 text-xs">
                              <div className="font-bold text-blue-900">{appointment.first_name} {appointment.last_name}</div>
                              <div className="text-blue-700">{appointment.service}</div>
                              <div className="text-blue-600">Dr. {appointment.doctor_name}</div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Add Appointment Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white rounded-[2rem] p-8 max-w-md w-full"
            >
              <h3 className="text-2xl font-black text-slate-900 mb-6">Adaugä Programare</h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Prenume"
                    value={newAppointment.firstName}
                    onChange={(e) => setNewAppointment({...newAppointment, firstName: e.target.value})}
                    className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                  />
                  <input
                    type="text"
                    placeholder="Nume"
                    value={newAppointment.lastName}
                    onChange={(e) => setNewAppointment({...newAppointment, lastName: e.target.value})}
                    className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                
                <input
                  type="tel"
                  placeholder="Telefon"
                  value={newAppointment.phone}
                  onChange={(e) => setNewAppointment({...newAppointment, phone: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                />
                
                <select
                  value={newAppointment.service}
                  onChange={(e) => setNewAppointment({...newAppointment, service: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="">Selecteazä serviciu</option>
                  <option value="Consultaie">Consultaie</option>
                  <option value="Igienizare">Igienizare</option>
                  <option value="Albire">Albire</option>
                  <option value="Control">Control</option>
                  <option value="Urgenta">Urgenta</option>
                </select>
                
                <div className="grid grid-cols-2 gap-4">
                  <select
                    value={newAppointment.doctorId}
                    onChange={(e) => setNewAppointment({...newAppointment, doctorId: e.target.value})}
                    className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                  >
                    <option value="dr1">Dr. 1</option>
                    <option value="dr2">Dr. 2</option>
                    <option value="dr3">Dr. 3</option>
                  </select>
                  
                  <input
                    type="date"
                    value={newAppointment.date}
                    onChange={(e) => setNewAppointment({...newAppointment, date: e.target.value})}
                    className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                  />
                </div>
                
                <input
                  type="time"
                  value={newAppointment.time}
                  onChange={(e) => setNewAppointment({...newAppointment, time: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-slate-900 outline-none focus:border-blue-500"
                />
              </div>
              
              <div className="flex gap-4 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Anuleazä
                </button>
                <button
                  onClick={handleAddAppointment}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all"
                >
                  Salveazä
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </div>
  );
}
