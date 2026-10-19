/**
 * Scoring System
 *
 * Base points: configurable per question (default 100)
 * Speed bonus: up to 50% of base points, scaled by how fast you answered
 *   speedBonus = basePoints * 0.5 * (1 - timeTaken / timeLimit)
 *   Minimum speed bonus: 0 (no bonus for answering at the very last second)
 *
 * Negative marking (optional): -negativePoints for wrong answer
 *
 * Total = basePoints + speedBonus (if correct)
 *       = -negativePoints (if incorrect and negative marking enabled)
 *       = 0 (if incorrect and no negative marking)
 */

export interface ScoringConfig {
  basePoints: number;
  timeLimit: number;
  negativeMarking: boolean;
  negativePoints: number;
  speedBonusEnabled: boolean;
}

export function calculateScore(
  isCorrect: boolean,
  timeTaken: number,
  config: ScoringConfig
): number {
  if (!isCorrect) {
    if (config.negativeMarking) {
      return -Math.abs(config.negativePoints);
    }
    return 0;
  }

  let score = config.basePoints;

  if (config.speedBonusEnabled && config.timeLimit > 0) {
    // Speed bonus: up to 50% extra, linearly scaled
    const ratio = Math.max(0, 1 - timeTaken / config.timeLimit);
    const speedBonus = Math.floor(config.basePoints * 0.5 * ratio);
    score += speedBonus;
  }

  return score;
}

/**
 * Compute leaderboard rankings from participants.
 * Ties are broken by: total correct answers, then join time (earlier = better).
 */
export function computeRankings(
  participants: Array<{
    id: string;
    nickname: string;
    score: number;
    correct: number;
    incorrect: number;
    joinedAt?: string;
    joined_at?: string;
  }>
): Array<{ id: string; rank: number }> {
  const sorted = [...participants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.correct !== a.correct) return b.correct - a.correct;
    // Earlier join = better tiebreak
    const aTime = new Date(a.joinedAt ?? a.joined_at ?? 0).getTime();
    const bTime = new Date(b.joinedAt ?? b.joined_at ?? 0).getTime();
    return aTime - bTime;
  });

  const rankings: Array<{ id: string; rank: number }> = [];
  let rank = 1;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].score !== sorted[i - 1].score) {
      rank = i + 1;
    }
    rankings.push({ id: sorted[i].id, rank });
  }
  return rankings;
}
