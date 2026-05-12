export const BACKEND = (
  (import.meta as any).env?.VITE_API_URL ||
  'https://precious-prosperity-production-4daa.up.railway.app'
).replace(/\/$/, '');