import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Calendar, 
  TrendingUp, 
  Download, 
  Search, 
  Filter,
  Lock,
  LogOut,
  CheckCircle,
  Clock,
  ExternalLink
} from 'lucide-react';
import { cn } from './lib/utils';

interface Lead {
  id: string;
  clinicName: string;
  contactPerson: string;
  phone: string;
  address: string;
  message: string;
  tierInteres: 'Incisiv' | 'Canin' | 'Molar' | 'Custom';
  status: 'New' | 'Contacted';
  timestamp: string;
}

export default function AdminDashboard() {
  const [isLoggedIn, setIsLoggedIn] = React.useState(false);
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');

  const ADMIN_PASSWORD = "admin-dentalvoice"; // Hardcoded for demo
  const API_KEY = "dv-secret-key-2026";

  const fetchLeads = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/admin/leads', {
        headers: {
          'x-api-key': API_KEY
        }
      });
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      }
    } catch (err) {
      console.error('Error fetching leads:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setIsLoggedIn(true);
      fetchLeads();
    } else {
      setError('Parolă incorectă');
    }
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Clinic Name', 'Contact Person', 'Phone', 'Address', 'Message', 'Tier', 'Status', 'Timestamp'];
    const csvContent = [
      headers.join(','),
      ...leads.map(lead => [
        lead.id,
        `"${lead.clinicName}"`,
        `"${lead.contactPerson}"`,
        lead.phone,
        `"${lead.address}"`,
        `"${lead.message}"`,
        lead.tierInteres,
        lead.status,
        lead.timestamp
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_dentalvoice_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    console.log('Exporting leads to CSV...');
  };

  const filteredLeads = leads.filter(lead => 
    lead.clinicName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.contactPerson.toLowerCase().includes(searchTerm.toLowerCase()) ||
    lead.phone.includes(searchTerm)
  );

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100"
        >
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-100">
              <Lock className="text-white w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-black text-center text-slate-900 mb-2">Admin Portal</h1>
          <p className="text-slate-500 text-center mb-8 font-medium">Introduceți parola pentru a accesa panoul de control.</p>
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <input 
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Parolă"
                className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                autoFocus
              />
              {error && <p className="text-red-500 text-sm mt-2 font-bold ml-2">{error}</p>}
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
            >
              Autentificare
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 hidden lg:flex flex-col">
        <div className="p-8">
          <div className="flex items-center gap-2 mb-12">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-black tracking-tight text-slate-900">Dental<span className="text-blue-600">Voice</span></span>
          </div>
          
          <nav className="space-y-2">
            <button className="w-full flex items-center gap-3 px-4 py-3 bg-blue-50 text-blue-600 rounded-xl font-bold text-sm transition-all">
              <Users className="w-5 h-5" />
              <span>Leads</span>
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:bg-slate-50 rounded-xl font-bold text-sm transition-all">
              <Calendar className="w-5 h-5" />
              <span>Programări</span>
            </button>
          </nav>

          <div className="mt-12 p-6 bg-slate-50 rounded-2xl border border-slate-100">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">SaaS Reference</h4>
            <div className="space-y-4">
              <div>
                <div className="text-xs font-black text-slate-900">Incisiv (150€)</div>
                <div className="text-[10px] text-slate-500 font-medium">Basic Webbot + SMS</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">Canin (250€)</div>
                <div className="text-[10px] text-slate-500 font-medium">WA/Msg + 3+2 Medici</div>
              </div>
              <div>
                <div className="text-xs font-black text-slate-900">Molar (450€)</div>
                <div className="text-[10px] text-slate-500 font-medium">Unlimited + Marketing + HW</div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-auto p-8">
          <button 
            onClick={() => setIsLoggedIn(false)}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl font-bold text-sm transition-all"
          >
            <LogOut className="w-5 h-5" />
            <span>Deconectare</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 h-20 flex items-center justify-between px-8 sticky top-0 z-10">
          <h2 className="text-xl font-black text-slate-900">Dashboard</h2>
          <div className="flex items-center gap-4">
            <div className="text-sm font-bold text-slate-500">Admin: DentalVoice</div>
            <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
              <Users className="w-5 h-5 text-slate-400" />
            </div>
          </div>
        </header>

        <div className="p-8">
          {/* Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center">
                  <Users className="text-blue-600 w-6 h-6" />
                </div>
                <span className="text-xs font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">+12%</span>
              </div>
              <div className="text-3xl font-black text-slate-900 mb-1">{leads.length}</div>
              <div className="text-slate-500 font-bold text-sm">Total Leads</div>
            </div>
            
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                  <Calendar className="text-indigo-600 w-6 h-6" />
                </div>
                <span className="text-xs font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Mock</span>
              </div>
              <div className="text-3xl font-black text-slate-900 mb-1">1,284</div>
              <div className="text-slate-500 font-bold text-sm">Total Bookings</div>
            </div>

            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                  <TrendingUp className="text-purple-600 w-6 h-6" />
                </div>
                <span className="text-xs font-black text-purple-600 bg-purple-50 px-3 py-1 rounded-full">Status</span>
              </div>
              <div className="flex items-end gap-4 mb-1">
                <div className="text-2xl font-black text-slate-900">12</div>
                <div className="text-xs font-bold text-slate-400 mb-1">vs</div>
                <div className="text-2xl font-black text-green-600">45</div>
              </div>
              <div className="text-slate-500 font-bold text-sm">SMS Pending vs WA Verified</div>
            </div>
          </div>

          {/* Leads Table */}
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="text-lg font-black text-slate-900">Clinic Leads</h3>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Caută clinică..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none w-64"
                  />
                </div>
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50">
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Clinică</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Contact</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Pachet</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Status</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Data</th>
                    <th className="px-8 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Acțiuni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <AnimatePresence>
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-bold">Se încarcă datele...</td>
                      </tr>
                    ) : filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-bold">Nu există lead-uri momentan.</td>
                      </tr>
                    ) : (
                      filteredLeads.map((lead) => (
                        <motion.tr 
                          key={lead.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="hover:bg-slate-50/50 transition-colors group"
                        >
                          <td className="px-8 py-6">
                            <div className="font-black text-slate-900">{lead.clinicName}</div>
                            <div className="text-xs text-slate-400 font-medium">{lead.address}</div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="font-bold text-slate-700">{lead.contactPerson}</div>
                            <div className="text-xs text-blue-600 font-bold">{lead.phone}</div>
                          </td>
                          <td className="px-8 py-6">
                            <div className={cn(
                              "text-sm font-black",
                              lead.tierInteres === 'Molar' ? "text-purple-600" : 
                              lead.tierInteres === 'Canin' ? "text-indigo-600" : 
                              lead.tierInteres === 'Incisiv' ? "text-blue-600" : "text-slate-600"
                            )}>
                              {lead.tierInteres}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <span className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                              lead.status === 'New' ? "bg-green-100 text-green-600" : "bg-blue-100 text-blue-600"
                            )}>
                              {lead.status}
                            </span>
                          </td>
                          <td className="px-8 py-6">
                            <div className="text-sm font-bold text-slate-600 flex items-center gap-2">
                              <Clock className="w-4 h-4 text-slate-300" />
                              {new Date(lead.timestamp).toLocaleDateString('ro-RO')}
                            </div>
                          </td>
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-blue-600 hover:border-blue-200 transition-all">
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-green-600 hover:border-green-200 transition-all">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      ))
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
