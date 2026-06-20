import { describe, expect, it } from 'vitest';
import { POINT_SCENARIO_LAB_CONTRACT_VERSION } from '../src/contracts/pointScenarioLab.js';
import { resolvePointScenarioLabMetadata } from '../src/services/pointScenarioLab/governance.js';

const GENERATED_AT = '2026-06-20T00:00:00.000Z';

describe('resolvePointScenarioLabMetadata (fail-closed dataset metadata)', () => {
  it('stamps the exact dataset-level contract literal', () => {
    const metadata = resolvePointScenarioLabMetadata({ generatedAt: GENERATED_AT, governanceStatus: 'governed' });
    expect(metadata.contractVersion).toBe('point_scenario_lab_v1');
    expect(metadata.contractVersion).toBe(POINT_SCENARIO_LAB_CONTRACT_VERSION);
  });

  it('always carries a dataset-level generatedAt', () => {
    const metadata = resolvePointScenarioLabMetadata({ generatedAt: GENERATED_AT, governanceStatus: 'fixture' });
    expect(metadata.generatedAt).toBe(GENERATED_AT);
  });

  it('honors an explicit governed assertion as an explicit marker', () => {
    const metadata = resolvePointScenarioLabMetadata({ generatedAt: GENERATED_AT, governanceStatus: 'governed' });
    expect(metadata.governanceStatus).toBe('governed');
    expect(metadata.governanceSource).toBe('explicit_marker');
  });

  it('fails closed to unknown when no governance status is asserted', () => {
    const metadata = resolvePointScenarioLabMetadata({ generatedAt: GENERATED_AT });
    expect(metadata.governanceStatus).toBe('unknown');
    expect(metadata.governanceSource).toBe('unknown');
  });

  it('fails closed to unknown for an unrecognized status', () => {
    const metadata = resolvePointScenarioLabMetadata({
      generatedAt: GENERATED_AT,
      // Simulate a malformed/unexpected upstream value.
      governanceStatus: 'promoted' as never,
    });
    expect(metadata.governanceStatus).toBe('unknown');
    expect(metadata.governanceSource).toBe('unknown');
  });

  it('treats path inference as a weak hint only (never synthesized, only honored when explicit)', () => {
    const metadata = resolvePointScenarioLabMetadata({
      generatedAt: GENERATED_AT,
      governanceStatus: 'ungoverned',
      governanceSource: 'path_inference',
    });
    expect(metadata.governanceStatus).toBe('ungoverned');
    expect(metadata.governanceSource).toBe('path_inference');
  });

  it('omits optional promotedAt / promotionNotes unless provided', () => {
    const bare = resolvePointScenarioLabMetadata({ generatedAt: GENERATED_AT, governanceStatus: 'governed' });
    expect(bare.promotedAt).toBeUndefined();
    expect(bare.promotionNotes).toBeUndefined();

    const full = resolvePointScenarioLabMetadata({
      generatedAt: GENERATED_AT,
      governanceStatus: 'governed',
      promotedAt: '2026-06-20T01:00:00.000Z',
      promotionNotes: 'Promoted from governed scenario dataset.',
    });
    expect(full.promotedAt).toBe('2026-06-20T01:00:00.000Z');
    expect(full.promotionNotes).toBe('Promoted from governed scenario dataset.');
  });
});
