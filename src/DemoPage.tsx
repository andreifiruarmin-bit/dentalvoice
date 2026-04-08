import React from 'react';
import { motion } from 'motion/react';
import { 
  X,
  Smartphone,
  MessageCircle,
  Facebook,
  MessageSquare,
  Zap,
  Shield,
  Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#f9fafb] py-12 px-4 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-12">
          <Link to="/" className="flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition-colors">
            <X className="w-5 h-5" />
            <span>Înapoi la Pagina Principală</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Smartphone className="text-white w-5 h-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-blue-900">DentalVoice.ai</span>
          </div>
        </div>

        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight leading-tight">
              Experiență <span className="text-blue-600">Omnichannel</span> <br />
              pentru Clinica Ta
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed">
              DentalVoice integrează Web Chat, WhatsApp și Messenger într-un singur motor inteligent de programări.
            </p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: <MessageSquare className="w-8 h-8 text-blue-600" />,
              title: "Web Chat",
              desc: "Asistent AI direct pe site-ul clinicii tale pentru conversii instantanee."
            },
            {
              icon: <MessageCircle className="w-8 h-8 text-[#25D366]" />,
              title: "WhatsApp",
              desc: "Integrare nativă WhatsApp Business pentru comunicare familiară și rapidă."
            },
            {
              icon: <Facebook className="w-8 h-8 text-[#0084FF]" />,
              title: "Messenger",
              desc: "Prezență pe Facebook Messenger pentru a capta pacienți de pe rețelele sociale."
            }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white p-8 rounded-3xl shadow-xl border border-slate-100 text-center"
            >
              <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
                {item.icon}
              </div>
              <h3 className="text-xl font-bold mb-3">{item.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        <div className="bg-slate-900 rounded-[2.5rem] p-8 md:p-12 text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full -mr-32 -mt-32 blur-3xl"></div>
          <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold mb-6 flex items-center gap-3">
                <Zap className="text-yellow-400" />
                Core Engine 3-Tier
              </h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Anti-Spam & Rate Limiting</h4>
                    <p className="text-slate-400 text-sm">Protecție automată împotriva programărilor multiple de pe același număr.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-bold mb-1">Smart Load Balancing</h4>
                    <p className="text-slate-400 text-sm">Distribuție inteligentă a pacienților bazată pe Gap Rule și Load Rule.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-3xl p-6 border border-white/10">
              <p className="text-slate-300 text-sm italic mb-4">
                "DentalVoice a transformat modul în care interacționăm cu pacienții. Integrarea WhatsApp ne-a adus cu 40% mai multe programări în prima lună."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">DR</div>
                <div>
                  <div className="font-bold text-sm">Dr. Radu Popescu</div>
                  <div className="text-xs text-slate-500">Manager Clinică</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-12 text-center text-slate-500 text-sm">
          <p>Folosiți butonul din colțul dreapta-jos pentru a testa canalele de comunicare.</p>
        </div>
      </div>
    </div>
  );
}
