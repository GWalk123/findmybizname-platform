import { 
  users, 
  generatedNames, 
  searchHistory, 
  digitalProducts,
  digitalProductPurchases,
  userProfiles,
  userFeedback,
  referralCodes,
  referrals,
  referralPayouts,
  referralStats,
  transactions,
  digitalWallets,
  walletTransactions,
  walletWithdrawals,
  type User, 
  type InsertUser, 
  type GeneratedName, 
  type InsertGeneratedName, 
  type SearchHistory, 
  type InsertSearchHistory, 
  type GeneratedNameWithDomains,
  type DigitalProduct,
  type InsertDigitalProduct,
  type DigitalProductPurchase,
  type InsertDigitalProductPurchase,
  type UserProfile,
  type InsertUserProfile,
  type UserFeedback,
  type InsertUserFeedback,
  type ReferralCode,
  type InsertReferralCode,
  type Referral,
  type InsertReferral,
  type ReferralPayout,
  type InsertReferralPayout,
  type ReferralStats,
  type InsertReferralStats,
  type Transaction,
  type InsertTransaction,
  type DigitalWallet,
  type InsertDigitalWallet,
  type WalletTransaction,
  type InsertWalletTransaction,
  type WalletWithdrawal,
  type InsertWalletWithdrawal
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";

export interface IStorage {
  // User management
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserUsage(userId: number, usage: number): Promise<void>;
  resetDailyUsage(userId: number): Promise<void>;
  updatePremiumFeatureUsage(userId: number, feature: 'brandAnalysis' | 'nameImprovement'): Promise<void>;
  updateStripeCustomerId(userId: number, customerId: string): Promise<User>;
  updateUserStripeInfo(userId: number, customerId: string, subscriptionId: string): Promise<User>;
  
  // Generated names
  createGeneratedName(userId: number, name: InsertGeneratedName): Promise<GeneratedName>;
  getUserGeneratedNames(userId: number, limit?: number): Promise<GeneratedNameWithDomains[]>;
  toggleFavorite(userId: number, nameId: number): Promise<void>;
  getUserFavorites(userId: number): Promise<GeneratedNameWithDomains[]>;
  
  // Search history
  addSearchHistory(userId: number, search: InsertSearchHistory): Promise<SearchHistory>;
  getUserSearchHistory(userId: number, limit?: number): Promise<SearchHistory[]>;
  
  // Digital products
  getAllDigitalProducts(): Promise<DigitalProduct[]>;
  getDigitalProduct(id: number): Promise<DigitalProduct | undefined>;
  createDigitalProduct(product: InsertDigitalProduct): Promise<DigitalProduct>;
  updateDigitalProduct(id: number, updates: Partial<InsertDigitalProduct>): Promise<DigitalProduct>;
  
  // Digital product purchases
  createPurchase(userId: number, purchase: InsertDigitalProductPurchase): Promise<DigitalProductPurchase>;
  getUserPurchases(userId: number): Promise<DigitalProductPurchase[]>;
  getPurchase(userId: number, productId: number): Promise<DigitalProductPurchase | undefined>;
  incrementDownloadCount(purchaseId: number): Promise<void>;
  
  // User profiles
  createUserProfile(profile: InsertUserProfile): Promise<UserProfile>;
  getUserProfile(userId: number): Promise<UserProfile | undefined>;
  updateUserProfile(userId: number, updates: Partial<InsertUserProfile>): Promise<UserProfile>;
  
  // User feedback
  createUserFeedback(feedback: InsertUserFeedback): Promise<UserFeedback>;
  getUserFeedback(userId: number): Promise<UserFeedback[]>;
  getAllFeedback(limit?: number): Promise<UserFeedback[]>;
  
  // Referral system
  createReferralCode(userId: number): Promise<ReferralCode>;
  getReferralCode(userId: number): Promise<ReferralCode | undefined>;
  getReferralCodeByCode(code: string): Promise<ReferralCode | undefined>;
  createReferral(referral: InsertReferral): Promise<Referral>;
  getReferralsByUser(userId: number): Promise<Referral[]>;
  updateReferralStatus(referralId: number, status: string, conversionDate?: Date, commissionAmount?: number): Promise<void>;
  getReferralStats(userId: number): Promise<ReferralStats | undefined>;
  updateReferralStats(userId: number, stats: Partial<InsertReferralStats>): Promise<ReferralStats>;
  createPayout(payout: InsertReferralPayout): Promise<ReferralPayout>;
  getUserPayouts(userId: number): Promise<ReferralPayout[]>;

  // Digital Wallet methods
  createWallet(userId: number, walletType: string): Promise<DigitalWallet>;
  getUserWallet(userId: number, walletType?: string): Promise<DigitalWallet | undefined>;
  getWalletBalance(walletId: number): Promise<string>;
  addWalletTransaction(walletId: number, transaction: Omit<InsertWalletTransaction, 'walletId' | 'balanceAfter'>): Promise<WalletTransaction>;
  getWalletTransactions(walletId: number, limit?: number): Promise<WalletTransaction[]>;
  createWithdrawal(walletId: number, withdrawal: Omit<InsertWalletWithdrawal, 'walletId' | 'netAmount'>): Promise<WalletWithdrawal>;
  getUserWithdrawals(userId: number): Promise<WalletWithdrawal[]>;
  updateWalletBalance(walletId: number, amount: string, transactionType: 'credit' | 'debit'): Promise<DigitalWallet>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private generatedNames: Map<number, GeneratedName>;
  private searchHistory: Map<number, SearchHistory>;
  private digitalProducts: Map<number, DigitalProduct>;
  private digitalProductPurchases: Map<number, DigitalProductPurchase>;
  private userProfiles: Map<number, UserProfile>;
  private userFeedback: Map<number, UserFeedback>;
  private referralCodes: Map<number, ReferralCode>;
  private referrals: Map<number, Referral>;
  private referralPayouts: Map<number, ReferralPayout>;
  private referralStats: Map<number, ReferralStats>;
  private currentUserId: number;
  private currentNameId: number;
  private currentSearchId: number;
  private currentProductId: number;
  private currentPurchaseId: number;
  private currentProfileId: number;
  private currentFeedbackId: number;
  private currentReferralCodeId: number;
  private currentReferralId: number;
  private currentPayoutId: number;
  private currentStatsId: number;

  constructor() {
    this.users = new Map();
    this.generatedNames = new Map();
    this.searchHistory = new Map();
    this.digitalProducts = new Map();
    this.digitalProductPurchases = new Map();
    this.userProfiles = new Map();
    this.userFeedback = new Map();
    this.referralCodes = new Map();
    this.referrals = new Map();
    this.referralPayouts = new Map();
    this.referralStats = new Map();
    this.currentUserId = 1;
    this.currentNameId = 1;
    this.currentSearchId = 1;
    this.currentProductId = 1;
    this.currentPurchaseId = 1;
    this.currentProfileId = 1;
    this.currentFeedbackId = 1;
    this.currentReferralCodeId = 1;
    this.currentReferralId = 1;
    this.currentPayoutId = 1;
    this.currentStatsId = 1;
    
    this.initializeData();

  }

  private initializeData() {
    // Create a default user for demo purposes with Free plan for freemium testing
    const demoUser: User = {
      id: 1,
      username: "demo_user", 
      email: "demo@example.com",
      plan: "core", // Free plan to test freemium limits
      dailyUsage: 0,
      lastUsageReset: new Date(),
      brandAnalysisUsage: 0,
      nameImprovementUsage: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
    };
    this.users.set(1, demoUser);
    this.currentUserId = 2; // Next user will get ID 2

    // Create permanent demo profile for MrBizWhiz
    const demoProfile: UserProfile = {
      id: 1,
      userId: 1,
      displayName: "MrBizWhiz",
      bio: "Caribbean entrepreneur passionate about business naming and digital innovation",
      businessName: "BizWhiz Consulting",
      businessStage: "growing",
      industry: "Consulting",
      location: "Trinidad & Tobago",
      website: "",
      linkedinUrl: "",
      twitterHandle: "",
      instagramHandle: "",
      interests: ["Networking", "Caribbean Markets", "Digital Marketing", "Innovation"],
      lookingFor: "Partnership opportunities and funding connections",
      canHelp: "Business naming strategies and market validation",
      isPublic: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userProfiles.set(1, demoProfile);

    // Create sample digital products
    this.createSampleProducts();
  }

  private createSampleProducts() {
    // Legal Document Templates Bundle
    this.createDigitalProduct({
      title: "Caribbean Legal Document Templates Bundle",
      description: "Complete collection of business legal documents customized for Caribbean markets. Includes Privacy Policies, Terms & Conditions, NDAs, and Independent Contractor agreements with mobile money integration.",
      price: 10000, // $100.00 in cents
      category: "legal",
      fileName: "caribbean-legal-templates.zip",
      filePath: "/products/legal-templates.zip",
      fileSize: 2048000, // 2MB
    });

    // Financial Tracking Spreadsheets
    this.createDigitalProduct({
      title: "Caribbean Business Financial Tracker",
      description: "Professional Excel and Google Sheets templates for tracking income, expenses, and cash flow with Caribbean currency support and mobile money integration.",
      price: 2500, // $25.00 in cents
      category: "financial",
      fileName: "caribbean-financial-tracker.xlsx",
      filePath: "/products/financial-tracker.xlsx",
      fileSize: 512000, // 512KB
    });

    // Brand Color Psychology Guide
    this.createDigitalProduct({
      title: "Caribbean Brand Color Psychology Guide",
      description: "Comprehensive color psychology guide with Caribbean cultural insights, helping businesses choose colors that resonate with local and international markets.",
      price: 3500, // $35.00 in cents
      category: "branding",
      fileName: "caribbean-brand-color-guide.pdf",
      filePath: "/products/brand-color-guide.pdf",
      fileSize: 5120000, // 5MB
    });

    // Language Translation Service
    this.createDigitalProduct({
      title: "Multi-Language Business Document Translation Service",
      description: "Professional translation of your business documents into 15+ languages including Spanish, French, Portuguese, Mandarin, Hindi, Arabic, and major Caribbean Creole languages. Perfect for global market expansion and reaching diverse customer bases.",
      price: 1500, // $15.00 in cents
      category: "services",
      fileName: "translation-service-voucher.pdf",
      filePath: "/products/translation-service.pdf",
      fileSize: 256000, // 256KB
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      plan: "free",
      dailyUsage: 0,
      lastUsageReset: new Date(),
      brandAnalysisUsage: 0,
      nameImprovementUsage: 0,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateStripeCustomerId(userId: number, customerId: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.stripeCustomerId = customerId;
    this.users.set(userId, user);
    return user;
  }

  async updateUserStripeInfo(userId: number, customerId: string, subscriptionId: string): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error("User not found");
    }
    user.stripeCustomerId = customerId;
    user.stripeSubscriptionId = subscriptionId;
    user.plan = "premium";
    this.users.set(userId, user);
    return user;
  }

  async updateUserUsage(userId: number, usage: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      const now = new Date();
      const lastReset = new Date(user.lastUsageReset);
      
      // Reset daily usage if it's a new day
      if (now.getDate() !== lastReset.getDate() || 
          now.getMonth() !== lastReset.getMonth() || 
          now.getFullYear() !== lastReset.getFullYear()) {
        user.dailyUsage = 0;
        user.lastUsageReset = now;
      }
      
      user.dailyUsage = usage;
      this.users.set(userId, user);
    }
  }

  async resetDailyUsage(userId: number): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.dailyUsage = 0;
      user.lastUsageReset = new Date();
      this.users.set(userId, user);
    }
  }

  async updatePremiumFeatureUsage(userId: number, feature: 'brandAnalysis' | 'nameImprovement'): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      if (feature === 'brandAnalysis') {
        user.brandAnalysisUsage++;
      } else if (feature === 'nameImprovement') {
        user.nameImprovementUsage++;
      }
      this.users.set(userId, user);
    }
  }

  async createGeneratedName(userId: number, insertName: InsertGeneratedName): Promise<GeneratedName> {
    const id = this.currentNameId++;
    const generatedName: GeneratedName = {
      ...insertName,
      id,
      userId,
      description: insertName.description || null,
      industry: insertName.industry || null,
      style: insertName.style || null,
      domains: insertName.domains || {},
      isFavorite: false,
      createdAt: new Date(),
    };
    this.generatedNames.set(id, generatedName);
    return generatedName;
  }

  async getUserGeneratedNames(userId: number, limit = 50): Promise<GeneratedNameWithDomains[]> {
    const userNames = Array.from(this.generatedNames.values())
      .filter(name => name.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return userNames.map(name => ({
      ...name,
      domains: (name.domains as Record<string, any>) || {}
    }));
  }

  async toggleFavorite(userId: number, nameId: number): Promise<void> {
    const generatedName = this.generatedNames.get(nameId);
    if (generatedName && generatedName.userId === userId) {
      generatedName.isFavorite = !generatedName.isFavorite;
      this.generatedNames.set(nameId, generatedName);
    }
  }

  async getUserFavorites(userId: number): Promise<GeneratedNameWithDomains[]> {
    const favorites = Array.from(this.generatedNames.values())
      .filter(name => name.userId === userId && name.isFavorite)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return favorites.map(name => ({
      ...name,
      domains: (name.domains as Record<string, any>) || {}
    }));
  }

  async addSearchHistory(userId: number, insertSearch: InsertSearchHistory): Promise<SearchHistory> {
    const id = this.currentSearchId++;
    const search: SearchHistory = {
      id,
      userId,
      query: insertSearch.query,
      description: null,
      industry: insertSearch.industry || null,
      style: insertSearch.style || null,
      keywords: null,
      createdAt: new Date(),
    };
    this.searchHistory.set(id, search);
    return search;
  }

  async getUserSearchHistory(userId: number, limit = 10): Promise<SearchHistory[]> {
    return Array.from(this.searchHistory.values())
      .filter(search => search.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Digital Products methods
  async getAllDigitalProducts(): Promise<DigitalProduct[]> {
    return Array.from(this.digitalProducts.values())
      .filter(product => product.isActive)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async getDigitalProduct(id: number): Promise<DigitalProduct | undefined> {
    return this.digitalProducts.get(id);
  }

  async createDigitalProduct(insertProduct: InsertDigitalProduct): Promise<DigitalProduct> {
    const id = this.currentProductId++;
    const product: DigitalProduct = {
      id,
      ...insertProduct,
      downloadCount: 0,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.digitalProducts.set(id, product);
    return product;
  }

  async updateDigitalProduct(id: number, updates: Partial<InsertDigitalProduct>): Promise<DigitalProduct> {
    const existing = this.digitalProducts.get(id);
    if (!existing) {
      throw new Error(`Product with id ${id} not found`);
    }
    const updated: DigitalProduct = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.digitalProducts.set(id, updated);
    return updated;
  }

  // Digital Product Purchases methods
  async createPurchase(userId: number, insertPurchase: InsertDigitalProductPurchase): Promise<DigitalProductPurchase> {
    const id = this.currentPurchaseId++;
    const purchase: DigitalProductPurchase = {
      id,
      userId,
      productId: insertPurchase.productId || 0,
      purchasePrice: insertPurchase.purchasePrice,
      paymentMethod: insertPurchase.paymentMethod,
      paymentId: insertPurchase.paymentId || null,
      downloadCount: 0,
      lastDownloadAt: null,
      createdAt: new Date(),
    };
    this.digitalProductPurchases.set(id, purchase);
    return purchase;
  }

  async getUserPurchases(userId: number): Promise<DigitalProductPurchase[]> {
    return Array.from(this.digitalProductPurchases.values())
      .filter(purchase => purchase.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getPurchase(userId: number, productId: number): Promise<DigitalProductPurchase | undefined> {
    return Array.from(this.digitalProductPurchases.values())
      .find(purchase => purchase.userId === userId && purchase.productId === productId);
  }

  async incrementDownloadCount(purchaseId: number): Promise<void> {
    const purchase = this.digitalProductPurchases.get(purchaseId);
    if (purchase) {
      purchase.downloadCount++;
      purchase.lastDownloadAt = new Date();
      this.digitalProductPurchases.set(purchaseId, purchase);
    }
  }

  // User Profile methods
  async createUserProfile(insertProfile: InsertUserProfile): Promise<UserProfile> {
    const profile: UserProfile = {
      id: this.currentProfileId++,
      ...insertProfile,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.userProfiles.set(profile.id, profile);
    return profile;
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    return Array.from(this.userProfiles.values()).find(profile => profile.userId === userId);
  }

  async updateUserProfile(userId: number, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
    const existing = await this.getUserProfile(userId);
    if (!existing) {
      throw new Error('Profile not found');
    }
    
    const updated: UserProfile = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.userProfiles.set(existing.id, updated);
    return updated;
  }

  // User Feedback methods
  async createUserFeedback(insertFeedback: InsertUserFeedback): Promise<UserFeedback> {
    const feedback: UserFeedback = {
      id: this.currentFeedbackId++,
      ...insertFeedback,
      createdAt: new Date(),
    };
    this.userFeedback.set(feedback.id, feedback);
    return feedback;
  }

  async getUserFeedback(userId: number): Promise<UserFeedback[]> {
    return Array.from(this.userFeedback.values())
      .filter(feedback => feedback.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getAllFeedback(limit = 100): Promise<UserFeedback[]> {
    return Array.from(this.userFeedback.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  // Referral system methods
  async createReferralCode(userId: number): Promise<ReferralCode> {
    const code = `REF${userId}${Date.now().toString(36).toUpperCase()}`;
    const referralCode: ReferralCode = {
      id: this.currentReferralCodeId++,
      userId,
      code,
      isActive: true,
      createdAt: new Date(),
    };
    this.referralCodes.set(referralCode.id, referralCode);
    return referralCode;
  }

  async getReferralCode(userId: number): Promise<ReferralCode | undefined> {
    return Array.from(this.referralCodes.values()).find(rc => rc.userId === userId && rc.isActive);
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    return Array.from(this.referralCodes.values()).find(rc => rc.code === code && rc.isActive);
  }

  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const referral: Referral = {
      id: this.currentReferralId++,
      ...insertReferral,
      createdAt: new Date(),
    };
    this.referrals.set(referral.id, referral);
    return referral;
  }

  async getReferralsByUser(userId: number): Promise<Referral[]> {
    return Array.from(this.referrals.values()).filter(r => r.referrerId === userId);
  }

  async updateReferralStatus(referralId: number, status: string, conversionDate?: Date, commissionAmount?: number): Promise<void> {
    const referral = this.referrals.get(referralId);
    if (referral) {
      referral.status = status;
      if (conversionDate) referral.conversionDate = conversionDate;
      if (commissionAmount) referral.commissionAmount = commissionAmount.toString();
    }
  }

  async getReferralStats(userId: number): Promise<ReferralStats | undefined> {
    return Array.from(this.referralStats.values()).find(rs => rs.userId === userId);
  }

  async updateReferralStats(userId: number, updates: Partial<InsertReferralStats>): Promise<ReferralStats> {
    let stats = Array.from(this.referralStats.values()).find(rs => rs.userId === userId);
    
    if (!stats) {
      stats = {
        id: this.currentStatsId++,
        userId,
        totalReferrals: 0,
        convertedReferrals: 0,
        totalCommissions: "0",
        pendingCommissions: "0",
        paidCommissions: "0",
        currency: "USD",
        country: null,
        updatedAt: new Date(),
        ...updates,
      };
      this.referralStats.set(stats.id, stats);
    } else {
      Object.assign(stats, updates);
      stats.updatedAt = new Date();
    }
    
    return stats;
  }

  async createPayout(insertPayout: InsertReferralPayout): Promise<ReferralPayout> {
    const payout: ReferralPayout = {
      id: this.currentPayoutId++,
      ...insertPayout,
      createdAt: new Date(),
    };
    this.referralPayouts.set(payout.id, payout);
    return payout;
  }

  async getUserPayouts(userId: number): Promise<ReferralPayout[]> {
    return Array.from(this.referralPayouts.values()).filter(p => p.userId === userId);
  }
}

// Database Storage Implementation
export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserUsage(userId: number, usage: number): Promise<void> {
    await db
      .update(users)
      .set({ dailyUsage: usage })
      .where(eq(users.id, userId));
  }

  async resetDailyUsage(userId: number): Promise<void> {
    await db
      .update(users)
      .set({ 
        dailyUsage: 0,
        lastUsageReset: new Date()
      })
      .where(eq(users.id, userId));
  }

  async updatePremiumFeatureUsage(userId: number, feature: 'brandAnalysis' | 'nameImprovement'): Promise<void> {
    const field = feature === 'brandAnalysis' ? 'brandAnalysisUsage' : 'nameImprovementUsage';
    await db
      .update(users)
      .set({ [field]: sql`${users[field]} + 1` })
      .where(eq(users.id, userId));
  }

  async updateStripeCustomerId(userId: number, customerId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async updateUserStripeInfo(userId: number, customerId: string, subscriptionId: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ 
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId 
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async createGeneratedName(userId: number, insertName: InsertGeneratedName): Promise<GeneratedName> {
    const [generatedName] = await db
      .insert(generatedNames)
      .values({ ...insertName, userId })
      .returning();
    return generatedName;
  }

  async getUserGeneratedNames(userId: number, limit = 50): Promise<GeneratedNameWithDomains[]> {
    const names = await db
      .select()
      .from(generatedNames)
      .where(eq(generatedNames.userId, userId))
      .orderBy(desc(generatedNames.createdAt))
      .limit(limit);
    return names;
  }

  async toggleFavorite(userId: number, nameId: number): Promise<void> {
    const [name] = await db
      .select({ isFavorite: generatedNames.isFavorite })
      .from(generatedNames)
      .where(and(eq(generatedNames.id, nameId), eq(generatedNames.userId, userId)));
    
    if (name) {
      await db
        .update(generatedNames)
        .set({ isFavorite: !name.isFavorite })
        .where(eq(generatedNames.id, nameId));
    }
  }

  async getUserFavorites(userId: number): Promise<GeneratedNameWithDomains[]> {
    const favorites = await db
      .select()
      .from(generatedNames)
      .where(and(eq(generatedNames.userId, userId), eq(generatedNames.isFavorite, true)))
      .orderBy(desc(generatedNames.createdAt));
    return favorites;
  }

  async addSearchHistory(userId: number, insertSearch: InsertSearchHistory): Promise<SearchHistory> {
    const [search] = await db
      .insert(searchHistory)
      .values({ ...insertSearch, userId })
      .returning();
    return search;
  }

  async getUserSearchHistory(userId: number, limit = 10): Promise<SearchHistory[]> {
    const history = await db
      .select()
      .from(searchHistory)
      .where(eq(searchHistory.userId, userId))
      .orderBy(desc(searchHistory.createdAt))
      .limit(limit);
    return history;
  }

  async getAllDigitalProducts(): Promise<DigitalProduct[]> {
    return await db.select().from(digitalProducts);
  }

  async getDigitalProduct(id: number): Promise<DigitalProduct | undefined> {
    const [product] = await db.select().from(digitalProducts).where(eq(digitalProducts.id, id));
    return product || undefined;
  }

  async createDigitalProduct(insertProduct: InsertDigitalProduct): Promise<DigitalProduct> {
    const [product] = await db
      .insert(digitalProducts)
      .values(insertProduct)
      .returning();
    return product;
  }

  async updateDigitalProduct(id: number, updates: Partial<InsertDigitalProduct>): Promise<DigitalProduct> {
    const [product] = await db
      .update(digitalProducts)
      .set(updates)
      .where(eq(digitalProducts.id, id))
      .returning();
    return product;
  }

  async createPurchase(userId: number, insertPurchase: InsertDigitalProductPurchase): Promise<DigitalProductPurchase> {
    const [purchase] = await db
      .insert(digitalProductPurchases)
      .values({ ...insertPurchase, userId })
      .returning();
    return purchase;
  }

  async getUserPurchases(userId: number): Promise<DigitalProductPurchase[]> {
    return await db
      .select()
      .from(digitalProductPurchases)
      .where(eq(digitalProductPurchases.userId, userId))
      .orderBy(desc(digitalProductPurchases.createdAt));
  }

  async getPurchase(userId: number, productId: number): Promise<DigitalProductPurchase | undefined> {
    const [purchase] = await db
      .select()
      .from(digitalProductPurchases)
      .where(and(
        eq(digitalProductPurchases.userId, userId),
        eq(digitalProductPurchases.productId, productId)
      ));
    return purchase || undefined;
  }

  async incrementDownloadCount(purchaseId: number): Promise<void> {
    await db
      .update(digitalProductPurchases)
      .set({ downloadCount: sql`${digitalProductPurchases.downloadCount} + 1` })
      .where(eq(digitalProductPurchases.id, purchaseId));
  }

  async createUserProfile(insertProfile: InsertUserProfile): Promise<UserProfile> {
    const [profile] = await db
      .insert(userProfiles)
      .values(insertProfile)
      .returning();
    return profile;
  }

  async getUserProfile(userId: number): Promise<UserProfile | undefined> {
    const [profile] = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    return profile || undefined;
  }

  async updateUserProfile(userId: number, updates: Partial<InsertUserProfile>): Promise<UserProfile> {
    const [profile] = await db
      .update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.userId, userId))
      .returning();
    return profile;
  }

  async createUserFeedback(insertFeedback: InsertUserFeedback): Promise<UserFeedback> {
    const [feedback] = await db
      .insert(userFeedback)
      .values(insertFeedback)
      .returning();
    return feedback;
  }

  async getUserFeedback(userId: number): Promise<UserFeedback[]> {
    return await db
      .select()
      .from(userFeedback)
      .where(eq(userFeedback.userId, userId))
      .orderBy(desc(userFeedback.createdAt));
  }

  async getAllFeedback(limit = 100): Promise<UserFeedback[]> {
    return await db
      .select()
      .from(userFeedback)
      .orderBy(desc(userFeedback.createdAt))
      .limit(limit);
  }

  // Referral System Methods
  async createReferralCode(userId: number): Promise<ReferralCode> {
    // Check if user already has a referral code
    const [existing] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId));
    
    if (existing) {
      return existing;
    }

    // Generate unique code
    const code = `REF${userId}${Date.now().toString(36).toUpperCase()}`;
    
    const [referralCode] = await db
      .insert(referralCodes)
      .values({
        userId,
        code,
        isActive: true
      })
      .returning();
    return referralCode;
  }

  async getReferralCode(userId: number): Promise<ReferralCode | undefined> {
    const [code] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId));
    return code || undefined;
  }

  async getReferralCodeByCode(code: string): Promise<ReferralCode | undefined> {
    const [referralCode] = await db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.code, code));
    return referralCode || undefined;
  }

  async createReferral(insertReferral: InsertReferral): Promise<Referral> {
    const [referral] = await db
      .insert(referrals)
      .values(insertReferral)
      .returning();
    return referral;
  }

  async getReferralsByUser(userId: number): Promise<Referral[]> {
    return await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, userId))
      .orderBy(desc(referrals.createdAt));
  }

  async updateReferralStatus(referralId: number, status: string, conversionDate?: Date, commissionAmount?: number): Promise<void> {
    const updates: any = { status };
    if (conversionDate) updates.conversionDate = conversionDate;
    if (commissionAmount) updates.commissionAmount = commissionAmount.toString();

    await db
      .update(referrals)
      .set(updates)
      .where(eq(referrals.id, referralId));
  }

  async getReferralStats(userId: number): Promise<ReferralStats | undefined> {
    const [stats] = await db
      .select()
      .from(referralStats)
      .where(eq(referralStats.userId, userId));
    return stats || undefined;
  }

  async updateReferralStats(userId: number, updates: Partial<InsertReferralStats>): Promise<ReferralStats> {
    // First check if stats exist
    const existing = await this.getReferralStats(userId);
    
    if (existing) {
      const [updated] = await db
        .update(referralStats)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(referralStats.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(referralStats)
        .values({ 
          userId, 
          totalReferrals: 0,
          convertedReferrals: 0,
          totalCommissions: "0",
          pendingCommissions: "0", 
          paidCommissions: "0",
          currency: "USD",
          ...updates 
        })
        .returning();
      return created;
    }
  }

  async createPayout(insertPayout: InsertReferralPayout): Promise<ReferralPayout> {
    const [payout] = await db
      .insert(referralPayouts)
      .values(insertPayout)
      .returning();
    return payout;
  }

  async getUserPayouts(userId: number): Promise<ReferralPayout[]> {
    return await db
      .select()
      .from(referralPayouts)
      .where(eq(referralPayouts.userId, userId))
      .orderBy(desc(referralPayouts.createdAt));
  }

  // Digital Wallet methods implementation
  async createWallet(userId: number, walletType: string): Promise<DigitalWallet> {
    const walletAddress = `FMBN${userId}${walletType.toUpperCase()}${Date.now().toString(36).toUpperCase()}`;
    
    const [wallet] = await db
      .insert(digitalWallets)
      .values({
        userId,
        walletAddress,
        walletType,
        balance: "0.00",
        currency: "USD",
        isActive: true
      })
      .returning();
    return wallet;
  }

  async getUserWallet(userId: number, walletType?: string): Promise<DigitalWallet | undefined> {
    const conditions = [eq(digitalWallets.userId, userId)];
    if (walletType) {
      conditions.push(eq(digitalWallets.walletType, walletType));
    }

    const [wallet] = await db
      .select()
      .from(digitalWallets)
      .where(and(...conditions))
      .orderBy(desc(digitalWallets.createdAt));
    
    return wallet || undefined;
  }

  async getWalletBalance(walletId: number): Promise<string> {
    const [wallet] = await db
      .select({ balance: digitalWallets.balance })
      .from(digitalWallets)
      .where(eq(digitalWallets.id, walletId));
    
    return wallet?.balance || "0.00";
  }

  async addWalletTransaction(walletId: number, transaction: Omit<InsertWalletTransaction, 'walletId' | 'balanceAfter'>): Promise<WalletTransaction> {
    const currentBalance = await this.getWalletBalance(walletId);
    const currentBalanceNum = parseFloat(currentBalance);
    const transactionAmount = parseFloat(transaction.amount);
    
    let newBalance: number;
    if (transaction.transactionType === 'credit') {
      newBalance = currentBalanceNum + transactionAmount;
    } else {
      newBalance = currentBalanceNum - transactionAmount;
    }

    const [walletTransaction] = await db
      .insert(walletTransactions)
      .values({
        ...transaction,
        walletId,
        balanceAfter: newBalance.toFixed(2)
      })
      .returning();

    // Update wallet balance
    await db
      .update(digitalWallets)
      .set({ 
        balance: newBalance.toFixed(2),
        lastTransactionAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(digitalWallets.id, walletId));

    return walletTransaction;
  }

  async getWalletTransactions(walletId: number, limit: number = 50): Promise<WalletTransaction[]> {
    return await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
  }

  async createWithdrawal(walletId: number, withdrawal: Omit<InsertWalletWithdrawal, 'walletId' | 'netAmount'>): Promise<WalletWithdrawal> {
    const transactionFee = parseFloat(withdrawal.transactionFee || "0");
    const amount = parseFloat(withdrawal.amount);
    const netAmount = (amount - transactionFee).toFixed(2);

    const [walletWithdrawal] = await db
      .insert(walletWithdrawals)
      .values({
        ...withdrawal,
        walletId,
        netAmount
      })
      .returning();

    // Create corresponding debit transaction
    await this.addWalletTransaction(walletId, {
      transactionType: 'debit',
      amount: withdrawal.amount,
      currency: withdrawal.currency || 'USD',
      description: `Withdrawal via ${withdrawal.withdrawalMethod}`,
      sourceType: 'withdrawal',
      sourceId: walletWithdrawal.id,
      status: 'pending'
    });

    return walletWithdrawal;
  }

  async getUserWithdrawals(userId: number): Promise<WalletWithdrawal[]> {
    return await db
      .select()
      .from(walletWithdrawals)
      .innerJoin(digitalWallets, eq(walletWithdrawals.walletId, digitalWallets.id))
      .where(eq(digitalWallets.userId, userId))
      .orderBy(desc(walletWithdrawals.createdAt));
  }

  async updateWalletBalance(walletId: number, amount: string, transactionType: 'credit' | 'debit'): Promise<DigitalWallet> {
    const currentBalance = await this.getWalletBalance(walletId);
    const currentBalanceNum = parseFloat(currentBalance);
    const amountNum = parseFloat(amount);
    
    let newBalance: number;
    if (transactionType === 'credit') {
      newBalance = currentBalanceNum + amountNum;
    } else {
      newBalance = Math.max(0, currentBalanceNum - amountNum); // Prevent negative balance
    }

    const [wallet] = await db
      .update(digitalWallets)
      .set({ 
        balance: newBalance.toFixed(2),
        lastTransactionAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(digitalWallets.id, walletId))
      .returning();

    return wallet;
  }
}

// Database Storage with Demo Data Initialization
export class DatabaseStorageWithInit extends DatabaseStorage {
  private initialized = false;

  async initializeDemoData() {
    if (this.initialized) return;

    try {
      // Check if demo user exists
      let demoUser = await this.getUserByEmail("demo@example.com");
      
      if (!demoUser) {
        // Create demo user
        demoUser = await this.createUser({
          username: "demo_user",
          email: "demo@example.com",
          plan: "starter"
        });
      }

      // Check if demo profile exists
      let demoProfile = await this.getUserProfile(demoUser.id);
      
      if (!demoProfile) {
        // Create demo profile
        await this.createUserProfile({
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

      this.initialized = true;
    } catch (error) {
      console.error("Error initializing demo data:", error);
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    await this.initializeDemoData();
    return super.getUser(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    if (email !== "demo@example.com") {
      await this.initializeDemoData();
    }
    return super.getUserByEmail(email);
  }
}

// Use DatabaseStorage with initialization for production
export const storage = new DatabaseStorageWithInit();
