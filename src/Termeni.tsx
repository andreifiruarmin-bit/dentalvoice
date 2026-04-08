import React from 'react';
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
            <h2 className="text-2xl font-bold text-slate-900 mb-4">1. Acceptarea Termenilor</h2>
            <p>
              Prin accesarea și utilizarea platformei DentalVoice, sunteți de acord să respectați acești Termeni și Condiții. Dacă nu sunteți de acord cu oricare dintre acești termeni, vă rugăm să nu utilizați serviciile noastre.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">2. Descrierea Serviciului</h2>
            <p>
              DentalVoice oferă o soluție SaaS (Software as a Service) bazată pe inteligență artificială pentru gestionarea programărilor în clinicile stomatologice. Serviciul include asistenți virtuali integrați pe Web, WhatsApp și Facebook Messenger.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">3. Utilizarea Platformei</h2>
            <p>
              Sunteți responsabil pentru menținerea confidențialității datelor de acces și pentru toate activitățile care au loc sub contul dumneavoastră. Utilizarea platformei în scopuri ilegale sau neautorizate este strict interzisă.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">4. Proprietate Intelectuală</h2>
            <p>
              Toate drepturile de proprietate intelectuală asupra platformei, inclusiv codul sursă, designul, logo-urile și algoritmii AI, aparțin exclusiv DentalVoice.ai.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">5. Limitarea Răspunderii</h2>
            <p>
              DentalVoice depune toate eforturile pentru a asigura funcționarea optimă a serviciului, însă nu poate garanta disponibilitatea neîntreruptă sau lipsa erorilor. Nu suntem responsabili pentru pierderi indirecte sau daune rezultate din utilizarea platformei.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">6. Modificări</h2>
            <p>
              Ne rezervăm dreptul de a modifica acești termeni în orice moment. Modificările vor intra în vigoare imediat după publicarea pe site.
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
