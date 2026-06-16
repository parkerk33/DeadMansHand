export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_VALUES = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14,
};

export class Deck {
  constructor() { this.reset(); }

  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push({ suit, rank, value: RANK_VALUES[rank], wild: false });
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal() { return this.cards.pop(); }

  peek() { return this.cards.length > 0 ? this.cards[this.cards.length - 1] : null; }

  remove(card) {
    const idx = this.cards.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (idx !== -1) { this.cards.splice(idx, 1); return true; }
    return false;
  }

  get size() { return this.cards.length; }
}
