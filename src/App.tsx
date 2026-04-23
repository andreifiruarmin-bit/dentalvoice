import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import DemoPage from './DemoPage';
import EmbedChatPage from './EmbedChatPage';
import Termeni from './Termeni';
import Confidentialitate from './Confidentialitate';
import AdminDashboard from './AdminDashboard';
import WhatsappTest from './WhatsappTest';
// import MessengerTest from './MessengerTest'; // DEFERRED: facebook-channel
import ClinicDashboard from './ClinicDashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/embed/chat" element={<EmbedChatPage />} />
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/termeni" element={<Termeni />} />
        <Route path="/confidentialitate" element={<Confidentialitate />} />
        <Route path="/admin-dv-portal" element={<AdminDashboard />} />
        <Route path="/test-whatsapp-bot" element={<WhatsappTest />} />
        {/* <Route path="/test-messenger-bot" element={<MessengerTest />} /> // DEFERRED: facebook-channel */}
        <Route path="/demo/admin" element={<ClinicDashboard />} />
      </Routes>
    </Router>
  );
}
