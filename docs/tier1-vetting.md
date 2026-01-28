# Tier 1 Nonprofit Vetting

This document explains how the nonprofit-vetting-mcp implements Tier 1 automated screening as part of Bonsaei's VC-style NGO vetting framework.

## Overview

Tier 1 is the **automated eligibility screening** layer. It uses publicly available IRS 990 data (via ProPublica Nonprofit Explorer) to quickly filter nonprofits against basic criteria before manual review.

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

### Limitations

- Data freshness depends on IRS processing (typically 6-18 months lag)
- Cannot verify geographic focus (Tier 2 manual check)
- Cannot detect scandals/lawsuits (requires external research)
- Cannot verify actual program quality (Tier 3 deep dive)

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
