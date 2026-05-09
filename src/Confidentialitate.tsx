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
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Introducere</h2>
            <p>
              La DentalVoice, protejarea datelor dumneavoastră cu caracter personal este o prioritate. Această politică explică modul în care colectăm, utilizăm și protejăm informațiile dumneavoastră în conformitate cu GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Date Colectate</h2>
            <p>
              Colectăm informații necesare pentru furnizarea serviciilor noastre, inclusiv:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Date de contact (nume, email, telefon) furnizate prin formulare.</li>
              <li>Informații despre clinica dumneavoastră.</li>
              <li>Date tehnice (adresa IP, tipul browserului) colectate prin cookies.</li>
              <li>Datele pacienților procesate prin asistenții AI (în calitate de procesator de date).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Scopul Prelucrării</h2>
            <p>
              Utilizăm datele dumneavoastră pentru:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Furnizarea și îmbunătățirea serviciilor DentalVoice.</li>
              <li>Comunicarea cu dumneavoastră privind asistența tehnică sau oferte comerciale.</li>
              <li>Asigurarea securității platformei noastre.</li>
              <li>Respectarea obligațiilor legale.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Partajarea Datelor</h2>
            <p>
              Nu vindem și nu închiriem datele dumneavoastră către terți. Putem partaja datele cu furnizori de servicii esențiali (ex: hosting, servicii email) care respectă standardele de securitate necesare.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Drepturile Dumneavoastră</h2>
            <p>
              Conform GDPR, aveți dreptul de a accesa, rectifica sau șterge datele dumneavoastră, dreptul la portabilitatea datelor și dreptul de a vă opune prelucrării. Pentru exercitarea acestor drepturi, ne puteți contacta la contact@dentalvoice.ai.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Securitate</h2>
            <p>
              Implementăm măsuri tehnice și organizatorice avansate pentru a proteja datele împotriva accesului neautorizat, pierderii sau distrugerii.
            </p>
          </section>
        </div>

        <footer className="mt-20 pt-8 border-t border-slate-100 text-slate-400 text-sm">
          Ultima actualizare: 8 Aprilie 2026
        </footer>
      </div>
    </div>
  );
}
