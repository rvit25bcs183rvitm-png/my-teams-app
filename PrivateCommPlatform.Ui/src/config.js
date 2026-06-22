const getBackendUrl = () => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_API_URL || 'http://localhost:5143';
  }

  const hostname = window.location.hostname;

  // 1. Localhost default
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const envUrl = import.meta.env.VITE_API_URL;
    if (envUrl && (envUrl.includes('localhost') || envUrl.includes('127.0.0.1'))) {
      return envUrl;
    }
    return 'http://localhost:5143';
  }

  // 2. Local network IP default (useful for testing on local Wi-Fi from mobile)
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
    return `http://${hostname}:5143`;
  }

  // 3. Cloudflare Tunnel or external production domains
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && envUrl !== 'https://YOUR_BACKEND_TUNNEL.trycloudflare.com') {
    return envUrl;
  }
  return window.location.origin;
};

const getSignalrUrl = (baseUrl) => {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_SIGNALR_URL || baseUrl;
  }

  const hostname = window.location.hostname;

  // Use base URL for local development/testing
  if (hostname === 'localhost' || hostname === '127.0.0.1' || /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname)) {
    return baseUrl;
  }

  const envSignalrUrl = import.meta.env.VITE_SIGNALR_URL;
  if (envSignalrUrl && envSignalrUrl !== 'https://YOUR_BACKEND_TUNNEL.trycloudflare.com') {
    return envSignalrUrl;
  }
  return baseUrl;
};

export const BASE_URL = getBackendUrl();
export const SIGNALR_URL = getSignalrUrl(BASE_URL);
