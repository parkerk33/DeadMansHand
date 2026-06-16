import { evaluateBestHand, compareHandResults, HAND_NAMES } from './HandEvaluator.js';

/**
 * Pure betting-round state machine for one street. No DOM / no Three.js, so it
 * can be driven identically by the UI controller and by automated tests.
 *
 * Action amounts use one consistent convention:
 *   raise `amount` = the total chips the actor commits THIS action (the call
 *   plus the raise on top). call/check/fold ignore `amount`.
 */
export class BettingRound {
  constructor(game, phase, firstToActIdx, opts = {}) {
    this.game = game;
    this.phase = phase;
    this.n = game.players.length;
    this.bigBlind = opts.bigBlind ?? game.bigBlind;
    this.noRaise = opts.noRaise || false;          // global (Noble decree)
    this.marked = new Set(opts.marked || []);      // players who may not raise (Assassin)
    this.lastRaiseSize = this.bigBlind;

    // Preflop carries the posted blinds into roundBets; postflop starts at 0.
    if (phase === 'preflop') {
      this.currentBet = game.bigBlind;
      this.roundBets = game.players.map((p) => {
        if (!p.active || p.folded) return 0;
        if (p.index === game.smallBlindIndex) return Math.min(game.smallBlind, p.totalBetThisHand);
        if (p.index === game.bigBlindIndex) return Math.min(game.bigBlind, p.totalBetThisHand);
        return 0;
      });
    } else {
      this.currentBet = 0;
      this.roundBets = new Array(this.n).fill(0);
    }

    this.acted = new Set();
    this.lastAggressorIdx = phase === 'preflop' ? game.bigBlindIndex : -1;
    this.currentIdx = firstToActIdx;
    this._complete = false;
  }

  _canAct(i) {
    const p = this.game.players[i];
    return p.active && !p.folded && !p.allIn;
  }

  get inHandCount() {
    return this.game.players.filter((p) => p.active && !p.folded).length;
  }

  /** Index of the next player who must act, or -1 if the round is over. */
  actor() {
    if (this._complete) return -1;
    if (this.inHandCount <= 1) { this._complete = true; return -1; }
    if (!this.game.players.some((_, i) => this._canAct(i))) { this._complete = true; return -1; }

    for (let k = 0; k < this.n; k++) {
      const i = (this.currentIdx + k) % this.n;
      if (!this._canAct(i)) continue;
      const matched = (this.roundBets[i] || 0) >= this.currentBet;
      if (!this.acted.has(i) || !matched) return i;
    }
    this._complete = true;
    return -1;
  }

  get complete() {
    if (this._complete) return true;
    return this.actor() === -1;
  }

  legalActions(idx) {
    const p = this.game.players[idx];
    const toCall = Math.max(0, this.currentBet - (this.roundBets[idx] || 0));
    const blockRaise = this.noRaise || this.marked.has(idx) || p.chips <= toCall;
    const minRaise = Math.min(p.chips, toCall + Math.max(this.bigBlind, this.lastRaiseSize));
    return {
      toCall: Math.min(toCall, p.chips),
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canRaise: !blockRaise,
      minRaiseCommit: minRaise,      // chips to commit for a minimum legal raise
      allInCommit: p.chips,          // chips to commit to go all-in
    };
  }

  /** Apply an action for player `idx`. Returns a short result descriptor. */
  apply(idx, action, amount = 0) {
    const p = this.game.players[idx];
    let committed = 0;
    let kind = action;

    if (action === 'fold') {
      this.game.playerFold(idx);
    } else if (action === 'check') {
      // no chips; only legal when toCall == 0
    } else if (action === 'call') {
      const toCall = Math.max(0, this.currentBet - (this.roundBets[idx] || 0));
      committed = this.game.playerBet(idx, toCall);
      this.roundBets[idx] = (this.roundBets[idx] || 0) + committed;
    } else if (action === 'raise' || action === 'bet' || action === 'allin') {
      const want = action === 'allin' ? p.chips : amount;
      committed = this.game.playerBet(idx, want);
      this.roundBets[idx] = (this.roundBets[idx] || 0) + committed;
      if (this.roundBets[idx] > this.currentBet) {
        this.lastRaiseSize = this.roundBets[idx] - this.currentBet;
        this.currentBet = this.roundBets[idx];
        this.lastAggressorIdx = idx;
        this.acted = new Set();        // a real raise re-opens the action
        kind = 'raise';
      } else {
        kind = 'call';                 // an undersized all-in is just a call
      }
    }

    this.acted.add(idx);
    this.currentIdx = (idx + 1) % this.n;
    return { idx, kind, committed, currentBet: this.currentBet };
  }

  /** Knight "Charge": force the actor's commitment up to a minimum, reopening. */
  forceRaise(idx, totalCommit) {
    return this.apply(idx, 'raise', totalCommit);
  }
}

/**
 * Settle the hand with correct side pots from each player's total contribution
 * this hand. Mutates chips. Returns { pots:[{amount,winners,handName}], summary }.
 */
export function settlePots(game, communityCards) {
  const players = game.players;
  const contrib = players.map((p) => p.totalBetThisHand || 0);
  const remaining = contrib.slice();
  const inHand = (i) => players[i].active && !players[i].folded;

  // Build pot layers.
  const layers = [];
  while (true) {
    const positives = remaining.map((v, i) => (v > 0 ? v : Infinity));
    const minPos = Math.min(...positives);
    if (!isFinite(minPos)) break;
    let amount = 0;
    const eligible = [];
    for (let i = 0; i < players.length; i++) {
      if (remaining[i] > 0) {
        remaining[i] -= minPos;
        amount += minPos;
        if (inHand(i)) eligible.push(i);
      }
    }
    if (amount > 0) layers.push({ amount, eligible });
  }

  // Pre-evaluate the hand of every still-in player once.
  const handOf = {};
  for (let i = 0; i < players.length; i++) {
    if (inHand(i)) {
      handOf[i] = evaluateBestHand([...players[i].holeCards, ...communityCards]);
    }
  }

  const pots = [];
  for (const layer of layers) {
    const elig = layer.eligible.filter((i) => handOf[i]);
    if (elig.length === 0) {
      // Everyone in this layer folded (rare): give it to any remaining contender.
      const fallback = players.findIndex((p, i) => inHand(i));
      if (fallback >= 0) players[fallback].chips += layer.amount;
      continue;
    }
    let best = elig[0];
    let winners = [best];
    for (let k = 1; k < elig.length; k++) {
      const cmp = compareHandResults(handOf[elig[k]], handOf[best]);
      if (cmp > 0) { best = elig[k]; winners = [best]; }
      else if (cmp === 0) winners.push(elig[k]);
    }
    const share = Math.floor(layer.amount / winners.length);
    let rem = layer.amount - share * winners.length;
    for (const w of winners) {
      players[w].chips += share;
      if (rem > 0) { players[w].chips += 1; rem--; }  // odd chip to earliest seat
    }
    const h = handOf[best];
    pots.push({
      amount: layer.amount,
      winners: winners.slice(),
      handName: h.name || HAND_NAMES[h.rank] || 'wins',
    });
  }

  game.pot = 0;
  for (const p of players) {
    if (p.active && p.chips <= 0) p.active = false;
  }

  // Merge winner names for a simple message.
  const names = {};
  for (const pot of pots) for (const w of pot.winners) names[w] = (names[w] || 0) + pot.amount;
  const summary = Object.keys(names)
    .map((i) => `${players[i].name} (+${names[i]})`)
    .join(', ');

  return { pots, summary };
}
