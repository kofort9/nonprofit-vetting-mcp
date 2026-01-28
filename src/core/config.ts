import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ProPublicaConfig {
  apiBaseUrl: string;
  rateLimitMs: number;
}

// Security: Only allow official ProPublica API endpoint
const ALLOWED_API_BASE_URL = 'https://projects.propublica.org/nonprofits/api/v2';

/**
 * Loads ProPublica API configuration from environment variables
 * Note: ProPublica API is free and doesn't require authentication
 */
export function loadConfig(): ProPublicaConfig {
  // Security: Ignore PROPUBLICA_API_BASE_URL env var to prevent SSRF
  // Only the official ProPublica endpoint is allowed
  return {
    apiBaseUrl: ALLOWED_API_BASE_URL,
    rateLimitMs: parseInt(process.env.PROPUBLICA_RATE_LIMIT_MS || '500', 10),
  };
}
