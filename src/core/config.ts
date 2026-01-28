import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface ProPublicaConfig {
  apiBaseUrl: string;
  rateLimitMs: number;
}

/**
 * Loads ProPublica API configuration from environment variables
 * Note: ProPublica API is free and doesn't require authentication
 */
export function loadConfig(): ProPublicaConfig {
  return {
    apiBaseUrl:
      process.env.PROPUBLICA_API_BASE_URL ||
      'https://projects.propublica.org/nonprofits/api/v2',
    rateLimitMs: parseInt(process.env.PROPUBLICA_RATE_LIMIT_MS || '500', 10),
  };
}
