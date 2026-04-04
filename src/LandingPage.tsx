import React from 'react';
import { motion } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  ShieldCheck, 
  Smartphone, 
  MessageSquare, 
  TrendingDown, 
  CheckCircle2, 
  ArrowRight,
  Menu,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Smartphone className="text-white w-5 h-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-blue-900">DentalVoice.ai</span>
            </div>
            
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Funcționalități</a>
              <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition-colors">Cum funcționează</a>
              <Link to="/demo" className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200">
                Vezi Demo
              </Link>
            </div>

            <button className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-b border-slate-100 p-4 flex flex-col gap-4">
            <a href="#features" className="text-sm font-medium text-slate-600">Funcționalități</a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-600">Cum funcționează</a>
            <Link to="/demo" className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold text-center">
              Vezi Demo
            </Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 rounded-full">
              Recepționer Virtual AI disponibil 24/7
            </span>
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 mb-6 leading-tight">
              Nu mai pierdeți niciun apel. <br />
              <span className="text-blue-600">Lăsați AI-ul să gestioneze programările.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
              DentalVoice este asistentul virtual inteligent care preia programările, reduce volumul apelurilor și organizează calendarul clinicii tale în mod automat.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/demo" className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-full text-lg font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2 group">
                Vezi Demo Live <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>
              <a 
                href="tel:0711111111"
                className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-full text-lg font-bold hover:bg-slate-50 transition-all text-center"
              >
                Programează un Demo Call
              </a>
            </div>
          </motion.div>
          
          {/* Hero Image / Mockup */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mt-16 relative max-w-5xl mx-auto"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-[2rem] blur-2xl opacity-50 -z-10"></div>
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden aspect-video flex items-center justify-center">
               <div className="text-slate-400 flex flex-col items-center gap-4">
                  <Smartphone className="w-16 h-16 opacity-20" />
                  <span className="font-medium">Imagine Mockup Dashboard / Chat Widget</span>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Problem Section */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">De ce DentalVoice?</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">Recepția unei clinici dentare este adesea copleșită. Iată realitatea multor clinici:</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <TrendingDown className="text-red-500" />,
                title: "Apeluri Pierdute = Venit Pierdut",
                desc: "Fiecare apel nepreluat este un pacient care merge la concurență."
              },
              {
                icon: <MessageSquare className="text-orange-500" />,
                title: "Recepție Supraîncărcată",
                desc: "Recepționerii petrec 70% din timp răspunzând la aceleași întrebări repetitive."
              },
              {
                icon: <Calendar className="text-blue-500" />,
                title: "Erori de Programare",
                desc: "Programările manuale duc adesea la suprapuneri sau omisiuni costisitoare."
              }
            ].map((item, i) => (
              <div key={i} className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center mb-6">
                  {item.icon}
                </div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-slate-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solution Section */}
      <section id="features" className="py-20">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">Angajatul tău virtual, <br /> mereu la datorie.</h2>
              <p className="text-slate-600 mb-8 leading-relaxed">
                DentalVoice nu este doar un chatbot. Este un agent AI care înțelege contextul, gestionează calendarul și comunică natural cu pacienții tăi.
              </p>
              <ul className="space-y-4">
                {[
                  "Programări automate direct în Google Sheets",
                  "Anulări și reprogramări fără intervenție umană",
                  "Răspunsuri instantanee la întrebări frecvente",
                  "Disponibil 24/7, inclusiv în weekend și sărbători",
                  "Integrare ușoară în site-ul clinicii și WhatsApp"
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="text-green-500 w-5 h-5 flex-shrink-0" />
                    <span className="font-medium text-slate-700">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-blue-600 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10">
                <h3 className="text-2xl font-bold mb-6">Impactul DentalVoice</h3>
                <div className="space-y-8">
                  <div>
                    <div className="text-4xl font-bold mb-1">70%</div>
                    <div className="text-blue-100">Reducere a volumului de apeluri la recepție</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold mb-1">24/7</div>
                    <div className="text-blue-100">Disponibilitate pentru pacienții tăi</div>
                  </div>
                  <div>
                    <div className="text-4xl font-bold mb-1">0</div>
                    <div className="text-blue-100">Apeluri pierdute în afara programului</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">Cum funcționează?</h2>
            <p className="text-slate-600">Simplitate pentru tine, eficiență pentru pacienți.</p>
          </div>
          
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Pacientul inițiază", desc: "Pacientul intră pe site sau scrie pe WhatsApp." },
              { step: "02", title: "AI-ul preia", desc: "Denti întreabă serviciul dorit și verifică calendarul." },
              { step: "03", title: "Confirmare", desc: "Pacientul alege slotul și confirmă cu datele de contact." },
              { step: "04", title: "Sincronizare", desc: "Programarea apare instant în Google Sheets-ul clinicii." }
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="text-5xl font-black text-blue-100 mb-4">{item.step}</div>
                <h3 className="text-xl font-bold mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-slate-900 rounded-[2rem] p-12 text-center text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10">
              <h2 className="text-3xl md:text-5xl font-bold mb-6">Pregătit să modernizezi clinica?</h2>
              <p className="text-slate-400 mb-10 text-lg max-w-2xl mx-auto">
                Alătură-te clinicilor de top care folosesc deja DentalVoice pentru a oferi o experiență premium pacienților lor.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link to="/demo" className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white rounded-full text-lg font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-900/40">
                  Încearcă Demo Live
                </Link>
                <a 
                  href="tel:0711111111"
                  className="w-full sm:w-auto px-10 py-5 bg-white/10 text-white border border-white/20 rounded-full text-lg font-bold hover:bg-white/20 transition-all text-center"
                >
                  Contactează Vânzări
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <Smartphone className="text-white w-4 h-4" />
            </div>
            <span className="text-lg font-bold tracking-tight text-blue-900">DentalVoice.ai</span>
          </div>
          <div className="text-slate-500 text-sm">
            © 2026 DentalVoice.ai. Toate drepturile rezervate.
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-blue-600"><ShieldCheck className="w-5 h-5" /></a>
            <a href="#" className="text-slate-400 hover:text-blue-600"><MessageSquare className="w-5 h-5" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
