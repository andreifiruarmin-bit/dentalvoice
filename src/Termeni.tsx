import { Link } from 'react-router-dom';
import { ArrowLeft, Shield } from 'lucide-react';

export default function Termeni() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-blue-600 font-bold mb-12 hover:gap-3 transition-all">
          <ArrowLeft className="w-5 h-5" />
          Înapoi la Pagina Principală
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Shield className="text-white w-6 h-6" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">Termeni și Condiții</h1>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Descrierea Serviciului</h2>
            <p>
              DentalVoice este o platformă SaaS care automatizează programările dentare prin WhatsApp,
              widget web și dashboard de recepție. Platforma facilitează comunicarea dintre clinică și
              pacient — nu este responsabilă de actul medical.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Răspundere Limitată</h2>
            <p>
              DentalVoice SRL nu răspunde pentru actul medical al clinicii, inexactitățile introduse
              de pacient sau indisponibilitatea temporară a serviciului din cauze externe (Meta,
              Twilio, Vercel). DentalVoice depune toate eforturile pentru a asigura funcționarea
              optimă, însă nu poate garanta disponibilitatea neîntreruptă.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Abonamente și Prețuri</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Incisiv — 99€/lună:</strong> 1 clinică, funcționalități de bază</li>
              <li><strong>Canin — 199€/lună:</strong> funcționalități avansate + reminder-e SMS</li>
              <li><strong>Molar — 299€/lună:</strong> multi-locație + integrări complete</li>
            </ul>
            <p className="mt-4">
              Prețurile sunt exprimate fără TVA. Facturarea se face lunar în avans.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Perioadă de Trial</h2>
            <p>
              Toate abonamentele includ 30 de zile gratuit, fără obligații și fără a fi necesar
              un card de credit pentru activare.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Reziliere</h2>
            <p>
              Contractul poate fi reziliat de oricare parte cu un preaviz de 30 de zile. La reziliere,
              datele clinicii sunt păstrate 30 de zile, după care sunt șterse definitiv.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Proprietate Intelectuală</h2>
            <p>
              Toate drepturile de proprietate intelectuală asupra platformei, inclusiv codul sursă,
              designul, logo-urile și algoritmii AI, aparțin exclusiv DentalVoice SRL.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Legea Aplicabilă</h2>
            <p>
              Prezentul contract este guvernat de legislația română. Orice litigiu se va soluționa
              pe cale amiabilă sau, în ultimă instanță, la instanțele competente din România.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Contact</h2>
            <p>
              DentalVoice SRL —{' '}
              <a href="mailto:andrei@dentalvoice.ro" className="text-blue-600 hover:underline">
                andrei@dentalvoice.ro
              </a>
            </p>
          </section>
        </div>

        <footer className="mt-20 pt-8 border-t border-slate-100 text-slate-400 text-sm">
          Ultima actualizare: Mai 2026
        </footer>
      </div>
    </div>
  );
}