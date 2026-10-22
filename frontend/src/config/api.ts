export function cleanApiBase(rawUrl?: string | null): string {
  if (!rawUrl || !rawUrl.trim()) return '';
  let url = rawUrl.trim().replace(/\/+$/, '');
  
  // Loại bỏ nếu vô tình bị lặp /api/api
  url = url.replace(/\/api\/api(\/)?$/, '/api');

  // Nếu là URL http/https nhưng quên /api ở đuôi thì tự thêm
  if (/^https?:\/\//i.test(url) && !url.endsWith('/api')) {
    url += '/api';
  }
  return url;
}

export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('findbox_api_url');
    if (custom && custom.trim()) {
      return cleanApiBase(custom);
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_BASE;
  if (envUrl && envUrl.trim()) {
    return cleanApiBase(envUrl);
  }
  return '/api';
}

export function setCustomApiBase(url: string) {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('findbox_api_url', cleanApiBase(url));
    } else {
      localStorage.removeItem('findbox_api_url');
    }
  }
}

export const API_BASE = getApiBase();
