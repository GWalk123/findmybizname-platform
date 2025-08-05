import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar, numeric, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  plan: text("plan").notNull().default("starter"), // starter, core, pro, scale, enterprise
  dailyUsage: integer("daily_usage").notNull().default(0),
  lastUsageReset: timestamp("last_usage_reset").notNull().defaultNow(),
  brandAnalysisUsage: integer("brand_analysis_usage").notNull().default(0),
  nameImprovementUsage: integer("name_improvement_usage").notNull().default(0),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const generatedNames = pgTable("generated_names", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  description: text("description"),
  industry: text("industry"),
  style: text("style"),
  domains: jsonb("domains"), // {com: {available: true, price: 12.99}, io: {available: false}}
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const searchHistory = pgTable("search_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  query: text("query").notNull(),
  description: text("description"),
  industry: text("industry"),
  style: text("style"),
  keywords: text("keywords"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const digitalProducts = pgTable("digital_products", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  price: integer("price").notNull(), // Price in cents
  category: text("category").notNull(), // legal, financial, branding, services
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  fileSize: integer("file_size").notNull(), // Size in bytes
  downloadCount: integer("download_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const digitalProductPurchases = pgTable("digital_product_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  productId: integer("product_id").notNull().references(() => digitalProducts.id),
  purchasePrice: integer("purchase_price").notNull(), // Price paid in cents
  paymentMethod: text("payment_method").notNull(), // paypal, wipay, manual
  paymentId: text("payment_id"), // External payment reference
  downloadCount: integer("download_count").notNull().default(0),
  lastDownloadAt: timestamp("last_download_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
});

export const insertGeneratedNameSchema = createInsertSchema(generatedNames).pick({
  name: true,
  description: true,
  industry: true,
  style: true,
  domains: true,
});

export const insertSearchHistorySchema = createInsertSchema(searchHistory).pick({
  query: true,
  industry: true,
  style: true,
});

export const insertDigitalProductSchema = createInsertSchema(digitalProducts).pick({
  title: true,
  description: true,
  price: true,
  category: true,
  fileName: true,
  filePath: true,
  fileSize: true,
});

export const insertDigitalProductPurchaseSchema = createInsertSchema(digitalProductPurchases).pick({
  productId: true,
  purchasePrice: true,
  paymentMethod: true,
  paymentId: true,
});

export const nameGenerationRequestSchema = z.object({
  description: z.string().optional(),
  specificName: z.string().optional(),
  industry: z.string().optional(),
  style: z.string().optional(),
  checkDomains: z.boolean().default(true),
  checkPremiumDomains: z.boolean().default(false),
  includeSynonyms: z.boolean().default(false),
}).refine(
  (data) => data.description || data.specificName,
  { message: "Either description or specific name is required" }
);

export type User = typeof users.$inferSelect;

// Transaction tracking for payment automation
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  transactionId: varchar("transaction_id").notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentMethod: varchar("payment_method").notNull(), // paypal, paddle, bank_transfer, mobile_money
  subscriptionPlan: varchar("subscription_plan").notNull(),
  referralCode: varchar("referral_code"),
  status: varchar("status").default("completed"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type InsertTransaction = typeof transactions.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type GeneratedName = typeof generatedNames.$inferSelect;
export type InsertGeneratedName = z.infer<typeof insertGeneratedNameSchema>;
export type SearchHistory = typeof searchHistory.$inferSelect;
export type InsertSearchHistory = z.infer<typeof insertSearchHistorySchema>;
export type DigitalProduct = typeof digitalProducts.$inferSelect;
export type InsertDigitalProduct = z.infer<typeof insertDigitalProductSchema>;
export type DigitalProductPurchase = typeof digitalProductPurchases.$inferSelect;
export type InsertDigitalProductPurchase = z.infer<typeof insertDigitalProductPurchaseSchema>;
export type NameGenerationRequest = z.infer<typeof nameGenerationRequestSchema>;

export interface DomainStatus {
  available: boolean;
  price?: number;
  premium?: boolean;
}

interface SocialMediaStatus {
  available: boolean;
  url?: string;
  note?: string;
}

export interface SocialMediaAvailability {
  instagram: SocialMediaStatus;
  twitter: SocialMediaStatus;
  facebook: SocialMediaStatus;
  linkedin: SocialMediaStatus;
  youtube: SocialMediaStatus;
  tiktok: SocialMediaStatus;
}

interface BrandSentiment {
  overall: 'positive' | 'neutral' | 'negative';
  confidence: number;
  emotions: string[];
  culturalNotes: string[];
}

interface PronunciationAnalysis {
  difficulty: 'easy' | 'medium' | 'hard';
  score: number;
  syllables: number;
  phoneticSpelling: string;
  notes: string[];
}

interface SEOAnalysis {
  score: number;
  searchability: 'excellent' | 'good' | 'fair' | 'poor';
  keywordStrength: number;
  brandability: number;
  notes: string[];
}

interface CompetitorAnalysis {
  uniqueness: number;
  marketFit: 'excellent' | 'good' | 'fair' | 'poor';
  similarNames: string[];
  recommendations: string[];
}

export interface BrandAnalysis {
  sentiment: BrandSentiment;
  pronunciation: PronunciationAnalysis;
  seo: SEOAnalysis;
  competitor: CompetitorAnalysis;
  overallScore: number;
}

export interface GeneratedNameWithDomains {
  id: number;
  name: string;
  description?: string | null;
  industry?: string | null;
  style?: string | null;
  domains: Record<string, DomainStatus>;
  socialMedia?: SocialMediaAvailability;
  brandAnalysis?: BrandAnalysis;
  isFavorite: boolean;
  createdAt: Date;
}

// Business Intelligence Tables
export const companyProfiles = pgTable("company_profiles", {
  id: serial("id").primaryKey(),
  cik: varchar("cik", { length: 20 }).unique(), // SEC Central Index Key
  companyNumber: varchar("company_number", { length: 50 }), // UK Companies House number
  name: varchar("name", { length: 200 }).notNull(),
  ticker: varchar("ticker", { length: 10 }),
  country: varchar("country", { length: 2 }).notNull(), // ISO country code
  industry: varchar("industry", { length: 100 }),
  sicCode: varchar("sic_code", { length: 10 }),
  address: text("address"),
  website: varchar("website", { length: 255 }),
  description: text("description"),
  revenue: numeric("revenue", { precision: 15, scale: 2 }),
  employees: integer("employees"),
  foundedYear: integer("founded_year"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  source: varchar("source", { length: 20 }).notNull() // 'SEC', 'COMPANIES_HOUSE', 'STATCAN', etc.
});

export const companySearchHistory = pgTable("company_search_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  searchQuery: varchar("search_query", { length: 200 }).notNull(),
  country: varchar("country", { length: 2 }),
  industry: varchar("industry", { length: 100 }),
  resultsCount: integer("results_count").default(0),
  searchDate: timestamp("search_date").defaultNow()
});

// Business Intelligence Types
export type CompanyProfile = typeof companyProfiles.$inferSelect;
export type InsertCompanyProfile = typeof companyProfiles.$inferInsert;
export type CompanySearchHistory = typeof companySearchHistory.$inferSelect;
export type InsertCompanySearchHistory = typeof companySearchHistory.$inferInsert;

// Company search request schema
export const companySearchRequestSchema = z.object({
  query: z.string().min(1).max(200),
  country: z.string().length(2).optional(),
  industry: z.string().max(100).optional(),
  limit: z.number().min(1).max(100).default(20)
});

export type CompanySearchRequest = z.infer<typeof companySearchRequestSchema>;

// User Feedback Schema
export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  rating: integer("rating").notNull(), // 1-5 stars
  category: varchar("category", { length: 50 }), // 'general', 'features', 'performance', 'support'
  message: text("message"),
  userAgent: text("user_agent"),
  url: varchar("url", { length: 255 }),
  isAnonymous: boolean("is_anonymous").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserFeedbackSchema = createInsertSchema(userFeedback).pick({
  userId: true,
  rating: true,
  category: true,
  message: true,
  userAgent: true,
  url: true,
  isAnonymous: true,
});

export type UserFeedback = typeof userFeedback.$inferSelect;

// Referral system tables
export const referralCodes = pgTable("referral_codes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  code: varchar("code", { length: 50 }).unique().notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referrals = pgTable("referrals", {
  id: serial("id").primaryKey(),
  referrerId: integer("referrer_id").references(() => users.id).notNull(),
  refereeId: integer("referee_id").references(() => users.id).notNull(),
  referralCode: varchar("referral_code", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).default("pending"), // pending, converted, paid
  conversionDate: timestamp("conversion_date"),
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }),
  currency: varchar("currency", { length: 3 }).default("USD"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralPayouts = pgTable("referral_payouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  paymentMethod: varchar("payment_method", { length: 50 }),
  paymentDetails: jsonb("payment_details"), // Email, phone, account details
  status: varchar("status", { length: 20 }).default("pending"), // pending, processed, failed
  transactionId: varchar("transaction_id", { length: 100 }),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const referralStats = pgTable("referral_stats", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  totalReferrals: integer("total_referrals").default(0),
  convertedReferrals: integer("converted_referrals").default(0),
  totalCommissions: decimal("total_commissions", { precision: 10, scale: 2 }).default("0"),
  pendingCommissions: decimal("pending_commissions", { precision: 10, scale: 2 }).default("0"),
  paidCommissions: decimal("paid_commissions", { precision: 10, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  country: varchar("country", { length: 2 }),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Digital Wallet System
export const digitalWallets = pgTable("digital_wallets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  walletAddress: varchar("wallet_address", { length: 100 }).unique().notNull(),
  walletType: varchar("wallet_type", { length: 50 }).notNull(), // personal, business, referral, commission
  balance: decimal("balance", { precision: 15, scale: 2 }).default("0"),
  currency: varchar("currency", { length: 3 }).default("USD"),
  isActive: boolean("is_active").default(true),
  lastTransactionAt: timestamp("last_transaction_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const walletTransactions = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => digitalWallets.id).notNull(),
  transactionType: varchar("transaction_type", { length: 20 }).notNull(), // credit, debit, transfer
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  description: text("description"),
  referenceId: varchar("reference_id", { length: 100 }),
  sourceType: varchar("source_type", { length: 50 }), // referral_commission, purchase, payout, transfer
  sourceId: integer("source_id"), // Reference to referral, purchase, etc.
  status: varchar("status", { length: 20 }).default("completed"), // pending, completed, failed, reversed
  balanceAfter: decimal("balance_after", { precision: 15, scale: 2 }).notNull(),
  metadata: jsonb("metadata"), // Additional transaction details
  createdAt: timestamp("created_at").defaultNow(),
});

export const walletWithdrawals = pgTable("wallet_withdrawals", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => digitalWallets.id).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("USD"),
  withdrawalMethod: varchar("withdrawal_method", { length: 50 }).notNull(), // bank_transfer, paypal, mobile_money, wise
  withdrawalDetails: jsonb("withdrawal_details"), // Account numbers, emails, etc.
  status: varchar("status", { length: 20 }).default("pending"), // pending, processing, completed, failed
  processedAt: timestamp("processed_at"),
  transactionFee: decimal("transaction_fee", { precision: 10, scale: 2 }).default("0"),
  netAmount: decimal("net_amount", { precision: 15, scale: 2 }).notNull(),
  externalTransactionId: varchar("external_transaction_id", { length: 100 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ReferralCode = typeof referralCodes.$inferSelect;
export type InsertReferralCode = typeof referralCodes.$inferInsert;
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = typeof referrals.$inferInsert;
export type ReferralPayout = typeof referralPayouts.$inferSelect;
export type InsertReferralPayout = typeof referralPayouts.$inferInsert;
export type ReferralStats = typeof referralStats.$inferSelect;
export type InsertReferralStats = typeof referralStats.$inferInsert;

// Digital Wallet Types
export type DigitalWallet = typeof digitalWallets.$inferSelect;
export type InsertDigitalWallet = typeof digitalWallets.$inferInsert;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = typeof walletTransactions.$inferInsert;
export type WalletWithdrawal = typeof walletWithdrawals.$inferSelect;
export type InsertWalletWithdrawal = typeof walletWithdrawals.$inferInsert;
export type InsertUserFeedback = z.infer<typeof insertUserFeedbackSchema>;

// User Profile Schema (Enhanced)
export const userProfiles = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  displayName: varchar("display_name", { length: 100 }),
  bio: text("bio"),
  businessName: varchar("business_name", { length: 200 }),
  businessStage: varchar("business_stage", { length: 50 }), // 'idea', 'startup', 'growing', 'established'
  industry: varchar("industry", { length: 100 }),
  location: varchar("location", { length: 100 }),
  website: varchar("website", { length: 255 }),
  linkedinUrl: varchar("linkedin_url", { length: 255 }),
  twitterHandle: varchar("twitter_handle", { length: 50 }),
  instagramHandle: varchar("instagram_handle", { length: 50 }),
  interests: text("interests").array(), // Array of interests
  lookingFor: text("looking_for"), // What they're looking for in the community
  canHelp: text("can_help"), // What they can help others with
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserProfileSchema = createInsertSchema(userProfiles).pick({
  userId: true,
  displayName: true,
  bio: true,
  businessName: true,
  businessStage: true,
  industry: true,
  location: true,
  website: true,
  linkedinUrl: true,
  twitterHandle: true,
  instagramHandle: true,
  interests: true,
  lookingFor: true,
  canHelp: true,
  isPublic: true,
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;

// AI Template Generation System
export const templateCategories = pgTable("template_categories", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  parentId: integer("parent_id"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiTemplates = pgTable("ai_templates", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => templateCategories.id).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  templateType: varchar("template_type", { length: 50 }), // 'document', 'form', 'contract', 'plan'
  aiPrompt: text("ai_prompt").notNull(), // The prompt used to generate content
  outputFormat: varchar("output_format", { length: 20 }).default("markdown"), // 'markdown', 'html', 'docx'
  requiredInputs: jsonb("required_inputs").default("[]"), // Array of required user inputs
  optionalInputs: jsonb("optional_inputs").default("[]"), // Array of optional user inputs
  pricing: integer("pricing").default(0), // Price in cents (0 = free)
  generationCount: integer("generation_count").default(0),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  status: varchar("status", { length: 20 }).default("active"), // active, review, archived
  aiModel: varchar("ai_model", { length: 50 }).default("gpt-4"), // AI model to use
  estimatedTokens: integer("estimated_tokens").default(2000),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const generatedTemplates = pgTable("generated_templates", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => aiTemplates.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  userInputs: jsonb("user_inputs").notNull(), // The inputs provided by user
  generatedContent: text("generated_content").notNull(),
  contentHash: varchar("content_hash", { length: 64 }), // For deduplication
  rating: integer("rating"), // 1-5 user rating
  feedback: text("feedback"),
  tokensUsed: integer("tokens_used"),
  generationTime: integer("generation_time"), // milliseconds
  downloadCount: integer("download_count").default(0),
  isPublic: boolean("is_public").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const templateGenerationQueue = pgTable("template_generation_queue", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").references(() => aiTemplates.id).notNull(),
  userId: integer("user_id").references(() => users.id),
  userInputs: jsonb("user_inputs").notNull(),
  status: varchar("status", { length: 20 }).default("pending"), // pending, generating, completed, failed, review
  priority: integer("priority").default(5), // 1-10, higher = more priority
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  assignedWorker: varchar("assigned_worker", { length: 50 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// SaaS Tools Schema
export const saasTools = pgTable("saas_tools", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  description: text("description"),
  category: varchar("category", { length: 50 }), // 'crm', 'invoicing', 'analytics', 'automation'
  toolType: varchar("tool_type", { length: 50 }), // 'generator', 'analyzer', 'tracker', 'planner'
  requiredPlan: varchar("required_plan", { length: 20 }).default("starter"),
  aiPrompt: text("ai_prompt"),
  configSchema: jsonb("config_schema").default("{}"), // JSON schema for tool configuration
  outputSchema: jsonb("output_schema").default("{}"), // Expected output structure
  isActive: boolean("is_active").default(true),
  usageCount: integer("usage_count").default(0),
  averageRating: decimal("average_rating", { precision: 3, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const saasToolUsage = pgTable("saas_tool_usage", {
  id: serial("id").primaryKey(),
  toolId: integer("tool_id").references(() => saasTools.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  inputs: jsonb("inputs").notNull(),
  outputs: jsonb("outputs"),
  executionTime: integer("execution_time"), // milliseconds
  tokensUsed: integer("tokens_used"),
  rating: integer("rating"), // 1-5
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admin Review Queue
export const adminReviewQueue = pgTable("admin_review_queue", {
  id: serial("id").primaryKey(),
  itemType: varchar("item_type", { length: 50 }).notNull(), // 'template', 'tool_output', 'user_feedback'
  itemId: integer("item_id").notNull(),
  priority: varchar("priority", { length: 20 }).default("normal"), // low, normal, high, urgent
  status: varchar("status", { length: 20 }).default("pending"), // pending, reviewing, approved, rejected
  reviewNotes: text("review_notes"),
  autoApprove: boolean("auto_approve").default(false),
  reviewedBy: varchar("reviewed_by", { length: 100 }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Updated user plan limits
export const planLimits = pgTable("plan_limits", {
  id: serial("id").primaryKey(),
  plan: varchar("plan", { length: 20 }).notNull().unique(),
  nameGenerations: integer("name_generations").default(-1), // -1 = unlimited
  templateGenerations: integer("template_generations").default(-1),
  saasToolUsage: integer("saas_tool_usage").default(-1),
  aiModelAccess: text("ai_model_access").array().default(['gpt-3.5-turbo']).notNull(),
  premiumFeatures: text("premium_features").array().default([]).notNull(),
  monthlyPrice: integer("monthly_price").default(0), // in cents
  yearlyPrice: integer("yearly_price").default(0), // in cents
  isActive: boolean("is_active").default(true),
});

// Insert schemas for new tables
export const insertTemplateCategorySchema = createInsertSchema(templateCategories).pick({
  name: true,
  description: true,
  icon: true,
  parentId: true,
  sortOrder: true,
});

export const insertAiTemplateSchema = createInsertSchema(aiTemplates).pick({
  categoryId: true,
  title: true,
  description: true,
  templateType: true,
  aiPrompt: true,
  outputFormat: true,
  requiredInputs: true,
  optionalInputs: true,
  pricing: true,
  aiModel: true,
  estimatedTokens: true,
});

export const insertGeneratedTemplateSchema = createInsertSchema(generatedTemplates).pick({
  templateId: true,
  userId: true,
  userInputs: true,
  generatedContent: true,
  rating: true,
  feedback: true,
});

export const insertSaasToolSchema = createInsertSchema(saasTools).pick({
  name: true,
  description: true,
  category: true,
  toolType: true,
  requiredPlan: true,
  aiPrompt: true,
  configSchema: true,
  outputSchema: true,
});

// Type exports
export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = z.infer<typeof insertTemplateCategorySchema>;
export type AiTemplate = typeof aiTemplates.$inferSelect;
export type InsertAiTemplate = z.infer<typeof insertAiTemplateSchema>;
export type GeneratedTemplate = typeof generatedTemplates.$inferSelect;
export type InsertGeneratedTemplate = z.infer<typeof insertGeneratedTemplateSchema>;
export type TemplateGenerationQueue = typeof templateGenerationQueue.$inferSelect;
export type SaasTool = typeof saasTools.$inferSelect;
export type InsertSaasTool = z.infer<typeof insertSaasToolSchema>;
export type SaasToolUsage = typeof saasToolUsage.$inferSelect;
export type AdminReviewQueue = typeof adminReviewQueue.$inferSelect;
export type PlanLimits = typeof planLimits.$inferSelect;

// News Articles for Biz Newz
export const newsArticles = pgTable("news_articles", {
  id: varchar("id").primaryKey(),
  title: varchar("title", { length: 500 }).notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  source: varchar("source", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  region: varchar("region", { length: 100 }).notNull().default("global"),
  url: varchar("url", { length: 1000 }).notNull(),
  relevanceScore: integer("relevance_score").default(50),
  tags: text("tags").array().default([]).notNull(),
  readTime: integer("read_time").default(5), // minutes
  publishedAt: timestamp("published_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const newsCategories = pgTable("news_categories", {
  id: varchar("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("gray"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  articleCount: integer("article_count").default(0),
});

// Support Bots for Biz Botz
export const supportBots = pgTable("support_bots", {
  id: varchar("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  specialty: varchar("specialty", { length: 200 }).notNull(),
  avatar: varchar("avatar", { length: 500 }),
  status: varchar("status", { length: 20 }).default("online"), // online, busy, offline
  responseTime: varchar("response_time", { length: 50 }).default("< 30s"),
  accuracy: integer("accuracy").default(85), // percentage
  totalChats: integer("total_chats").default(0),
  languages: text("languages").array().default(["English"]).notNull(),
  aiModel: varchar("ai_model", { length: 100 }).default("gpt-3.5-turbo"),
  systemPrompt: text("system_prompt").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatSessions = pgTable("chat_sessions", {
  id: varchar("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  botId: varchar("bot_id").references(() => supportBots.id).notNull(),
  status: varchar("status", { length: 20 }).default("active"), // active, resolved, escalated
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  messageCount: integer("message_count").default(0),
  lastMessage: text("last_message"),
  rating: integer("rating"), // 1-5 stars
  feedback: text("feedback"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey(),
  sessionId: varchar("session_id").references(() => chatSessions.id).notNull(),
  type: varchar("type", { length: 10 }).notNull(), // user, bot
  content: text("content").notNull(),
  metadata: jsonb("metadata"), // confidence, sources, suggested actions
  timestamp: timestamp("timestamp").defaultNow(),
});

// Type exports for new tables
export type NewsArticle = typeof newsArticles.$inferSelect;
export type NewsCategory = typeof newsCategories.$inferSelect;
export type SupportBot = typeof supportBots.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
