import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Search, User, Phone, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

interface Patient {
  first_name: string;
  last_name: string;
  phone: string;
  phone_normalized: string;
  appointment_count: number;
}

interface PatientsSectionProps {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export default function PatientsSection({ SUPABASE_URL, SUPABASE_ANON_KEY }: PatientsSectionProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const patientsPerPage = 20;

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      // Query appointments table and extract unique patients by phone_normalized
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('first_name, last_name, phone, phone_normalized')
        .not('phone_normalized', 'is', null);

      if (error) throw error;

      // Group by phone_normalized and count appointments
      const patientMap = new Map<string, Patient>();
      
      appointments?.forEach((apt: any) => {
        const key = apt.phone_normalized;
        if (!patientMap.has(key)) {
          patientMap.set(key, {
            first_name: apt.first_name,
            last_name: apt.last_name,
            phone: apt.phone,
            phone_normalized: apt.phone_normalized,
            appointment_count: 1
          });
        } else {
          const patient = patientMap.get(key)!;
          patient.appointment_count += 1;
        }
      });

      // Convert to array and sort by last_name alphabetically
      const patientsArray = Array.from(patientMap.values()).sort((a, b) => 
        a.last_name.localeCompare(b.last_name)
      );

      setPatients(patientsArray);
      setTotalPages(Math.ceil(patientsArray.length / patientsPerPage));
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(patient =>
    `${patient.first_name} ${patient.last_name} ${patient.phone}`
      .toLowerCase()
      .includes(searchTerm.toLowerCase())
  );

  // Pagination
  const paginatedPatients = filteredPatients.slice(
    (currentPage - 1) * patientsPerPage,
    currentPage * patientsPerPage
  );

  const totalPagesFiltered = Math.ceil(filteredPatients.length / patientsPerPage);

  useEffect(() => {
    setCurrentPage(1);
    setTotalPages(totalPagesFiltered);
  }, [searchTerm, totalPagesFiltered]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">Pacienți</h2>
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Caută pacienți..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Se încarcă pacienții...</p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Prenume
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Nume
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Telefon
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Nr. programări
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                            <User className="w-4 h-4 text-blue-600" />
                          </div>
                          <span className="text-sm font-medium text-slate-900">
                            {patient.first_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                        {patient.last_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-slate-600">
                          <Phone className="w-3 h-3 mr-2" />
                          {patient.phone}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                        {patient.appointment_count}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Empty state */}
          {filteredPatients.length === 0 && (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Nu există pacienți înregistrați.</p>
              <p className="text-sm text-slate-400">
                {searchTerm ? 'Încercați o altă căutare' : 'Când se vor face programări, pacienții vor apărea aici'}
              </p>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600">
                Afișare {((currentPage - 1) * patientsPerPage) + 1} - {Math.min(currentPage * patientsPerPage, filteredPatients.length)} 
                {' '}din {filteredPatients.length} pacienți
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-1 text-sm text-slate-600">
                  Pagina {currentPage} din {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
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
