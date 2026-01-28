# Tier 1 Nonprofit Vetting

This document explains how the grassroot-vetting-mcp implements Tier 1 automated screening as part of Bonsaei's VC-style NGO vetting framework.

## Overview

Tier 1 is the **automated eligibility screening** layer. It uses publicly available IRS 990 data (via ProPublica Nonprofit Explorer) to quickly filter nonprofits against basic criteria before manual review.

### Grassroots Focus

This tool is specifically designed for **grassroots and community-based nonprofits**, not large national charities. The revenue range filter ($100K-$10M) intentionally excludes:

- **Too small (<$50K):** Volunteer-only operations without the infrastructure to absorb donations effectively
- **Too large (>$50M):** Well-resourced national organizations that don't need Bonsaei's platform

The sweet spot is local organizations with real programs, staff, and community impact—but limited fundraising reach. These are the orgs that benefit most from Bonsaei's visibility.

### Position in the Vetting Funnel

```
200 NGOs considered
     ↓
[TIER 1] ← This MCP (automated)
     ↓
 25 pass initial screen
     ↓
  8 deep dive (Tier 2-3, manual)
     ↓
1-2 featured on platform
```

## Tier 1 Criteria

Based on the [VC/NGO Vetting Framework](https://github.com/kofort9/nonprofit-vetting-mcp), Tier 1 checks:

| Criterion | Implementation | Weight |
|-----------|----------------|--------|
| 501(c)(3) status | `subsection === "03"` from IRS data | 30 pts |
| 3+ years operating | Calculate from IRS ruling date | 15 pts |
| Revenue $100K-$10M | From most recent 990 | 20 pts |
| Healthy financials | Expense-to-revenue ratio 70-100% | 20 pts |
| Current data | 990 filed within 2 years | 15 pts |

### Check Details

#### 1. 501(c)(3) Status (30 pts)

**Why it matters:** Only 501(c)(3) organizations can receive tax-deductible donations. This is non-negotiable for Bonsaei's platform.

| Result | Condition | Grassroots Relevance |
|--------|-----------|---------------------|
| **PASS** | `subsection === "03"` | Legitimate charity |
| **FAIL** | Any other subsection | 501(c)(4), (6), etc. aren't donation-eligible |

**Note:** This is the highest-weighted check (30 pts) because it's a legal requirement, not a quality signal.

#### 2. Years Operating (15 pts)

**Why it matters:** Track record demonstrates sustainability. New orgs have higher failure rates.

| Result | Condition | Grassroots Relevance |
|--------|-----------|---------------------|
| **PASS** | 5+ years since IRS ruling | Proven staying power |
| **REVIEW** | 3-5 years | Established but still building |
| **FAIL** | <3 years | Too new to assess reliably |

**Edge cases:**
- Missing ruling date → FAIL (data integrity issue)
- Future date → FAIL (data error)

#### 3. Revenue Range (20 pts) — THE GRASSROOTS FILTER

**Why it matters:** This is where Bonsaei's value proposition shines. The $100K-$10M range targets organizations that:
- Have real programs and staff (not just volunteers)
- Lack the fundraising infrastructure of large nationals
- Would benefit meaningfully from platform visibility

| Result | Condition | Rationale |
|--------|-----------|-----------|
| **PASS** | $100K - $10M | Sweet spot for impact + accountability |
| **REVIEW** | $50K - $100K | Small but viable; may lack capacity |
| **REVIEW** | $10M - $50M | Large; may have different needs |
| **FAIL** | <$50K | Too small to assess; volunteer-only |
| **FAIL** | >$50M | Well-resourced; doesn't need Bonsaei |

#### 4. Expense Efficiency (20 pts)

**Why it matters:** Shows funds are being deployed, not hoarded.

| Result | Condition | Interpretation |
|--------|-----------|---------------|
| **PASS** | 70-100% | Healthy fund deployment |
| **REVIEW** | 50-70% | May be building reserves |
| **REVIEW** | 100-120% | Spending from reserves |
| **FAIL** | <50% | Funds not being deployed |
| **FAIL** | >120% | Unsustainable burn rate |

**Important:** For pass-through orgs (food banks, job programs), high ratios are GOOD—it means efficient distribution.

#### 5. Recent 990 (15 pts)

**Why it matters:** Stale data means we can't trust the financials.

| Result | Condition | Interpretation |
|--------|-----------|---------------|
| **PASS** | Filed within 2 years | Current, reliable data |
| **REVIEW** | 2-3 years old | Slightly dated but usable |
| **FAIL** | >3 years old | Data too stale |

**Note:** 990s are filed annually, 11 months after fiscal year end. A 2-year window accounts for IRS processing delays.

### Scoring System

Each check results in:
- **PASS** = Full points
- **REVIEW** = 50% points
- **FAIL** = 0 points

Total score determines recommendation:
- **80-100**: PASS → Proceed to Tier 2
- **50-79**: REVIEW → Manual review needed
- **0-49**: REJECT → Do not proceed

### Red Flags (Auto-Reject)

Any HIGH severity red flag triggers automatic rejection:

| Red Flag | Severity | Trigger |
|----------|----------|---------|
| No 990 on file | HIGH | `filing_count === 0` |
| Not 501(c)(3) | HIGH | `subsection !== "03"` |
| Unsustainable spending | HIGH | Expense ratio >120% |
| No IRS ruling date | HIGH | Cannot verify legitimacy |
| 990 >4 years old | HIGH | Data too stale |

Medium severity flags are noted but don't auto-reject:

| Red Flag | Severity | Trigger |
|----------|----------|---------|
| Very small operation | MEDIUM | Revenue <$25K |
| Revenue decline | MEDIUM | >50% YoY drop |
| Too new | MEDIUM | <1 year operating |
| Low fund deployment | MEDIUM | Expense ratio <50% |

## API Usage

### Check Tier 1 Eligibility

```typescript
const result = await tools.checkTier1(client, { ein: '95-3135649' });
```

**Response:**

```json
{
  "success": true,
  "data": {
    "ein": "95-3135649",
    "name": "Los Angeles Regional Food Bank",
    "passed": false,
    "score": 73,
    "summary": {
      "headline": "Manual Review Required",
      "justification": "Organization scored 73/100, requiring manual review...",
      "key_factors": [
        "+ 501(c)(3) tax-exempt status verified",
        "+ Established track record (3+ years)",
        "- Revenue outside acceptable range",
        "+ Healthy expense-to-revenue ratio",
        "~ Financial data slightly dated"
      ],
      "next_steps": [
        "Review flagged items manually",
        "Request additional documentation if needed",
        "Re-evaluate after addressing concerns"
      ]
    },
    "checks": [...],
    "recommendation": "REVIEW",
    "red_flags": []
  }
}
```

### Summary Fields

| Field | Description |
|-------|-------------|
| `headline` | One-line verdict for UI display |
| `justification` | 1-2 sentence explanation of decision |
| `key_factors` | List with prefixes: `+` positive, `-` negative, `~` neutral |
| `next_steps` | Actionable items based on verdict |

## Important Notes

### Expense Efficiency vs. Overhead Ratio

The framework specifies "overhead ratio <25%", but ProPublica 990 summary data doesn't separate program expenses from administrative/fundraising expenses.

**What we actually measure:** Total Expenses / Total Revenue

**Interpretation:**
- 70-100%: Healthy fund deployment
- 50-70%: May be accumulating reserves
- <50%: Concerning - funds not being deployed
- >100%: Spending from reserves (review sustainability)
- >120%: Potentially unsustainable burn rate

For pass-through organizations (food banks, etc.), a **high** ratio (97%) is actually **good** - it means they're efficiently distributing resources.

### Data Source

All data comes from [ProPublica Nonprofit Explorer](https://projects.propublica.org/nonprofits/), which aggregates IRS 990 filings. Attribution is required and included in all API responses.

### Available Compensation Data

ProPublica's 990 data includes compensation fields that could support future impact vs. admin expense analysis:

| Field | Description | Use Case |
|-------|-------------|----------|
| `compnsatncurrofcr` | Officer/director compensation | Executive pay ratio |
| `othrsalwages` | Other salaries and wages | Total staff investment |
| `payrolltx` | Payroll taxes | Employment indicator |
| `profndraising` | Professional fundraising fees | Fundraising efficiency |

**Example Analysis (Homeboy Industries):**
```
Total Revenue:        $39.9M
Total Expenses:       $40.0M
Officer Compensation: $809,613 (4.7% of total comp)
Other Salaries:       $15.1M
Payroll Taxes:        $1.4M
Total Compensation:   $17.3M (43.3% of expenses)
```

**Interpretation nuance:** For job-creation programs like Homeboy Industries, a HIGH compensation percentage is actually a **positive signal**—jobs ARE the program. This differs from advocacy or grant-making orgs where high salary % might indicate bloat.

**Not yet implemented:** Future versions may add:
- Executive compensation ratio check (officer pay vs. average staff)
- Compensation-to-program alignment analysis
- Sector-specific benchmarks (service orgs vs. advocacy vs. foundations)

### Limitations

- Data freshness depends on IRS processing (typically 6-18 months lag)
- Cannot verify geographic focus (Tier 2 manual check)
- Cannot detect scandals/lawsuits (requires external research)
- Cannot verify actual program quality (Tier 3 deep dive)
- Compensation analysis requires sector context (not automated yet)

## Recommended Workflow

1. **Search** for nonprofit by name
2. **Get profile** to review basic info
3. **Run Tier 1 check** for automated screening
4. **Check red flags** for disqualifying issues
5. If PASS/REVIEW → proceed to Tier 2 manual review

## Related Documentation

- [MCP Server README](../README.md) - Setup and configuration
- [VC/NGO Vetting Framework](https://docs.google.com/document/d/...) - Full vetting methodology
- [ProPublica API Docs](https://projects.propublica.org/nonprofits/api) - Data source
