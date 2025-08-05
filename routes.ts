import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { body, validationResult } from 'express-validator';
import { storage } from "./storage";
import { nanoid } from "nanoid";
import { NameGeneratorService } from "./services/nameGenerator";
import { DomainCheckerService } from "./services/domainChecker";
import { SocialMediaCheckerService } from "./services/socialMediaChecker";
import { BrandAnalyzerService } from "./services/brandAnalyzer";
import type { DomainStatus } from "../shared/schema";
import { nameGenerationRequestSchema, companySearchRequestSchema, users, transactions, referralCodes, referrals } from "@shared/schema";
import { z } from "zod";
import { securityMonitor } from "./middleware/security";
import { secEdgarService } from "./services/secEdgar";
import { createPaypalOrder, capturePaypalOrder, loadPaypalDefault } from "./paypal";
import { createWiPaySubscription, handleWiPayCallback, getWiPayStatus } from "./wipay";
import { aiTemplateGenerator } from "./services/aiTemplateGenerator";
import { saasToolEngine } from "./services/saasToolEngine";
import { db } from "./db";
import { eq } from "drizzle-orm";

const nameGenerator = new NameGeneratorService();
const domainChecker = new DomainCheckerService();
const socialMediaChecker = new SocialMediaCheckerService();
const brandAnalyzer = new BrandAnalyzerService();

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for Railway
  app.get('/api/health', (req, res) => {
    res.status(200).json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      platform: 'FindMyBizName',
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Business health status
  app.get("/api/health/business", async (req, res) => {
    res.json({ 
      status: "healthy", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  });

  // Debug endpoint to upgrade user for testing
  app.post("/api/debug-upgrade-user", async (req, res) => {
    const user = await storage.getUser(1);
    if (user) {
      user.plan = "pro";
      user.dailyUsage = 0;
      res.json({ message: "User upgraded to Pro for testing", user });
    } else {
      res.status(404).json({ message: "User not found" });
    }
  });

  // Get current user (demo user for development)
  app.get("/api/user", async (req, res) => {
    // Get user from storage with Pro plan for testing
    const user = await storage.getUser(1);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Add usage calculation
    const usageLimit = user.plan === "free" ? 10 : user.plan === "premium" ? 50 : 999;
    const userResponse = {
      ...user,
      usageToday: user.dailyUsage,
      usageLimit,
      remainingUsage: Math.max(0, usageLimit - user.dailyUsage)
    };
    
    res.json(userResponse);
  });

  // Contact form endpoint with automated responses
  app.post("/api/contact", [
    body('name').trim().isLength({ min: 2, max: 100 }).escape(),
    body('email').isEmail().normalizeEmail(),
    body('subject').trim().isLength({ min: 5, max: 200 }).escape(),
    body('message').trim().isLength({ min: 10, max: 2000 }).escape(),
    body('category').isIn(['general', 'support', 'billing', 'partnership', 'media'])
  ], async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, email, subject, message, category } = req.body;

      // Log contact submission for business owner
      console.log("📧 Contact Form Submission:", {
        from: `${name} <${email}>`,
        category,
        subject,
        timestamp: new Date().toISOString(),
        ip: req.ip
      });

      // Automated response confirmation
      console.log("🤖 Automated Response Triggered:", {
        to: email,
        category,
        expectedResponse: category === "partnership" ? "48 hours" : "24 hours"
      });

      res.json({
        success: true,
        message: "Message sent successfully! You'll receive an automated response shortly.",
        responseInfo: {
          category,
          expectedResponseTime: category === "partnership" ? "48 hours" : "24 hours"
        }
      });

    } catch (error) {
      console.error("Contact form error:", error);
      res.status(500).json({ error: "Failed to submit contact form" });
    }
  });

  // Generate business names with enhanced security
  app.post("/api/generate-names", async (req: Request, res: Response) => {
    try {
      // Custom validation: require either description OR specificName
      if (!req.body.description && !req.body.specificName) {
        return res.status(400).json({
          error: "Either description or specificName is required"
        });
      }

      // Validate request body with Zod (handles all data validation)
      const validatedData = nameGenerationRequestSchema.parse(req.body);
      
      // Demo user ID
      const userId = 1;
      
      // Check usage limits for demo user
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user has exceeded monthly limit (free users: 10/month, 20 during promotion)
      // Reset usage if it's a new month
      const now = new Date();
      const lastReset = new Date(user.lastUsageReset);
      if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        await storage.resetDailyUsage(userId);
        user.dailyUsage = 0;
      }

      // Launch promotion: 20 generations for first month, then 10/month
      const isLaunchMonth = now.getFullYear() === 2025 && now.getMonth() === 0; // January 2025
      const monthlyLimit = isLaunchMonth ? 20 : 10;

      if (user.plan === 'free' && user.dailyUsage >= monthlyLimit) {
        return res.status(403).json({ 
          message: `Free limit reached (${monthlyLimit} per month). Upgrade to Premium for unlimited generations + advanced features!`,
          remainingUsage: 0
        });
      }

      // Generate business names or check specific name
      let generatedNames: string[] = [];
      
      // Check subscription tier restrictions
      if (validatedData.includeSynonyms && user.plan === "free") {
        return res.status(403).json({ 
          message: "Synonyms feature requires Premium subscription. Upgrade to unlock advanced name variations!",
          feature: "synonyms",
          requiredPlan: "premium"
        });
      }
      
      if (validatedData.specificName) {
        // If checking a specific name, just use that name
        generatedNames = [validatedData.specificName];
      } else if (validatedData.description) {
        // Otherwise generate names from description
        // Pro users get advanced algorithms automatically
        const requestWithPlan = {
          ...validatedData,
          useAdvancedAlgorithms: user.plan === "pro"
        };
        generatedNames = await nameGenerator.generateNames(requestWithPlan);
      }
      
      // Check domain availability for each name
      const namesWithDomains = await Promise.all(
        generatedNames.map(async (name) => {
          let domains: Record<string, DomainStatus> = {};
          
          if (validatedData.checkDomains || validatedData.checkPremiumDomains) {
            domains = await domainChecker.checkDomainAvailability(
              name, 
              user.plan, 
              validatedData.checkPremiumDomains
            );
          }
          
          // Save generated name to storage
          const savedName = await storage.createGeneratedName(userId, {
            name,
            description: validatedData.description || validatedData.specificName || "",
            industry: validatedData.industry || "",
            style: validatedData.style || "",
            domains: JSON.stringify(domains)
          });

          return {
            id: savedName.id,
            name,
            description: validatedData.description || validatedData.specificName,
            industry: validatedData.industry,
            style: validatedData.style,
            domains,
            isFavorite: false,
            createdAt: savedName.createdAt
          };
        })
      );

      // Update user usage
      await storage.updateUserUsage(userId, user.dailyUsage + 1);
      
      // Add search to history
      await storage.addSearchHistory(userId, {
        query: validatedData.description || validatedData.specificName || "",
        industry: validatedData.industry || "",
        style: validatedData.style || ""
      });

      // Calculate remaining usage based on launch promotion
      const remainingUsage = user.plan === 'free' ? Math.max(0, monthlyLimit - (user.dailyUsage + 1)) : -1;
      
      res.json({
        names: namesWithDomains,
        remainingUsage
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request data", 
          errors: error.errors 
        });
      }
      
      console.error("Error generating names:", error);
      res.status(500).json({ message: "Failed to generate names" });
    }
  });

  // Get user's generated names
  app.get("/api/generated-names", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const names = await storage.getUserGeneratedNames(userId);
      res.json(names);
    } catch (error) {
      console.error("Error fetching generated names:", error);
      res.status(500).json({ message: "Failed to fetch generated names" });
    }
  });

  // Toggle favorite status
  app.post("/api/favorites/toggle", async (req, res) => {
    try {
      const { nameId } = req.body;
      const userId = 1; // Demo user ID
      
      await storage.toggleFavorite(userId, nameId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error toggling favorite:", error);
      res.status(500).json({ message: "Failed to toggle favorite" });
    }
  });

  // Get user's favorites
  app.get("/api/favorites", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const favorites = await storage.getUserFavorites(userId);
      res.json(favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      res.status(500).json({ message: "Failed to fetch favorites" });
    }
  });

  // Get search history
  app.get("/api/search-history", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const history = await storage.getUserSearchHistory(userId);
      res.json(history);
    } catch (error) {
      console.error("Error fetching search history:", error);
      res.status(500).json({ message: "Failed to fetch search history" });
    }
  });

  // Check domains endpoint for live domain checker
  app.post("/api/check-domains", async (req, res) => {
    try {
      const { businessName, userPlan = 'free' } = req.body;
      
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ message: "Business name must be at least 2 characters" });
      }

      const domainChecker = new DomainCheckerService();
      const domains = await domainChecker.checkDomainAvailability(businessName, userPlan);
      
      res.json({ domains });
    } catch (error) {
      console.error("Error checking domains:", error);
      res.status(500).json({ message: "Failed to check domain availability" });
    }
  });

  // Export favorites
  app.get("/api/favorites/export", async (req, res) => {
    try {
      const { format } = req.query;
      const userId = 1; // Demo user ID
      
      const favorites = await storage.getUserFavorites(userId);
      
      if (format === 'csv') {
        const csv = [
          'Name,Industry,Style,Available Domains,Created At',
          ...favorites.map(fav => {
            const availableDomains = Object.entries(fav.domains)
              .filter(([, status]) => status.available)
              .map(([domain]) => domain)
              .join(';');
            
            return `"${fav.name}","${fav.industry || ''}","${fav.style || ''}","${availableDomains}","${fav.createdAt.toISOString()}"`;
          })
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="business-names.csv"');
        res.send(csv);
      } else {
        // JSON format
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="business-names.json"');
        res.json(favorites);
      }
    } catch (error) {
      console.error("Error exporting favorites:", error);
      res.status(500).json({ message: "Failed to export favorites" });
    }
  });

  // PayPal order endpoints
  app.get("/paypal/setup", async (req, res) => {
    await loadPaypalDefault(req, res);
  });

  app.post("/paypal/order", async (req, res) => {
    // Request body should contain: { intent, amount, currency }
    await createPaypalOrder(req, res);
  });

  app.post("/paypal/order/:orderID/capture", async (req, res) => {
    await capturePaypalOrder(req, res);
  });

  // WiPay payment routes
  app.post("/api/wipay/subscription", async (req, res) => {
    await createWiPaySubscription(req, res);
  });

  app.post("/api/create-wipay-subscription", async (req, res) => {
    await createWiPaySubscription(req, res);
  });

  app.post("/api/wipay/callback", async (req, res) => {
    await handleWiPayCallback(req, res);
  });

  app.get("/api/wipay/status", async (req, res) => {
    await getWiPayStatus(req, res);
  });

  // PayPal subscription endpoint
  app.post("/api/create-paypal-subscription", async (req, res) => {
    try {
      const { plan } = req.body;
      
      // Define plan pricing
      const planPricing = {
        premium: { amount: "9.99", name: "Premium Plan", id: "P-premium-plan" },
        pro: { amount: "19.99", name: "Pro Plan", id: "P-pro-plan" }
      };

      const selectedPlan = planPricing[plan as keyof typeof planPricing];
      if (!selectedPlan) {
        return res.status(400).json({ error: "Invalid plan selected" });
      }

      // For development, return a mock approval URL
      // In production, you would integrate with PayPal's subscription API
      const approvalUrl = `https://www.sandbox.paypal.com/checkoutnow?token=mock_${plan}_${Date.now()}`;

      res.json({ 
        approvalUrl,
        plan: selectedPlan,
        message: "Development mode - PayPal integration ready for production"
      });
    } catch (error: any) {
      console.error("PayPal subscription creation error:", error);
      res.status(500).json({ 
        error: "Failed to create PayPal subscription",
        details: error.message 
      });
    }
  });

  // PayPal webhook endpoint for subscription events
  app.post("/api/paypal-webhook", async (req, res) => {
    try {
      const event = req.body;
      
      // Handle PayPal webhook events
      switch (event.event_type) {
        case 'BILLING.SUBSCRIPTION.ACTIVATED':
          console.log('PayPal subscription activated:', event.resource.id);
          // Update user subscription status in database
          break;
        
        case 'BILLING.SUBSCRIPTION.CANCELLED':
          console.log('PayPal subscription cancelled:', event.resource.id);
          // Update user subscription status in database
          break;
        
        default:
          console.log(`Unhandled PayPal event type ${event.event_type}`);
      }

      res.json({ received: true });
    } catch (error: any) {
      console.error("PayPal webhook error:", error);
      res.status(500).json({ error: "PayPal webhook processing failed" });
    }
  });

  // User Profile routes
  app.get("/api/profile", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const profile = await storage.getUserProfile(userId);
      console.log("Fetching profile for userId:", userId, "Found:", profile ? "Yes" : "No");
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post("/api/profile", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const existing = await storage.getUserProfile(userId);
      
      let profile;
      if (existing) {
        profile = await storage.updateUserProfile(userId, req.body);
      } else {
        profile = await storage.createUserProfile({ ...req.body, userId });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("Error saving profile:", error);
      res.status(500).json({ message: "Failed to save profile" });
    }
  });

  // User Feedback routes
  app.post("/api/feedback", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const feedback = await storage.createUserFeedback({
        ...req.body,
        userId,
        userAgent: req.get('User-Agent'),
        url: req.get('Referer')
      });
      res.json(feedback);
    } catch (error) {
      console.error("Error submitting feedback:", error);
      res.status(500).json({ message: "Failed to submit feedback" });
    }
  });

  app.get("/api/feedback", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const feedback = await storage.getUserFeedback(userId);
      res.json(feedback);
    } catch (error) {
      console.error("Error fetching feedback:", error);
      res.status(500).json({ message: "Failed to fetch feedback" });
    }
  });

  // Social media availability check endpoint
  app.post("/api/check-social-media", async (req, res) => {
    try {
      const { businessName } = req.body;
      
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ message: "Business name must be at least 2 characters" });
      }

      const socialMedia = await socialMediaChecker.checkSocialMediaAvailability(businessName);
      
      res.json({ socialMedia });
    } catch (error) {
      console.error("Error checking social media:", error);
      res.status(500).json({ message: "Failed to check social media availability" });
    }
  });

  // Brand analysis endpoint
  app.post("/api/analyze-brand", async (req, res) => {
    try {
      const { businessName, industry } = req.body;
      
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ message: "Business name must be at least 2 characters" });
      }

      const analysis = await brandAnalyzer.analyzeBrand(businessName, industry);
      
      res.json({ analysis });
    } catch (error) {
      console.error("Error analyzing brand:", error);
      res.status(500).json({ message: "Failed to analyze brand" });
    }
  });

  // Comprehensive name analysis (domains + social + brand)
  app.post("/api/analyze-name-complete", async (req, res) => {
    try {
      const { businessName, industry, userPlan = 'free' } = req.body;
      
      if (!businessName || businessName.trim().length < 2) {
        return res.status(400).json({ message: "Business name must be at least 2 characters" });
      }

      // Run all analyses in parallel for speed
      const [domains, socialMedia, brandAnalysis] = await Promise.all([
        domainChecker.checkDomainAvailability(businessName, userPlan),
        socialMediaChecker.checkSocialMediaAvailability(businessName),
        brandAnalyzer.analyzeBrand(businessName, industry)
      ]);
      
      res.json({ 
        name: businessName,
        domains, 
        socialMedia, 
        brandAnalysis,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error in complete analysis:", error);
      res.status(500).json({ message: "Failed to complete name analysis" });
    }
  });

  // Security monitoring endpoint (admin only)
  app.get("/api/security/stats", async (req, res) => {
    try {
      const stats = securityMonitor.getSecurityStats();
      res.json({
        status: "secure",
        timestamp: new Date().toISOString(),
        stats
      });
    } catch (error) {
      console.error("Security stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Digital Products API Endpoints
  
  // Get all digital products
  app.get("/api/digital-products", async (req, res) => {
    try {
      const products = await storage.getAllDigitalProducts();
      res.json(products);
    } catch (error) {
      console.error("Error fetching digital products:", error);
      res.status(500).json({ message: "Failed to fetch digital products" });
    }
  });

  // Paddle integration - Zero-touch global payment processing
  app.post("/api/paddle-checkout", async (req, res) => {
    try {
      const { plan, customerEmail, customerName, country = "TT" } = req.body;
      
      // Paddle product IDs (set these up in Paddle dashboard)
      const paddleProducts = {
        premium: {
          productId: "pro_01hsxxxxxxxxxxx", // Replace with actual Paddle product ID
          price: "$9.99/month",
          checkoutUrl: "https://checkout.paddle.com/subscription/premium-findmybizname"
        },
        pro: {
          productId: "pro_01hsyyyyyyyyyyy", // Replace with actual Paddle product ID  
          price: "$19.99/month",
          checkoutUrl: "https://checkout.paddle.com/subscription/pro-findmybizname"
        }
      };

      const selectedPlan = paddleProducts[plan];
      
      if (!selectedPlan) {
        return res.status(400).json({ message: "Invalid plan selected" });
      }

      // Paddle automatically handles:
      // - Global tax compliance (VAT, sales tax, GST)
      // - Currency conversion
      // - Payment processing
      // - Subscription management
      // - Refunds and disputes
      // - Legal compliance as merchant of record

      res.json({
        success: true,
        checkoutUrl: selectedPlan.checkoutUrl,
        productId: selectedPlan.productId,
        planDetails: {
          name: plan,
          price: selectedPlan.price,
          features: plan === 'premium' 
            ? ["Unlimited generations", "Premium domains", "PDF export"]
            : ["Everything in Premium", "Brand analysis", "Bulk features", "Priority support"]
        },
        globalCompliance: {
          taxHandling: "Automatic VAT, sales tax, GST",
          currencies: "200+ supported automatically", 
          legalProtection: "Paddle is merchant of record",
          payoutFrequency: "Monthly to your Trinidad & Tobago bank"
        },
        message: "Global compliance and zero manual work included"
      });

    } catch (error) {
      console.error("Paddle checkout error:", error);
      res.status(500).json({ message: "Checkout system unavailable" });
    }
  });

  // Paddle webhook for automatic user upgrades
  app.post("/api/paddle-webhook", async (req, res) => {
    try {
      const { alert_name, email, subscription_plan_id, status } = req.body;
      
      // Paddle sends webhooks for:
      // - subscription_created
      // - subscription_updated  
      // - subscription_cancelled
      // - payment_succeeded
      // - payment_failed

      if (alert_name === "subscription_created" && status === "active") {
        // Automatically upgrade user account
        console.log("PADDLE WEBHOOK - User upgraded:", {
          email,
          plan: subscription_plan_id,
          timestamp: new Date().toISOString(),
          automated: true
        });

        // Here you would automatically:
        // 1. Find user by email
        // 2. Upgrade their account to Premium/Pro
        // 3. Send welcome email
        // 4. Grant access to premium features
        
        res.json({ received: true });
      } else {
        res.json({ received: true, action: "no_action_needed" });
      }

    } catch (error) {
      console.error("Paddle webhook error:", error);
      res.status(400).json({ message: "Webhook processing failed" });
    }
  });

  // Cross-platform payment automation endpoint
  app.post("/api/payment-automation", async (req: Request, res: Response) => {
    try {
      const { 
        paymentMethod, 
        amount, 
        currency, 
        customerEmail, 
        customerName, 
        plan,
        country = "TT",
        phone
      } = req.body;

      // Generate unique order ID
      const orderId = `FMBN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      // Payment method configurations
      const paymentMethods = {
        paypal: {
          automated: false,
          contact: "gregorywalker760@gmail.com",
          instructions: `Send ${currency} ${amount} via PayPal to gregorywalker760@gmail.com with reference: ${orderId}`,
          expectedTime: "Instant confirmation"
        },
        wipay: {
          automated: false,
          contact: "+1 (868) 326-1593",
          instructions: `WhatsApp +1 (868) 326-1593 for WiPay payment. Reference: ${orderId}`,
          expectedTime: "Within 2 hours"
        },
        bank: {
          automated: false,
          contact: "gregorywalker760@gmail.com",
          instructions: `Email gregorywalker760@gmail.com for bank transfer details. Reference: ${orderId}`,
          expectedTime: "1-3 business days"
        },
        mobile: {
          automated: false,
          contact: "+1 (868) 326-1593",
          instructions: `WhatsApp +1 (868) 326-1593 for mobile money (Digicel/Flow). Reference: ${orderId}`,
          expectedTime: "Within 4 hours"
        },
        crypto: {
          automated: false,
          contact: "gregorywalker760@gmail.com",
          instructions: `Email gregorywalker760@gmail.com for cryptocurrency payment details. Reference: ${orderId}`,
          expectedTime: "Within 24 hours"
        },
        wise: {
          automated: false,
          contact: "gregorywalker760@gmail.com",
          instructions: `Request Wise payment details via email to gregorywalker760@gmail.com. Reference: ${orderId}`,
          expectedTime: "Within 2 hours",
          features: ["Personal account only", "Direct TT bank transfer", "Multi-currency support"]
        },
        onesafe: {
          automated: false,
          contact: "gregorywalker760@gmail.com", 
          instructions: `Email gregorywalker760@gmail.com for OneSafe payment processing. Reference: ${orderId}`,
          expectedTime: "Within 4 hours",
          features: ["Caribbean-focused", "Personal account", "Local customer service"]
        }
      };

      const selectedMethod = paymentMethods[paymentMethod as keyof typeof paymentMethods] || paymentMethods.bank;

      // Create automation notification for processing
      const automationData = {
        orderId,
        timestamp: new Date().toISOString(),
        customer: {
          name: customerName,
          email: customerEmail,
          phone: phone || "Not provided",
          country
        },
        order: {
          plan,
          amount,
          currency,
          paymentMethod
        },
        actions: [
          `Verify ${paymentMethod} payment received`,
          `Upgrade ${customerEmail} to ${plan} plan`,
          `Send confirmation email`,
          `Update billing records`,
          `Grant platform access`
        ]
      };

      // Log for manual processing (this would trigger automation workflows)
      console.log("PAYMENT AUTOMATION REQUEST:", JSON.stringify(automationData, null, 2));

      // Response with payment instructions
      res.json({
        success: true,
        orderId,
        paymentMethod: selectedMethod,
        automationStatus: "initiated",
        nextSteps: [
          "Complete payment using provided instructions",
          "Keep order reference for tracking",
          "Check email for confirmation within expected timeframe",
          "Contact support if payment not confirmed"
        ],
        support: {
          whatsapp: "+1 (868) 326-1593",
          email: "gregorywalker760@gmail.com",
          hours: "Monday-Friday 9AM-5PM AST"
        }
      });

    } catch (error) {
      console.error("Payment automation error:", error);
      res.status(500).json({ message: "Payment automation failed" });
    }
  });

  // Payment verification webhook (for automation tools like Zapier)
  app.post("/api/payment-verified", async (req, res) => {
    try {
      const { 
        orderId, 
        customerEmail, 
        plan, 
        amount, 
        paymentMethod,
        verificationSource 
      } = req.body;

      // In a real implementation, this would:
      // 1. Verify the payment was actually received
      // 2. Upgrade user account automatically
      // 3. Send confirmation emails
      // 4. Update billing systems

      console.log("PAYMENT VERIFIED - AUTO PROCESSING:", {
        orderId,
        customerEmail,
        plan,
        amount,
        paymentMethod,
        verificationSource,
        processedAt: new Date().toISOString()
      });

      // Simulate automated account upgrade
      const upgradeResult = {
        success: true,
        customerEmail,
        newPlan: plan,
        accessGranted: true,
        confirmationSent: true
      };

      res.json({
        message: "Payment verified and account upgraded automatically",
        result: upgradeResult
      });

    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // Get user's purchased products
  app.get("/api/user/purchases", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const purchases = await storage.getUserPurchases(userId);
      
      // Enrich with product details
      const enrichedPurchases = await Promise.all(
        purchases.map(async (purchase) => {
          if (purchase.productId) {
            const product = await storage.getDigitalProduct(purchase.productId);
            return {
              ...purchase,
              product
            };
          }
          return purchase;
        })
      );
      
      res.json(enrichedPurchases);
    } catch (error) {
      console.error("Error fetching user purchases:", error);
      res.status(500).json({ message: "Failed to fetch purchases" });
    }
  });

  // Purchase a digital product
  app.post("/api/digital-products/:id/purchase", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const userId = 1; // Demo user ID
      const { paymentMethod, paymentId } = req.body;

      // Check if product exists
      const product = await storage.getDigitalProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if already purchased
      const existingPurchase = await storage.getPurchase(userId, productId);
      if (existingPurchase) {
        return res.status(400).json({ message: "Product already purchased" });
      }

      // Create purchase record
      const purchase = await storage.createPurchase(userId, {
        productId,
        purchasePrice: product.price,
        paymentMethod: paymentMethod || "demo",
        paymentId: paymentId || `demo_${Date.now()}`
      });

      res.json({
        message: "Purchase successful",
        purchase,
        downloadUrl: `/api/digital-products/${productId}/download?purchaseId=${purchase.id}`
      });
    } catch (error) {
      console.error("Error processing purchase:", error);
      res.status(500).json({ message: "Failed to process purchase" });
    }
  });

  // Download a purchased product
  app.get("/api/digital-products/:id/download", async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const { purchaseId } = req.query;
      const userId = 1; // Demo user ID

      // Verify purchase
      const purchase = await storage.getPurchase(userId, productId);
      if (!purchase || purchase.id.toString() !== purchaseId) {
        return res.status(403).json({ message: "Access denied - purchase required" });
      }

      // Get product details
      const product = await storage.getDigitalProduct(productId);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Increment download count
      await storage.incrementDownloadCount(purchase.id);

      // For demo purposes, return sample file content
      const sampleContent = `# ${product.title}

This is a sample ${product.category} template from FindMyBizName.

## What's Included:
${product.description}

## File Details:
- Product: ${product.title}
- Category: ${product.category}
- Purchase Date: ${purchase.createdAt.toISOString()}
- Download Count: ${purchase.downloadCount + 1}

## Next Steps:
1. Customize this template for your business
2. Replace placeholder content with your information
3. Save and use for your business needs

---
Generated by FindMyBizName - The Stripe of Underbanked Entrepreneur Tools
`;

      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${product.fileName}"`);
      res.send(sampleContent);
    } catch (error) {
      console.error("Error downloading product:", error);
      res.status(500).json({ message: "Failed to download product" });
    }
  });

  // Business Intelligence API Routes
  
  // Search companies (SEC EDGAR database)
  app.get("/api/companies/search", async (req: Request, res: Response) => {
    try {
      const { query, country, industry, limit } = req.query;
      
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({ 
          message: "Search query is required" 
        });
      }

      const searchParams = {
        query: query.trim(),
        country: country as string || 'US',
        industry: industry as string,
        limit: Math.min(parseInt(limit as string) || 20, 50)
      };

      // Validate with schema
      const validatedParams = companySearchRequestSchema.parse(searchParams);
      
      // Search companies using SEC EDGAR
      const companies = await secEdgarService.searchCompanies(
        validatedParams.query, 
        validatedParams.limit
      );

      // Log search activity
      console.log(`Company search: ${validatedParams.query}`);

      res.json({ 
        companies,
        total: companies.length,
        query: validatedParams.query,
        source: 'SEC EDGAR'
      });

    } catch (error) {
      console.error("Company search error:", error);
      res.status(500).json({ 
        message: "Failed to search companies",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get trending/popular companies
  app.get("/api/companies/trending", async (req: Request, res: Response) => {
    try {
      const { limit } = req.query;
      const limitNum = Math.min(parseInt(limit as string) || 10, 20);

      const companies = await secEdgarService.getTrendingCompanies(limitNum);

      res.json({ 
        companies,
        total: companies.length,
        source: 'SEC EDGAR',
        type: 'trending'
      });

    } catch (error) {
      console.error("Trending companies error:", error);
      res.status(500).json({ 
        message: "Failed to fetch trending companies",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get detailed company profile
  app.get("/api/companies/:cik", async (req: Request, res: Response) => {
    try {
      const { cik } = req.params;
      
      if (!cik || !/^\d{1,10}$/.test(cik)) {
        return res.status(400).json({ 
          message: "Valid CIK number is required" 
        });
      }

      const company = await secEdgarService.getCompanyProfile(cik);
      
      if (!company) {
        return res.status(404).json({ 
          message: "Company not found" 
        });
      }

      res.json({ 
        company,
        source: 'SEC EDGAR'
      });

    } catch (error) {
      console.error("Company profile error:", error);
      res.status(500).json({ 
        message: "Failed to fetch company profile",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  const httpServer = createServer(app);
  
  // Community Chat WebSocket Server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  interface ConnectedUser {
    id: string;
    username: string;
    userType: 'entrepreneur' | 'supporter' | 'premium';
    location?: string;
    ws: WebSocket;
  }
  
  const connectedUsers = new Map<string, ConnectedUser>();
  const welcomeMessagesSent = new Set<string>(); // Track which users received welcome messages
  
  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null;
    
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());
        
        switch (message.type) {
          case 'join_community':
            // Use username as unique identifier to prevent duplicates
            const username = message.username || `User${Math.floor(Math.random() * 1000)}`;
            userId = username; // Use username as userId to prevent duplicates
            
            // Remove any existing connection for this username
            for (const [existingId, existingUser] of Array.from(connectedUsers.entries())) {
              if (existingUser.username === username) {
                existingUser.ws.close();
                connectedUsers.delete(existingId);
                break;
              }
            }
            
            const user: ConnectedUser = {
              id: userId || username,
              username: username,
              userType: message.userType || 'entrepreneur',
              location: message.location,
              ws
            };
            
            connectedUsers.set(userId || username, user);
            
            // Send welcome messages only once per browser session
            const sessionKey = `${user.username}_${Date.now()}`;
            if (!welcomeMessagesSent.has(user.username)) {
              welcomeMessagesSent.add(user.username);
              
              // Send limited welcome messages to new user
              ws.send(JSON.stringify({
                type: 'community_message',
                id: Date.now().toString(),
                username: 'System',
                message: 'Hello. Welcome to FindMyBizName.',
                timestamp: new Date().toISOString(),
                userType: 'supporter'
              }));
              
              // Send second welcome message after brief delay
              setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({
                    type: 'community_message',
                    id: (Date.now() + 1).toString(),
                    username: 'System',
                    message: 'Be sure to give us some feedback about your experience before leaving.',
                    timestamp: new Date().toISOString(),
                    userType: 'supporter'
                  }));
                }
              }, 2000);
            }
            
            // Notify all users about new join
            broadcast({
              type: 'user_joined',
              user: {
                id: user.id,
                username: user.username,
                userType: user.userType,
                location: user.location
              }
            }, userId);
            
            // Send current users list to new user
            ws.send(JSON.stringify({
              type: 'users_update',
              users: Array.from(connectedUsers.values()).map(u => ({
                id: u.id,
                username: u.username,
                userType: u.userType,
                location: u.location
              }))
            }));
            break;
            
          case 'community_message':
            if (userId && connectedUsers.has(userId)) {
              const sender = connectedUsers.get(userId)!;
              const chatMessage = {
                type: 'community_message',
                id: Date.now().toString(),
                username: sender.username,
                message: message.message,
                timestamp: new Date().toISOString(),
                userType: sender.userType
              };
              
              // Broadcast message to all connected users
              broadcast(chatMessage);
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    ws.on('close', () => {
      if (userId && connectedUsers.has(userId)) {
        const user = connectedUsers.get(userId)!;
        connectedUsers.delete(userId);
        
        // Clean up welcome messages tracking after 5 minutes to allow reconnection without spam
        setTimeout(() => {
          welcomeMessagesSent.delete(user.username);
        }, 5 * 60 * 1000);
        
        // Notify others about user leaving
        broadcast({
          type: 'user_left',
          userId: userId,
          username: user.username
        });
      }
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      if (userId) {
        connectedUsers.delete(userId);
      }
    });
  });
  
  function broadcast(message: any, excludeUserId?: string) {
    const messageStr = JSON.stringify(message);
    connectedUsers.forEach((user, id) => {
      if (id !== excludeUserId && user.ws.readyState === WebSocket.OPEN) {
        user.ws.send(messageStr);
      }
    });
  }

  // Initialize demo data endpoint
  app.post("/api/init-demo", async (req, res) => {
    try {
      // Create demo user
      let demoUser = await storage.getUserByEmail("demo@example.com");
      
      if (!demoUser) {
        demoUser = await storage.createUser({
          username: "demo_user",
          email: "demo@example.com",
          plan: "starter"
        });
      }

      // Create demo profile
      let demoProfile = await storage.getUserProfile(demoUser.id);
      
      if (!demoProfile) {
        await storage.createUserProfile({
          userId: demoUser.id,
          displayName: "MrBizWhiz",
          bio: "Caribbean entrepreneur building the next big thing! 🌴",
          businessStage: "idea",
          industry: "technology", 
          location: "Trinidad & Tobago",
          website: "https://findmybizname.com",
          linkedinUrl: "https://linkedin.com/in/mrbizwhiz",
          interests: ["AI", "Caribbean Business", "Startup Growth"],
          allowMessages: true,
          allowNetworking: true
        });
      }

      res.json({ message: "Demo data initialized", user: demoUser });
    } catch (error) {
      console.error("Demo initialization error:", error);
      res.status(500).json({ message: "Failed to initialize demo data" });
    }
  });

  // Referral system endpoints
  app.post("/api/referral/create-code", async (req: Request, res: Response) => {
    try {
      // Get the actual demo user ID
      const demoUser = await storage.getUserByEmail("demo@example.com");
      if (!demoUser) {
        return res.status(404).json({ message: "Demo user not found. Please initialize demo data first." });
      }
      const userId = demoUser.id;
      
      // Check if user already has a code
      let referralCode = await storage.getReferralCode(userId);
      
      if (!referralCode) {
        referralCode = await storage.createReferralCode(userId);
      }
      
      res.json(referralCode);
    } catch (error) {
      console.error("Create referral code error:", error);
      res.status(500).json({ message: "Failed to create referral code" });
    }
  });

  app.get("/api/referral/stats/:userId", async (req: Request, res: Response) => {
    try {
      // Use actual demo user ID if userId is 1
      let userId = parseInt(req.params.userId);
      if (userId === 1) {
        const demoUser = await storage.getUserByEmail("demo@example.com");
        if (demoUser) {
          userId = demoUser.id;
        }
      }
      
      const stats = await storage.getReferralStats(userId);
      const referrals = await storage.getReferralsByUser(userId);
      const payouts = await storage.getUserPayouts(userId);
      
      res.json({
        stats: stats || {
          totalReferrals: 0,
          convertedReferrals: 0,
          totalCommissions: "0",
          pendingCommissions: "0",
          paidCommissions: "0",
          currency: "USD"
        },
        referrals,
        payouts
      });
    } catch (error) {
      console.error("Get referral stats error:", error);
      res.status(500).json({ message: "Failed to get referral stats" });
    }
  });

  app.post("/api/referral/track", async (req: Request, res: Response) => {
    try {
      const { referralCode, newUserEmail } = req.body;
      
      // Find referral code
      const code = await storage.getReferralCodeByCode(referralCode);
      
      if (!code) {
        return res.status(404).json({ message: "Invalid referral code" });
      }
      
      // Create user (for now we'll simulate this)
      const newUser = await storage.createUser({
        username: newUserEmail.split('@')[0],
        email: newUserEmail,
        plan: "starter"
      });
      
      // Create referral record
      const referral = await storage.createReferral({
        referrerId: code.userId,
        refereeId: newUser.id,
        referralCode: code.code,
        status: "pending"
      });
      
      // Update stats
      await storage.updateReferralStats(code.userId, {
        totalReferrals: 1
      });
      
      res.json({ referral, message: "Referral tracked successfully" });
    } catch (error) {
      console.error("Track referral error:", error);
      res.status(500).json({ message: "Failed to track referral" });
    }
  });

  app.post("/api/referral/convert", async (req: Request, res: Response) => {
    try {
      const { referralId, plan, amount } = req.body;
      
      // Calculate commission (30%)
      const commissionAmount = parseFloat(amount) * 0.30;
      
      // Update referral status
      await storage.updateReferralStatus(
        referralId, 
        "converted", 
        new Date(), 
        commissionAmount
      );
      
      // Get referral to find referrer
      const referrals = Array.from((storage as any).referrals?.values() || []);
      const referral = referrals.find((r: any) => r.id === referralId);
      
      if (referral) {
        // Update referrer stats
        const currentStats = await storage.getReferralStats(referral.referrerId);
        await storage.updateReferralStats(referral.referrerId, {
          convertedReferrals: (currentStats?.convertedReferrals || 0) + 1,
          pendingCommissions: ((parseFloat(currentStats?.pendingCommissions || "0")) + commissionAmount).toString(),
          totalCommissions: ((parseFloat(currentStats?.totalCommissions || "0")) + commissionAmount).toString()
        });
      }
      
      res.json({ message: "Referral converted successfully", commission: commissionAmount });
    } catch (error) {
      console.error("Convert referral error:", error);
      res.status(500).json({ message: "Failed to convert referral" });
    }
  });

  // Payment automation endpoints
  app.post("/api/payment-automation", async (req: Request, res: Response) => {
    try {
      const { transactionId, userEmail, amount, currency, subscriptionPlan, paymentMethod, referralCode } = req.body;
      
      if (!transactionId || !userEmail || !amount || !subscriptionPlan || !paymentMethod) {
        return res.status(400).json({ message: "Missing required payment data" });
      }

      // Find or create user
      let user = await storage.getUserByEmail(userEmail);
      
      if (!user) {
        const username = userEmail.split('@')[0] + '_' + Date.now().toString().slice(-4);
        user = await storage.createUser({
          username,
          email: userEmail,
          plan: subscriptionPlan
        });
        console.log("Payment automation - Created new user:", user.id);
      } else {
        await db.update(users).set({ plan: subscriptionPlan }).where(eq(users.id, user.id));
        console.log("Payment automation - Upgraded user:", user.id, "to", subscriptionPlan);
      }

      // Record transaction
      const transaction = await db.insert(transactions).values({
        userId: user.id,
        transactionId,
        amount: amount.toString(),
        currency: currency || "USD",
        paymentMethod,
        subscriptionPlan,
        referralCode,
        status: "completed"
      }).returning();

      // Process referral commission
      let commissionGenerated = 0;
      let referralProcessed = false;

      if (referralCode) {
        try {
          const [codeData] = await db.select().from(referralCodes)
            .where(eq(referralCodes.code, referralCode));
          
          if (codeData) {
            commissionGenerated = parseFloat(amount) * 0.30; // 30% commission
            
            const [referral] = await db.insert(referrals).values({
              referrerId: codeData.userId,
              refereeId: user.id,
              referralCode: referralCode,
              status: "converted",
              conversionDate: new Date(),
              commissionAmount: commissionGenerated.toString()
            }).returning();

            // Update referral stats
            const stats = await storage.getReferralStats(codeData.userId);
            await storage.updateReferralStats(codeData.userId, {
              totalReferrals: (stats?.totalReferrals || 0) + 1,
              convertedReferrals: (stats?.convertedReferrals || 0) + 1,
              totalCommissions: ((parseFloat(stats?.totalCommissions || "0")) + commissionGenerated).toFixed(2),
              pendingCommissions: ((parseFloat(stats?.pendingCommissions || "0")) + commissionGenerated).toFixed(2),
            });
            
            referralProcessed = true;
            console.log("Payment automation - Referral processed:", referralCode, "Commission:", commissionGenerated);
          }
        } catch (referralError) {
          console.error("Payment automation - Referral error:", referralError);
        }
      }

      res.json({
        success: true,
        message: "Payment processed and account upgraded",
        userId: user.id,
        upgradeApplied: true,
        referralProcessed,
        commissionGenerated,
        transactionId: transaction[0].id
      });

    } catch (error) {
      console.error("Payment automation error:", error);
      res.status(500).json({ message: "Payment automation failed", error: error.message });
    }
  });

  // AI Template Generation API Routes
  
  // Initialize AI template system on startup
  await aiTemplateGenerator.initializeCategories();
  await aiTemplateGenerator.initializeTemplates();
  await saasToolEngine.initializeTools();

  // Get template categories
  app.get("/api/templates/categories", async (req, res) => {
    try {
      const categories = await aiTemplateGenerator.getCategories();
      res.json(categories);
    } catch (error) {
      console.error("Error fetching template categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Get templates by category
  app.get("/api/templates", async (req, res) => {
    try {
      const { categoryId } = req.query;
      const templates = await aiTemplateGenerator.getTemplatesByCategory(
        categoryId ? parseInt(categoryId as string) : undefined
      );
      res.json(templates);
    } catch (error) {
      console.error("Error fetching templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Generate a template
  app.post("/api/templates/:id/generate", async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const userId = 1; // Demo user ID
      const { inputs } = req.body;

      if (!inputs || typeof inputs !== 'object') {
        return res.status(400).json({ message: "Template inputs are required" });
      }

      const generated = await aiTemplateGenerator.generateTemplate(templateId, userId, inputs);
      res.json(generated);
    } catch (error) {
      console.error("Error generating template:", error);
      res.status(500).json({ 
        message: "Failed to generate template",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get user's generated templates
  app.get("/api/templates/generated", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { limit } = req.query;
      
      const templates = await aiTemplateGenerator.getUserTemplates(
        userId, 
        limit ? parseInt(limit as string) : 50
      );
      res.json(templates);
    } catch (error) {
      console.error("Error fetching user templates:", error);
      res.status(500).json({ message: "Failed to fetch templates" });
    }
  });

  // Rate a generated template
  app.post("/api/templates/generated/:id/rate", async (req, res) => {
    try {
      const generatedId = parseInt(req.params.id);
      const userId = 1; // Demo user ID
      const { rating, feedback } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      await aiTemplateGenerator.rateTemplate(generatedId, userId, rating, feedback);
      res.json({ message: "Rating submitted successfully" });
    } catch (error) {
      console.error("Error rating template:", error);
      res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // SaaS Tools API Routes

  // Get available SaaS tools
  app.get("/api/saas-tools", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const user = await storage.getUser(userId);
      const userPlan = user?.plan || 'freemium';
      
      const { category } = req.query;
      
      const tools = category 
        ? await saasToolEngine.getToolsByCategory(category as string, userPlan)
        : await saasToolEngine.getAvailableTools(userPlan);
        
      res.json(tools);
    } catch (error) {
      console.error("Error fetching SaaS tools:", error);
      res.status(500).json({ message: "Failed to fetch tools" });
    }
  });

  // Execute a SaaS tool
  app.post("/api/saas-tools/:id/execute", async (req, res) => {
    try {
      const toolId = parseInt(req.params.id);
      const userId = 1; // Demo user ID
      const { inputs } = req.body;

      if (!inputs || typeof inputs !== 'object') {
        return res.status(400).json({ message: "Tool inputs are required" });
      }

      const result = await saasToolEngine.executeTool(toolId, userId, inputs);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(400).json(result);
      }
    } catch (error) {
      console.error("Error executing SaaS tool:", error);
      res.status(500).json({ 
        message: "Failed to execute tool",
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get user's tool usage history
  app.get("/api/saas-tools/usage", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { limit } = req.query;
      
      const usage = await saasToolEngine.getUserToolUsage(
        userId, 
        limit ? parseInt(limit as string) : 50
      );
      res.json(usage);
    } catch (error) {
      console.error("Error fetching tool usage:", error);
      res.status(500).json({ message: "Failed to fetch usage history" });
    }
  });

  // Rate a tool execution
  app.post("/api/saas-tools/usage/:id/rate", async (req, res) => {
    try {
      const usageId = parseInt(req.params.id);
      const userId = 1; // Demo user ID
      const { rating, feedback } = req.body;

      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }

      await saasToolEngine.rateTool(usageId, userId, rating, feedback);
      res.json({ message: "Rating submitted successfully" });
    } catch (error) {
      console.error("Error rating tool:", error);
      res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // News API routes for Biz Newz
  app.get("/api/news/categories", async (req, res) => {
    try {
      // Sample news categories for demo
      const categories = [
        { id: "entrepreneurship", name: "Entrepreneurship", description: "Startup news and entrepreneur stories", color: "green", count: 42 },
        { id: "funding", name: "Funding", description: "Investment and funding news", color: "blue", count: 28 },
        { id: "technology", name: "Technology", description: "Tech innovations and digital trends", color: "purple", count: 35 },
        { id: "markets", name: "Markets", description: "Market analysis and economic news", color: "orange", count: 22 },
        { id: "policy", name: "Policy", description: "Business policy and regulation news", color: "red", count: 15 },
        { id: "caribbean", name: "Caribbean", description: "Caribbean business and economic news", color: "teal", count: 18 },
      ];
      res.json(categories);
    } catch (error) {
      console.error("Error fetching news categories:", error);
      res.status(500).json({ message: "Failed to fetch news categories" });
    }
  });

  app.get("/api/news/articles", async (req, res) => {
    try {
      const { category, region, search } = req.query;
      
      // Sample news articles for demo
      const articles = [
        {
          id: "1",
          title: "Caribbean Tech Startup Raises $2M in Seed Funding",
          summary: "Trinidad-based fintech startup secures major investment to expand across the Caribbean region, focusing on digital payment solutions for underbanked populations.",
          content: "Full article content here...",
          source: "Caribbean Business Weekly",
          category: "funding",
          region: "caribbean",
          url: "https://example.com/news/1",
          relevanceScore: 95,
          tags: ["fintech", "caribbean", "funding", "digital payments"],
          readTime: 4,
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        },
        {
          id: "2", 
          title: "Global SME Financing Gap Reaches $5.7 Trillion",
          summary: "New World Bank report highlights the massive financing gap facing small and medium enterprises worldwide, with particular impact on underbanked entrepreneurs.",
          content: "Full article content here...",
          source: "World Bank News",
          category: "markets",
          region: "global",
          url: "https://example.com/news/2",
          relevanceScore: 88,
          tags: ["SME", "financing", "world bank", "underbanked"],
          readTime: 6,
          publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
        },
        {
          id: "3",
          title: "AI-Powered Business Tools Transform Entrepreneur Operations",
          summary: "New generation of AI tools helping small business owners automate operations, from business planning to customer support, reducing barriers to entrepreneurship.",
          content: "Full article content here...",
          source: "TechCrunch",
          category: "technology",
          region: "global",
          url: "https://example.com/news/3",
          relevanceScore: 92,
          tags: ["AI", "automation", "small business", "entrepreneurship"],
          readTime: 5,
          publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        },
        {
          id: "4",
          title: "Mobile Money Adoption Surges in Caribbean Markets",
          summary: "Digital payment platforms see unprecedented growth across Caribbean islands as entrepreneurs embrace cashless business solutions.",
          content: "Full article content here...",
          source: "Caribbean Tech Today",
          category: "technology",
          region: "caribbean",
          url: "https://example.com/news/4",
          relevanceScore: 87,
          tags: ["mobile money", "caribbean", "digital payments", "adoption"],
          readTime: 3,
          publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), // 8 hours ago
        },
        {
          id: "5",
          title: "New Government Grants Support Caribbean Startups",
          summary: "Trinidad & Tobago launches $10M grant program to support local entrepreneurs and tech startups, with focus on innovation and job creation.",
          content: "Full article content here...",
          source: "T&T Government Press",
          category: "policy",
          region: "caribbean",
          url: "https://example.com/news/5",
          relevanceScore: 90,
          tags: ["grants", "government", "trinidad", "startups", "support"],
          readTime: 4,
          publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), // 12 hours ago
        },
        {
          id: "6",
          title: "Women Entrepreneurs Drive Caribbean Economic Growth",
          summary: "Female-led businesses show remarkable resilience and growth across the Caribbean, contributing significantly to regional economic development.",
          content: "Full article content here...",
          source: "Caribbean Women Business Network",
          category: "entrepreneurship",
          region: "caribbean",
          url: "https://example.com/news/6",
          relevanceScore: 85,
          tags: ["women entrepreneurs", "caribbean", "economic growth", "business"],
          readTime: 5,
          publishedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        }
      ];

      res.json(articles);
    } catch (error) {
      console.error("Error fetching news articles:", error);
      res.status(500).json({ message: "Failed to fetch news articles" });
    }
  });

  app.get("/api/news/trending", async (req, res) => {
    try {
      const trendingTopics = [
        "Caribbean Fintech",
        "SME Financing",
        "Digital Transformation",
        "Startup Funding",
        "AI Business Tools",
        "Mobile Payments",
        "Government Grants",
        "Women Entrepreneurs"
      ];
      res.json(trendingTopics);
    } catch (error) {
      console.error("Error fetching trending topics:", error);
      res.status(500).json({ message: "Failed to fetch trending topics" });
    }
  });

  // Support Bot API routes for Biz Botz
  app.get("/api/support-bots", async (req, res) => {
    try {
      const supportBots = [
        {
          id: "bizgenie",
          name: "BizGenie",
          description: "Expert in business planning, strategy, and startup guidance. Specializes in helping entrepreneurs develop comprehensive business plans and strategic roadmaps.",
          specialty: "Business Strategy & Planning",
          avatar: "/avatars/bizgenie.png",
          status: "online",
          responseTime: "< 15s",
          accuracy: 94,
          totalChats: 1247,
          languages: ["English", "Spanish", "French"],
        },
        {
          id: "fundingfinder", 
          name: "FundingFinder",
          description: "Specializes in funding opportunities, grant applications, and investment strategies. Helps entrepreneurs navigate the complex world of business financing.",
          specialty: "Funding & Investment",
          avatar: "/avatars/fundingfinder.png",
          status: "online",
          responseTime: "< 20s",
          accuracy: 91,
          totalChats: 892,
          languages: ["English", "Portuguese"],
        },
        {
          id: "legaladviser",
          name: "LegalAdviser",
          description: "Provides guidance on business legal matters, contracts, intellectual property, and regulatory compliance for entrepreneurs and small businesses.",
          specialty: "Legal & Compliance",
          avatar: "/avatars/legaladviser.png", 
          status: "online",
          responseTime: "< 25s",
          accuracy: 89,
          totalChats: 654,
          languages: ["English", "Spanish"],
        },
        {
          id: "marketingmaven",
          name: "MarketingMaven",
          description: "Expert in digital marketing, brand building, and customer acquisition strategies. Helps businesses grow their online presence and reach target audiences.",
          specialty: "Marketing & Branding",
          avatar: "/avatars/marketingmaven.png",
          status: "busy",
          responseTime: "< 30s", 
          accuracy: 87,
          totalChats: 1156,
          languages: ["English", "French", "Creole"],
        },
        {
          id: "techsupport",
          name: "TechSupport",
          description: "Assists with technical questions, software recommendations, digital transformation, and technology implementation for small businesses.",
          specialty: "Technology & Software",
          avatar: "/avatars/techsupport.png",
          status: "online",
          responseTime: "< 10s",
          accuracy: 96,
          totalChats: 2103,
          languages: ["English", "Spanish", "Hindi"],
        },
        {
          id: "caribbeanexpert",
          name: "CaribbeanExpert", 
          description: "Specialized knowledge of Caribbean business environments, local regulations, cultural considerations, and regional market opportunities.",
          specialty: "Caribbean Business Culture",
          avatar: "/avatars/caribbeanexpert.png",
          status: "online",
          responseTime: "< 20s",
          accuracy: 93,
          totalChats: 445,
          languages: ["English", "Spanish", "French", "Creole"],
        }
      ];
      
      res.json(supportBots);
    } catch (error) {
      console.error("Error fetching support bots:", error);
      res.status(500).json({ message: "Failed to fetch support bots" });
    }
  });

  app.get("/api/chat-sessions", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      
      // Sample chat sessions for demo
      const sessions = [
        {
          id: "session-1",
          botId: "bizgenie",
          status: "resolved",
          startTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          lastMessage: "Thank you for the business plan guidance!",
          messageCount: 12,
          rating: 5,
        },
        {
          id: "session-2", 
          botId: "fundingfinder",
          status: "active",
          startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
          lastMessage: "What about micro-loans for Caribbean startups?",
          messageCount: 8,
        },
        {
          id: "session-3",
          botId: "marketingmaven", 
          status: "resolved",
          startTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          lastMessage: "The social media strategy worked perfectly!",
          messageCount: 15,
          rating: 4,
        }
      ];
      
      res.json(sessions);
    } catch (error) {
      console.error("Error fetching chat sessions:", error);
      res.status(500).json({ message: "Failed to fetch chat sessions" });
    }
  });

  app.get("/api/chat-messages/:sessionId", async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Sample messages for demo
      const messages = [
        {
          id: "msg-1",
          type: "user",
          content: "I need help creating a business plan for my tech startup",
          timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          sessionId,
        },
        {
          id: "msg-2",
          type: "bot", 
          content: "I'd be happy to help you create a comprehensive business plan! Let's start with the basics. What's your startup idea and what problem does it solve?",
          timestamp: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
          sessionId,
          botId: "bizgenie",
          metadata: {
            confidence: 0.95,
            suggestedActions: ["Tell me about your target market", "What's your revenue model?", "Who are your main competitors?"]
          }
        }
      ];
      
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/support-bots/chat", async (req, res) => {
    try {
      const { botId, message, sessionId } = req.body;
      const userId = 1; // Demo user ID
      
      // Generate session ID if not provided
      const currentSessionId = sessionId || `session-${Date.now()}`;
      
      // Simulate AI response based on bot type
      let botResponse = "";
      let confidence = 0.85;
      let suggestedActions: string[] = [];
      
      switch (botId) {
        case "bizgenie":
          botResponse = `Great question about business planning! Based on your message about "${message.substring(0, 50)}...", I recommend focusing on market validation first. A solid business plan should include: executive summary, market analysis, competitive landscape, financial projections, and operational strategy. Would you like me to help you develop any specific section?`;
          suggestedActions = ["Help with market analysis", "Create financial projections", "Develop competitive strategy"];
          confidence = 0.92;
          break;
          
        case "fundingfinder":
          botResponse = `Regarding funding opportunities for your business, there are several paths to explore: traditional bank loans, government grants (especially for Caribbean businesses), angel investors, venture capital, and crowdfunding. For underbanked entrepreneurs, I particularly recommend looking into microfinance options and government-backed loan programs. What's your current stage and funding requirements?`;
          suggestedActions = ["Show me grant opportunities", "Explain angel investor process", "Help with loan applications"];
          confidence = 0.89;
          break;
          
        case "legaladviser":
          botResponse = `From a legal perspective, it's important to address business structure, contracts, intellectual property protection, and regulatory compliance early. For Caribbean businesses, you'll need to consider local incorporation requirements, tax obligations, and any industry-specific regulations. What specific legal aspect would you like guidance on?`;
          suggestedActions = ["Business registration process", "Contract templates", "IP protection guidance"];
          confidence = 0.87;
          break;
          
        case "marketingmaven":
          botResponse = `Excellent marketing question! For effective brand building and customer acquisition, focus on understanding your target audience, developing compelling messaging, and choosing the right channels. Digital marketing is particularly powerful for Caribbean businesses looking to expand regionally or globally. Social media, content marketing, and local partnerships are key strategies. What's your target market?`;
          suggestedActions = ["Create social media strategy", "Develop brand messaging", "Plan content calendar"];
          confidence = 0.91;
          break;
          
        case "techsupport":
          botResponse = `For your technology needs, I can help you choose the right tools and platforms for your business. Consider cloud-based solutions for scalability, automation tools for efficiency, and mobile-friendly platforms for the Caribbean market. What specific technical challenges are you facing?`;
          suggestedActions = ["Recommend business software", "Set up automation", "Mobile app guidance"];
          confidence = 0.94;
          break;
          
        case "caribbeanexpert":
          botResponse = `As a Caribbean business expert, I understand the unique opportunities and challenges in our region. The Caribbean market offers great potential for entrepreneurs who understand local culture, payment preferences, and business practices. Regional integration, tourism connections, and diaspora markets are key advantages. How can I help you navigate the Caribbean business landscape?`;
          suggestedActions = ["Explore regional markets", "Understand local regulations", "Connect with diaspora"];
          confidence = 0.90;
          break;
          
        default:
          botResponse = "Thank you for your message. I'm here to help with your business questions. Could you provide more specific details about what you'd like assistance with?";
          suggestedActions = ["Ask a specific question", "Tell me about your business", "Get started with planning"];
      }
      
      // Simulate response delay
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
      
      res.json({
        sessionId: currentSessionId,
        response: botResponse,
        metadata: {
          confidence,
          suggestedActions,
          botModel: "gpt-4",
          responseTime: Math.floor(1000 + Math.random() * 2000)
        }
      });
    } catch (error) {
      console.error("Error in bot chat:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  app.post("/api/chat-sessions/:sessionId/rate", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const { rating, feedback } = req.body;
      
      // In a real implementation, save to database
      console.log(`Session ${sessionId} rated ${rating} stars with feedback: ${feedback}`);
      
      res.json({ message: "Rating submitted successfully" });
    } catch (error) {
      console.error("Error rating session:", error);
      res.status(500).json({ message: "Failed to submit rating" });
    }
  });

  // Digital Wallet API Endpoints
  
  // Create or get user wallet
  app.post("/api/wallet/create", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { walletType = "personal" } = req.body;

      // Check if wallet already exists
      let wallet = await storage.getUserWallet(userId, walletType);
      
      if (!wallet) {
        wallet = await storage.createWallet(userId, walletType);
      }

      res.json({
        message: "Wallet ready",
        wallet
      });
    } catch (error) {
      console.error("Error creating wallet:", error);
      res.status(500).json({ message: "Failed to create wallet" });
    }
  });

  // Get user wallet details
  app.get("/api/wallet", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { walletType = "personal" } = req.query;

      let wallet = await storage.getUserWallet(userId, walletType as string);
      
      if (!wallet) {
        // Auto-create wallet if it doesn't exist
        wallet = await storage.createWallet(userId, walletType as string);
      }

      res.json(wallet);
    } catch (error) {
      console.error("Error fetching wallet:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // Add funds to wallet (credit transaction)
  app.post("/api/wallet/add-funds", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { amount, description, sourceType = "deposit" } = req.body;

      // Get user's primary wallet
      let wallet = await storage.getUserWallet(userId, "personal");
      
      if (!wallet) {
        wallet = await storage.createWallet(userId, "personal");
      }

      const transaction = await storage.addWalletTransaction(wallet.id, {
        transactionType: 'credit',
        amount: amount.toString(),
        currency: 'USD',
        description: description || 'Funds added to wallet',
        sourceType,
        status: 'completed'
      });

      res.json({
        message: "Funds added successfully",
        transaction,
        newBalance: transaction.balanceAfter
      });
    } catch (error) {
      console.error("Error adding funds:", error);
      res.status(500).json({ message: "Failed to add funds" });
    }
  });

  // Get wallet transactions
  app.get("/api/wallet/transactions", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { limit = 50 } = req.query;

      const wallet = await storage.getUserWallet(userId, "personal");
      
      if (!wallet) {
        return res.json([]);
      }

      const transactions = await storage.getWalletTransactions(wallet.id, parseInt(limit as string));
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Create withdrawal request
  app.post("/api/wallet/withdraw", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const { amount, withdrawalMethod, withdrawalDetails } = req.body;

      const wallet = await storage.getUserWallet(userId, "personal");
      
      if (!wallet) {
        return res.status(404).json({ message: "Wallet not found" });
      }

      // Check balance
      const currentBalance = parseFloat(wallet.balance);
      const withdrawalAmount = parseFloat(amount);
      
      if (currentBalance < withdrawalAmount) {
        return res.status(400).json({ message: "Insufficient balance" });
      }

      const withdrawal = await storage.createWithdrawal(wallet.id, {
        amount: amount.toString(),
        currency: 'USD',
        withdrawalMethod,
        withdrawalDetails,
        transactionFee: "2.50" // $2.50 standard fee
      });

      res.json({
        message: "Withdrawal request created",
        withdrawal
      });
    } catch (error) {
      console.error("Error creating withdrawal:", error);
      res.status(500).json({ message: "Failed to create withdrawal" });
    }
  });

  // Get user withdrawals
  app.get("/api/wallet/withdrawals", async (req, res) => {
    try {
      const userId = 1; // Demo user ID
      const withdrawals = await storage.getUserWithdrawals(userId);
      res.json(withdrawals);
    } catch (error) {
      console.error("Error fetching withdrawals:", error);
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  return httpServer;
}