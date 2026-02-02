import {
  Tier1Check,
  Tier1Summary,
  RedFlag,
  CheckResult,
  RedFlagType,
} from "./types.js";

// ============================================================================
// Tier 1 Verdict Configuration
// ============================================================================

export const VERDICT_CONFIG = {
  PASS: {
    headline: "Approved for Tier 2 Vetting",
    template:
      "Organization meets Tier 1 criteria with a score of {{score}}/100. {{name}} is a verified 501(c)(3) with {{years}} years of operating history and healthy financials.",
    next_steps: [
      "Proceed to Tier 2 deep-dive vetting",
      "Review program effectiveness and impact metrics",
      "Verify leadership and governance structure",
    ],
  },
  REVIEW: {
    headline: "Manual Review Required",
    template:
      "Organization scored {{score}}/100, requiring manual review. {{issues_summary}} Verify these concerns before proceeding.",
    next_steps: [
      "Review flagged items manually",
      "Request additional documentation if needed",
      "Re-evaluate after addressing concerns",
    ],
  },
  REJECT: {
    headline: "Does Not Meet Criteria",
    template:
      "Organization does not meet minimum Tier 1 criteria (score: {{score}}/100). {{issues_summary}}",
    next_steps: [
      "Do not proceed with funding consideration",
      "Document rejection reason for records",
      "Consider alternative organizations in this space",
    ],
  },
} as const;

// ============================================================================
// Check-Specific Messages
// ============================================================================

export const CHECK_MESSAGES: Record<
  string,
  Record<
    CheckResult,
    { factor: string; weight: "positive" | "negative" | "neutral" }
  >
> = {
  "501c3_status": {
    PASS: {
      factor: "501(c)(3) tax-exempt status verified",
      weight: "positive",
    },
    REVIEW: {
      factor: "501(c)(3) status needs verification",
      weight: "neutral",
    },
    FAIL: { factor: "Not a 501(c)(3) organization", weight: "negative" },
  },
  years_operating: {
    PASS: { factor: "Established track record (3+ years)", weight: "positive" },
    REVIEW: { factor: "Newer organization (1-3 years)", weight: "neutral" },
    FAIL: { factor: "Insufficient operating history", weight: "negative" },
  },
  revenue_range: {
    PASS: {
      factor: "Revenue in target range ($100K-$10M)",
      weight: "positive",
    },
    REVIEW: { factor: "Revenue outside ideal range", weight: "neutral" },
    FAIL: { factor: "Revenue outside acceptable range", weight: "negative" },
  },
  overhead_ratio: {
    PASS: { factor: "Healthy expense-to-revenue ratio", weight: "positive" },
    REVIEW: { factor: "Expense ratio needs review", weight: "neutral" },
    FAIL: { factor: "Concerning expense ratio", weight: "negative" },
  },
  recent_990: {
    PASS: { factor: "Recent financial data available", weight: "positive" },
    REVIEW: { factor: "Financial data slightly dated", weight: "neutral" },
    FAIL: { factor: "Financial data too old or missing", weight: "negative" },
  },
};

// ============================================================================
// Red Flag Messages
// ============================================================================

export const RED_FLAG_FACTORS: Partial<Record<RedFlagType, string>> = {
  no_990_on_file: "No 990 filings on record",
  stale_990: "Financial data is severely outdated",
  low_fund_deployment: "Low fund deployment ratio",
  very_high_overhead: "Unsustainable expense-to-revenue ratio",
  no_ruling_date: "No IRS determination date",
  very_low_revenue: "Very small operation",
  revenue_decline: "Significant revenue decline",
  not_501c3: "Not tax-exempt under 501(c)(3)",
  too_new: "Organization is less than 1 year old",
  high_officer_compensation: "High officer/director compensation ratio",
};

// ============================================================================
// Summary Generator
// ============================================================================

export function generateSummary(
  name: string,
  score: number,
  recommendation: "PASS" | "REVIEW" | "REJECT",
  checks: Tier1Check[],
  redFlags: RedFlag[],
  yearsOperating: number | null,
): Tier1Summary {
  const config = VERDICT_CONFIG[recommendation];

  // Build key factors from checks
  const keyFactors: string[] = [];

  for (const check of checks) {
    const checkConfig = CHECK_MESSAGES[check.name];
    if (checkConfig) {
      const msg = checkConfig[check.result];
      const prefix =
        msg.weight === "positive" ? "+" : msg.weight === "negative" ? "-" : "~";
      keyFactors.push(`${prefix} ${msg.factor}`);
    }
  }

  // Add red flags as negative factors
  for (const flag of redFlags) {
    const flagMsg = RED_FLAG_FACTORS[flag.type] ?? flag.detail;
    // Avoid duplicates (some red flags overlap with check failures)
    const factorText = `- ${flagMsg} (${flag.severity})`;
    if (!keyFactors.some((f) => f.includes(flagMsg))) {
      keyFactors.push(factorText);
    }
  }

  // Build issues summary for REVIEW/REJECT
  const issues = checks
    .filter((c) => c.result !== "PASS")
    .map((c) => c.detail)
    .slice(0, 3); // Top 3 issues

  const issuesSummary =
    issues.length > 0
      ? `Key concerns: ${issues.join("; ")}.`
      : "No specific concerns identified.";

  // Interpolate template
  const justification = config.template
    .replace("{{score}}", String(score))
    .replace("{{name}}", name)
    .replace(
      "{{years}}",
      yearsOperating !== null ? String(yearsOperating) : "unknown",
    )
    .replace("{{issues_summary}}", issuesSummary);

  return {
    headline: config.headline,
    justification,
    key_factors: keyFactors,
    next_steps: [...config.next_steps],
  };
}
