import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import DemoPage from './DemoPage';
import Termeni from './Termeni';
import Confidentialitate from './Confidentialitate';
import AdminDashboard from './AdminDashboard';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/termeni" element={<Termeni />} />
        <Route path="/confidentialitate" element={<Confidentialitate />} />
        <Route path="/admin-dv-portal" element={<AdminDashboard />} />
      </Routes>
    </Router>
  );
}
