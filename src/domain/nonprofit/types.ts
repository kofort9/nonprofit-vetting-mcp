// ============================================================================
// ProPublica API Response Types (raw API shapes)
// ============================================================================

export interface ProPublicaSearchResponse {
  total_results: number;
  organizations: ProPublicaOrganization[];
}

export interface ProPublicaOrganization {
  ein: number;
  name: string;
  city: string;
  state: string;
  ntee_code: string | null;
  // Search results use `subseccd`, org detail uses `subsection_code`
  subseccd?: number; // 3 = 501(c)(3) - from search results
  subsection_code?: number; // 3 = 501(c)(3) - from org detail
  ruling_date: string; // YYYY-MM-DD format
  totrevenue?: number;
  totfuncexpns?: number;
  totassetsend?: number;
  pf_asset_val?: number;
}

export interface ProPublicaOrgDetailResponse {
  organization: ProPublicaOrganization;
  filings_with_data: ProPublica990Filing[];
}

export interface ProPublica990Filing {
  tax_prd: number; // Tax period as YYYYMM
  tax_prd_yr: number; // Tax year
  formtype: number; // 990, 990EZ, 990PF
  totrevenue: number;
  totfuncexpns: number;
  totassetsend: number;
  totliabend: number;
  pct_compnsatncurrofcr?: number;
  totcntrbgfts?: number;
  totprgmrevnue?: number;
  invstmntinc?: number;
  txexmptbndsproceeds?: number;
  royaltsinc?: number;
  grsrntsreal?: number;
  grsrntsprsnl?: number;
  raboression?: number;
  grsalesecur?: number;
  grsalesothr?: number;
  totnetassetend?: number;
  pdf_url?: string;
}

// ============================================================================
// Domain Types (cleaned up for tool responses)
// ============================================================================

export interface NonprofitSearchResult {
  ein: string;
  name: string;
  city: string;
  state: string;
  ntee_code: string;
}

export interface NonprofitAddress {
  city: string;
  state: string;
  zip?: string;
}

export interface Latest990Summary {
  tax_period: string;
  tax_year: number;
  form_type: string;
  total_revenue: number;
  total_expenses: number;
  total_assets: number;
  total_liabilities: number;
  overhead_ratio: number;
  program_revenue?: number;
  contributions?: number;
}

export interface NonprofitProfile {
  ein: string;
  name: string;
  address: NonprofitAddress;
  ruling_date: string;
  years_operating: number;
  subsection: string;
  is_501c3: boolean;
  ntee_code: string;
  latest_990: Latest990Summary | null;
  filing_count: number;
}

// ============================================================================
// Tier 1 Check Types
// ============================================================================

export type CheckResult = 'PASS' | 'REVIEW' | 'FAIL';

export interface Tier1Check {
  name: string;
  passed: boolean;
  result: CheckResult;
  detail: string;
  weight: number;
}

export interface Tier1Result {
  ein: string;
  name: string;
  passed: boolean;
  score: number;
  checks: Tier1Check[];
  recommendation: 'PASS' | 'REVIEW' | 'REJECT';
  red_flags: RedFlag[];
}

// ============================================================================
// Red Flag Types
// ============================================================================

export type RedFlagSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type RedFlagType =
  | 'no_990_on_file'
  | 'stale_990'
  | 'high_overhead'
  | 'very_high_overhead'
  | 'no_ruling_date'
  | 'very_low_revenue'
  | 'revenue_decline'
  | 'not_501c3'
  | 'too_new';

export interface RedFlag {
  severity: RedFlagSeverity;
  type: RedFlagType;
  detail: string;
}

export interface RedFlagResult {
  ein: string;
  name: string;
  flags: RedFlag[];
  clean: boolean;
}

// ============================================================================
// Tool Response Wrappers
// ============================================================================

export interface SearchNonprofitResponse {
  results: NonprofitSearchResult[];
  total: number;
  attribution: string;
}

export interface ToolResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  attribution: string;
}
