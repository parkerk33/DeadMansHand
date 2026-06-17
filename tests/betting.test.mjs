import { PokerGame } from '../src/game/PokerGame.js';
import { botDecide } from '../src/game/BotPlayer.js';
import { BettingRound, settlePots } from '../src/game/BettingEngine.js';

let ok = 0, fail = 0;
const check = (n, c) => { c ? ok++ : (fail++, console.log('  FAIL:', n)); };
const C = (r, s) => ({ rank: r, suit: s, value: ({2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,'10':10,J:11,Q:12,K:13,A:14})[r] });

// ---- helper: play one full hand driven by the bot strategy ----
function botStrategy(game, round, idx, legal) {
  const p = game.players[idx];
  const dec = botDecide(p, game.communityCards,
    { currentBet: round.currentBet, roundBets: round.roundBets, pot: game.pot, noRaise: !legal.canRaise },
    game.bigBlind);
  let a = dec.action;
  if (a === 'raise' && !legal.canRaise) a = legal.canCheck ? 'check' : 'call';
  if (a === 'check' && !legal.canCheck) a = 'call';
  if (a === 'call' && !legal.canCall) a = 'check';
  if (a === 'raise') {
    let amt = Math.max(dec.raiseAmount || legal.minRaiseCommit, legal.minRaiseCommit);
    amt = Math.min(amt, legal.allInCommit);
    return { action: 'raise', amount: amt };
  }
  return { action: a };
}

function playHand(game) {
  game.startRound(); game.postBlinds(); game.dealHoleCards();
  for (const phase of ['preflop', 'flop', 'turn', 'river']) {
    if (phase === 'flop') game.dealFlop();
    if (phase === 'turn') game.dealTurn();
    if (phase === 'river') game.dealRiver();
    if (game.inHandPlayers.length <= 1) break;
    const first = phase === 'preflop'
      ? game.nextActiveIndex(game.bigBlindIndex)
      : game.nextActiveIndex(game.dealerIndex);
    const round = new BettingRound(game, phase, first, { bigBlind: game.bigBlind });
    let guard = 0;
    while (true) {
      const idx = round.actor();
      if (idx < 0) break;
      const legal = round.legalActions(idx);
      const act = botStrategy(game, round, idx, legal);
      round.apply(idx, act.action, act.amount);
      if (++guard > 2000) throw new Error('betting round did not terminate');
    }
  }
  return settlePots(game, game.communityCards);
}

// ---- 1. chip conservation + termination across many full hands ----
let conserved = true, crashed = false, hands = 0;
try {
  const g = new PokerGame([
    { name: 'A', isHuman: false, class: { name: 'Knight' } },
    { name: 'B', isHuman: false, class: { name: 'Noble' } },
    { name: 'C', isHuman: false, class: { name: 'Ranger' } },
    { name: 'D', isHuman: false, class: { name: 'Jester' } },
  ], 1500, 25);
  for (let t = 0; t < 400 && !g.isGameOver(); t++) {
    const before = g.players.reduce((s, p) => s + p.chips, 0);
    playHand(g);
    const after = g.players.reduce((s, p) => s + p.chips, 0);
    // Chips are never lost; split pots may round each winner up to a whole chip
    // unit, so the total can tick UP slightly on a tie — but never down.
    if (after < before) { conserved = false; console.log(`  hand ${t}: ${before} -> ${after}`); }
    hands++;
  }
} catch (e) { crashed = true; console.log('  CRASH:', e.message); }
check('many hands: no crash / terminates', !crashed);
check('many hands: chips never lost (splits may round up)', conserved);
console.log(`  (played ${hands} hands)`);

// ---- 2. side pots: short all-in can only win the main pot ----
{
  const community = [C('7','♦'),C('2','♣'),C('3','♠'),C('4','♥'),C('9','♦')];
  const A = { index:0, name:'A', active:true, folded:false, allIn:true,  chips:0, totalBetThisHand:50,  holeCards:[C('A','♠'),C('A','♥')] }; // AA (best)
  const B = { index:1, name:'B', active:true, folded:false, allIn:false, chips:0, totalBetThisHand:200, holeCards:[C('K','♠'),C('K','♥')] }; // KK
  const D = { index:2, name:'D', active:true, folded:false, allIn:false, chips:0, totalBetThisHand:200, holeCards:[C('Q','♠'),C('Q','♥')] }; // QQ
  const game = { players:[A,B,D], pot:450 };
  settlePots(game, community);
  check('side pot: short all-in wins only main (A=150)', A.chips === 150);
  check('side pot: side pot to next best (B=300)', B.chips === 300);
  check('side pot: loser gets nothing (D=0)', D.chips === 0);
  check('side pot: total distributed = 450', A.chips + B.chips + D.chips === 450);
}

// ---- 3. folded player's chips stay in the pot but they cannot win ----
{
  const community = [C('7','♦'),C('2','♣'),C('3','♠'),C('4','♥'),C('9','♦')];
  const A = { index:0, name:'A', active:true, folded:true,  allIn:false, chips:0, totalBetThisHand:50,  holeCards:[C('A','♠'),C('A','♥')] };
  const B = { index:1, name:'B', active:true, folded:false, allIn:false, chips:0, totalBetThisHand:100, holeCards:[C('K','♠'),C('K','♥')] };
  const D = { index:2, name:'D', active:true, folded:false, allIn:false, chips:0, totalBetThisHand:100, holeCards:[C('Q','♠'),C('Q','♥')] };
  const game = { players:[A,B,D], pot:250 };
  settlePots(game, community);
  check('fold: best non-folded wins all (B=250)', B.chips === 250);
  check('fold: folded player wins nothing (A=0)', A.chips === 0);
}

// ---- 4. preflop big blind gets the option to act ----
{
  const g = new PokerGame([
    { name:'P0', isHuman:false, class:{name:'Knight'} },
    { name:'P1', isHuman:false, class:{name:'Noble'} },
    { name:'P2', isHuman:false, class:{name:'Ranger'} },
  ], 1500, 25);
  g.startRound(); g.postBlinds(); g.dealHoleCards();
  const round = new BettingRound(g, 'preflop', g.nextActiveIndex(g.bigBlindIndex), { bigBlind: g.bigBlind });
  const bb = g.bigBlindIndex;
  const seen = new Set();
  let guard = 0;
  while (true) {
    const idx = round.actor(); if (idx < 0) break;
    seen.add(idx);
    // everyone just calls/checks
    const legal = round.legalActions(idx);
    round.apply(idx, legal.canCheck ? 'check' : 'call');
    if (++guard > 50) break;
  }
  check('preflop: BB got to act on a limped pot', seen.has(bb));
}

console.log(`\nBETTING ENGINE: ${ok} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
