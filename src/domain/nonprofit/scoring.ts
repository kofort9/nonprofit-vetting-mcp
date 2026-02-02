import {
  NonprofitProfile,
  Tier1Check,
  Tier1Result,
  CheckResult,
  RedFlag,
  RedFlagResult,
  ProPublica990Filing,
  VettingThresholds,
} from "./types.js";
import { generateSummary } from "./messages.js";

// ============================================================================
// Tier 1 Individual Check Functions
// ============================================================================

/**
 * Check 1: 501(c)(3) Status
 * PASS: subsection === "03"
 * FAIL: anything else
 */
export function check501c3Status(
  profile: NonprofitProfile,
  t: VettingThresholds,
): Tier1Check {
  const passed = profile.subsection === "03";

  return {
    name: "501c3_status",
    passed,
    result: passed ? "PASS" : "FAIL",
    detail: passed
      ? `501(c)(3) public charity (subsection ${profile.subsection})`
      : `Not a 501(c)(3) - subsection ${profile.subsection || "unknown"}`,
    weight: t.weight501c3Status,
  };
}

/**
 * Check 2: Years Operating
 * PASS: >= yearsPassMin
 * REVIEW: >= yearsReviewMin
 * FAIL: < yearsReviewMin or no ruling date
 */
export function checkYearsOperating(
  profile: NonprofitProfile,
  t: VettingThresholds,
): Tier1Check {
  const years = profile.years_operating;

  let result: CheckResult;
  let detail: string;

  if (years === null || years < 0) {
    result = "FAIL";
    detail = "No ruling date available";
  } else if (years < t.yearsReviewMin) {
    result = "FAIL";
    detail = `Less than ${t.yearsReviewMin} year${t.yearsReviewMin === 1 ? "" : "s"} operating (${years} year${years === 1 ? "" : "s"} since ${profile.ruling_date})`;
  } else if (years < t.yearsPassMin) {
    result = "REVIEW";
    detail = `${years} years operating (since ${profile.ruling_date}) - newer organization`;
  } else {
    result = "PASS";
    detail = `${years} years operating (since ${profile.ruling_date})`;
  }

  return {
    name: "years_operating",
    passed: result === "PASS",
    result,
    detail,
    weight: t.weightYearsOperating,
  };
}

/**
 * Check 3: Revenue Range
 * PASS: revenuePassMin - revenuePassMax
 * REVIEW: revenueFailMin - revenuePassMin or revenuePassMax - revenueReviewMax
 * FAIL: < revenueFailMin or > revenueReviewMax or $0/missing
 */
export function checkRevenueRange(
  profile: NonprofitProfile,
  t: VettingThresholds,
): Tier1Check {
  const revenue = profile.latest_990?.total_revenue;

  let result: CheckResult;
  let detail: string;

  if (revenue === undefined || revenue === null) {
    result = "FAIL";
    detail = "No revenue data available";
  } else if (revenue < 0) {
    result = "FAIL";
    detail = `Negative revenue ($${formatNumber(revenue)}) - data anomaly requires investigation`;
  } else if (revenue === 0) {
    result = "FAIL";
    detail = "Zero revenue reported";
  } else if (revenue < t.revenueFailMin) {
    result = "FAIL";
    detail = `$${formatNumber(revenue)} revenue - too small to assess reliably`;
  } else if (revenue < t.revenuePassMin) {
    result = "REVIEW";
    detail = `$${formatNumber(revenue)} revenue - small but viable`;
  } else if (revenue <= t.revenuePassMax) {
    result = "PASS";
    detail = `$${formatNumber(revenue)} revenue - appropriate size for impact`;
  } else if (revenue <= t.revenueReviewMax) {
    result = "REVIEW";
    detail = `$${formatNumber(revenue)} revenue - larger organization, may have different needs`;
  } else {
    result = "FAIL";
    detail = `$${formatNumber(revenue)} revenue - outside target scope (>$${formatNumber(t.revenueReviewMax)})`;
  }

  return {
    name: "revenue_range",
    passed: result === "PASS",
    result,
    detail,
    weight: t.weightRevenueRange,
  };
}

/**
 * Check 4: Expense Efficiency (renamed from "overhead ratio")
 *
 * NOTE: ProPublica data doesn't separate program vs admin expenses,
 * so we cannot calculate true overhead (admin/fundraising %).
 *
 * Instead, we check Expense-to-Revenue ratio using configurable bands.
 */
export function checkOverheadRatio(
  profile: NonprofitProfile,
  t: VettingThresholds,
): Tier1Check {
  const ratio = profile.latest_990?.overhead_ratio;

  let result: CheckResult;
  let detail: string;

  if (ratio === undefined || ratio === null || Number.isNaN(ratio)) {
    result = "REVIEW";
    detail = "Cannot calculate expense efficiency - missing data";
  } else if (ratio >= t.expenseRatioPassMin && ratio <= t.expenseRatioPassMax) {
    result = "PASS";
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - healthy fund deployment`;
  } else if (
    ratio > t.expenseRatioPassMax &&
    ratio <= t.expenseRatioHighReview
  ) {
    result = "REVIEW";
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - spending exceeds revenue (check reserves)`;
  } else if (ratio > t.expenseRatioHighReview) {
    result = "FAIL";
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - potentially unsustainable`;
  } else if (ratio >= t.expenseRatioLowReview) {
    result = "REVIEW";
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - lower than typical (accumulating reserves?)`;
  } else {
    result = "FAIL";
    detail = `${formatPercent(ratio)} expense-to-revenue ratio - very low fund deployment`;
  }

  return {
    name: "overhead_ratio",
    passed: result === "PASS",
    result,
    detail,
    weight: t.weightOverheadRatio,
  };
}

/**
 * Check 5: Recent 990 Filed
 * PASS: Filed within filing990PassMax years
 * REVIEW: Filed within filing990ReviewMax years
 * FAIL: Older or no filings
 */
export function checkRecent990(
  profile: NonprofitProfile,
  t: VettingThresholds,
): Tier1Check {
  const taxPeriod = profile.latest_990?.tax_period;

  let result: CheckResult;
  let detail: string;

  if (!taxPeriod || profile.filing_count === 0) {
    result = "FAIL";
    detail = "No 990 filings on record";
  } else {
    const yearsAgo = yearsFromTaxPeriod(taxPeriod);

    if (yearsAgo <= t.filing990PassMax) {
      result = "PASS";
      detail = `Most recent 990 from ${taxPeriod} (${profile.latest_990?.form_type})`;
    } else if (yearsAgo <= t.filing990ReviewMax) {
      result = "REVIEW";
      detail = `Most recent 990 from ${taxPeriod} - data is ${yearsAgo.toFixed(1)} years old`;
    } else {
      result = "FAIL";
      detail = `Most recent 990 from ${taxPeriod} - data is ${yearsAgo.toFixed(1)} years old (too stale)`;
    }
  }

  return {
    name: "recent_990",
    passed: result === "PASS",
    result,
    detail,
    weight: t.weightRecent990,
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
    if (check.result === "PASS") {
      score += check.weight;
    } else if (check.result === "REVIEW") {
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
  redFlags: RedFlag[],
  t: VettingThresholds,
): "PASS" | "REVIEW" | "REJECT" {
  // Any HIGH severity red flag = auto-reject
  if (redFlags.some((flag) => flag.severity === "HIGH")) {
    return "REJECT";
  }

  if (score >= t.scorePassMin) {
    return "PASS";
  } else if (score >= t.scoreReviewMin) {
    return "REVIEW";
  } else {
    return "REJECT";
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
  filings: ProPublica990Filing[] | undefined,
  t: VettingThresholds,
): RedFlag[] {
  const flags: RedFlag[] = [];

  // No 990 on file
  if (profile.filing_count === 0 || !profile.latest_990) {
    flags.push({
      severity: "HIGH",
      type: "no_990_on_file",
      detail: "No 990 filings on record with ProPublica",
    });
  }

  // Not 501(c)(3)
  if (profile.subsection !== "03") {
    flags.push({
      severity: "HIGH",
      type: "not_501c3",
      detail: `Organization is 501(c)(${profile.subsection || "?"}) - donations may not be tax-deductible`,
    });
  }

  // No ruling date
  if (!profile.ruling_date || profile.years_operating === null) {
    flags.push({
      severity: "HIGH",
      type: "no_ruling_date",
      detail: "No IRS ruling date on record",
    });
  }

  // Too new
  if (
    profile.years_operating !== null &&
    profile.years_operating < t.redFlagTooNewYears
  ) {
    flags.push({
      severity: "MEDIUM",
      type: "too_new",
      detail: `Organization is less than ${t.redFlagTooNewYears} year${t.redFlagTooNewYears === 1 ? "" : "s"} old`,
    });
  }

  // Check 990-related flags
  if (profile.latest_990) {
    const taxPeriod = profile.latest_990.tax_period;
    if (taxPeriod) {
      const yearsAgo = yearsFromTaxPeriod(taxPeriod);
      if (yearsAgo > t.redFlagStale990Years) {
        flags.push({
          severity: "HIGH",
          type: "stale_990",
          detail: `Most recent 990 is from ${taxPeriod} (${yearsAgo.toFixed(1)} years old)`,
        });
      }
    }

    // Expense efficiency flags (NOTE: this is expense/revenue, NOT true overhead)
    const ratio = profile.latest_990.overhead_ratio;
    if (ratio !== undefined && ratio !== null) {
      if (ratio > t.redFlagHighExpenseRatio) {
        flags.push({
          severity: "HIGH",
          type: "very_high_overhead",
          detail: `Expense-to-revenue ratio is ${formatPercent(ratio)} - spending far exceeds income`,
        });
      } else if (ratio < t.redFlagLowExpenseRatio) {
        flags.push({
          severity: "MEDIUM",
          type: "low_fund_deployment",
          detail: `Expense-to-revenue ratio is only ${formatPercent(ratio)} - low fund deployment`,
        });
      }
    }

    // Very low revenue
    const revenue = profile.latest_990.total_revenue;
    if (revenue != null && revenue < t.redFlagVeryLowRevenue) {
      flags.push({
        severity: "MEDIUM",
        type: "very_low_revenue",
        detail: `Revenue is only $${formatNumber(revenue)} - very small operation`,
      });
    }

    // Officer compensation ratio (from profile summary)
    const compRatio = profile.latest_990.officer_compensation_ratio;
    if (compRatio != null && Number.isFinite(compRatio) && compRatio > 0) {
      if (compRatio > t.redFlagHighCompensation) {
        flags.push({
          severity: "HIGH",
          type: "high_officer_compensation",
          detail: `Officer/director compensation is ${formatPercent(compRatio)} of total expenses — exceeds ${formatPercent(t.redFlagHighCompensation)} threshold`,
        });
      } else if (compRatio > t.redFlagModerateCompensation) {
        flags.push({
          severity: "MEDIUM",
          type: "high_officer_compensation",
          detail: `Officer/director compensation is ${formatPercent(compRatio)} of total expenses — elevated`,
        });
      }
    }
  }

  // Revenue decline check (requires multiple filings)
  if (filings && filings.length >= 2) {
    const sorted = [...filings].sort((a, b) => b.tax_prd - a.tax_prd);
    const latest = sorted[0];
    const previous = sorted[1];

    if (
      latest.totrevenue != null &&
      previous.totrevenue != null &&
      previous.totrevenue > 0 &&
      latest.totrevenue >= 0
    ) {
      const decline =
        (previous.totrevenue - latest.totrevenue) / previous.totrevenue;
      if (
        Number.isFinite(decline) &&
        decline > t.redFlagRevenueDeclinePercent
      ) {
        flags.push({
          severity: "MEDIUM",
          type: "revenue_decline",
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
  filings: ProPublica990Filing[] | undefined,
  t: VettingThresholds,
): Tier1Result {
  // Run all individual checks
  const checks: Tier1Check[] = [
    check501c3Status(profile, t),
    checkYearsOperating(profile, t),
    checkRevenueRange(profile, t),
    checkOverheadRatio(profile, t),
    checkRecent990(profile, t),
  ];

  // Calculate score
  const score = calculateScore(checks);

  // Detect red flags
  const redFlags = detectRedFlags(profile, filings, t);

  // Determine recommendation
  const recommendation = getRecommendation(score, redFlags, t);

  // Overall passed = recommendation is PASS
  const passed = recommendation === "PASS";

  // Collect review reasons: details from non-PASS checks + HIGH red flags
  const review_reasons = buildReviewReasons(checks, redFlags);

  // Generate standardized summary
  const summary = generateSummary(
    profile.name,
    score,
    recommendation,
    checks,
    redFlags,
    profile.years_operating,
  );

  return {
    ein: profile.ein,
    name: profile.name,
    passed,
    score,
    summary,
    checks,
    recommendation,
    review_reasons,
    red_flags: redFlags,
  };
}

/**
 * Run red flag detection only
 */
export function runRedFlagCheck(
  profile: NonprofitProfile,
  filings: ProPublica990Filing[] | undefined,
  t: VettingThresholds,
): RedFlagResult {
  const flags = detectRedFlags(profile, filings, t);

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

/**
 * Collect human-readable reasons for non-PASS checks and HIGH red flags.
 * Used by the Bonsaei dashboard to show "why this recommendation?" context.
 */
function buildReviewReasons(
  checks: Tier1Check[],
  redFlags: RedFlag[],
): string[] {
  const reasons: string[] = [];

  for (const check of checks) {
    if (check.result !== "PASS") {
      reasons.push(check.detail);
    }
  }

  for (const flag of redFlags) {
    if (flag.severity === "HIGH") {
      reasons.push(`RED FLAG: ${flag.detail}`);
    }
  }

  return reasons;
}

function yearsFromTaxPeriod(taxPeriod: string): number {
  const [year, month] = taxPeriod.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return Infinity;
  const filingDate = new Date(year, month - 1, 1);
  return (Date.now() - filingDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function formatNumber(num: number): string {
  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";
  if (abs >= 1000000) {
    return `${sign}${(abs / 1000000).toFixed(1)}M`;
  }
  if (abs >= 1000) {
    return `${sign}${(abs / 1000).toFixed(0)}K`;
  }
  return num.toFixed(0);
}

function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}
