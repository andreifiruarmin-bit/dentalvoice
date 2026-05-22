import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, User, Phone, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface AppointmentRow {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  date: string;
  time: string;
  status: string;
}

interface Patient {
  first_name: string;
  last_name: string;
  phone: string;
  phone_normalized: string;
  email: string;
  active_appointments: number;
}

interface PatientsSectionProps {
  getAuthHeaders: () => Promise<Record<string, string>>;
}

function normalizePhoneKey(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length >= 10 && digits.startsWith('0')) return digits.slice(-10);
  if (digits.length >= 9) return digits.padStart(10, '0').slice(-10);
  return digits;
}

export default function PatientsSection({ getAuthHeaders }: PatientsSectionProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const patientsPerPage = 20;

  const fetchPatients = async () => {
    setIsLoading(true);
    setFetchError('');
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/clinic/appointments', { headers });
      if (!response.ok) {
        throw new Error('Nu am putut încărca programările');
      }
      const appointments: AppointmentRow[] = await response.json();
      const today = format(new Date(), 'yyyy-MM-dd');
      const patientMap = new Map<string, Patient>();

      for (const apt of appointments) {
        const key = normalizePhoneKey(apt.phone || '');
        if (!key) continue;

        const isActive =
          (apt.status === 'Confirmed' || apt.status === 'Pending') && apt.date >= today;

        if (!patientMap.has(key)) {
          patientMap.set(key, {
            first_name: apt.firstName || '',
            last_name: apt.lastName || '',
            phone: apt.phone || '',
            phone_normalized: key,
            email: apt.email?.trim() || '',
            active_appointments: isActive ? 1 : 0,
          });
        } else {
          const existing = patientMap.get(key)!;
          if (!existing.email && apt.email?.trim()) {
            existing.email = apt.email.trim();
          }
          if (isActive) {
            existing.active_appointments += 1;
          }
        }
      }

      const patientsArray = Array.from(patientMap.values()).sort((a, b) =>
        a.last_name.localeCompare(b.last_name, 'ro')
      );
      setPatients(patientsArray);
    } catch (error) {
      console.error('Error fetching patients:', error);
      setFetchError('Eroare la încărcarea listei de pacienți.');
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter((patient) => {
    const haystack = `${patient.first_name} ${patient.last_name} ${patient.phone} ${patient.email}`.toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  const totalPagesFiltered = Math.max(1, Math.ceil(filteredPatients.length / patientsPerPage));
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * patientsPerPage,
    currentPage * patientsPerPage
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Pacienți</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Caută după nume sau telefon..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm">{fetchError}</div>
      )}

      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Se încarcă pacienții...</p>
        </div>
      ) : (
        <>
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Nume
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Prenume
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Număr telefon
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Programări active
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {paginatedPatients.map((patient, index) => (
                    <motion.tr
                      key={patient.phone_normalized}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                        {patient.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-sm text-slate-900">{patient.first_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-slate-600">
                          <Phone className="w-3 h-3 mr-2" />
                          {patient.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {patient.email || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {patient.active_appointments > 0
                          ? patient.active_appointments
                          : 'Nicio programare activă'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {filteredPatients.length === 0 && (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Nu există pacienți înregistrați.</p>
              <p className="text-sm text-slate-400">
                {searchTerm ? 'Încercați o altă căutare' : 'Când se vor face programări, pacienții vor apărea aici'}
              </p>
            </div>
          )}

          {filteredPatients.length > 0 && totalPagesFiltered > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Afișare {(currentPage - 1) * patientsPerPage + 1} -{' '}
                {Math.min(currentPage * patientsPerPage, filteredPatients.length)} din {filteredPatients.length}{' '}
                pacienți
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-slate-600">
                  Pagina {currentPage} din {totalPagesFiltered}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPagesFiltered))}
                  disabled={currentPage === totalPagesFiltered}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
