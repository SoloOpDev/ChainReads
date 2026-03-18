import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { DbType } from './db-d1.js';
import { 
  users, 
  newsArticles, 
  userClaims, 
  ipBindings, 
  predictions,
  telegramPosts,
  type User,
  type InsertUser,
  type NewsArticle,
  type InsertNewsArticle,
  type UserClaim,
  type InsertUserClaim,
  type IpBinding,
  type InsertIpBinding,
  type Prediction,
  type InsertPrediction
} from '../shared/schema-d1.js';
import type { IStorage } from './storage.js';

export class D1Storage implements IStorage {
  constructor(private db: DbType) {}

  async getUser(id: string): Promise<User | undefined> {
    return await this.db.query.users.findFirst({
      where: eq(users.id, id)
    });
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await this.db.query.users.findFirst({
      where: eq(users.username, username)
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.db.insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserTokens(userId: string, tokenBalance: number, dailyClaims: number): Promise<User | undefined> {
    const [user] = await this.db.update(users)
      .set({ 
        tokenBalance, 
        dailyClaims,
        lastClaimDate: new Date()
      })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async resetDailyClaims(userId: string): Promise<User | undefined> {
    const [user] = await this.db.update(users)
      .set({ dailyClaims: 0 })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getNewsArticles(limit = 20, offset = 0): Promise<NewsArticle[]> {
    const articles = await this.db.query.newsArticles.findMany({
      orderBy: desc(newsArticles.publishedAt),
      limit,
      offset
    });
    
    // Parse instruments JSON string back to array
    return articles.map(article => ({
      ...article,
      instruments: article.instruments ? JSON.parse(article.instruments) : null
    }));
  }

  async getNewsArticle(id: string): Promise<NewsArticle | undefined> {
    const article = await this.db.query.newsArticles.findFirst({
      where: eq(newsArticles.id, id)
    });
    
    if (!article) return undefined;
    
    // Parse instruments JSON string back to array
    return {
      ...article,
      instruments: article.instruments ? JSON.parse(article.instruments) : null
    };
  }

  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    // Convert instruments array to JSON string
    const articleData = {
      ...article,
      instruments: article.instruments ? JSON.stringify(article.instruments) : null
    };
    
    try {
      const [inserted] = await this.db.insert(newsArticles)
        .values(articleData)
        .returning();
      
      // Parse instruments back to array for return
      return {
        ...inserted,
        instruments: inserted.instruments ? JSON.parse(inserted.instruments) : null
      };
    } catch (error) {
      // If conflict (article already exists), fetch and return it
      const existing = await this.getNewsArticle(article.id);
      if (!existing) {
        throw new Error(`Failed to create or find article: ${article.id}`);
      }
      return existing;
    }
  }

  async createNewsArticles(articles: InsertNewsArticle[]): Promise<NewsArticle[]> {
    if (articles.length === 0) return [];
    
    const articlesData = articles.map(article => ({
      ...article,
      instruments: article.instruments ? JSON.stringify(article.instruments) : null
    }));
    
    try {
      const inserted = await this.db.insert(newsArticles)
        .values(articlesData)
        .returning();
      
      // Parse instruments back to arrays
      return inserted.map(article => ({
        ...article,
        instruments: article.instruments ? JSON.parse(article.instruments) : null
      }));
    } catch (error) {
      console.error('Failed to insert articles:', error);
      return [];
    }
  }

  async getUserClaims(userId: string): Promise<UserClaim[]> {
    return await this.db.query.userClaims.findMany({
      where: eq(userClaims.userId, userId),
      orderBy: desc(userClaims.claimedAt)
    });
  }

  async getUserClaimForArticle(userId: string, articleId: string): Promise<UserClaim | undefined> {
    return await this.db.query.userClaims.findFirst({
      where: and(
        eq(userClaims.userId, userId),
        eq(userClaims.articleId, articleId)
      )
    });
  }

  async createUserClaim(claim: InsertUserClaim): Promise<UserClaim> {
    const [userClaim] = await this.db.insert(userClaims)
      .values(claim)
      .returning();
    return userClaim;
  }

  async getUserDailyClaims(userId: string, date: Date): Promise<UserClaim[]> {
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

    return await this.db.query.userClaims.findMany({
      where: and(
        eq(userClaims.userId, userId),
        gte(userClaims.claimedAt, startOfDay),
        lte(userClaims.claimedAt, endOfDay)
      )
    });
  }

  async clearUserClaims(userId: string): Promise<void> {
    await this.db.delete(userClaims)
      .where(eq(userClaims.userId, userId));
    console.log(`[STORAGE-D1] Cleared claims for user: ${userId}`);
  }

  async getIpBinding(ipAddress: string, bindingType: string): Promise<IpBinding | undefined> {
    return await this.db.query.ipBindings.findFirst({
      where: and(
        eq(ipBindings.ipAddress, ipAddress),
        eq(ipBindings.bindingType, bindingType)
      )
    });
  }

  async createIpBinding(binding: InsertIpBinding): Promise<IpBinding> {
    // SQLite doesn't have UPSERT with ON CONFLICT DO UPDATE, so we handle it manually
    const existing = await this.getIpBinding(binding.ipAddress, binding.bindingType);
    
    if (existing) {
      const [updated] = await this.db.update(ipBindings)
        .set({
          walletAddress: binding.walletAddress,
          boundAt: new Date()
        })
        .where(and(
          eq(ipBindings.ipAddress, binding.ipAddress),
          eq(ipBindings.bindingType, binding.bindingType)
        ))
        .returning();
      return updated;
    } else {
      const [inserted] = await this.db.insert(ipBindings)
        .values(binding)
        .returning();
      return inserted;
    }
  }

  async getWalletBindings(walletAddress: string, bindingType: string): Promise<IpBinding[]> {
    const normalizedWallet = walletAddress.toLowerCase();
    return await this.db.query.ipBindings.findMany({
      where: and(
        sql`LOWER(${ipBindings.walletAddress}) = ${normalizedWallet}`,
        eq(ipBindings.bindingType, bindingType)
      )
    });
  }

  async clearIpBindingsForWallet(walletAddress: string): Promise<void> {
    const normalizedWallet = walletAddress.toLowerCase();
    await this.db.delete(ipBindings)
      .where(sql`LOWER(${ipBindings.walletAddress}) = ${normalizedWallet}`);
  }

  async clearAllIpBindings(): Promise<void> {
    await this.db.delete(ipBindings);
  }

  async createPrediction(prediction: InsertPrediction): Promise<Prediction> {
    const [pred] = await this.db.insert(predictions)
      .values(prediction)
      .returning();
    return pred;
  }

  async getUserPredictions(walletAddress: string, limit = 10): Promise<Prediction[]> {
    return await this.db.query.predictions.findMany({
      where: eq(predictions.walletAddress, walletAddress),
      orderBy: desc(predictions.createdAt),
      limit
    });
  }

  async getPendingPredictions(): Promise<Prediction[]> {
    return await this.db.query.predictions.findMany({
      where: eq(predictions.status, 'pending')
    });
  }

  async updatePredictionStatus(
    id: string, 
    status: string, 
    exitPrice?: number, 
    payout?: number
  ): Promise<Prediction | undefined> {
    const [pred] = await this.db.update(predictions)
      .set({
        status,
        ...(exitPrice !== undefined && { exitPrice }),
        ...(payout !== undefined && { payout })
      })
      .where(eq(predictions.id, id))
      .returning();
    return pred;
  }

  async deletePrediction(id: string): Promise<boolean> {
    const result = await this.db.delete(predictions)
      .where(eq(predictions.id, id))
      .returning();
    return result.length > 0;
  }
  
  async getTelegramPosts(category: string, limit = 100): Promise<any[]> {
    return await this.db.select({
      id: telegramPosts.id,
      messageId: telegramPosts.messageId,
      channel: telegramPosts.channel,
      category: telegramPosts.category,
      text: telegramPosts.text,
      date: telegramPosts.date,
      image: telegramPosts.image,
      imageData: telegramPosts.imageData,
      imageFileId: telegramPosts.imageFileId,
      createdAt: telegramPosts.createdAt,
    })
      .from(telegramPosts)
      .where(eq(telegramPosts.category, category))
      .orderBy(desc(telegramPosts.date))
      .limit(limit);
  }
  
  async upsertTelegramPosts(posts: any[]): Promise<number> {
    if (posts.length === 0) return 0;
    
    let inserted = 0;
    
    try {
      // Process posts in batches
      const BATCH_SIZE = 10;
      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        
        for (const post of batch) {
          try {
            const postId = `${post.channel}_${post.messageId}`;
            
            // Check if post exists
            const existing = await this.db.query.telegramPosts.findFirst({
              where: eq(telegramPosts.id, postId)
            });
            
            const postData = {
              id: postId,
              messageId: post.messageId,
              channel: post.channel,
              category: post.category,
              text: post.text,
              date: new Date(post.date),
              image: post.image || null,
              imageData: post.imageData || null,
              imageFileId: post.imageFileId || null,
            };
            
            if (existing) {
              await this.db.update(telegramPosts)
                .set({
                  text: post.text,
                  image: post.image || null,
                  imageData: post.imageData || null,
                  imageFileId: post.imageFileId || null,
                  date: new Date(post.date),
                })
                .where(eq(telegramPosts.id, postId));
            } else {
              await this.db.insert(telegramPosts)
                .values(postData);
            }
            
            inserted++;
          } catch (error) {
            console.error(`Failed to upsert post ${post.messageId}:`, error);
          }
        }
      }
      
      // Cleanup old posts - keep only latest 200 per category
      const tradingPosts = await this.db.select({ id: telegramPosts.id })
        .from(telegramPosts)
        .where(eq(telegramPosts.category, 'trading'))
        .orderBy(desc(telegramPosts.date))
        .limit(200);
      
      if (tradingPosts.length === 200) {
        const keepIds = tradingPosts.map(p => p.id);
        await this.db.delete(telegramPosts)
          .where(and(
            eq(telegramPosts.category, 'trading'),
            sql`${telegramPosts.id} NOT IN (${keepIds.map(id => `'${id}'`).join(',')})`
          ));
      }
      
      const airdropPosts = await this.db.select({ id: telegramPosts.id })
        .from(telegramPosts)
        .where(eq(telegramPosts.category, 'airdrop'))
        .orderBy(desc(telegramPosts.date))
        .limit(200);
      
      if (airdropPosts.length === 200) {
        const keepIds = airdropPosts.map(p => p.id);
        await this.db.delete(telegramPosts)
          .where(and(
            eq(telegramPosts.category, 'airdrop'),
            sql`${telegramPosts.id} NOT IN (${keepIds.map(id => `'${id}'`).join(',')})`
          ));
      }
      
      console.log('[TELEGRAM-CLEANUP] Cleaned up old posts, kept latest 200 per category');
    } catch (error) {
      console.error('[TELEGRAM-UPDATE] Transaction failed:', error);
      throw error;
    }
    
    return inserted;
  }
}