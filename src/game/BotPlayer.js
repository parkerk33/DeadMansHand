import { evaluateBestHand } from './HandEvaluator.js';

function holeStrength(holeCards) {
  if (!holeCards || holeCards.length < 2) return 0.2;
  const [a, b] = holeCards;
  let s = ((a.value - 2) + (b.value - 2)) / 24; // 0-1 from raw card values
  if (a.rank === b.rank) s += 0.25;
  if (a.suit === b.suit) s += 0.1;
  const gap = Math.abs(a.value - b.value);
  if (gap <= 2 && gap > 0) s += 0.05;
  return Math.min(s, 1);
}

export function estimateStrength(holeCards, communityCards) {
  const all = [...(holeCards || []), ...(communityCards || [])];
  if (all.length < 5) return holeStrength(holeCards);
  const result = evaluateBestHand(all);
  if (result.rank < 0) return holeStrength(holeCards);
  return result.rank / 9 * 0.65 + holeStrength(holeCards) * 0.35;
}

export function botDecide(player, communityCards, bettingState, bigBlind) {
  const { currentBet, roundBets, pot, noRaise } = bettingState;
  const playerBet = roundBets[player.index] || 0;
  const toCall = currentBet - playerBet;
  const chips = player.chips;

  const baseStrength = estimateStrength(player.holeCards, communityCards);
  const isBluffing = Math.random() < 0.15;
  const strength = isBluffing ? 0.4 + Math.random() * 0.4 : baseStrength;

  const minRaise = Math.max(bigBlind, currentBet + bigBlind);

  if (strength < 0.25) {
    if (toCall === 0) return { action: 'check' };
    if (toCall <= chips * 0.08) return { action: 'call' };
    return { action: 'fold' };
  }

  if (strength < 0.5) {
    if (toCall === 0) {
      if (!noRaise && Math.random() < 0.25) {
        return { action: 'raise', raiseAmount: Math.min(Math.floor(pot * 0.5) || bigBlind, chips) };
      }
      return { action: 'check' };
    }
    if (toCall <= chips * 0.25) return { action: 'call' };
    return { action: 'fold' };
  }

  if (strength < 0.75) {
    if (toCall === 0) {
      if (!noRaise && Math.random() < 0.5) {
        return { action: 'raise', raiseAmount: Math.min(Math.floor(pot * 0.75) || minRaise, chips) };
      }
      return { action: 'check' };
    }
    if (!noRaise && Math.random() < 0.35) {
      const raise = Math.min(toCall + Math.floor(pot * 0.5), chips);
      return { action: 'raise', raiseAmount: raise };
    }
    if (toCall <= chips * 0.5) return { action: 'call' };
    return { action: 'fold' };
  }

  // Very strong
  if (toCall === 0) {
    const raise = noRaise ? 0 : Math.min(Math.floor(pot) || minRaise, chips);
    if (!noRaise && raise > 0) return { action: 'raise', raiseAmount: raise };
    return { action: 'check' };
  }
  if (!noRaise && Math.random() < 0.6) {
    const raise = Math.min(toCall + Math.floor(pot * 0.75), chips);
    return { action: 'raise', raiseAmount: raise };
  }
  return { action: 'call' };
}
