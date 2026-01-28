import { ProPublicaClient } from './propublica-client.js';
import {
  NonprofitProfile,
  NonprofitSearchResult,
  SearchNonprofitResponse,
  ToolResponse,
  Tier1Result,
  RedFlagResult,
  Latest990Summary,
} from './types.js';
import { runTier1Checks, runRedFlagCheck } from './scoring.js';
import { logDebug, logError } from '../../core/logging.js';

const ATTRIBUTION = 'Data provided by ProPublica Nonprofit Explorer (https://projects.propublica.org/nonprofits/)';

// ============================================================================
// Tool Input Types
// ============================================================================

export interface SearchNonprofitInput {
  query: string;
  state?: string;
  city?: string;
}

export interface GetNonprofitProfileInput {
  ein: string;
}

export interface CheckTier1Input {
  ein: string;
}

export interface GetRedFlagsInput {
  ein: string;
}

// ============================================================================
// Tool Implementations
// ============================================================================

/**
 * search_nonprofit - Search for nonprofits by name
 */
export async function searchNonprofit(
  client: ProPublicaClient,
  input: SearchNonprofitInput
): Promise<ToolResponse<SearchNonprofitResponse>> {
  try {
    if (!input.query || input.query.trim().length === 0) {
      return {
        success: false,
        error: 'Query parameter is required',
        attribution: ATTRIBUTION,
      };
    }

    logDebug(`Searching for nonprofits: "${input.query}"`);

    const response = await client.search(input.query, input.state, input.city);

    const results: NonprofitSearchResult[] = response.organizations.map((org) => ({
      ein: ProPublicaClient.formatEin(org.ein),
      name: org.name,
      city: org.city || '',
      state: org.state || '',
      ntee_code: org.ntee_code || '',
    }));

    return {
      success: true,
      data: {
        results,
        total: response.total_results,
        attribution: ATTRIBUTION,
      },
      attribution: ATTRIBUTION,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('searchNonprofit failed:', message);
    return {
      success: false,
      error: `Search failed: ${message}`,
      attribution: ATTRIBUTION,
    };
  }
}

/**
 * get_nonprofit_profile - Get detailed profile for a nonprofit
 */
export async function getNonprofitProfile(
  client: ProPublicaClient,
  input: GetNonprofitProfileInput
): Promise<ToolResponse<NonprofitProfile>> {
  try {
    if (!input.ein) {
      return {
        success: false,
        error: 'EIN parameter is required',
        attribution: ATTRIBUTION,
      };
    }

    logDebug(`Getting profile for EIN: ${input.ein}`);

    const response = await client.getOrganization(input.ein);

    if (!response) {
      return {
        success: false,
        error: `Organization not found with EIN: ${input.ein}`,
        attribution: ATTRIBUTION,
      };
    }

    const org = response.organization;
    const filings = response.filings_with_data || [];
    const latestFiling = ProPublicaClient.getMostRecentFiling(filings);

    // Build latest 990 summary
    let latest990: Latest990Summary | null = null;
    if (latestFiling) {
      const overheadRatio = ProPublicaClient.calculateOverheadRatio(latestFiling);
      latest990 = {
        tax_period: ProPublicaClient.formatTaxPeriod(latestFiling.tax_prd),
        tax_year: latestFiling.tax_prd_yr,
        form_type: ProPublicaClient.getFormTypeName(latestFiling.formtype),
        total_revenue: latestFiling.totrevenue,
        total_expenses: latestFiling.totfuncexpns,
        total_assets: latestFiling.totassetsend,
        total_liabilities: latestFiling.totliabend,
        overhead_ratio: overheadRatio ?? 0,
        program_revenue: latestFiling.totprgmrevnue,
        contributions: latestFiling.totcntrbgfts,
      };
    }

    // Calculate years operating
    const yearsOperating = org.ruling_date
      ? ProPublicaClient.calculateYearsOperating(org.ruling_date)
      : null;

    const subsection = ProPublicaClient.getSubsection(org);
    const profile: NonprofitProfile = {
      ein: ProPublicaClient.formatEin(org.ein),
      name: org.name,
      address: {
        city: org.city || '',
        state: org.state || '',
      },
      ruling_date: org.ruling_date || '',
      years_operating: yearsOperating ?? 0,
      subsection: subsection,
      is_501c3: subsection === '03',
      ntee_code: org.ntee_code || '',
      latest_990: latest990,
      filing_count: filings.length,
    };

    return {
      success: true,
      data: profile,
      attribution: ATTRIBUTION,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('getNonprofitProfile failed:', message);
    return {
      success: false,
      error: `Failed to get profile: ${message}`,
      attribution: ATTRIBUTION,
    };
  }
}

/**
 * check_tier1 - Run Tier 1 vetting checks
 */
export async function checkTier1(
  client: ProPublicaClient,
  input: CheckTier1Input
): Promise<ToolResponse<Tier1Result>> {
  try {
    if (!input.ein) {
      return {
        success: false,
        error: 'EIN parameter is required',
        attribution: ATTRIBUTION,
      };
    }

    logDebug(`Running Tier 1 checks for EIN: ${input.ein}`);

    // Get organization data
    const response = await client.getOrganization(input.ein);

    if (!response) {
      return {
        success: false,
        error: `Organization not found with EIN: ${input.ein}`,
        attribution: ATTRIBUTION,
      };
    }

    const org = response.organization;
    const filings = response.filings_with_data || [];
    const latestFiling = ProPublicaClient.getMostRecentFiling(filings);

    // Build profile for scoring
    let latest990: Latest990Summary | null = null;
    if (latestFiling) {
      const overheadRatio = ProPublicaClient.calculateOverheadRatio(latestFiling);
      latest990 = {
        tax_period: ProPublicaClient.formatTaxPeriod(latestFiling.tax_prd),
        tax_year: latestFiling.tax_prd_yr,
        form_type: ProPublicaClient.getFormTypeName(latestFiling.formtype),
        total_revenue: latestFiling.totrevenue,
        total_expenses: latestFiling.totfuncexpns,
        total_assets: latestFiling.totassetsend,
        total_liabilities: latestFiling.totliabend,
        overhead_ratio: overheadRatio ?? 0,
        program_revenue: latestFiling.totprgmrevnue,
        contributions: latestFiling.totcntrbgfts,
      };
    }

    const yearsOperating = org.ruling_date
      ? ProPublicaClient.calculateYearsOperating(org.ruling_date)
      : null;

    const subsection = ProPublicaClient.getSubsection(org);
    const profile: NonprofitProfile = {
      ein: ProPublicaClient.formatEin(org.ein),
      name: org.name,
      address: {
        city: org.city || '',
        state: org.state || '',
      },
      ruling_date: org.ruling_date || '',
      years_operating: yearsOperating ?? 0,
      subsection: subsection,
      is_501c3: subsection === '03',
      ntee_code: org.ntee_code || '',
      latest_990: latest990,
      filing_count: filings.length,
    };

    // Run Tier 1 checks
    const result = runTier1Checks(profile, filings);

    return {
      success: true,
      data: result,
      attribution: ATTRIBUTION,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('checkTier1 failed:', message);
    return {
      success: false,
      error: `Tier 1 check failed: ${message}`,
      attribution: ATTRIBUTION,
    };
  }
}

/**
 * get_red_flags - Get red flags for a nonprofit
 */
export async function getRedFlags(
  client: ProPublicaClient,
  input: GetRedFlagsInput
): Promise<ToolResponse<RedFlagResult>> {
  try {
    if (!input.ein) {
      return {
        success: false,
        error: 'EIN parameter is required',
        attribution: ATTRIBUTION,
      };
    }

    logDebug(`Getting red flags for EIN: ${input.ein}`);

    // Get organization data
    const response = await client.getOrganization(input.ein);

    if (!response) {
      return {
        success: false,
        error: `Organization not found with EIN: ${input.ein}`,
        attribution: ATTRIBUTION,
      };
    }

    const org = response.organization;
    const filings = response.filings_with_data || [];
    const latestFiling = ProPublicaClient.getMostRecentFiling(filings);

    // Build profile for red flag detection
    let latest990: Latest990Summary | null = null;
    if (latestFiling) {
      const overheadRatio = ProPublicaClient.calculateOverheadRatio(latestFiling);
      latest990 = {
        tax_period: ProPublicaClient.formatTaxPeriod(latestFiling.tax_prd),
        tax_year: latestFiling.tax_prd_yr,
        form_type: ProPublicaClient.getFormTypeName(latestFiling.formtype),
        total_revenue: latestFiling.totrevenue,
        total_expenses: latestFiling.totfuncexpns,
        total_assets: latestFiling.totassetsend,
        total_liabilities: latestFiling.totliabend,
        overhead_ratio: overheadRatio ?? 0,
        program_revenue: latestFiling.totprgmrevnue,
        contributions: latestFiling.totcntrbgfts,
      };
    }

    const yearsOperating = org.ruling_date
      ? ProPublicaClient.calculateYearsOperating(org.ruling_date)
      : null;

    const subsection = ProPublicaClient.getSubsection(org);
    const profile: NonprofitProfile = {
      ein: ProPublicaClient.formatEin(org.ein),
      name: org.name,
      address: {
        city: org.city || '',
        state: org.state || '',
      },
      ruling_date: org.ruling_date || '',
      years_operating: yearsOperating ?? 0,
      subsection: subsection,
      is_501c3: subsection === '03',
      ntee_code: org.ntee_code || '',
      latest_990: latest990,
      filing_count: filings.length,
    };

    // Run red flag detection
    const result = runRedFlagCheck(profile, filings);

    return {
      success: true,
      data: result,
      attribution: ATTRIBUTION,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError('getRedFlags failed:', message);
    return {
      success: false,
      error: `Red flag check failed: ${message}`,
      attribution: ATTRIBUTION,
    };
  }
}
