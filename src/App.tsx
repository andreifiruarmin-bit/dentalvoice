import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import SimulationPage from './SimulationPage';
import FloatingHub from './components/FloatingHub';
import ChatWidget from './components/ChatWidget';

export default function App() {
  const [isChatOpen, setIsChatOpen] = React.useState(false);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/old-demo-simulation" element={<SimulationPage />} />
      </Routes>
      
      <ChatWidget isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      <FloatingHub onOpenChat={() => setIsChatOpen(true)} />
    </Router>
  );
}
