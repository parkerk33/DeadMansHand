export const CLASSES = {
  Jester: {
    name: 'Jester',
    emoji: '🃏',
    color: 0xf0c040,
    colorStr: '#f0c040',
    lore: 'A master of tricks who bends fate with sleight of hand and chaos.',
    passive: {
      name: 'Sleight of Hand',
      description: 'After cards are dealt, swap one hole card with the top of the deck.',
    },
    ultimate: {
      name: 'Grand Illusion',
      description: 'Force all opponents to discard their worst hole card and draw a new one.',
    },
  },
  Noble: {
    name: 'Noble',
    emoji: '👑',
    color: 0x9b59b6,
    colorStr: '#9b59b6',
    lore: 'Born into power, the Noble leverages wealth and decree to control the table.',
    passive: {
      name: 'Tax Collection',
      description: 'Win an extra 15% bonus chips on every pot you claim.',
    },
    ultimate: {
      name: 'Royal Decree',
      description: 'No player may raise this betting round. Check, call, or fold only.',
    },
  },
  Sorcerer: {
    name: 'Sorcerer',
    emoji: '🔮',
    color: 0x3498db,
    colorStr: '#3498db',
    lore: 'The Sorcerer weaves arcane magic to glimpse destiny and reshape the board.',
    passive: {
      name: 'Foresight',
      description: 'Before each community reveal you may peek at the next card.',
    },
    ultimate: {
      name: 'Arcane Swap',
      description: 'Swap one of your hole cards with any revealed community card.',
    },
  },
  Assassin: {
    name: 'Assassin',
    emoji: '🗡️',
    color: 0x566573,
    colorStr: '#566573',
    lore: 'Silent and lethal, the Assassin profits most when opponents never reach showdown.',
    passive: {
      name: 'Blade in the Dark',
      description: 'If everyone folds to you, gain a 25% bonus on the pot.',
    },
    ultimate: {
      name: 'Mark Target',
      description: 'The chip leader cannot raise this round — only check, call, or fold.',
    },
  },
  Knight: {
    name: 'Knight',
    emoji: '⚔️',
    color: 0xbdc3c7,
    colorStr: '#bdc3c7',
    lore: 'Sworn to honor, the Knight plays with iron discipline and refuses to be manipulated.',
    passive: {
      name: 'Iron Will',
      description: 'You are immune to all abilities used against you.',
    },
    ultimate: {
      name: 'Charge',
      description: 'Force a minimum bet of 2× the current pot. All must match or fold.',
    },
  },
  Summoner: {
    name: 'Summoner',
    emoji: '✨',
    color: 0xe74c3c,
    colorStr: '#e74c3c',
    lore: 'The Summoner calls upon ancient spirits to warp the very nature of cards.',
    passive: {
      name: 'Familiar Bond',
      description: 'Your first hole card is bonded — it can be any suit for evaluation.',
    },
    ultimate: {
      name: 'Summon Elemental',
      description: 'Add a wild card to the community cards. It counts as any card.',
    },
  },
  Ranger: {
    name: 'Ranger',
    emoji: '🏹',
    color: 0x27ae60,
    colorStr: '#27ae60',
    lore: "The Ranger's eagle eye misses nothing — not even cards still face-down.",
    passive: {
      name: 'Tracker',
      description: 'Before the flop, briefly peek at one of the community cards.',
    },
    ultimate: {
      name: "Hunter's Mark",
      description: 'Replace any one revealed community card with a fresh card from the deck.',
    },
  },
  Alchemist: {
    name: 'Alchemist',
    emoji: '⚗️',
    color: 0xe67e22,
    colorStr: '#e67e22',
    lore: 'The Alchemist transmutes defeat into victory through cunning transformation.',
    passive: {
      name: "Philosopher's Stone",
      description: 'Once per round, change the suit of one of your hole cards.',
    },
    ultimate: {
      name: 'Grand Transmutation',
      description: 'Shift the value of any community card up or down by 1.',
    },
  },
};

export const CLASS_LIST = Object.values(CLASSES);
