import express from "express";
import { setupVite, serveStatic, log } from "./vite";

const app = express();

// Basic request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// API health check for Railway
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    platform: 'FindMyBizName - Complete Business Operating System',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    features: [
      'AI Business Naming Engine',
      'Real-time Domain Checking',
      'Global Payment Processing',
      'Complete CRM System',
      '30% Referral Network',
      'Business Intelligence Suite',
      'Digital Products Marketplace'
    ]
  });
});

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Platform status API
app.get('/api/status', (req, res) => {
  res.json({
    platform: 'FindMyBizName',
    status: 'LIVE',
    market: '430.5M underbanked entrepreneurs',
    positioning: 'The First Complete Global Business Operating System for Underbanked Entrepreneurs',
    features: {
      'AI Naming': 'Active',
      'Domain Checking': 'Active', 
      'CRM': 'Active',
      'Invoicing': 'Active',
      'Referrals': 'Active',
      'Business Intelligence': 'Active',
      'Digital Products': 'Active',
      'Alternative Payments': 'Active'
    }
  });
});

// Setup Vite for development or serve static for production  
const isProduction = process.env.NODE_ENV === "production";

// Railway requires binding to assigned port
const port = parseInt(process.env.PORT || "5000", 10);
const host = "0.0.0.0"; // Railway requires 0.0.0.0

const server = app.listen(port, host, async () => {
  console.log(`🚀 FindMyBizName server running on ${host}:${port}`);
  console.log(`🌍 Railway URL: https://findmybizname-production.up.railway.app`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ Railway deployment: SUCCESS`);

  try {
    if (isProduction) {
      serveStatic(app);
    } else {
      await setupVite(app, server);
    }
  } catch (error) {
    console.error('Error setting up server:', error);
    process.exit(1);
  }
});