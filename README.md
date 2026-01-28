# Grassroot Vetting MCP Server

An MCP (Model Context Protocol) server for automated **grassroots nonprofit vetting** using the ProPublica Nonprofit Explorer API. Implements Tier 1 automated checks from a VC-style nonprofit vetting framework.

## Grassroots Focus

This tool targets **grassroots and community-based nonprofits** ($100K-$10M revenue), not large national charities. The sweet spot: local organizations with real programs, staff, and community impact—but limited fundraising reach.

## Features

- **search_nonprofit** - Search for nonprofits by name, with optional state/city filters
- **get_nonprofit_profile** - Get detailed profile including 990 financial summary
- **check_tier1** - Run automated Tier 1 vetting checks with scoring
- **get_red_flags** - Identify warning signs and issues

## Tier 1 Criteria

The `check_tier1` tool evaluates nonprofits on five criteria:

| Check | Weight | Pass | Review | Fail |
|-------|--------|------|--------|------|
| 501(c)(3) Status | 30 | Subsection "03" | - | Other subsection |
| Years Operating | 15 | ≥3 years | 1-3 years | <1 year |
| Revenue Range | 20 | $100K-$10M | $50K-$100K or $10M-$50M | <$50K or >$50M |
| Expense Efficiency* | 20 | 70-100% | 50-70% or 100-120% | <50% or >120% |
| Recent 990 | 15 | Within 2 years | 2-3 years ago | >3 years |

*\*Note: This measures total expenses / total revenue, NOT true overhead. ProPublica data doesn't separate program vs admin expenses. For pass-through orgs (food banks), high ratios are actually good - it means they're deploying funds effectively.*

**Scoring**: PASS = full points, REVIEW = 50% points, FAIL = 0 points

**Recommendations**:
- 80-100: **PASS** - Proceed to Tier 2
- 50-79: **REVIEW** - Manual review needed
- 0-49: **REJECT** - Do not proceed
- Any HIGH red flag: **REJECT** - Auto-reject regardless of score

## Red Flags

| Flag | Severity | Trigger |
|------|----------|---------|
| No 990 on file | HIGH | No filings in ProPublica |
| Not 501(c)(3) | HIGH | Subsection ≠ "03" |
| No ruling date | HIGH | Missing IRS ruling date |
| Stale 990 | HIGH | Last filing >4 years old |
| Unsustainable burn | HIGH | >120% expense-to-revenue (spending far exceeds income) |
| Low fund deployment | MEDIUM | <50% expense-to-revenue (potential fund hoarding) |
| Very low revenue | MEDIUM | <$25K revenue |
| Revenue decline | MEDIUM | >50% YoY decline |
| Too new | MEDIUM | <1 year operating |

## Installation

```bash
# Clone the repository
git clone https://github.com/kofort9/grassroot-vetting-mcp.git
cd grassroot-vetting-mcp

# Install dependencies
npm install

# Build
npm run build
```

## Usage with Claude Code

Add to your `.mcp.json` configuration:

```json
{
  "mcpServers": {
    "grassroot-vetting": {
      "command": "node",
      "args": ["/path/to/grassroot-vetting-mcp/dist/index.js"]
    }
  }
}
```

Then use the tools in Claude Code:

```
"Search for LA Regional Food Bank"
→ Returns EIN + basic info

"Check tier 1 vetting for EIN 95-3135649"
→ Returns pass/fail checks, score, and recommendation

"Get red flags for EIN 95-3135649"
→ Returns any warning signs
```

## API Reference

### search_nonprofit

Search for nonprofits by name.

**Input:**
```typescript
{
  query: string;      // Required: Organization name or keywords
  state?: string;     // Optional: 2-letter state code
  city?: string;      // Optional: City name
}
```

**Output:**
```typescript
{
  results: Array<{
    ein: string;
    name: string;
    city: string;
    state: string;
    ntee_code: string;
  }>;
  total: number;
  attribution: string;
}
```

### get_nonprofit_profile

Get detailed profile for a nonprofit.

**Input:**
```typescript
{
  ein: string;  // EIN with or without dash
}
```

**Output:**
```typescript
{
  ein: string;
  name: string;
  address: { city, state };
  ruling_date: string;
  years_operating: number;
  subsection: string;
  is_501c3: boolean;
  ntee_code: string;
  latest_990: {
    tax_period: string;
    total_revenue: number;
    total_expenses: number;
    total_assets: number;
    overhead_ratio: number;
  } | null;
  filing_count: number;
}
```

### check_tier1

Run Tier 1 vetting checks.

**Input:**
```typescript
{
  ein: string;  // EIN with or without dash
}
```

**Output:**
```typescript
{
  ein: string;
  name: string;
  passed: boolean;
  score: number;              // 0-100
  checks: Array<{
    name: string;
    passed: boolean;
    result: "PASS" | "REVIEW" | "FAIL";
    detail: string;
    weight: number;
  }>;
  recommendation: "PASS" | "REVIEW" | "REJECT";
  red_flags: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    type: string;
    detail: string;
  }>;
}
```

### get_red_flags

Get red flags for a nonprofit.

**Input:**
```typescript
{
  ein: string;  // EIN with or without dash
}
```

**Output:**
```typescript
{
  ein: string;
  name: string;
  flags: Array<{
    severity: "HIGH" | "MEDIUM" | "LOW";
    type: string;
    detail: string;
  }>;
  clean: boolean;
}
```

## Data Source

This server uses the [ProPublica Nonprofit Explorer API](https://projects.propublica.org/nonprofits/api), which provides:

- Organization details from IRS Business Master File
- 990 tax form data (filed by nonprofits with >$200K gross receipts or >$500K assets)
- Historical filings going back several years

**Attribution Required**: Data provided by ProPublica Nonprofit Explorer.

## Development

```bash
# Run in development mode (watch)
npm run dev

# Run linter
npm run lint

# Run tests
npm test

# Full verification (format, build, lint, test)
npm run verify
```

## License

MIT

## Attribution

Data provided by [ProPublica Nonprofit Explorer](https://projects.propublica.org/nonprofits/).
