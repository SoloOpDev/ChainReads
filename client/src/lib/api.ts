// In development, use relative URLs (proxied by Vite)
// In production, use same domain (works with Railway and custom domains)
export const API_URL = import.meta.env.MODE === 'development' 
  ? '' 
  : '';

export function getApiUrl(path: string) {
  return `${API_URL}${path}`;
}
