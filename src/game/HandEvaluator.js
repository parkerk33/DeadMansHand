import { RANK_VALUES } from './Deck.js';

export const HAND_NAMES = [
  'High Card', 'One Pair', 'Two Pair', 'Three of a Kind',
  'Straight', 'Flush', 'Full House', 'Four of a Kind',
  'Straight Flush', 'Royal Flush',
];

function combinations(arr, k) {
  const result = [];
  function helper(start, cur) {
    if (cur.length === k) { result.push([...cur]); return; }
    for (let i = start; i < arr.length; i++) {
      cur.push(arr[i]);
      helper(i + 1, cur);
      cur.pop();
    }
  }
  helper(0, []);
  return result;
}

function evaluate5(cards) {
  const values = cards.map(c => c.value).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);

  const countMap = {};
  for (const v of values) countMap[v] = (countMap[v] || 0) + 1;

  const groups = Object.entries(countMap)
    .map(([val, cnt]) => ({ val: Number(val), cnt }))
    .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

  const counts = groups.map(g => g.cnt);
  const tieVals = groups.map(g => g.val);

  let isStraight = false;
  let straightHigh = 0;

  if (Object.keys(countMap).length === 5) {
    if (values[0] - values[4] === 4) { isStraight = true; straightHigh = values[0]; }
    if (values[0] === 14 && values[1] === 5 && values[2] === 4 && values[3] === 3 && values[4] === 2) {
      isStraight = true; straightHigh = 5;
    }
  }

  let rank, tiebreakers;

  if (isFlush && isStraight) {
    rank = straightHigh === 14 ? 9 : 8;
    tiebreakers = [straightHigh];
  } else if (counts[0] === 4) {
    rank = 7; tiebreakers = tieVals;
  } else if (counts[0] === 3 && counts[1] === 2) {
    rank = 6; tiebreakers = tieVals;
  } else if (isFlush) {
    rank = 5; tiebreakers = values;
  } else if (isStraight) {
    rank = 4; tiebreakers = [straightHigh];
  } else if (counts[0] === 3) {
    rank = 3; tiebreakers = tieVals;
  } else if (counts[0] === 2 && counts[1] === 2) {
    rank = 2; tiebreakers = tieVals;
  } else if (counts[0] === 2) {
    rank = 1; tiebreakers = tieVals;
  } else {
    rank = 0; tiebreakers = values;
  }

  return { rank, tiebreakers };
}

export function compareHandResults(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.max(a.tiebreakers.length, b.tiebreakers.length); i++) {
    const av = a.tiebreakers[i] ?? 0;
    const bv = b.tiebreakers[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function bestFrom(cards) {
  if (cards.length < 5) return { rank: -1, tiebreakers: cards.map(c => c.value).sort((a,b)=>b-a), name: 'Partial' };
  const combs = combinations(cards, 5);
  let best = null;
  for (const combo of combs) {
    const r = evaluate5(combo);
    if (!best || compareHandResults(r, best) > 0) best = r;
  }
  best.name = HAND_NAMES[best.rank];
  return best;
}

function bestFromWithWilds(nonWilds, numWilds) {
  const suits = ['♠', '♥', '♦', '♣'];
  const ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  let best = null;

  function tryWild(cards, rem) {
    if (rem === 0) {
      const r = bestFrom(cards);
      if (!best || compareHandResults(r, best) > 0) best = r;
      return;
    }
    for (const suit of suits) {
      for (const rank of ranks) {
        tryWild([...cards, { suit, rank, value: RANK_VALUES[rank] }], rem - 1);
      }
    }
  }

  tryWild(nonWilds, numWilds);
  if (best) best.name = HAND_NAMES[best.rank];
  return best;
}

export function evaluateBestHand(cards) {
  const valid = (cards || []).filter(c => c && c.rank && c.value);
  if (valid.length === 0) return { rank: -1, tiebreakers: [], name: 'No Hand' };

  const wilds = valid.filter(c => c.wild);
  const nonWilds = valid.filter(c => !c.wild);

  if (wilds.length === 0) return bestFrom(valid);
  return bestFromWithWilds(nonWilds, wilds.length);
}

export function getHandName(result) {
  return result?.name ?? (result ? HAND_NAMES[result.rank] : 'Unknown');
}
