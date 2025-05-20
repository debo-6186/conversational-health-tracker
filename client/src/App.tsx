import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './components/LandingPage';
import MedicalHistory from './components/MedicalHistory';

const App: React.FC = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/medical-history" element={<MedicalHistory />} />
      </Routes>
    </Router>
  );
};

export default App; 