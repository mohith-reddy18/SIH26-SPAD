/**
 * SPAD API Configuration
 * Consistently uses the configured VITE_API_URL.
 * In local development with Vite proxy or relative routes, defaults to '' or configured URL.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
