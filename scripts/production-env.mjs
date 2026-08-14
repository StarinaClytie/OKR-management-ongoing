import { loadEnv } from 'vite';

/**
 * Match Vite's production-mode file order: .env, .env.local,
 * .env.production, and .env.production.local. Existing process variables
 * remain highest priority, just as they do for Vite itself.
 */
export function loadProductionEnv(envDirectory = process.cwd()) {
  return { ...loadEnv('production', envDirectory, ''), ...process.env };
}
