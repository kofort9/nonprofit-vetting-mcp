import {
  NonprofitProfile,
  Tier1Check,
  Tier1Result,
  CheckResult,
  RedFlag,
  RedFlagResult,
  RedFlagType,
  RedFlagSeverity,
  ProPublica990Filing,
} from './types.js';
import { ProPublicaClient } from './propublica-client.js';
import { generateSummary } from './messages.js';

// ============================================================================
// Weight Configuration for Tier 1 Checks
// ============================================================================

const CHECK_WEIGHTS: Record<string, number> = {
  '501c3_status': 30, // Critical - must be tax-exempt
  years_operating: 15, // Stability indicator
  revenue_range: 20, // Size appropriateness
  overhead_ratio: 20, // Efficiency
  recent_990: 15, // Data freshness
};

// ============================================================================
// Tier 1 Individual Check Functions
// ============================================================================

/**
 * Check 1: 501(c)(3) Status
 * PASS: subsection === "03"
 * FAIL: anything else
 */
export function check501c3Status(profile: NonprofitProfile): Tier1Check {
  const passed = profile.subsection === '03';

  return {
    name: '501c3_status',
    passed,
    result: passed ? 'PASS' : 'FAIL',
    detail: passed
      ? `501(c)(3) public charity (subsection ${profile.subsection})`
      : `Not a 501(c)(3) - subsection ${profile.subsection || 'unknown'}`,
    weight: CHECK_WEIGHTS['501c3_status'],
  };
}

/**
 * Check 2: Years Operating
 * PASS: >= 3 years
 * REVIEW: 1-3 years
 * FAIL: < 1 year or no ruling date
 */
export function checkYearsOperating(profile: NonprofitProfile): Tier1Check {
  const years = profile.years_operating;

  let result: CheckResult;
  let detail: string;

  if (years === null || years < 0) {
    result = 'FAIL';
    detail = 'No ruling date available';
  } else if (years < 1) {
    result = 'FAIL';
    detail = `Less than 1 year operating (${years} years since ${profile.ruling_date})`;
  } else if (years < 3) {
    result = 'REVIEW';
    detail = `${years} years operating (since ${profile.ruling_date}) - newer organization`;
  } else {
    result = 'PASS';
    detail = `${years} years operating (since ${profile.ruling_date})`;
  }

  return {
    name: 'years_operating',
    passed: result === 'PASS',
    result,
    detail,
    weight: CHECK_WEIGHTS['years_operating'],
  };
}

/**
 * Check 3: Revenue Range
 * PASS: $100K - $10M
 * REVIEW: $50K - $100K or $10M - $50M
 * FAIL: < $50K or > $50M or $0/missing
 */
export function checkRevenueRange(profile: NonprofitProfile): Tier1Check {
  const revenue = profile.latest_990?.total_revenue;

  let result: CheckResult;
  let detail: string;

  if (revenue === undefined || revenue === null) {
    result = 'FAIL';
    detail = 'No revenue data available';
  } else if (revenue < 0) {
    result = 'FAIL';
    detail = `Negative revenue ($${formatNumber(revenue)}) - data anomaly requires investigation`;
  } else if (revenue === 0) {
    result = 'FAIL';
    detail = 'Zero revenue reported';
  } else if (revenue < 50000) {
    result = 'FAIL';
    detail = `$${formatNumber(revenue)} revenue - too small to assess reliably`;
  } else if (revenue < 100000) {
    result = 'REVIEW';
    detail = `$${formatNumber(revenue)} revenue - small but viable`;
  } else if (revenue <= 10000000) {
    result = 'PASS';
    detail = `$${formatNumber(revenue)} revenue - appropriate size for impact`;
  } else if (revenue <= 50000000) {
    result = 'REVIEW';
    detail = `$${formatNumber(revenue)} revenue - larger organization, may have different needs`;
  } else {
    result = 'FAIL';
    detail = `$${formatNumber(revenue)} revenue - outside target scope (>$50M)`;
  }

  return {
    name: 'revenue_range',
    passed: result === 'PASS',
    result,
    detail,
    weight: CHECK_WEIGHTS['revenue_range'],
  };
}

/**
 * Check 4: Expense Efficiency (renamed from "overhead ratio")
 *
 * NOTE: ProPublica data doesn't separate program vs admin expenses,
 * so we cannot calculate true overhead (admin/fundraising %).
 *
 * Instead, we check Expense-to-Revenue ratio:
 * - 70-100%: Healthy - org is deploying funds toward mission
 * - 50-70%: Review - may be accumulating reserves or underspending
 * - <50%: Concerning - significant funds not being deployed
 * - >100%: Review - spending more than revenue (may be sustainable via reserves)
 * - >120%: Concerning - potentially unsustainable burn rate
 */
export function checkOverheadRatio(profile: NonprofitProfile): Tier1Check {
  const ratio = profile.latest_990?.overhead_ratio;

  let result: CheckResult;
  let detail: string;

  if (ratio === undefined || ratio === null) {
    result = 'REVIEW';
    detail = 'Cannot calculate expense efficiency - missing data';
  } else if (ratio >= 0.70 && ratio <= 1.0) {
    result = 'PASS';
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - healthy fund deployment`;
  } else if (ratio > 1.0 && ratio <= 1.2) {
    result = 'REVIEW';
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - spending exceeds revenue (check reserves)`;
  } else if (ratio > 1.2) {
    result = 'FAIL';
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - potentially unsustainable`;
  } else if (ratio >= 0.5) {
    result = 'REVIEW';
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - lower than typical (accumulating reserves?)`;
  } else {
    result = 'FAIL';
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - very low fund deployment`;
  }

  return {
    name: 'overhead_ratio',
    passed: result === 'PASS',
    result,
    detail,
    weight: CHECK_WEIGHTS['overhead_ratio'],
  };
}

/**
 * Check 5: Recent 990 Filed
 * PASS: Filed within 2 years
 * REVIEW: Filed 2-3 years ago
 * FAIL: > 3 years since last filing or no filings
 */
export function checkRecent990(profile: NonprofitProfile): Tier1Check {
  const taxPeriod = profile.latest_990?.tax_period;

  let result: CheckResult;
  let detail: string;

  if (!taxPeriod || profile.filing_count === 0) {
    result = 'FAIL';
    detail = 'No 990 filings on record';
  } else {
    // Parse tax period (YYYY-MM format)
    const [year, month] = taxPeriod.split('-').map(Number);
    const filingDate = new Date(year, month - 1, 1);
    const now = new Date();
    const yearsAgo =
      (now.getTime() - filingDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

    if (yearsAgo <= 2) {
      result = 'PASS';
      detail = `Most recent 990 from ${taxPeriod} (${profile.latest_990?.form_type})`;
    } else if (yearsAgo <= 3) {
      result = 'REVIEW';
      detail = `Most recent 990 from ${taxPeriod} - data is ${yearsAgo.toFixed(1)} years old`;
    } else {
      result = 'FAIL';
      detail = `Most recent 990 from ${taxPeriod} - data is ${yearsAgo.toFixed(1)} years old (too stale)`;
    }
  }

  return {
    name: 'recent_990',
    passed: result === 'PASS',
    result,
    detail,
    weight: CHECK_WEIGHTS['recent_990'],
  };
}

// ============================================================================
// Scoring Calculation
// ============================================================================

/**
 * Calculate overall score from checks
 * PASS = full points, REVIEW = 50% points, FAIL = 0 points
 */
export function calculateScore(checks: Tier1Check[]): number {
  let score = 0;

  for (const check of checks) {
    if (check.result === 'PASS') {
      score += check.weight;
    } else if (check.result === 'REVIEW') {
      score += check.weight * 0.5;
    }
    // FAIL = 0 points
  }

  return Math.round(score);
}

/**
 * Determine recommendation based on score and red flags
 */
export function getRecommendation(
  score: number,
  redFlags: RedFlag[]
): 'PASS' | 'REVIEW' | 'REJECT' {
  // Any HIGH severity red flag = auto-reject
  if (redFlags.some((flag) => flag.severity === 'HIGH')) {
    return 'REJECT';
  }

  if (score >= 80) {
    return 'PASS';
  } else if (score >= 50) {
    return 'REVIEW';
  } else {
    return 'REJECT';
  }
}

// ============================================================================
// Red Flag Detection
// ============================================================================

/**
 * Detect red flags from profile data
 */
export function detectRedFlags(
  profile: NonprofitProfile,
  filings?: ProPublica990Filing[]
): RedFlag[] {
  const flags: RedFlag[] = [];

  // No 990 on file
  if (profile.filing_count === 0 || !profile.latest_990) {
    flags.push({
      severity: 'HIGH',
      type: 'no_990_on_file',
      detail: 'No 990 filings on record with ProPublica',
    });
  }

  // Not 501(c)(3)
  if (profile.subsection !== '03') {
    flags.push({
      severity: 'HIGH',
      type: 'not_501c3',
      detail: `Organization is 501(c)(${profile.subsection || '?'}) - donations may not be tax-deductible`,
    });
  }

  // No ruling date
  if (!profile.ruling_date || profile.years_operating === null) {
    flags.push({
      severity: 'HIGH',
      type: 'no_ruling_date',
      detail: 'No IRS ruling date on record',
    });
  }

  // Too new (< 1 year)
  if (profile.years_operating !== null && profile.years_operating < 1) {
    flags.push({
      severity: 'MEDIUM',
      type: 'too_new',
      detail: `Organization is less than 1 year old`,
    });
  }

  // Check 990-related flags
  if (profile.latest_990) {
    // Stale 990 (> 4 years)
    const taxPeriod = profile.latest_990.tax_period;
    if (taxPeriod) {
      const [year] = taxPeriod.split('-').map(Number);
      const currentYear = new Date().getFullYear();
      if (currentYear - year > 4) {
        flags.push({
          severity: 'HIGH',
          type: 'stale_990',
          detail: `Most recent 990 is from ${taxPeriod} (>${currentYear - year} years old)`,
        });
      }
    }

    // Expense efficiency flags (NOTE: this is expense/revenue, NOT true overhead)
    const ratio = profile.latest_990.overhead_ratio;
    if (ratio !== undefined && ratio !== null) {
      // Very high burn rate (spending significantly more than revenue)
      if (ratio > 1.2) {
        flags.push({
          severity: 'HIGH',
          type: 'very_high_overhead',
          detail: `Expense-to-revenue ratio is ${formatPercent(ratio)} - spending far exceeds income`,
        });
      }
      // Very low fund deployment (potential hoarding)
      else if (ratio < 0.5) {
        flags.push({
          severity: 'MEDIUM',
          type: 'high_overhead',
          detail: `Expense-to-revenue ratio is only ${formatPercent(ratio)} - low fund deployment`,
        });
      }
    }

    // Very low revenue (< $25K)
    const revenue = profile.latest_990.total_revenue;
    if (revenue !== undefined && revenue < 25000) {
      flags.push({
        severity: 'MEDIUM',
        type: 'very_low_revenue',
        detail: `Revenue is only $${formatNumber(revenue)} - very small operation`,
      });
    }
  }

  // Revenue decline check (requires multiple filings)
  if (filings && filings.length >= 2) {
    const sortedFilings = [...filings].sort((a, b) => b.tax_prd - a.tax_prd);
    const latest = sortedFilings[0];
    const previous = sortedFilings[1];

    if (latest.totrevenue && previous.totrevenue && previous.totrevenue > 0) {
      const decline =
        (previous.totrevenue - latest.totrevenue) / previous.totrevenue;
      if (decline > 0.5) {
        flags.push({
          severity: 'MEDIUM',
          type: 'revenue_decline',
          detail: `Revenue declined ${formatPercent(decline)} year-over-year ($${formatNumber(previous.totrevenue)} → $${formatNumber(latest.totrevenue)})`,
        });
      }
    }
  }

  return flags;
}

// ============================================================================
// Main Tier 1 Check Function
// ============================================================================

/**
 * Run all Tier 1 checks and return comprehensive result
 */
export function runTier1Checks(
  profile: NonprofitProfile,
  filings?: ProPublica990Filing[]
): Tier1Result {
  // Run all individual checks
  const checks: Tier1Check[] = [
    check501c3Status(profile),
    checkYearsOperating(profile),
    checkRevenueRange(profile),
    checkOverheadRatio(profile),
    checkRecent990(profile),
  ];

  // Calculate score
  const score = calculateScore(checks);

  // Detect red flags
  const redFlags = detectRedFlags(profile, filings);

  // Determine recommendation
  const recommendation = getRecommendation(score, redFlags);

  // Overall passed = recommendation is PASS
  const passed = recommendation === 'PASS';

  // Generate standardized summary
  const summary = generateSummary(
    profile.name,
    score,
    recommendation,
    checks,
    redFlags,
    profile.years_operating
  );

  return {
    ein: profile.ein,
    name: profile.name,
    passed,
    score,
    summary,
    checks,
    recommendation,
    red_flags: redFlags,
  };
}

/**
 * Run red flag detection only
 */
export function runRedFlagCheck(
  profile: NonprofitProfile,
  filings?: ProPublica990Filing[]
): RedFlagResult {
  const flags = detectRedFlags(profile, filings);

  return {
    ein: profile.ein,
    name: profile.name,
    flags,
    clean: flags.length === 0,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K`;
  }
  return num.toFixed(0);
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
