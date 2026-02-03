import { db } from './db.js';
import { 
  users, 
  newsArticles, 
  userClaims, 
  ipBindings, 
  predictions,
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
} from '../shared/schema.js';
import { eq, and, desc, gte, lte, sql } from 'drizzle-orm';
import type { IStorage } from './storage.js';

export class PostgresStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.id, id)
    });
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return await db.query.users.findFirst({
      where: eq(users.username, username)
    });
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserTokens(userId: string, tokenBalance: number, dailyClaims: number): Promise<User | undefined> {
    const [user] = await db.update(users)
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
    const [user] = await db.update(users)
      .set({ dailyClaims: 0 })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }

  async getNewsArticles(limit = 20, offset = 0): Promise<NewsArticle[]> {
    return await db.query.newsArticles.findMany({
      orderBy: desc(newsArticles.publishedAt),
      limit,
      offset
    });
  }

  async getNewsArticle(id: string): Promise<NewsArticle | undefined> {
    return await db.query.newsArticles.findFirst({
      where: eq(newsArticles.id, id)
    });
  }

  async createNewsArticle(article: InsertNewsArticle): Promise<NewsArticle> {
    const result = await db.insert(newsArticles)
      .values(article)
      .onConflictDoNothing()
      .returning();
    
    // If conflict (article already exists), fetch and return it
    if (result.length === 0) {
      const existing = await db.query.newsArticles.findFirst({
        where: eq(newsArticles.id, article.id)
      });
      if (!existing) {
        throw new Error(`Failed to create or find article: ${article.id}`);
      }
      return existing;
    }
    
    return result[0];
  }

  async createNewsArticles(articles: InsertNewsArticle[]): Promise<NewsArticle[]> {
    if (articles.length === 0) return [];
    
    const inserted = await db.insert(newsArticles)
      .values(articles)
      .onConflictDoNothing()
      .returning();
    return inserted;
  }

  async getUserClaims(userId: string): Promise<UserClaim[]> {
    return await db.query.userClaims.findMany({
      where: eq(userClaims.userId, userId),
      orderBy: desc(userClaims.claimedAt)
    });
  }

  async getUserClaimForArticle(userId: string, articleId: string): Promise<UserClaim | undefined> {
    return await db.query.userClaims.findFirst({
      where: and(
        eq(userClaims.userId, userId),
        eq(userClaims.articleId, articleId)
      )
    });
  }

  async createUserClaim(claim: InsertUserClaim): Promise<UserClaim> {
    const [userClaim] = await db.insert(userClaims)
      .values(claim)
      .returning();
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

    return await db.query.userClaims.findMany({
      where: and(
        eq(userClaims.userId, userId),
        gte(userClaims.claimedAt, startOfDay),
        lte(userClaims.claimedAt, endOfDay)
      )
    });
  }

  async clearUserClaims(userId: string): Promise<void> {
    await db.delete(userClaims)
      .where(eq(userClaims.userId, userId));
    console.log(`[STORAGE-PG] Cleared claims for user: ${userId}`);
  }

  async getIpBinding(ipAddress: string, bindingType: string): Promise<IpBinding | undefined> {
    return await db.query.ipBindings.findFirst({
      where: and(
        eq(ipBindings.ipAddress, ipAddress),
        eq(ipBindings.bindingType, bindingType)
      )
    });
  }

  async createIpBinding(binding: InsertIpBinding): Promise<IpBinding> {
    const [ipBinding] = await db.insert(ipBindings)
      .values(binding)
      .onConflictDoUpdate({
        target: [ipBindings.ipAddress, ipBindings.bindingType],
        set: {
          walletAddress: binding.walletAddress,
          boundAt: new Date()
        }
      })
      .returning();
    return ipBinding;
  }

  async getWalletBindings(walletAddress: string, bindingType: string): Promise<IpBinding[]> {
    const normalizedWallet = walletAddress.toLowerCase();
    return await db.query.ipBindings.findMany({
      where: and(
        sql`LOWER(${ipBindings.walletAddress}) = ${normalizedWallet}`,
        eq(ipBindings.bindingType, bindingType)
      )
    });
  }

  async clearIpBindingsForWallet(walletAddress: string): Promise<void> {
    const normalizedWallet = walletAddress.toLowerCase();
    await db.delete(ipBindings)
      .where(sql`LOWER(${ipBindings.walletAddress}) = ${normalizedWallet}`);
  }

  async clearAllIpBindings(): Promise<void> {
    await db.delete(ipBindings);
  }

  async createPrediction(prediction: InsertPrediction): Promise<Prediction> {
    const [pred] = await db.insert(predictions)
      .values(prediction)
      .returning();
    return pred;
  }

  async getUserPredictions(walletAddress: string, limit = 10): Promise<Prediction[]> {
    return await db.query.predictions.findMany({
      where: eq(predictions.walletAddress, walletAddress),
      orderBy: desc(predictions.createdAt),
      limit
    });
  }

  async getPendingPredictions(): Promise<Prediction[]> {
    return await db.query.predictions.findMany({
      where: eq(predictions.status, 'pending')
    });
  }

  async updatePredictionStatus(
    id: string, 
    status: string, 
    exitPrice?: number, 
    payout?: number
  ): Promise<Prediction | undefined> {
    const [pred] = await db.update(predictions)
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
    const result = await db.delete(predictions)
      .where(eq(predictions.id, id))
      .returning();
    return result.length > 0;
  }
  
  async getTelegramPosts(category: string, limit = 100): Promise<any[]> {
    const { telegramPosts } = await import('../shared/schema.js');
    const { eq, desc } = await import('drizzle-orm');
    
    // Query with index on category and date for fast retrieval
    return await db.select({
      id: telegramPosts.id,
      messageId: telegramPosts.messageId,
      channel: telegramPosts.channel,
      category: telegramPosts.category,
      text: telegramPosts.text,
      date: telegramPosts.date,
      image: telegramPosts.image,
      imageData: telegramPosts.imageData,
      createdAt: telegramPosts.createdAt,
    })
      .from(telegramPosts)
      .where(eq(telegramPosts.category, category))
      .orderBy(desc(telegramPosts.date))
      .limit(limit);
  }
  
  async upsertTelegramPosts(posts: any[]): Promise<number> {
    if (posts.length === 0) return 0;
    
    const { telegramPosts } = await import('../shared/schema.js');
    
    // Use transaction for atomic operations
    let inserted = 0;
    
    try {
      // Insert or update posts in batches of 10 for better performance
      const BATCH_SIZE = 10;
      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        const batch = posts.slice(i, i + BATCH_SIZE);
        
        for (const post of batch) {
          try {
            await db.insert(telegramPosts)
              .values({
                id: `${post.channel}_${post.messageId}`,
                messageId: post.messageId,
                channel: post.channel,
                category: post.category,
                text: post.text,
                date: new Date(post.date),
                image: post.image || null,
                imageData: post.imageData || null,
              })
              .onConflictDoUpdate({
                target: telegramPosts.id,
                set: {
                  text: post.text,
                  image: post.image || null,
                  imageData: post.imageData || null,
                  date: new Date(post.date),
                }
              });
            inserted++;
          } catch (error) {
            console.error(`Failed to upsert post ${post.messageId}:`, error);
          }
        }
      }
      
      // Auto-cleanup: Keep only latest 100 posts per category
      // Run cleanup after inserts to avoid race conditions
      await db.execute(sql`
        DELETE FROM telegram_posts 
        WHERE category = 'trading' 
        AND id NOT IN (
          SELECT id FROM telegram_posts 
          WHERE category = 'trading' 
          ORDER BY date DESC 
          LIMIT 100
        )
      `);
      
      await db.execute(sql`
        DELETE FROM telegram_posts 
        WHERE category = 'airdrop' 
        AND id NOT IN (
          SELECT id FROM telegram_posts 
          WHERE category = 'airdrop' 
          ORDER BY date DESC 
          LIMIT 100
        )
      `);
      
      console.log('[TELEGRAM-CLEANUP] Cleaned up old posts, kept latest 100 per category');
    } catch (error) {
      console.error('[TELEGRAM-UPDATE] Transaction failed:', error);
      throw error;
    }
    
    return inserted;
  }
}
