import { Deck } from './Deck.js';
import { evaluateBestHand, compareHandResults, HAND_NAMES } from './HandEvaluator.js';

export class PokerGame {
  constructor(playerConfigs, startingChips = 1500, smallBlind = 25) {
    this.smallBlind = smallBlind;
    this.bigBlind = smallBlind * 2;
    this.startingChips = startingChips;

    this.players = playerConfigs.map((cfg, i) => ({
      index: i,
      name: cfg.name,
      isHuman: cfg.isHuman || false,
      class: cfg.class,
      chips: startingChips,
      holeCards: [],
      folded: false,
      allIn: false,
      active: true,
      totalBetThisHand: 0,
    }));

    this.deck = new Deck();
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;
    this.dealerIndex = 0;
    this.roundNumber = 0;
  }

  get activePlayers() { return this.players.filter(p => p.active); }
  get inHandPlayers() { return this.players.filter(p => p.active && !p.folded); }

  nextActiveIndex(from) {
    let idx = (from + 1) % this.players.length;
    for (let i = 0; i < this.players.length; i++) {
      if (this.players[idx].active) return idx;
      idx = (idx + 1) % this.players.length;
    }
    return from;
  }

  get smallBlindIndex() { return this.nextActiveIndex(this.dealerIndex); }
  get bigBlindIndex() { return this.nextActiveIndex(this.smallBlindIndex); }

  startRound() {
    this.roundNumber++;
    this.communityCards = [];
    this.pot = 0;
    this.currentBet = 0;

    for (const p of this.players) {
      p.holeCards = [];
      p.folded = !p.active;
      p.allIn = false;
      p.totalBetThisHand = 0;
    }

    this.dealerIndex = this.nextActiveIndex(this.dealerIndex);
    this.deck.reset();
    this.deck.shuffle();
  }

  postBlinds() {
    const sbIdx = this.smallBlindIndex;
    const bbIdx = this.bigBlindIndex;
    const sb = this.players[sbIdx];
    const bb = this.players[bbIdx];

    const sbAmt = Math.min(this.smallBlind, sb.chips);
    const bbAmt = Math.min(this.bigBlind, bb.chips);

    sb.chips -= sbAmt;
    sb.totalBetThisHand = sbAmt;
    if (sb.chips === 0) sb.allIn = true;

    bb.chips -= bbAmt;
    bb.totalBetThisHand = bbAmt;
    if (bb.chips === 0) bb.allIn = true;

    this.pot += sbAmt + bbAmt;
    this.currentBet = bbAmt;

    return { sbIdx, bbIdx, sbAmt, bbAmt };
  }

  dealHoleCards() {
    const order = this.getActiveOrder(this.smallBlindIndex);
    for (let r = 0; r < 2; r++) {
      for (const p of order) {
        p.holeCards.push(this.deck.deal());
      }
    }
  }

  getActiveOrder(startFrom) {
    const order = [];
    let idx = startFrom;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[idx];
      if (p.active && !p.folded) order.push(p);
      idx = (idx + 1) % this.players.length;
    }
    return order;
  }

  dealFlop() {
    this.deck.deal(); // burn
    this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
  }

  dealTurn() {
    this.deck.deal(); // burn
    this.communityCards.push(this.deck.deal());
  }

  dealRiver() {
    this.deck.deal(); // burn
    this.communityCards.push(this.deck.deal());
  }

  playerFold(idx) { this.players[idx].folded = true; }

  playerBet(idx, additionalAmount) {
    const p = this.players[idx];
    const actual = Math.min(additionalAmount, p.chips);
    p.chips -= actual;
    p.totalBetThisHand += actual;
    this.pot += actual;
    if (p.chips === 0) p.allIn = true;
    return actual;
  }

  determineWinners() {
    const contenders = this.inHandPlayers;
    if (contenders.length === 1) {
      return [{ player: contenders[0], hand: null, handName: 'Last standing' }];
    }

    const results = contenders.map(p => {
      const all = [...p.holeCards, ...this.communityCards];
      const hand = evaluateBestHand(all);
      return { player: p, hand, handName: hand.name || HAND_NAMES[hand.rank] || 'Unknown' };
    });

    results.sort((a, b) => compareHandResults(b.hand, a.hand));
    const best = results[0];
    return results.filter(r => compareHandResults(r.hand, best.hand) === 0);
  }

  distributePot(winners) {
    const share = Math.floor(this.pot / winners.length);
    const rem = this.pot - share * winners.length;
    for (const w of winners) w.player.chips += share;
    if (rem > 0 && winners.length > 0) winners[0].player.chips += rem;
    this.pot = 0;

    for (const p of this.players) {
      if (p.active && p.chips <= 0) p.active = false;
    }
  }

  isGameOver() { return this.activePlayers.length <= 1; }
}
