/**
 * Unified backend host configuration & sanitization
 * Handles Render, Vercel, Railway, Cloud Run, Localhost, and custom domains.
 */

export function cleanBackendHost(input: string): string {
  if (!input) return '';
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^wss?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
}

export function getSavedBackendHost(): string {
  if (typeof window === 'undefined') return '';

  // 1. User configured in localStorage
  try {
    const stored = localStorage.getItem('live_backend_host');
    if (stored && stored.trim()) {
      return cleanBackendHost(stored);
    }
  } catch (e) {}

  // 2. Environment variable injected at build time (e.g. on Vercel)
  const envHost = (import.meta as any).env?.VITE_BACKEND_HOST;
  if (envHost && typeof envHost === 'string' && envHost.trim()) {
    return cleanBackendHost(envHost);
  }

  // 3. If running directly on Render, Railway, Cloud Run, or localhost, host is current server
  const hostname = window.location.hostname;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.includes('run.app') ||
    hostname.includes('onrender.com') ||
    hostname.includes('railway.app')
  ) {
    return window.location.host;
  }

  return '';
}

export function saveBackendHost(host: string): string {
  const cleaned = cleanBackendHost(host);
  if (typeof window !== 'undefined') {
    try {
      if (cleaned) {
        localStorage.setItem('live_backend_host', cleaned);
      } else {
        localStorage.removeItem('live_backend_host');
      }
    } catch (e) {}
  }
  return cleaned;
}

export function getWsUrl(hostOverride?: string): string {
  const host = cleanBackendHost(hostOverride || getSavedBackendHost());
  if (!host) return '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocal ? 'ws:' : 'wss:';
  return `${protocol}//${host}/live-ws`;
}

export function getHttpBaseUrl(hostOverride?: string): string {
  const host = cleanBackendHost(hostOverride || getSavedBackendHost());
  if (!host) return '';
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  const protocol = isLocal ? 'http:' : 'https:';
  return `${protocol}//${host}`;
}
