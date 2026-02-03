import { type User, type InsertUser, type NewsArticle, type InsertNewsArticle, type UserClaim, type InsertUserClaim, type IpBinding, type InsertIpBinding, type Prediction, type InsertPrediction } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTokens(userId: string, tokenBalance: number, dailyClaims: number): Promise<User | undefined>;
  resetDailyClaims(userId: string): Promise<User | undefined>;
  
  getNewsArticles(limit?: number, offset?: number): Promise<NewsArticle[]>;
  getNewsArticle(id: string): Promise<NewsArticle | undefined>;
  createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle>;
  createNewsArticles(articles: InsertNewsArticle[]): Promise<NewsArticle[]>;
  
  getUserClaims(userId: string): Promise<UserClaim[]>;
  getUserClaimForArticle(userId: string, articleId: string): Promise<UserClaim | undefined>;
  createUserClaim(claim: InsertUserClaim): Promise<UserClaim>;
  getUserDailyClaims(userId: string, date: Date): Promise<UserClaim[]>;
  
  getIpBinding(ipAddress: string, bindingType: string): Promise<IpBinding | undefined>;
  createIpBinding(binding: InsertIpBinding): Promise<IpBinding>;
  getWalletBindings(walletAddress: string, bindingType: string): Promise<IpBinding[]>;
  clearIpBindingsForWallet(walletAddress: string): Promise<void>;
  clearAllIpBindings(): Promise<void>;
  clearUserClaims(userId: string): Promise<void>;
  
  createPrediction(prediction: InsertPrediction): Promise<Prediction>;
  getUserPredictions(walletAddress: string, limit?: number): Promise<Prediction[]>;
  getPendingPredictions(): Promise<Prediction[]>;
  updatePredictionStatus(id: string, status: string, exitPrice?: number, payout?: number): Promise<Prediction | undefined>;
  deletePrediction(id: string): Promise<boolean>;
  
  getTelegramPosts(category: string, limit?: number): Promise<any[]>;
  upsertTelegramPosts(posts: any[]): Promise<number>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private newsArticles: Map<string, NewsArticle>;
  private userClaims: Map<string, UserClaim>;
  private ipBindings: Map<string, IpBinding>;
  private predictions: Map<string, Prediction>;

  constructor() {
    this.users = new Map();
    this.newsArticles = new Map();
    this.userClaims = new Map();
    this.ipBindings = new Map();
    this.predictions = new Map();
    
    // Default user
    const defaultUser: User = {
      id: "default-user",
      username: "crypto_trader",
      password: "password",
      tokenBalance: 12.5,
      dailyClaims: 2,
      lastClaimDate: new Date(),
    };
    this.users.set(defaultUser.id, defaultUser);
    
    // Add the user's wallet with 10k points
    const userWallet: User = {
      id: "user-wallet-1",
      username: "0x93fa2975c8ad5a77bda3887b96a276a7daa3637f", // lowercase
      password: "wallet-auth",
      tokenBalance: 10000,
      dailyClaims: 0,
      lastClaimDate: new Date(),
    };
    this.users.set(userWallet.id, userWallet);
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id, 
      tokenBalance: 0,
      dailyClaims: 0,
      lastClaimDate: null,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserTokens(userId: string, tokenBalance: number, dailyClaims: number): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { 
      ...user, 
      tokenBalance, 
      dailyClaims,
      lastClaimDate: new Date(),
    };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async resetDailyClaims(userId: string): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    const updatedUser = { ...user, dailyClaims: 0 };
    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async getNewsArticles(limit = 20, offset = 0): Promise<NewsArticle[]> {
    const articles = Array.from(this.newsArticles.values());
    return articles
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(offset, offset + limit);
  }

  async getNewsArticle(id: string): Promise<NewsArticle | undefined> {
    return this.newsArticles.get(id);
  }

  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    const newsArticle: NewsArticle = {
      ...article,
      description: article.description ?? null,
      sourceDomain: article.sourceDomain ?? null,
      url: article.url ?? null,
      image: article.image ?? null,
      instruments: article.instruments ?? null,
      votes: article.votes ?? null,
      author: article.author ?? null,
      createdAt: new Date(),
    };
    this.newsArticles.set(article.id, newsArticle);
    return newsArticle;
  }

  async createNewsArticles(articles: InsertNewsArticle[]): Promise<NewsArticle[]> {
    const newsArticles: NewsArticle[] = [];
    for (const article of articles) {
      const newsArticle = await this.createNewsArticle(article);
      newsArticles.push(newsArticle);
    }
    return newsArticles;
  }

  async getUserClaims(userId: string): Promise<UserClaim[]> {
    return Array.from(this.userClaims.values()).filter(
      (claim) => claim.userId === userId
    );
  }

  async getUserClaimForArticle(userId: string, articleId: string): Promise<UserClaim | undefined> {
    return Array.from(this.userClaims.values()).find(
      (claim) => claim.userId === userId && claim.articleId === articleId
    );
  }

  async createUserClaim(claim: InsertUserClaim): Promise<UserClaim> {
    const id = randomUUID();
    const userClaim: UserClaim = {
      ...claim,
      id,
      claimedAt: new Date(),
    };
    this.userClaims.set(id, userClaim);
    return userClaim;
  }

  async getUserDailyClaims(userId: string, date: Date): Promise<UserClaim[]> {
    // Use UTC to match articleId format (section-YYYY-MM-DD in UTC)
    const startOfDay = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0, 0, 0, 0
    ));
    const endOfDay = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23, 59, 59, 999
    ));

    return Array.from(this.userClaims.values()).filter(
      (claim) => 
        claim.userId === userId &&
        claim.claimedAt >= startOfDay &&
        claim.claimedAt <= endOfDay
    );
  }

  async clearUserClaims(userId: string): Promise<void> {
    const keysToDelete: string[] = [];
    for (const [key, claim] of Array.from(this.userClaims.entries())) {
      if (claim.userId === userId) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.userClaims.delete(key));
    console.log(`[STORAGE] Cleared ${keysToDelete.length} claims for user: ${userId}`);
  }

  async getIpBinding(ipAddress: string, bindingType: string): Promise<IpBinding | undefined> {
    const key = `${ipAddress}:${bindingType}`;
    return this.ipBindings.get(key);
  }

  async createIpBinding(binding: InsertIpBinding): Promise<IpBinding> {
    const key = `${binding.ipAddress}:${binding.bindingType}`;
    const ipBinding: IpBinding = {
      ...binding,
      boundAt: new Date(),
    };
    this.ipBindings.set(key, ipBinding);
    return ipBinding;
  }

  async getWalletBindings(walletAddress: string, bindingType: string): Promise<IpBinding[]> {
    const normalizedWallet = walletAddress.toLowerCase();
    return Array.from(this.ipBindings.values()).filter(
      (binding) => binding.walletAddress.toLowerCase() === normalizedWallet && binding.bindingType === bindingType
    );
  }

  async clearIpBindingsForWallet(walletAddress: string): Promise<void> {
    const normalizedWallet = walletAddress.toLowerCase();
    const keysToDelete: string[] = [];
    for (const [key, binding] of Array.from(this.ipBindings.entries())) {
      if (binding.walletAddress.toLowerCase() === normalizedWallet) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.ipBindings.delete(key));
  }

  async clearAllIpBindings(): Promise<void> {
    this.ipBindings.clear();
  }

  async createPrediction(prediction: InsertPrediction): Promise<Prediction> {
    const id = randomUUID();
    const pred: Prediction = {
      ...prediction,
      id,
      status: prediction.status || 'pending',
      exitPrice: prediction.exitPrice ?? null,
      payout: prediction.payout ?? null,
      createdAt: new Date(),
    };
    this.predictions.set(id, pred);
    return pred;
  }

  async getUserPredictions(walletAddress: string, limit = 10): Promise<Prediction[]> {
    return Array.from(this.predictions.values())
      .filter((pred) => pred.walletAddress === walletAddress)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async getPendingPredictions(): Promise<Prediction[]> {
    return Array.from(this.predictions.values()).filter(
      (pred) => pred.status === "pending"
    );
  }

  async updatePredictionStatus(id: string, status: string, exitPrice?: number, payout?: number): Promise<Prediction | undefined> {
    const pred = this.predictions.get(id);
    if (!pred) return undefined;
    
    const updatedPred: Prediction = {
      ...pred,
      status,
      exitPrice: exitPrice ?? pred.exitPrice,
      payout: payout ?? pred.payout,
    };
    this.predictions.set(id, updatedPred);
    return updatedPred;
  }

  async deletePrediction(id: string): Promise<boolean> {
    return this.predictions.delete(id);
  }
  
  async getTelegramPosts(category: string, limit = 100): Promise<any[]> {
    // In-memory: return empty for now (will use PostgreSQL in production)
    return [];
  }
  
  async upsertTelegramPosts(posts: any[]): Promise<number> {
    // In-memory: no-op (will use PostgreSQL in production)
    return 0;
  }
}

// Auto-detect: Use PostgreSQL if DATABASE_URL exists, otherwise in-memory
let storageInstance: IStorage;

if (process.env.DATABASE_URL) {
  // Import PostgreSQL storage dynamically (only when DATABASE_URL is set)
  // This prevents db.ts from being loaded in local dev mode
  const { PostgresStorage } = await import('./storage-pg.js');
  storageInstance = new PostgresStorage();
  console.log('[STORAGE] PostgreSQL storage initialized');
} else {
  storageInstance = new MemStorage();
  console.log('[STORAGE] In-memory storage initialized');
}

export const storage = storageInstance;
