import express from "express";
import { setupVite, serveStatic, log } from "../vite";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ 
    status: "OK",
    platform: "FindMyBizName",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  res.json({
    message: "FindMyBizName API is running",
    features: ["AI Naming", "Domain Checking", "CRM", "Payments"]
  });
});

if (process.env.NODE_ENV === "production") {
  serveStatic(app);
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 FindMyBizName production server running on port ${PORT}`);
  });
} else {
  const server = app.listen(PORT, "0.0.0.0", () => {
    log(`🚀 FindMyBizName development server running on 0.0.0.0:${PORT}`);
  });
  setupVite(app, server).catch(console.error);
}
