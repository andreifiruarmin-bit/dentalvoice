import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import DemoPage from './DemoPage';
import Termeni from './Termeni';
import Confidentialitate from './Confidentialitate';
import AdminDashboard from './AdminDashboard';
import WhatsappTest from './WhatsappTest';
import ClinicDashboard from './ClinicDashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/termeni" element={<Termeni />} />
        <Route path="/confidentialitate" element={<Confidentialitate />} />
        <Route path="/admin-dv-portal" element={<AdminDashboard />} />
        <Route path="/test-whatsapp-bot" element={<WhatsappTest />} />
        <Route path="/demo/admin" element={<ClinicDashboard />} />
      </Routes>
    </Router>
  );
}
