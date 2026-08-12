// ============================================================
// cards.js — UNO Card Definitions, Deck Creation & Shuffle
// ============================================================

const CARD_COLORS = ['red', 'blue', 'green', 'yellow'];

const CARD_TYPES = {
    NUMBER: 'number',
    SKIP: 'skip',
    REVERSE: 'reverse',
    DRAW_TWO: 'draw_two',
    WILD: 'wild',
    WILD_DRAW_FOUR: 'wild_draw_four'
};

// Display symbols for action cards
const CARD_SYMBOLS = {
    [CARD_TYPES.SKIP]: '⊘',
    [CARD_TYPES.REVERSE]: '⟲',
    [CARD_TYPES.DRAW_TWO]: '+2',
    [CARD_TYPES.WILD]: '★',
    [CARD_TYPES.WILD_DRAW_FOUR]: '+4'
};

// Points for scoring
const CARD_POINTS = {
    [CARD_TYPES.SKIP]: 20,
    [CARD_TYPES.REVERSE]: 20,
    [CARD_TYPES.DRAW_TWO]: 20,
    [CARD_TYPES.WILD]: 50,
    [CARD_TYPES.WILD_DRAW_FOUR]: 50
};

// Global ID counter for unique card IDs
let _cardNextId = 1;

/**
 * Creates a card object.
 * @param {string|null} color - Card color (red/blue/green/yellow) or null for wilds
 * @param {string} type - Card type from CARD_TYPES
 * @param {number|null} value - Number value (0-9) for number cards, null otherwise
 * @returns {object} Card object
 */
function createCard(color, type, value = null) {
    return {
        id: _cardNextId++,
        color: color,
        type: type,
        value: value
    };
}

/**
 * Gets the display value for a card (number or symbol).
 */
function getCardDisplay(card) {
    if (card.type === CARD_TYPES.NUMBER) {
        return card.value.toString();
    }
    return CARD_SYMBOLS[card.type] || '?';
}

/**
 * Gets the point value of a card.
 */
function getCardPoints(card) {
    if (card.type === CARD_TYPES.NUMBER) {
        return card.value;
    }
    return CARD_POINTS[card.type] || 0;
}

/**
 * Checks if a card is a wild card (Wild or Wild Draw Four).
 */
function isWildCard(card) {
    return card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR;
}

/**
 * Checks if a card is an action card (Skip, Reverse, Draw Two).
 */
function isActionCard(card) {
    return card.type === CARD_TYPES.SKIP ||
        card.type === CARD_TYPES.REVERSE ||
        card.type === CARD_TYPES.DRAW_TWO;
}

/**
 * Checks if a card can be played on the current discard pile.
 * @param {object} card - The card to play
 * @param {object} topCard - The top card of the discard pile
 * @param {string} currentColor - The current active color
 * @returns {boolean} True if the card can be played
 */
function canPlayCardOn(card, topCard, currentColor) {
    // Wild cards can always be played
    if (isWildCard(card)) return true;

    // Match by color
    if (card.color === currentColor) return true;

    // Match by number (both must be number cards with same value)
    if (card.type === CARD_TYPES.NUMBER && topCard.type === CARD_TYPES.NUMBER && card.value === topCard.value) {
        return true;
    }

    // Match by action type (Skip on Skip, Reverse on Reverse, Draw Two on Draw Two)
    if (isActionCard(card) && card.type === topCard.type) {
        return true;
    }

    return false;
}

/**
 * Creates a full 108-card UNO deck.
 * @returns {object[]} Array of card objects
 */
function createDeck() {
    const cards = [];

    for (const color of CARD_COLORS) {
        // One 0 per color (4 total)
        cards.push(createCard(color, CARD_TYPES.NUMBER, 0));

        // Two of each 1–9 per color (72 total)
        for (let n = 1; n <= 9; n++) {
            cards.push(createCard(color, CARD_TYPES.NUMBER, n));
            cards.push(createCard(color, CARD_TYPES.NUMBER, n));
        }

        // Two Skip per color (8 total)
        cards.push(createCard(color, CARD_TYPES.SKIP));
        cards.push(createCard(color, CARD_TYPES.SKIP));

        // Two Reverse per color (8 total)
        cards.push(createCard(color, CARD_TYPES.REVERSE));
        cards.push(createCard(color, CARD_TYPES.REVERSE));

        // Two Draw Two per color (8 total)
        cards.push(createCard(color, CARD_TYPES.DRAW_TWO));
        cards.push(createCard(color, CARD_TYPES.DRAW_TWO));
    }

    // 4 Wild cards
    for (let i = 0; i < 4; i++) {
        cards.push(createCard(null, CARD_TYPES.WILD));
    }

    // 4 Wild Draw Four cards
    for (let i = 0; i < 4; i++) {
        cards.push(createCard(null, CARD_TYPES.WILD_DRAW_FOUR));
    }

    return cards; // 108 cards total
}

/**
 * Shuffles a deck using Fisher-Yates algorithm.
 * @param {object[]} deck - Array of cards to shuffle
 * @returns {object[]} New shuffled array (does not mutate original)
 */
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Sorts a hand by color then value for display.
 * Order: Red, Blue, Green, Yellow, Wild
 */
function sortHand(hand) {
    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3 };
    const typeOrder = {
        [CARD_TYPES.NUMBER]: 0,
        [CARD_TYPES.SKIP]: 10,
        [CARD_TYPES.REVERSE]: 11,
        [CARD_TYPES.DRAW_TWO]: 12,
        [CARD_TYPES.WILD]: 100,
        [CARD_TYPES.WILD_DRAW_FOUR]: 101
    };

    return [...hand].sort((a, b) => {
        // Wilds go last
        const aIsWild = isWildCard(a) ? 1 : 0;
        const bIsWild = isWildCard(b) ? 1 : 0;
        if (aIsWild !== bIsWild) return aIsWild - bIsWild;

        // Sort by color
        const aColor = colorOrder[a.color] ?? 99;
        const bColor = colorOrder[b.color] ?? 99;
        if (aColor !== bColor) return aColor - bColor;

        // Sort by type (numbers first, then actions)
        const aType = typeOrder[a.type] ?? 50;
        const bType = typeOrder[b.type] ?? 50;
        if (aType !== bType) return aType - bType;

        // Sort by value within numbers
        return (a.value ?? 0) - (b.value ?? 0);
    });
}

/**
 * Serializes a card to a plain JSON object.
 */
function cardToJSON(card) {
    return {
        id: card.id,
        color: card.color,
        type: card.type,
        value: card.value
    };
}

/**
 * Deserializes a card from a JSON object.
 */
function cardFromJSON(data) {
    return {
        id: data.id,
        color: data.color,
        type: data.type,
        value: data.value
    };
}
