import { Link } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';

export default function Confidentialitate() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 py-20 px-4">
      <div className="max-w-4xl mx-auto">
        <Link to="/" className="inline-flex items-center gap-2 text-blue-600 font-bold mb-12 hover:gap-3 transition-all">
          <ArrowLeft className="w-5 h-5" />
          Înapoi la Pagina Principală
        </Link>

        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Lock className="text-white w-6 h-6" />
          </div>
          <h1 className="text-4xl font-black tracking-tight">Politica de Confidențialitate</h1>
        </div>

        <div className="prose prose-slate max-w-none space-y-8 text-slate-600 leading-relaxed">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Cine Suntem</h2>
            <p>
              DentalVoice SRL prelucrează datele dumneavoastră cu caracter personal în calitate de
              operator de date. Pentru orice întrebare privind datele personale, ne puteți contacta
              la{' '}
              <a href="mailto:andrei@dentalvoice.ro" className="text-blue-600 hover:underline">
                andrei@dentalvoice.ro
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Ce Date Colectăm</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Nume și prenume</li>
              <li>Număr de telefon</li>
              <li>Adresă de email</li>
              <li>Data și ora programării</li>
              <li>Istoricul conversației cu asistentul virtual</li>
              <li>Date medicale relevante programării (colectate doar cu consimțământ explicit)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Scopul Colectării</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Confirmarea programărilor dentare</li>
              <li>Trimiterea de reminder-e înainte de programare</li>
              <li>Funcționarea serviciului de programare automată</li>
              <li>Respectarea obligațiilor legale</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Temeiul Legal</h2>
            <p>
              Prelucrarea se bazează pe consimțământul dumneavoastră explicit conform{' '}
              <strong>Art. 6(1)(a) din Regulamentul UE 2016/679 (GDPR)</strong>. Datele cu caracter
              medical sunt prelucrate exclusiv în baza consimțământului explicit, conform{' '}
              <strong>Art. 9(2)(a) GDPR</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Durata Păstrării Datelor</h2>
            <p>
              Datele sunt păstrate timp de <strong>12 luni</strong> de la ultima programare, după
              care sunt șterse automat din sistem.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Drepturile Dumneavoastră</h2>
            <p>Conform GDPR, aveți dreptul la:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Acces la datele personale deținute despre dumneavoastră</li>
              <li>Rectificarea datelor inexacte</li>
              <li>Ștergerea datelor („dreptul de a fi uitat")</li>
              <li>Restricționarea prelucrării</li>
              <li>Portabilitatea datelor</li>
              <li>Opoziție față de prelucrare</li>
            </ul>
            <p className="mt-4">
              Pentru exercitarea acestor drepturi, contactați:{' '}
              <a href="mailto:andrei@dentalvoice.ro" className="text-blue-600 hover:underline">
                andrei@dentalvoice.ro
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">7. Cookie-uri</h2>
            <p>
              Folosim exclusiv cookie-uri funcționale, necesare pentru operarea serviciului. Nu
              utilizăm cookie-uri de tracking sau publicitate terță.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">8. Partajarea Datelor</h2>
            <p>
              Nu vindem și nu închiriem datele dumneavoastră către terți. Putem partaja datele cu
              furnizori de servicii esențiali (hosting, email) care respectă standardele GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">9. Modificări</h2>
            <p>
              Ne rezervăm dreptul de a actualiza această politică. Versiunea curentă este
              disponibilă permanent la adresa /confidentialitate.
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