// Type definitions for extractor.js
export function getCachedExtraction(url: string): { html: string; meta: any; ts: number } | null;
export function setCachedExtraction(url: string, payload: { html: string; meta: any }): void;
export function clearCache(): void;
export function normalizeUrl(url: string): string;
export function pickBestContentNode(doc: Document): Element | null;
export function extractHtmlFromArticlePage(targetUrl: string): Promise<{ html: string; meta: { strategy: string; textLen: number; url: string } }>;
export function extractHtmlFromArticlePageCached(targetUrl: string): Promise<{ html: string; meta: { strategy: string; textLen: number; url: string } }>;
