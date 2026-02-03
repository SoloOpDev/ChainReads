/**
 * Type definitions for news fetching and caching
 */

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  content?: string;
  source: {
    title: string;
    domain: string;
  };
  published_at: string;
  created_at: string;
  image: string | null;
  original_url: string;
  kind: string;
  author: string | null;
}

export interface CachedNews {
  results: NewsArticle[];
}

export interface RSSItem {
  title?: string;
  link?: string;
  pubDate?: string;
  contentSnippet?: string;
  summary?: string;
  content?: string;
  contentEncoded?: string;
  'content:encoded'?: string;
  creator?: string;
  media?: {
    $: { url: string };
  };
  enclosure?: {
    url: string;
  };
  thumbnail?: {
    $: { url: string };
  };
}

export interface RSSFeed {
  items: RSSItem[];
}

export interface ScrapedContent {
  html: string;
  meta: {
    textLen: number;
    strategy: string;
  };
  ts: number;
}

export interface CacheEntry {
  html: string;
  meta: {
    textLen: number;
    strategy: string;
  };
  ts: number;
}
