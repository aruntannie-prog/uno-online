// ============================================================
// game.js — UNO Game Engine
// Full game logic: state, validation, actions, scoring
// ============================================================

class GameEngine {
    constructor() {
        this.reset();
    }

    reset() {
        this.players = [];          // { id, name, hand: [], score: 0 }
        this.drawPile = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1;         // 1 = clockwise, -1 = counter-clockwise
        this.currentColor = null;
        this.gameStatus = 'waiting'; // waiting | playing | finished
        this.winner = null;

        // Special state tracking
        this.pendingDrawFour = false;
        this.drawFourPlayerId = null;
        this._previousColor = null; // Color before Wild Draw Four was played (for challenge validation)

        this.awaitingDrawnCardDecision = false; // True when player drew a playable card

        // UNO call tracking
        this.mustCallUno = {};  // playerId -> true (player has 1 card and hasn't been cleared)
        this.unoCalled = {};    // playerId -> true (player called UNO)

        // Action log for animations
        this.lastAction = null;
    }

    // ----------------------------------------------------------
    // Player Management
    // ----------------------------------------------------------

    addPlayer(id, name) {
        if (this.players.length >= 6) return false;
        if (this.gameStatus !== 'waiting') return false;
        if (this.players.find(p => p.id === id)) return false;

        this.players.push({
            id,
            name,
            hand: [],
            score: 0
        });
        return true;
    }

    markPlayerDisconnected(id) {
        const player = this.getPlayer(id);
        if (!player) return false;

        if (this.gameStatus === 'playing') {
            player.isDisconnected = true;
            player.isBot = true;
            if (!player.name.includes('(BOT)')) {
                player.name = `${player.name} (BOT)`;
            }

            // If it's currently this player's turn, trigger bot turn
            if (this.getCurrentPlayer()?.id === id) {
                setTimeout(() => {
                    const res = this.takeBotTurn(id);
                    if (res && this.onBotAction) this.onBotAction(res);
                }, 600);
            }
            return true;
        } else {
            return this.removePlayer(id);
        }
    }

    reclaimPlayer(oldIdOrName, newId, newName) {
        let player = this.getPlayer(oldIdOrName);
        if (!player) {
            player = this.players.find(p => p.name.replace(' (BOT)', '').toLowerCase() === newName.toLowerCase());
        }

        if (player && (player.isBot || player.isDisconnected)) {
            player.id = newId;
            player.name = newName;
            player.isDisconnected = false;
            player.isBot = false;
            return player;
        }
        return null;
    }

    takeBotTurn(playerId) {
        if (this.gameStatus !== 'playing') return null;
        const player = this.getPlayer(playerId);
        if (!player || !player.isBot) return null;
        if (this.getCurrentPlayer()?.id !== playerId) return null;

        // If bot must respond to Wild Draw Four
        if (this.pendingDrawFour) {
            return this.acceptDrawFour(playerId);
        }

        const playable = this._getPlayableIndices(player);

        if (playable.length > 0) {
            let chosenIndex = playable[0];

            for (const idx of playable) {
                const card = player.hand[idx];
                if (card.type === CARD_TYPES.DRAW_TWO || card.type === CARD_TYPES.SKIP || card.type === CARD_TYPES.REVERSE) {
                    chosenIndex = idx;
                    break;
                } else if (card.type === CARD_TYPES.NUMBER) {
                    chosenIndex = idx;
                }
            }

            const chosenCard = player.hand[chosenIndex];
            let chosenColor = null;

            if (isWildCard(chosenCard)) {
                const colorCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
                player.hand.forEach(c => {
                    if (c.color && colorCounts[c.color] !== undefined) colorCounts[c.color]++;
                });
                chosenColor = Object.keys(colorCounts).reduce((a, b) => colorCounts[a] > colorCounts[b] ? a : b);
            }

            if (player.hand.length === 2) {
                this.callUno(playerId);
            }

            return this.playCard(playerId, chosenIndex, chosenColor);
        } else {
            const drawResult = this.drawCard(playerId);

            if (drawResult.action === 'draw_can_play') {
                const drawnCard = player.hand[player.hand.length - 1];
                let chosenColor = null;
                if (isWildCard(drawnCard)) {
                    chosenColor = CARD_COLORS[Math.floor(Math.random() * 4)];
                }
                if (player.hand.length === 2) {
                    this.callUno(playerId);
                }
                return this.playDrawnCard(playerId, true, chosenColor);
            }

            return drawResult;
        }
    }

    removePlayer(id) {
        const index = this.players.findIndex(p => p.id === id);
        if (index === -1) return false;

        const player = this.players[index];

        // Return cards to draw pile if game is in progress
        if (this.gameStatus === 'playing') {
            this.drawPile.push(...player.hand);
            this.drawPile = shuffleDeck(this.drawPile);
        }

        this.players.splice(index, 1);

        // Clean up UNO tracking
        delete this.mustCallUno[id];
        delete this.unoCalled[id];

        // Adjust current player index if needed
        if (this.gameStatus === 'playing' && this.players.length >= 2) {
            if (this.currentPlayerIndex >= this.players.length) {
                this.currentPlayerIndex = 0;
            }
            if (this.drawFourPlayerId === id) {
                this.pendingDrawFour = false;
                this.drawFourPlayerId = null;
            }
        } else if (this.players.length < 2 && this.gameStatus === 'playing') {
            this.gameStatus = 'finished';
            if (this.players.length === 1) {
                this.winner = this.players[0].id;
            }
        }

        return true;
    }

    getPlayer(id) {
        return this.players.find(p => p.id === id);
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    getTopCard() {
        return this.discardPile[this.discardPile.length - 1];
    }

    // ----------------------------------------------------------
    // Game Start
    // ----------------------------------------------------------

    startGame() {
        if (this.players.length < 2 || this.players.length > 6) return false;

        // Reset game state but keep players
        const playerData = this.players.map(p => ({ id: p.id, name: p.name, score: p.score }));
        this.drawPile = [];
        this.discardPile = [];
        this.currentPlayerIndex = 0;
        this.direction = 1;
        this.gameStatus = 'playing';
        this.winner = null;
        this.pendingDrawFour = false;
        this.drawFourPlayerId = null;
        this._previousColor = null;
        this.awaitingDrawnCardDecision = false;
        this.mustCallUno = {};
        this.unoCalled = {};
        this.lastAction = null;

        // Rebuild players with cleared hands
        this.players = playerData.map(p => ({
            id: p.id,
            name: p.name,
            hand: [],
            score: p.score
        }));

        // Create and shuffle deck
        _cardNextId = 1; // Reset card IDs
        this.drawPile = shuffleDeck(createDeck());

        // Deal 7 cards to each player
        for (const player of this.players) {
            for (let i = 0; i < 7; i++) {
                player.hand.push(this.drawPile.pop());
            }
            player.hand = sortHand(player.hand);
        }

        // Flip first card
        this._flipFirstCard();

        return true;
    }

    _flipFirstCard() {
        let card = this.drawPile.pop();

        // Wild Draw Four cannot be the first card — reshuffle
        while (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            this.drawPile.unshift(card);
            this.drawPile = shuffleDeck(this.drawPile);
            card = this.drawPile.pop();
        }

        this.discardPile.push(card);

        // Set initial color
        if (isWildCard(card)) {
            // Wild as first card: set random color
            this.currentColor = CARD_COLORS[Math.floor(Math.random() * 4)];
        } else {
            this.currentColor = card.color;
        }

        // Apply first card effects to the first player
        this.lastAction = { type: 'game_start', firstCard: cardToJSON(card) };

        if (card.type === CARD_TYPES.SKIP) {
            this.lastAction = {
                type: 'first_card_skip',
                card: cardToJSON(card),
                skippedPlayer: this.getCurrentPlayer().id
            };
            this._advanceTurn();
        } else if (card.type === CARD_TYPES.REVERSE) {
            this.direction *= -1;
            if (this.players.length === 2) {
                this.lastAction = {
                    type: 'first_card_reverse_skip',
                    card: cardToJSON(card),
                    skippedPlayer: this.getCurrentPlayer().id
                };
                this._advanceTurn();
            } else {
                this.lastAction = {
                    type: 'first_card_reverse',
                    card: cardToJSON(card)
                };
            }
        } else if (card.type === CARD_TYPES.DRAW_TWO) {
            const firstPlayer = this.getCurrentPlayer();
            this._drawCards(firstPlayer, 2);
            this.lastAction = {
                type: 'first_card_draw_two',
                card: cardToJSON(card),
                targetPlayer: firstPlayer.id,
                count: 2
            };
            this._advanceTurn();
        }
    }

    // ----------------------------------------------------------
    // Turn Management
    // ----------------------------------------------------------

    _advanceTurn() {
        this.currentPlayerIndex = this._getNextPlayerIndex();
        this.awaitingDrawnCardDecision = false;

        // Clear UNO window for the player whose turn just ended
        const prevIndex = this._getPrevPlayerIndex();
        const prevPlayer = this.players[prevIndex];
        if (prevPlayer && this.mustCallUno[prevPlayer.id] && !this.unoCalled[prevPlayer.id]) {
            delete this.mustCallUno[prevPlayer.id];
        }

        // Check if next player is a bot / disconnected
        const nextPlayer = this.getCurrentPlayer();
        if (nextPlayer && nextPlayer.isBot && this.gameStatus === 'playing') {
            setTimeout(() => {
                if (this.getCurrentPlayer()?.id === nextPlayer.id && this.gameStatus === 'playing') {
                    const result = this.takeBotTurn(nextPlayer.id);
                    if (result && this.onBotAction) {
                        this.onBotAction(result);
                    }
                }
            }, 800);
        }
    }

    _getNextPlayerIndex() {
        let next = this.currentPlayerIndex + this.direction;
        if (next >= this.players.length) next = 0;
        if (next < 0) next = this.players.length - 1;
        return next;
    }

    _getPrevPlayerIndex() {
        let prev = this.currentPlayerIndex - this.direction;
        if (prev >= this.players.length) prev = 0;
        if (prev < 0) prev = this.players.length - 1;
        return prev;
    }

    // ----------------------------------------------------------
    // Card Drawing
    // ----------------------------------------------------------

    _drawCards(player, count) {
        const drawn = [];
        for (let i = 0; i < count; i++) {
            if (this.drawPile.length === 0) {
                this._reshuffleDiscardPile();
                if (this.drawPile.length === 0) break; // Completely out of cards
            }
            const card = this.drawPile.pop();
            player.hand.push(card);
            drawn.push(card);
        }
        return drawn;
    }

    _reshuffleDiscardPile() {
        if (this.discardPile.length <= 1) return;
        const topCard = this.discardPile.pop();
        this.drawPile = shuffleDeck(this.discardPile);
        this.discardPile = [topCard];
    }

    // ----------------------------------------------------------
    // Core Actions
    // ----------------------------------------------------------

    /**
     * Checks if a specific card in a player's hand can be played.
     */
    canPlayCard(playerId, cardIndex) {
        const player = this.getPlayer(playerId);
        if (!player) return false;
        if (this.getCurrentPlayer().id !== playerId) return false;
        if (this.pendingDrawFour) return false;
        if (this.awaitingDrawnCardDecision) return false;
        if (this.gameStatus !== 'playing') return false;
        if (cardIndex < 0 || cardIndex >= player.hand.length) return false;

        const card = player.hand[cardIndex];
        return canPlayCardOn(card, this.getTopCard(), this.currentColor);
    }

    /**
     * Play a card from the player's hand.
     * @param {string} playerId - Player making the move
     * @param {number} cardIndex - Index in player's hand
     * @param {string|null} chosenColor - Required for wild cards
     * @returns {object} Result with success flag and action details
     */
    playCard(playerId, cardIndex, chosenColor = null) {
        const player = this.getPlayer(playerId);

        if (!player) return { success: false, error: 'Player not found' };
        if (this.getCurrentPlayer().id !== playerId) return { success: false, error: 'Not your turn' };
        if (this.pendingDrawFour && !this.awaitingDrawnCardDecision) return { success: false, error: 'Must respond to +4' };
        if (this.gameStatus !== 'playing') return { success: false, error: 'Game not in progress' };
        if (cardIndex < 0 || cardIndex >= player.hand.length) return { success: false, error: 'Invalid card index' };

        const card = player.hand[cardIndex];

        // Validate the card can be played (skip validation if playing drawn card in awaitingDrawnCardDecision)
        if (!this.awaitingDrawnCardDecision) {
            if (!canPlayCardOn(card, this.getTopCard(), this.currentColor)) {
                return { success: false, error: 'Card cannot be played' };
            }
        }

        // Wild cards require a color choice
        if (isWildCard(card)) {
            if (!chosenColor || !CARD_COLORS.includes(chosenColor)) {
                return { success: false, error: 'Must choose a color for wild card', needsColor: true };
            }
        }

        // Remove card from hand and add to discard pile
        player.hand.splice(cardIndex, 1);
        this.discardPile.push(card);

        // Clear drawn card state
        this.awaitingDrawnCardDecision = false;

        // Track UNO requirement
        // Track UNO requirement
        if (player.hand.length === 1) {
            this.mustCallUno[playerId] = true;
            if (!this.unoCalled[playerId]) {
                this.unoCalled[playerId] = false;
            }
        } else {
            delete this.mustCallUno[playerId];
            delete this.unoCalled[playerId];
        }

        // Update current color
        if (isWildCard(card)) {
            this._previousColor = this.currentColor; // Store for +4 challenge
            this.currentColor = chosenColor;
        } else {
            this.currentColor = card.color;
        }

        // Build result
        const result = {
            success: true,
            card: cardToJSON(card),
            playerId,
            chosenColor: isWildCard(card) ? chosenColor : null
        };

        // Check for win
        if (player.hand.length === 0) {
            this.gameStatus = 'finished';
            this.winner = playerId;
            result.action = 'win';
            result.winner = playerId;
            result.scores = this._calculateScores(playerId);
            this.lastAction = result;
            return result;
        }

        // Apply card effects
        switch (card.type) {
            case CARD_TYPES.NUMBER:
                result.action = 'number';
                this._advanceTurn();
                break;

            case CARD_TYPES.SKIP:
                this._advanceTurn(); // Move to next player (who gets skipped)
                result.action = 'skip';
                result.skippedPlayer = this.getCurrentPlayer().id;
                this._advanceTurn(); // Move past the skipped player
                break;

            case CARD_TYPES.REVERSE:
                this.direction *= -1;
                result.action = 'reverse';
                if (this.players.length === 2) {
                    // In 2-player, reverse acts as skip
                    result.action = 'reverse_skip';
                    this._advanceTurn();
                    result.skippedPlayer = this.getCurrentPlayer().id;
                    this._advanceTurn();
                } else {
                    this._advanceTurn();
                }
                break;

            case CARD_TYPES.DRAW_TWO: {
                this._advanceTurn(); // Move to target player
                const targetPlayer = this.getCurrentPlayer();
                const drawn = this._drawCards(targetPlayer, 2);
                result.action = 'draw_two';
                result.targetPlayer = targetPlayer.id;
                result.drawnCount = drawn.length;
                this._advanceTurn(); // Skip the target player
                break;
            }

            case CARD_TYPES.WILD:
                result.action = 'wild';
                this._advanceTurn();
                break;

            case CARD_TYPES.WILD_DRAW_FOUR:
                this._advanceTurn(); // Move to target player
                this.pendingDrawFour = true;
                this.drawFourPlayerId = playerId;
                result.action = 'wild_draw_four';
                result.targetPlayer = this.getCurrentPlayer().id;
                // Don't advance — target player must accept or challenge
                break;
        }

        // Sort hand after play
        player.hand = sortHand(player.hand);

        this.lastAction = result;
        return result;
    }

    /**
     * Draw a card from the draw pile.
     */
    drawCard(playerId) {
        const player = this.getPlayer(playerId);
        if (!player) return { success: false, error: 'Player not found' };
        if (this.getCurrentPlayer().id !== playerId) return { success: false, error: 'Not your turn' };
        if (this.pendingDrawFour) return { success: false, error: 'Must respond to +4 first' };
        if (this.awaitingDrawnCardDecision) return { success: false, error: 'Already drew a card' };
        if (this.gameStatus !== 'playing') return { success: false, error: 'Game not in progress' };

        const drawn = this._drawCards(player, 1);
        if (drawn.length === 0) {
            // No cards to draw — pass turn
            this._advanceTurn();
            return { success: true, action: 'no_cards_pass', playerId };
        }

        const drawnCard = drawn[0];
        const canPlay = canPlayCardOn(drawnCard, this.getTopCard(), this.currentColor);

        if (canPlay) {
            // Player can choose to play the drawn card or pass
            this.awaitingDrawnCardDecision = true;
            const result = {
                success: true,
                action: 'draw_can_play',
                drawnCard: cardToJSON(drawnCard),
                drawnCardIndex: player.hand.length - 1,
                playerId
            };
            this.lastAction = result;
            return result;
        } else {
            // Can't play — turn passes
            player.hand = sortHand(player.hand);
            this._advanceTurn();
            const result = {
                success: true,
                action: 'draw_pass',
                drawnCard: cardToJSON(drawnCard),
                playerId
            };
            this.lastAction = result;
            return result;
        }
    }

    /**
     * After drawing a playable card, player decides to play it or pass.
     */
    playDrawnCard(playerId, shouldPlay, chosenColor = null) {
        if (!this.awaitingDrawnCardDecision) return { success: false, error: 'No drawn card pending' };
        if (this.getCurrentPlayer().id !== playerId) return { success: false, error: 'Not your turn' };

        if (!shouldPlay) {
            // Player passes
            this.awaitingDrawnCardDecision = false;
            const player = this.getPlayer(playerId);
            player.hand = sortHand(player.hand);
            this._advanceTurn();
            const result = { success: true, action: 'drawn_card_pass', playerId };
            this.lastAction = result;
            return result;
        }

        // Play the drawn card (last card in hand)
        const player = this.getPlayer(playerId);
        const cardIndex = player.hand.length - 1;
        this.awaitingDrawnCardDecision = false; // Clear before playCard checks
        return this.playCard(playerId, cardIndex, chosenColor);
    }

    // ----------------------------------------------------------
    // Wild Draw Four Challenge
    // ----------------------------------------------------------

    /**
     * Accept a Wild Draw Four (draw 4 cards, lose turn).
     */
    acceptDrawFour(playerId) {
        if (!this.pendingDrawFour) return { success: false, error: 'No +4 pending' };
        if (this.getCurrentPlayer().id !== playerId) return { success: false, error: 'Not your turn' };

        const player = this.getCurrentPlayer();
        const drawn = this._drawCards(player, 4);
        player.hand = sortHand(player.hand);

        this.pendingDrawFour = false;
        this.drawFourPlayerId = null;

        this._advanceTurn();

        const result = {
            success: true,
            action: 'accept_draw_four',
            playerId,
            drawnCount: drawn.length
        };
        this.lastAction = result;
        return result;
    }

    /**
     * Challenge a Wild Draw Four.
     * If the challenger wins: +4 player draws 4 instead.
     * If the challenger loses: challenger draws 6 (4 + 2 penalty).
     */
    challengeDrawFour(playerId) {
        if (!this.pendingDrawFour) return { success: false, error: 'No +4 pending' };
        if (this.getCurrentPlayer().id !== playerId) return { success: false, error: 'Not your turn' };

        const challengerPlayer = this.getCurrentPlayer();
        const challengedPlayer = this.getPlayer(this.drawFourPlayerId);

        if (!challengedPlayer) {
            this.pendingDrawFour = false;
            return { success: false, error: 'Challenged player not found' };
        }

        // Check if the +4 was legal:
        // +4 is ILLEGAL if the player had cards matching the PREVIOUS active color
        const previousColor = this._previousColor;
        const hadMatchingColor = challengedPlayer.hand.some(c => c.color === previousColor);

        this.pendingDrawFour = false;
        this.drawFourPlayerId = null;

        let result;

        if (hadMatchingColor) {
            // Challenge SUCCESSFUL — challenged player's +4 was illegal
            // Challenged player draws 4 cards
            const drawn = this._drawCards(challengedPlayer, 4);
            challengedPlayer.hand = sortHand(challengedPlayer.hand);

            // Challenger doesn't draw and gets to take their turn normally
            // Actually per official rules, the +4 is returned... but simplified:
            // The challenged player draws 4, challenger proceeds
            this._advanceTurn();

            result = {
                success: true,
                action: 'challenge_success',
                challengerId: playerId,
                challengedId: challengedPlayer.id,
                drawnBy: challengedPlayer.id,
                drawnCount: drawn.length
            };
        } else {
            // Challenge FAILED — +4 was legal
            // Challenger draws 6 (4 from +4 plus 2 penalty)
            const drawn = this._drawCards(challengerPlayer, 6);
            challengerPlayer.hand = sortHand(challengerPlayer.hand);

            this._advanceTurn();

            result = {
                success: true,
                action: 'challenge_fail',
                challengerId: playerId,
                challengedId: challengedPlayer.id,
                drawnBy: playerId,
                drawnCount: drawn.length
            };
        }

        this.lastAction = result;
        return result;
    }

    // ----------------------------------------------------------
    // UNO Call & Catch
    // ----------------------------------------------------------

    /**
     * Player calls UNO (when they have 1 card left).
     */
    callUno(playerId) {
        const player = this.getPlayer(playerId);
        if (!player) return { success: false, error: 'Player not found' };

        if (player.hand.length === 1 || player.hand.length === 2 || this.mustCallUno[playerId]) {
            this.unoCalled[playerId] = true;
            if (player.hand.length === 1) {
                this.mustCallUno[playerId] = true;
            }
            const result = { success: true, action: 'uno_called', playerId };
            this.lastAction = result;
            return result;
        }
        return { success: false, error: 'You don\'t need to call UNO' };
    }

    /**
     * Another player catches someone who forgot to call UNO.
     * The target must have 1 card and NOT have called UNO.
     */
    catchUno(catcherId, targetId) {
        if (!this.mustCallUno[targetId]) {
            return { success: false, error: 'Target doesn\'t need to call UNO' };
        }
        if (this.unoCalled[targetId]) {
            return { success: false, error: 'Target already called UNO' };
        }

        const target = this.getPlayer(targetId);
        if (!target) return { success: false, error: 'Target not found' };

        // Penalty: draw 2 cards
        const drawn = this._drawCards(target, 2);
        target.hand = sortHand(target.hand);
        delete this.mustCallUno[targetId];
        delete this.unoCalled[targetId];

        const result = {
            success: true,
            action: 'uno_caught',
            catcherId,
            targetId,
            drawnCount: drawn.length
        };
        this.lastAction = result;
        return result;
    }

    // ----------------------------------------------------------
    // Scoring
    // ----------------------------------------------------------

    _calculateScores(winnerId) {
        let totalPoints = 0;
        const breakdown = {};

        for (const player of this.players) {
            if (player.id === winnerId) {
                breakdown[player.id] = 0;
                continue;
            }
            let points = 0;
            for (const card of player.hand) {
                points += getCardPoints(card);
            }
            breakdown[player.id] = points;
            totalPoints += points;
        }

        // Add points to winner's score
        const winner = this.getPlayer(winnerId);
        if (winner) {
            winner.score += totalPoints;
        }

        return { winnerId, totalPoints, breakdown };
    }

    // ----------------------------------------------------------
    // State Serialization
    // ----------------------------------------------------------

    /**
     * Gets the game state visible to a specific player.
     * Other players' hands are hidden (only card count is sent).
     */
    getStateForPlayer(playerId) {
        const player = this.getPlayer(playerId);

        return {
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                cardCount: p.hand.length,
                hand: p.id === playerId ? p.hand.map(c => cardToJSON(c)) : undefined,
                score: p.score
            })),
            topCard: this.getTopCard() ? cardToJSON(this.getTopCard()) : null,
            currentColor: this.currentColor,
            currentPlayerId: this.getCurrentPlayer()?.id,
            direction: this.direction,
            drawPileCount: this.drawPile.length,
            gameStatus: this.gameStatus,
            winner: this.winner,
            pendingDrawFour: this.pendingDrawFour,
            drawFourPlayerId: this.drawFourPlayerId,
            awaitingDrawnCardDecision: this.awaitingDrawnCardDecision && this.getCurrentPlayer()?.id === playerId,
            isYourTurn: this.getCurrentPlayer()?.id === playerId,
            playableCardIndices: player ? this._getPlayableIndices(player) : [],
            mustCallUno: { ...this.mustCallUno },
            unoCalled: { ...this.unoCalled },
            lastAction: this.lastAction,
            scores: this.gameStatus === 'finished' ? this._getScoreboard() : null
        };
    }

    /**
     * Gets indices of cards in a player's hand that can be played.
     */
    _getPlayableIndices(player) {
        if (this.getCurrentPlayer()?.id !== player.id) return [];
        if (this.pendingDrawFour) return [];
        if (this.gameStatus !== 'playing') return [];

        if (this.awaitingDrawnCardDecision) {
            // Only the drawn card (last card) can be played
            return [player.hand.length - 1];
        }

        const indices = [];
        for (let i = 0; i < player.hand.length; i++) {
            if (canPlayCardOn(player.hand[i], this.getTopCard(), this.currentColor)) {
                indices.push(i);
            }
        }
        return indices;
    }

    _getScoreboard() {
        return this.players.map(p => ({
            id: p.id,
            name: p.name,
            score: p.score,
            cardsLeft: p.hand.length,
            handPoints: p.hand.reduce((sum, c) => sum + getCardPoints(c), 0)
        }));
    }
}
