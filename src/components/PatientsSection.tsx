import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Search, User, Phone, Mail, Calendar, MoreVertical } from 'lucide-react';

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  totalAppointments: number;
  lastAppointment?: string;
  status: 'active' | 'inactive';
}

interface PatientsSectionProps {
  API_KEY: string;
  onAppointmentClick: (appointment: any) => void;
}

export default function PatientsSection({ API_KEY, onAppointmentClick }: PatientsSectionProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/patients', {
        headers: { 'x-api-key': API_KEY }
      });
      
      if (response.ok) {
        const data = await response.json();
        setPatients(data);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchPatients();
  }, []);

  const filteredPatients = patients.filter(patient =>
    `${patient.firstName} ${patient.lastName} ${patient.phone}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-r-2 border-blue-600"></div>
          <p className="mt-2 text-slate-600">Se încarcă pacienții...</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPatients.map((patient, index) => (
            <motion.div
              key={patient.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-all cursor-pointer"
              onClick={() => {
                // This would typically open patient details or show appointments
                console.log('Patient clicked:', patient);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">
                      {patient.firstName} {patient.lastName}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span>{patient.phone}</span>
                      </div>
                      {patient.email && (
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          <span>{patient.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm text-slate-500">
                    {patient.totalAppointments} programări
                  </div>
                  {patient.lastAppointment && (
                    <div className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {patient.lastAppointment}
                    </div>
                  )}
                </div>
                
                <MoreVertical className="w-5 h-5 text-slate-400" />
              </div>
            </motion.div>
          ))}
          
          {filteredPatients.length === 0 && (
            <div className="text-center py-8">
              <User className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-600">Nu s-au găsit pacienți</p>
              <p className="text-sm text-slate-400">
                {searchTerm ? 'Încercați o altă căutare' : 'Nu există pacienți înregistrați'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
