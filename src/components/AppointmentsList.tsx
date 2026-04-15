import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Filter, 
  Calendar, 
  ChevronLeft, 
  ChevronRight,
  MoreVertical,
  XCircle,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface Appointment {
  id: string;
  date: string;
  displayDate?: string;
  time: string;
  service: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: 'confirmed' | 'pending' | 'cancelled';
  googleEventId?: string | null;
  calendarId?: string;
  doctorId?: string;
  doctorName?: string;
  notes?: string;
  channel?: 'web' | 'whatsapp' | 'manual' | 'facebook';
}

interface AppointmentsListProps {
  appointments: Appointment[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  appointmentFilter: 'all' | 'confirmed' | 'pending' | 'cancelled';
  setAppointmentFilter: (filter: 'all' | 'confirmed' | 'pending' | 'cancelled') => void;
  dateFilter: 'today' | 'week' | 'all';
  setDateFilter: (filter: 'today' | 'week' | 'all') => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  onAppointmentClick: (appointment: Appointment) => void;
}

export default function AppointmentsList({
  appointments,
  searchTerm,
  setSearchTerm,
  appointmentFilter,
  setAppointmentFilter,
  dateFilter,
  setDateFilter,
  currentPage,
  setCurrentPage,
  onAppointmentClick
}: AppointmentsListProps) {
  const [itemsPerPage] = useState(10);

  const filteredAppointments = useMemo(() => {
    let filtered = appointments;

    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(apt => 
        apt.firstName?.toLowerCase().includes(searchLower) ||
        apt.lastName?.toLowerCase().includes(searchLower) ||
        apt.phone?.includes(searchTerm) ||
        apt.service?.toLowerCase().includes(searchLower) ||
        apt.doctorName?.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (appointmentFilter !== 'all') {
      filtered = filtered.filter(apt => apt.status === appointmentFilter);
    }

    // Date filter
    if (dateFilter === 'today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(apt => apt.date === today);
    } else if (dateFilter === 'week') {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      filtered = filtered.filter(apt => {
        const aptDate = new Date(apt.date);
        return aptDate >= weekStart && aptDate <= weekEnd;
      });
    }

    return filtered.sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.time.localeCompare(b.time);
    });
  }, [appointments, searchTerm, appointmentFilter, dateFilter]);

  const totalPages = Math.ceil(filteredAppointments.length / itemsPerPage);
  const paginatedAppointments = filteredAppointments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getChannelColor = (channel: string) => {
    switch (channel) {
      case 'web': return 'bg-blue-100 text-blue-600';
      case 'whatsapp': return 'bg-green-100 text-green-600';
      case 'manual': return 'bg-gray-100 text-gray-600';
      case 'facebook': return 'bg-indigo-100 text-indigo-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'cancelled': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Caută programări..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <select
            value={appointmentFilter}
            onChange={(e) => setAppointmentFilter(e.target.value as any)}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toate statusurile</option>
            <option value="confirmed">Confirmate</option>
            <option value="pending">În așteptare</option>
            <option value="cancelled">Anulate</option>
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as any)}
            className="px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">Toate datele</option>
            <option value="today">Azi</option>
            <option value="week">Săptămâna aceasta</option>
          </select>
        </div>
      </div>

      {/* Results count */}
      <div className="text-sm text-slate-600">
        {filteredAppointments.length} programare{filteredAppointments.length !== 1 ? 'i' : ''} găsit{filteredAppointments.length !== 1 ? 'e' : 'ă'}
      </div>

      {/* Appointments list */}
      <div className="space-y-3">
        <AnimatePresence>
          {paginatedAppointments.map((appointment, index) => (
            <motion.div
              key={appointment.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onAppointmentClick(appointment)}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {getStatusIcon(appointment.status)}
                    <h3 className="font-bold text-slate-900">
                      {appointment.firstName} {appointment.lastName}
                    </h3>
                    <span className={`text-xs px-2 py-1 rounded-full ${getChannelColor(appointment.channel || 'web')}`}>
                      {appointment.channel || 'web'}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-slate-500">Serviciu:</span>
                      <p className="font-medium text-slate-900">{appointment.service}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">Data/Ora:</span>
                      <p className="font-medium text-slate-900">
                        {appointment.displayDate || appointment.date} la {appointment.time}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Contact:</span>
                      <p className="font-medium text-slate-900">{appointment.phone}</p>
                    </div>
                  </div>

                  {appointment.doctorName && (
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">Medic:</span>
                      <span className="font-medium text-slate-900 ml-2">{appointment.doctorName}</span>
                    </div>
                  )}

                  {appointment.notes && (
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">Note:</span>
                      <p className="text-slate-700 mt-1">{appointment.notes}</p>
                    </div>
                  )}
                </div>

                <MoreVertical className="w-5 h-5 text-slate-400" />
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
