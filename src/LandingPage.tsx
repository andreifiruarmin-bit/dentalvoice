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
  Layers,
  Check,
  Building2,
  User,
  Mail,
  MapPin,
  TrendingUp
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useClinicConfig } from './hooks/useClinicConfig';

export default function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [formStatus, setFormStatus] = React.useState<'idle' | 'submitting' | 'success'>('idle');
  const { config } = useClinicConfig();

  type ChannelItem = {
    id: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    btnText: string;
    href: string;
    isInternal: boolean;
    disabled?: boolean;
    badge?: string;
  };

  const handleContactSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormStatus('submitting');
    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());
    
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        setFormStatus('success');
        (e.target as HTMLFormElement).reset();
      } else {
        throw new Error('Failed to submit');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setFormStatus('idle');
      alert('A apărut o eroare la trimiterea solicitării. Vă rugăm să încercați din nou.');
    }
  };

  const pricingTiers = [
    {
      name: "Pachetul Incisiv",
      price: "150",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-blue-600">
          <path d="M7 4C7 4 7 10 7 14C7 18 12 21 12 21C12 21 17 18 17 14C17 10 17 4 17 4H7Z" />
        </svg>
      ),
      features: [
        "Chatbot pe site",
        "Programări online",
        "Modificări ale programărilor",
        "✅ Calendar intern sincronizat",
        "✅ Confirmare email automată",
        "Confirmări prin SMS",
        "Reminder pentru clienți"
      ],
      color: "blue"
    },
    {
      name: "Pachetul Canin",
      price: "250",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-blue-600">
          <path d="M7 4C7 4 7 10 7 14C7 18 12 21 12 21C12 21 17 18 17 14C17 10 17 4 17 4H7Z" />
          <path d="M12 4V21" strokeOpacity="0.2" />
          <path d="M7 4L12 2" strokeOpacity="0.5" />
          <path d="M17 4L12 2" strokeOpacity="0.5" />
        </svg>
      ),
      features: [
        "Tot ce include Pachetul Incisiv",
        "✅ Integrare WhatsApp",
        "Review Booster",
        "Suportă maxim 3 medici de bază + 2 medici colaboratori",
        "Trimitere detalii programare pe email"
      ],
      color: "indigo",
      popular: true
    },
    {
      name: "Pachetul Molar",
      price: "450",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-12 h-12 text-blue-600">
          <path d="M6 4C6 4 5 10 5 14C5 18 8 21 8 21C8 21 10 19 12 19C14 19 16 21 16 21C16 21 19 18 19 14C19 10 18 4 18 4H6Z" />
          <path d="M12 4V19" strokeOpacity="0.2" />
        </svg>
      ),
      features: [
        "Tot ce include Pachetul Canin",
        "Număr nelimitat de medici în calendar",
        "Adresă de email profesională",
        "Opțional: Închiriere hardware pentru recepție (MiniPC + Monitor)",
        "Social Media Management",
        "Campanii de marketing (Email/SMS)",
        "Manager de cont dedicat"
      ],
      color: "slate"
    }
  ];

  const channels: ChannelItem[] = [
    {
      id: "webbot",
      icon: <MessageSquare className="w-10 h-10 text-blue-600" />,
      title: "Webbot",
      desc: "Asistent AI direct pe site-ul clinicii tale pentru conversii instantanee.",
      btnText: "Testează asistentul web",
      href: "/demo",
      isInternal: true,
    },
    {
      id: "whatsapp",
      icon: <MessageCircle className="w-10 h-10 text-[#25D366]" />,
      title: "WhatsApp",
      desc: "Integrare nativă WhatsApp Business pentru comunicare familiară și rapidă.",
      btnText: "Testează programările pe WhatsApp",
      href: "/test-whatsapp-bot",
      isInternal: true,
    },
    {
      id: "messenger",
      icon: <Facebook className="w-10 h-10 text-[#0084FF]" />,
      title: "Messenger",
      desc: "Prezență pe Facebook Messenger pentru a capta pacienți de pe rețelele sociale.",
      btnText: "În curând",
      href: "#",
      isInternal: false,
      disabled: true,
      badge: "🔜 În curând",
    },
  ];

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-blue-100 selection:text-blue-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                <Smartphone className="text-white w-6 h-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-slate-900">DentalVoice</span>
            </div>
            
            <div className="hidden md:flex items-center gap-10">
              <a href="#servicii" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Servicii</a>
              <a href="#cum-functioneaza" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Cum funcționează</a>
              <a href="#preturi" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Prețuri</a>
              <a href="#contact" className="text-sm font-semibold text-slate-600 hover:text-blue-600 transition-colors">Contact</a>
              <a href="#servicii" className="px-6 py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold hover:bg-blue-700 transition-all shadow-xl shadow-blue-100">
                Încearcă Demo Live
              </a>
            </div>

            <button className="md:hidden p-2 text-slate-600" onClick={() => setIsMenuOpen(!isMenuOpen)}>
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {isMenuOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden bg-white border-b border-slate-100 p-6 flex flex-col gap-6 shadow-xl"
          >
            <a href="#servicii" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold text-slate-900">Servicii</a>
            <a href="#cum-functioneaza" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold text-slate-900">Cum funcționează</a>
            <a href="#preturi" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold text-slate-900">Prețuri</a>
            <a href="#contact" onClick={() => setIsMenuOpen(false)} className="text-lg font-bold text-slate-900">Contact</a>
            <a href="#servicii" onClick={() => setIsMenuOpen(false)} className="px-6 py-4 bg-blue-600 text-white rounded-2xl font-bold text-center shadow-lg shadow-blue-100">
              Încearcă Demo Live
            </a>
          </motion.div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[800px] bg-blue-50 rounded-full blur-3xl -z-10 opacity-50"></div>
          
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-block px-5 py-2 mb-8 text-xs font-extrabold tracking-widest text-blue-600 uppercase bg-blue-50 rounded-full border border-blue-100">
              Recepționer Virtual AI disponibil 24/7
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-10 leading-[1.1] tracking-tight max-w-5xl mx-auto">
              Nu mai pierdeți pacienți. <br />
              <span className="text-blue-600">Lăsați agentul nostru să facă programările automant.</span>
            </h1>
            
            {/* Stylized Business Benefits */}
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {[
                "Programări corecte, fără suprapuneri.",
                "Distribuția echilibrată a volumului de muncă pentru angajați (Load Balance).",
                "Rapiditate maximă în programare pentru pacienți."
              ].map((benefit, i) => (
                <div key={i} className="flex items-center gap-4 px-8 py-6 bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="text-blue-600 w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold text-slate-700 text-left leading-tight">{benefit}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Omnichannel Section (#servicii) */}
      <section id="servicii" className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Un singur asistent. <span className="text-blue-600">Toate canalele de comunicare.</span>
            </h2>
            <p className="text-slate-600 text-xl max-w-3xl mx-auto leading-relaxed font-medium">
              DentalVoice integrează Web Chat, WhatsApp și Messenger într-un singur motor inteligent, familiar și rapid pentru pacienți.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-10">
            {channels.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white p-12 rounded-[3rem] shadow-xl border border-slate-100 text-center flex flex-col h-full group hover:border-blue-200 transition-all"
              >
                <div className="w-24 h-24 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-10 group-hover:scale-110 transition-transform shadow-inner">
                  {item.icon}
                </div>
                <h3 className="text-3xl font-black mb-6">{item.title}</h3>
                <p className="text-slate-600 text-base leading-relaxed mb-10 flex-1 font-medium">{item.desc}</p>
                {item.disabled ? (
                  <div className="bg-slate-200 text-slate-400 cursor-not-allowed opacity-70 w-full py-5 rounded-2xl font-black text-center">
                    {item.badge || item.btnText}
                  </div>
                ) : item.isInternal ? (
                  <Link 
                    to={item.href}
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                  >
                    {item.btnText}
                  </Link>
                ) : (
                  <a 
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-5 bg-blue-600 text-white rounded-2xl font-black hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                  >
                    {item.btnText}
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works / Features Merged (#cum-functioneaza) */}
      <section id="cum-functioneaza" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Cum funcționează <span className="text-blue-600">DentalVoice</span>
            </h2>
            <p className="text-slate-600 text-xl max-w-3xl mx-auto leading-relaxed font-medium">
              O experiență de programare fluidă, de la primul mesaj până la ușa clinicii.
            </p>
          </div>

          {/* Step-by-Step Graphic */}
          <div className="relative mb-32">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 -z-10"></div>
            <div className="grid md:grid-cols-4 gap-12 relative z-10">
              {[
                {
                  icon: <MessageCircle className="w-8 h-8 text-[#25D366]" />,
                  title: "Pacientul inițiază conversația",
                  desc: "Scrie pe WhatsApp, folosește chatbot-ul de pe site sau Messenger pentru a începe programarea."
                },
                {
                  icon: <Zap className="w-8 h-8 text-blue-600" />,
                  title: "Agentul colectează datele",
                  desc: "Colectează serviciul dorit, medicul preferat (opțional), data și ora — verificând disponibilitatea în timp real."
                },
                {
                  icon: <CheckCircle2 className="w-8 h-8 text-indigo-600" />,
                  title: "Programare confirmată",
                  desc: "Programarea este salvată în calendarul intern al clinicii și pacientul primește un email de confirmare cu detaliile."
                },
                {
                  icon: <MapPin className="w-8 h-8 text-purple-600" />,
                  title: "Email & Locație",
                  desc: "Emailul include adresa clinicii, link GPS și toate detaliile programării."
                }
              ].map((step, i) => (
                <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm text-center flex flex-col items-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center mb-6 shadow-inner">
                    {step.icon}
                  </div>
                  <h4 className="text-xl font-black mb-3">{step.title}</h4>
                  <p className="text-slate-500 text-sm font-medium leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-20 items-center">
            <div className="bg-slate-900 rounded-[3rem] p-16 text-white shadow-2xl relative overflow-hidden order-2 md:order-1">
              <div className="absolute top-0 right-0 w-80 h-80 bg-blue-600/20 rounded-full -mr-40 -mt-40 blur-3xl"></div>
              <div className="relative z-10">
                <h3 className="text-3xl font-black mb-12">Impactul DentalVoice</h3>
                <div className="space-y-12">
                  <div className="flex items-end gap-4">
                    <div className="text-7xl font-black text-blue-400 leading-none">70%</div>
                    <div className="text-slate-400 font-bold mb-1">Reducere a volumului <br />de apeluri la recepție</div>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="text-7xl font-black text-indigo-400 leading-none">24/7</div>
                    <div className="text-slate-400 font-bold mb-1">Disponibilitate pentru <br />pacienții tăi</div>
                  </div>
                  <div className="flex items-end gap-4">
                    <div className="text-7xl font-black text-purple-400 leading-none">0</div>
                    <div className="text-slate-400 font-bold mb-1">Apeluri pierdute în <br />afara programului</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 md:order-2">
              <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 leading-tight">
                Angajatul tău virtual, <br /> mereu la datorie.
              </h2>
              <p className="text-slate-600 text-xl mb-12 leading-relaxed font-medium">
                DentalVoice nu este doar un chatbot. Este un agent AI care înțelege contextul, gestionează calendarul și comunică natural cu pacienții tăi.
              </p>
              <div className="space-y-6">
                {[
                  "Gestionare inteligentă: Programări automate sincronizate cu cele manuale.",
                  "Salvare automată în calendarul personal al pacientului.",
                  "Load Balance: Distribuție echilibrată între doctori pentru eficiență maximă.",
                  "User Friendly: Experiență de programare în mai puțin de 1 minut."
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <Check className="w-5 h-5 text-blue-600" />
                    </div>
                    <span className="font-bold text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section (#preturi) */}
      <section id="preturi" className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-6 tracking-tight">
              Alege pachetul <span className="text-blue-600">potrivit</span>
            </h2>
            <p className="text-slate-600 text-xl max-w-3xl mx-auto leading-relaxed font-medium">
              Toate pachetele includ o perioadă de 30 de zile de DEMO gratuit și training gratuit (online sau la sediul clinicii).
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {pricingTiers.map((tier, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={cn(
                  "bg-white p-10 rounded-[3rem] shadow-xl border flex flex-col h-full relative overflow-hidden",
                  tier.popular ? "border-blue-600 ring-4 ring-blue-50" : "border-slate-100"
                )}
              >
                {tier.popular && (
                  <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest px-6 py-2 rounded-bl-2xl">
                    Cel mai popular
                  </div>
                )}
                <div className="mb-10">
                  <div className="mb-6 w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center shadow-inner">
                    {tier.icon}
                  </div>
                  <h3 className="text-2xl font-black mb-4">{tier.name}</h3>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black">{tier.price} €</span>
                    <span className="text-slate-400 font-bold">/ lună</span>
                  </div>
                </div>
                <div className="space-y-5 mb-12 flex-1">
                  {tier.features.map((feature, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5",
                        tier.color === 'blue' ? "bg-blue-50" : tier.color === 'indigo' ? "bg-indigo-50" : "bg-slate-100"
                      )}>
                        <Check className={cn(
                          "w-3 h-3",
                          tier.color === 'blue' ? "text-blue-600" : tier.color === 'indigo' ? "text-indigo-600" : "text-slate-600"
                        )} />
                      </div>
                      <span className="text-sm font-bold text-slate-700 leading-tight">{feature}</span>
                    </div>
                  ))}
                </div>
                <a 
                  href="#contact"
                  className={cn(
                    "w-full py-4 rounded-2xl font-black text-center transition-all shadow-lg",
                    tier.popular 
                      ? "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-100" 
                      : "bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200"
                  )}
                >
                  Alege {tier.name}
                </a>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <a 
              href="#contact"
              className="inline-flex items-center gap-3 px-10 py-5 bg-white border-2 border-slate-200 rounded-full text-lg font-black text-slate-900 hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm"
            >
              Creează Pachet Custom (între 50€ și 800€)
            </a>
          </div>
        </div>
      </section>

      {/* Contact Form Section (#contact) */}
      <section id="contact" className="py-32">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-20">
            <div>
              <h2 className="text-4xl md:text-6xl font-black text-slate-900 mb-8 tracking-tight">
                Hai să vorbim despre <span className="text-blue-600">viitorul</span> clinicii tale.
              </h2>
              <p className="text-slate-600 text-xl mb-12 leading-relaxed font-medium">
                Completează formularul și unul dintre experții noștri te va contacta pentru o sesiune de consultanță gratuită.
              </p>
              
              <div className="space-y-8">
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600">
                    <Mail className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-400 uppercase tracking-widest">Email</div>
                    <div className="text-xl font-bold">contact@dentalvoice.ai</div>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                    <Smartphone className="w-7 h-7" />
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-400 uppercase tracking-widest">Telefon</div>
                    <div className="text-xl font-bold">{config?.clinicPhone || ''}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-10 md:p-12 rounded-[3rem] shadow-2xl border border-slate-100">
              {formStatus === 'success' ? (
                <div className="text-center py-12">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
                    <Check className="w-10 h-10" />
                  </div>
                  <h3 className="text-3xl font-black mb-4">Mesaj Trimis!</h3>
                  <p className="text-slate-600 font-bold">Vă mulțumim! Un consultant DentalVoice vă va contacta în cel mai scurt timp.</p>
                  <button 
                    onClick={() => setFormStatus('idle')}
                    className="mt-10 px-8 py-3 bg-slate-900 text-white rounded-xl font-bold"
                  >
                    Trimite alt mesaj
                  </button>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Building2 className="w-4 h-4" /> Numele Clinicii Dentare
                    </label>
                    <input 
                      required
                      name="clinicName"
                      type="text" 
                      placeholder="Ex: Beautiful Smile Clinic"
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <User className="w-4 h-4" /> Persoana de Contact
                    </label>
                    <input 
                      required
                      name="contactPerson"
                      type="text" 
                      placeholder="Ex: Dr. Andrei Popescu"
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <Smartphone className="w-4 h-4" /> Telefon
                      </label>
                      <input 
                        required
                        name="phone"
                        type="tel" 
                        placeholder="07xx xxx xxx"
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Adresa Clinicii
                      </label>
                      <input 
                        required
                        name="address"
                        type="text" 
                        placeholder="Oraș, Stradă..."
                        className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> Pachet de Interes
                    </label>
                    <select 
                      required
                      name="tierInteres"
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold appearance-none cursor-pointer"
                    >
                      <option value="Incisiv">Pachet Incisiv (150€)</option>
                      <option value="Canin">Pachet Canin (250€)</option>
                      <option value="Molar">Pachet Molar (450€)</option>
                      <option value="Custom">Pachet Custom</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" /> Cum te putem ajuta?
                    </label>
                    <textarea 
                      name="message"
                      rows={4}
                      placeholder="Spune-ne mai multe despre nevoile clinicii tale..."
                      className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:border-blue-600 focus:bg-white outline-none transition-all font-bold resize-none"
                    ></textarea>
                  </div>
                  
                  <div className="text-xs text-slate-500 font-medium leading-relaxed">
                    Prin trimiterea acestui formular ești de acord cu <Link to="/termeni" className="text-blue-600 hover:underline">Termenii și Condițiile</Link> și <Link to="/confidentialitate" className="text-blue-600 hover:underline">Politica de Confidențialitate</Link>.
                  </div>

                  <button 
                    type="submit"
                    disabled={formStatus === 'submitting'}
                    className="w-full py-6 bg-blue-600 text-white rounded-[2rem] text-xl font-black hover:bg-blue-700 transition-all shadow-2xl shadow-blue-100 disabled:opacity-50"
                  >
                    {formStatus === 'submitting' ? 'Se trimite...' : 'Solicită Testare Demo'}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="py-24 bg-slate-900 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black mb-10 leading-tight tracking-tight">Pregătit să modernizezi clinica?</h2>
          <p className="text-slate-400 mb-16 text-xl max-w-2xl mx-auto font-medium">
            Alătură-te clinicilor de top care folosesc deja DentalVoice pentru a oferi o experiență premium pacienților lor.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <a href="#servicii" className="w-full sm:w-auto px-12 py-6 bg-blue-600 text-white rounded-full text-xl font-black hover:bg-blue-700 transition-all shadow-2xl shadow-blue-900/40">
              Încearcă Demo Live
            </a>
            <a href="#contact" className="w-full sm:w-auto px-12 py-6 bg-white/10 text-white border border-white/20 rounded-full text-xl font-black hover:bg-white/20 transition-all">
              Contactează-ne
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Smartphone className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-slate-900">DentalVoice</span>
          </div>
          <div className="text-slate-400 text-sm font-bold">
            © 2026 DentalVoice. Toate drepturile rezervate.
          </div>
          <div className="flex gap-8">
            <a
              href="https://www.facebook.com/dentalvoice"
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-300 hover:text-blue-600 transition-colors"
            >
              <Shield className="w-6 h-6" />
            </a>
            <a
              href="mailto:contact@dentalvoice.ro"
              className="text-slate-300 hover:text-blue-600 transition-colors"
            >
              <MessageSquare className="w-6 h-6" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}
