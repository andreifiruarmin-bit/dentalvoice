import React from 'react';
import { motion } from 'motion/react';
import { 
  Smartphone, 
  MessageSquare, 
  ArrowRight,
  Menu,
  X,
  MessageCircle,
  Facebook,
  CheckCircle2,
  Zap,
  Shield,
  Layers
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CHANNEL_CONFIG } from './types';

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
              <a href="#features" className="px-5 py-2 bg-white text-blue-600 border border-blue-100 rounded-full text-sm font-bold hover:bg-blue-50 transition-all shadow-sm">
                Funcționalități
              </a>
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
            <a href="#features" className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-semibold text-center">
              Funcționalități
            </a>
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
            <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 mb-8 leading-[1.2] tracking-tight max-w-4xl mx-auto">
              Nu mai pierdeți pacienți. <br />
              <span className="text-blue-600">Lăsați AI-ul să gestioneze fluxul.</span>
            </h1>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
              <a href="#features" className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white rounded-full text-lg font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 flex items-center justify-center gap-2 group">
                Funcționalități <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            {/* Stylized Business Benefits */}
            <div className="mt-12 grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {[
                "Programări corecte, fără suprapuneri.",
                "Distribuția echilibrată a volumului de muncă pentru angajați (Load Balance).",
                "Rapiditate maximă în programare pentru pacienți."
              ].map((benefit, i) => (
                <div key={i} className="flex items-center justify-center gap-3 px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <CheckCircle2 className="text-blue-600 w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-bold text-slate-700 text-left leading-tight">{benefit}</span>
                </div>
              ))}
            </div>
          </motion.div>
          
          {/* Product Showcase - Video/GIF Simulation */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="mt-20 relative max-w-5xl mx-auto"
          >
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-[2rem] blur-2xl opacity-50 -z-10"></div>
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden aspect-video flex items-center justify-center bg-slate-900">
               {/* Optimized GIF/Video Simulation */}
               <div className="relative w-full h-full flex items-center justify-center">
                 <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                 <div className="relative z-10 flex flex-col items-center gap-6 text-white text-center px-8">
                    <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl animate-pulse">
                      <MessageCircle className="w-10 h-10" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold">Simulare WhatsApp AI</h3>
                      <p className="text-slate-400 max-w-md">
                        "Salut, vreau o detartrare." <br/>
                        <span className="text-blue-400 font-mono text-sm">DentalVoice: "Sigur! Avem locuri libere mâine la ora 10:00 sau 14:00 la Dr. Popescu."</span>
                      </p>
                    </div>
                    {/* Placeholder for actual video/gif if available */}
                    <div className="text-xs text-slate-500 uppercase tracking-widest">Product Showcase Video</div>
                 </div>
               </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Omnichannel Section (Integrated Demo Flow) */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">
              Experiență <span className="text-blue-600">Omnichannel</span>
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto leading-relaxed">
              DentalVoice integrează Web Chat, WhatsApp și Messenger într-un singur motor inteligent de programări.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                id: "webbot",
                icon: <MessageSquare className="w-8 h-8 text-blue-600" />,
                title: "Webbot",
                desc: "Asistent AI direct pe site-ul clinicii tale pentru conversii instantanee.",
                btnText: "Testează asistentul web",
                href: "/old-demo-simulation",
                isInternal: true
              },
              {
                id: "whatsapp",
                icon: <MessageCircle className="w-8 h-8 text-[#25D366]" />,
                title: "WhatsApp",
                desc: "Integrare nativă WhatsApp Business pentru comunicare familiară și rapidă.",
                btnText: "Programează-te pe WhatsApp",
                href: `https://wa.me/${(CHANNEL_CONFIG.whatsapp as any).number}?text=${encodeURIComponent(CHANNEL_CONFIG.whatsapp.text)}`,
                isInternal: false
              },
              {
                id: "messenger",
                icon: <Facebook className="w-8 h-8 text-[#0084FF]" />,
                title: "Messenger",
                desc: "Prezență pe Facebook Messenger pentru a capta pacienți de pe rețelele sociale.",
                btnText: "Programează-te pe Messenger",
                href: `https://m.me/${(CHANNEL_CONFIG.messenger as any).pageId}`,
                isInternal: false
              }
            ].map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-10 rounded-[2.5rem] shadow-xl border border-slate-100 text-center flex flex-col h-full"
              >
                <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-8 group-hover:scale-110 transition-transform">
                  {item.icon}
                </div>
                <h3 className="text-2xl font-bold mb-4">{item.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed mb-8 flex-1">{item.desc}</p>
                {item.isInternal ? (
                  <Link 
                    to={item.href}
                    className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                  >
                    {item.btnText}
                  </Link>
                ) : (
                  <a 
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                  >
                    {item.btnText}
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Core Engine Features Section */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 mb-8 leading-tight">
                Angajatul tău virtual, <br /> mereu la datorie.
              </h2>
              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <Zap className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Core Engine 3-Tier</h4>
                    <p className="text-slate-600 leading-relaxed">Arhitectură robustă care integrează logică complexă de business cu canale multiple de comunicare.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-7 h-7 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Anti-Spam & Rate Limiting</h4>
                    <p className="text-slate-600 leading-relaxed">Protecție automată împotriva programărilor multiple de pe același număr, asigurând un calendar curat.</p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-14 h-14 rounded-2xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Layers className="w-7 h-7 text-purple-600" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold mb-2">Smart Load Balancing</h4>
                    <p className="text-slate-600 leading-relaxed">Distribuție inteligentă a pacienților bazată pe Gap Rule și Load Rule pentru a optimiza timpul medicilor.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-slate-900 rounded-[3rem] p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full -mr-32 -mt-32 blur-3xl"></div>
              <div className="relative z-10">
                <h3 className="text-3xl font-bold mb-8">Impactul DentalVoice</h3>
                <div className="space-y-10">
                  <div>
                    <div className="text-5xl font-black mb-2 text-blue-400">70%</div>
                    <div className="text-slate-400 font-medium">Reducere a volumului de apeluri la recepție</div>
                  </div>
                  <div>
                    <div className="text-5xl font-black mb-2 text-indigo-400">24/7</div>
                    <div className="text-slate-400 font-medium">Disponibilitate pentru pacienții tăi</div>
                  </div>
                  <div>
                    <div className="text-5xl font-black mb-2 text-purple-400">0</div>
                    <div className="text-slate-400 font-medium">Apeluri pierdute în afara programului</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-5xl font-extrabold text-slate-900 mb-16 tracking-tight">Cum funcționează?</h2>
          <div className="grid md:grid-cols-4 gap-12">
            {[
              { step: "01", title: "Pacientul inițiază", desc: "Pacientul intră pe site sau scrie pe WhatsApp." },
              { step: "02", title: "AI-ul preia", desc: "Denti întreabă serviciul dorit și verifică calendarul." },
              { step: "03", title: "Confirmare", desc: "Pacientul alege slotul și confirmă cu datele de contact." },
              { step: "04", title: "Sincronizare", desc: "Programarea apare instant în Google Sheets-ul clinicii." }
            ].map((item, i) => (
              <div key={i} className="relative group">
                <div className="text-7xl font-black text-slate-200 mb-6 group-hover:text-blue-100 transition-colors">{item.step}</div>
                <h3 className="text-xl font-bold mb-3">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="bg-blue-600 rounded-[3rem] p-16 text-center text-white relative overflow-hidden shadow-2xl shadow-blue-200">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="relative z-10">
              <h2 className="text-4xl md:text-6xl font-black mb-8 leading-tight">Pregătit să modernizezi clinica?</h2>
              <p className="text-blue-100 mb-12 text-xl max-w-2xl mx-auto font-medium">
                Alătură-te clinicilor de top care folosesc deja DentalVoice pentru a oferi o experiență premium pacienților lor.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                <a href="#features" className="w-full sm:w-auto px-12 py-6 bg-white text-blue-600 rounded-full text-xl font-bold hover:bg-blue-50 transition-all shadow-xl">
                  Încearcă Demo Live
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-100">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Smartphone className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-blue-900">DentalVoice.ai</span>
          </div>
          <div className="text-slate-400 text-sm font-medium">
            © 2026 DentalVoice.ai. Toate drepturile rezervate.
          </div>
          <div className="flex gap-8">
            <a href="#" className="text-slate-300 hover:text-blue-600 transition-colors"><Shield className="w-6 h-6" /></a>
            <a href="#" className="text-slate-300 hover:text-blue-600 transition-colors"><MessageSquare className="w-6 h-6" /></a>
          </div>
        </div>
      </footer>
    </div>
  );
}
