export function getApiBase(): string {
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('findbox_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  const envUrl = (import.meta as any).env?.VITE_API_BASE;
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return '/api';
}

export function setCustomApiBase(url: string) {
  if (typeof window !== 'undefined') {
    if (url && url.trim()) {
      localStorage.setItem('findbox_api_url', url.trim().replace(/\/+$/, ''));
    } else {
      localStorage.removeItem('findbox_api_url');
    }
  }
}

export const API_BASE = getApiBase();
