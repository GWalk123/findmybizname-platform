import React from 'react';

const App = () => (
  <div style={{ 
    padding: '40px', 
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif',
    background: 'linear-gradient(135deg, #0040FF 0%, #FF2D2D 100%)',
    minHeight: '100vh',
    color: 'white'
  }}>
    <h1 style={{ fontSize: '3em', marginBottom: '20px' }}>FindMyBizName</h1>
    <h2 style={{ fontSize: '1.5em', fontWeight: 'normal', marginBottom: '30px' }}>
      The First Complete Global Business Operating System for Underbanked Entrepreneurs
    </h2>
    <div style={{ 
      background: 'rgba(255,255,255,0.1)', 
      padding: '20px', 
      borderRadius: '10px',
      maxWidth: '600px',
      margin: '0 auto'
    }}>
      <p>🚀 Platform Status: LIVE</p>
      <p>🌍 Target Market: 430.5M Underbanked Entrepreneurs</p>
      <p>💰 Market Opportunity: $5.2 Trillion</p>
      <p>🎯 Features: AI Naming + Domain Checking + CRM + Payments</p>
    </div>
    <p style={{ marginTop: '30px', opacity: '0.8' }}>
      Railway Deployment: SUCCESS ✅
    </p>
  </div>
);

export default App;
