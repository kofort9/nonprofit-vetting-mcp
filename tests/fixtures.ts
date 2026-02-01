import type {
  NonprofitProfile,
  VettingThresholds,
  ProPublica990Filing,
  Latest990Summary,
} from '../src/domain/nonprofit/types.js';
import { loadThresholds } from '../src/core/config.js';

/**
 * Canonical defaults from config.ts — single source of truth.
 * Importing loadThresholds() ensures tests always match production defaults.
 */
export const DEFAULT_THRESHOLDS: VettingThresholds = loadThresholds();

/**
 * Build thresholds with specific overrides (defaults are valid).
 * Moved here so config.test.ts and scoring.test.ts can share it.
 */
export function makeThresholds(overrides: Partial<VettingThresholds>): VettingThresholds {
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

/**
 * Build tax_prd for filing N years before the "most recent" year.
 * taxPrdOffset(0) = this year's recent, taxPrdOffset(1) = prior year.
 */
export function taxPrdOffset(yearsBack: number): number {
  const baseYear = new Date().getFullYear() - 1;
  return (baseYear - yearsBack) * 100 + 6;
}

/** A recent tax period string for test filings */
function recentTaxPeriod(): string {
  const now = new Date();
  // Use last year to ensure it counts as "recent"
  return `${now.getFullYear() - 1}-06`;
}

/** A recent tax period number (YYYYMM) for raw ProPublica filings */
function recentTaxPrd(): number {
  const now = new Date();
  return (now.getFullYear() - 1) * 100 + 6; // e.g., 202506
}

/**
 * Build a healthy 990 summary. Override any fields as needed.
 */
export function make990(overrides?: Partial<Latest990Summary>): Latest990Summary {
  return {
    tax_period: recentTaxPeriod(),
    tax_year: new Date().getFullYear() - 1,
    form_type: '990',
    total_revenue: 500_000,
    total_expenses: 400_000,
    total_assets: 1_000_000,
    total_liabilities: 200_000,
    overhead_ratio: 0.8,
    ...overrides,
  };
}

/**
 * Build a healthy nonprofit profile that passes all Tier 1 checks.
 * Override any fields to create specific test scenarios.
 */
export function makeProfile(overrides?: Partial<NonprofitProfile>): NonprofitProfile {
  return {
    ein: '95-3135649',
    name: 'Test Nonprofit',
    address: { city: 'Los Angeles', state: 'CA' },
    ruling_date: '2010-01-01',
    years_operating: 15,
    subsection: '03',
    ntee_code: 'K31',
    latest_990: make990(),
    filing_count: 5,
    ...overrides,
  };
}

/**
 * Build a raw ProPublica 990 filing record.
 */
export function makeFiling(overrides?: Partial<ProPublica990Filing>): ProPublica990Filing {
  return {
    tax_prd: recentTaxPrd(),
    tax_prd_yr: new Date().getFullYear() - 1,
    formtype: 1,
    totrevenue: 500_000,
    totfuncexpns: 400_000,
    totassetsend: 1_000_000,
    totliabend: 200_000,
    ...overrides,
  };
}
