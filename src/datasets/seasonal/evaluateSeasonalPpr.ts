/**
 * Deterministic error metrics for the seasonal PPR backtest (Issue #49).
 *
 * Operates on simple {position, predicted, actual} pairs so it is decoupled from
 * any specific model. All aggregation is order-independent (sums) and therefore
 * deterministic.
 */
import type { ScoringPosition } from '../../contracts/scoring.js';
import type { SeasonalPprErrorSummary } from '../../contracts/seasonalPprBacktest.js';

export interface ScoredPair {
  position: ScoringPosition;
  predicted: number;
  actual: number;
}

const average = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const pearson = (pairs: ScoredPair[]): number | null => {
  if (pairs.length < 2) {
    return null;
  }
  const predictedMean = average(pairs.map((pair) => pair.predicted));
  const actualMean = average(pairs.map((pair) => pair.actual));
  let covariance = 0;
  let predictedVar = 0;
  let actualVar = 0;
  for (const pair of pairs) {
    const predictedDiff = pair.predicted - predictedMean;
    const actualDiff = pair.actual - actualMean;
    covariance += predictedDiff * actualDiff;
    predictedVar += predictedDiff ** 2;
    actualVar += actualDiff ** 2;
  }
  if (predictedVar === 0 || actualVar === 0) {
    return null;
  }
  return covariance / Math.sqrt(predictedVar * actualVar);
};

// Average-rank assignment (ties share the mean rank) so Spearman handles ties.
const toRanks = (values: number[]): number[] => {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = new Array<number>(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) {
      j += 1;
    }
    const averageRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) {
      ranks[indexed[k].index] = averageRank;
    }
    i = j + 1;
  }
  return ranks;
};

const rankCorrelation = (pairs: ScoredPair[]): number | null => {
  if (pairs.length < 2) {
    return null;
  }
  const predictedRanks = toRanks(pairs.map((pair) => pair.predicted));
  const actualRanks = toRanks(pairs.map((pair) => pair.actual));
  return pearson(
    predictedRanks.map((predicted, index) => ({
      position: pairs[index].position,
      predicted,
      actual: actualRanks[index],
    })),
  );
};

export const summarizeSeasonalErrors = (pairs: ScoredPair[]): SeasonalPprErrorSummary => {
  if (pairs.length === 0) {
    return { sample_size: 0, mae: 0, rmse: 0, correlation: null, rank_correlation: null };
  }
  const absoluteErrors = pairs.map((pair) => Math.abs(pair.predicted - pair.actual));
  const squaredErrors = pairs.map((pair) => (pair.predicted - pair.actual) ** 2);
  return {
    sample_size: pairs.length,
    mae: average(absoluteErrors),
    rmse: Math.sqrt(average(squaredErrors)),
    correlation: pearson(pairs),
    rank_correlation: rankCorrelation(pairs),
  };
};

export const summarizeSeasonalErrorsByPosition = (
  pairs: ScoredPair[],
): Partial<Record<ScoringPosition, SeasonalPprErrorSummary>> => {
  const grouped = pairs.reduce<Partial<Record<ScoringPosition, ScoredPair[]>>>((acc, pair) => {
    acc[pair.position] ??= [];
    acc[pair.position]?.push(pair);
    return acc;
  }, {});
  return Object.fromEntries(
    Object.entries(grouped).map(([position, entries]) => [position, summarizeSeasonalErrors(entries ?? [])]),
  ) as Partial<Record<ScoringPosition, SeasonalPprErrorSummary>>;
};
