// ============================================================
// app.js — Main Application Controller
// Connects GameEngine + NetworkManager + UIManager
// ============================================================

class App {
    constructor() {
        this.game = new GameEngine();
        this.network = new NetworkManager();
        this.ui = new UIManager();

        this.isHost = false;
        this.myPlayerId = '';
        this.myPlayerName = '';
        this.roomCode = '';

        // For color picker flow (wild cards)
        this._pendingWildCardIndex = null;
        this._pendingWildCardData = null;

        // Track players for lobby
        this._lobbyPlayers = [];
        this._roomRequestInFlight = false;
        this._turnMonitor = setInterval(() => this._checkTurnTimer(), 1000);

        this._bindUICallbacks();
    }

    // ----------------------------------------------------------
    // Wire up UI callbacks
    // ----------------------------------------------------------

    _bindUICallbacks() {
        this.ui.onCreateRoom = (name) => this._createRoom(name);
        this.ui.onJoinRoom = (name, code) => this._joinRoom(name, code);
        this.ui.onLeaveRoom = () => this._leaveRoom();
        this.ui.onStartGame = () => this._startGame();
        this.ui.onPlayCard = (index, card) => this._handlePlayCard(index, card);
        this.ui.onDrawCard = () => this._handleDrawCard();
        this.ui.onPlayDrawnCard = () => this._handlePlayDrawnCard();
        this.ui.onPassDrawnCard = () => this._handlePassDrawnCard();
        this.ui.onCallUno = () => this._handleCallUno();
        this.ui.onCatchUno = () => this._handleCatchUno();
        this.ui.onChooseColor = (color) => this._handleColorChosen(color);
        this.ui.onChallengeDrawFour = () => this._handleChallengeDrawFour();
        this.ui.onAcceptDrawFour = () => this._handleAcceptDrawFour();
        this.ui.onLeaveGame = () => this._leaveRoom();
        this.ui.onPlayAgain = () => this._playAgain();
        this.ui.onBackToLobby = () => this._backToLobby();
        this.ui.onSendEmoji = (emoji) => this._handleSendEmoji(emoji);
    }

    // ----------------------------------------------------------
    // Room Creation (Host)
    // ----------------------------------------------------------

    async _createRoom(name) {
        if (this._roomRequestInFlight) return;
        this._roomRequestInFlight = true;
        this.myPlayerName = name;
        this.ui.showLoading('Creating room...');

        // Clean up previous state
        this.game.reset();

        try {
            const { roomCode, peerId } = await this.network.createRoom(name);
            this.isHost = true;
            this.myPlayerId = peerId;
            this.roomCode = roomCode;

            // Add self to game engine
            this.game.addPlayer(this.myPlayerId, this.myPlayerName);

            // Setup network callbacks for host
            this._setupHostNetworkCallbacks();

            // Update lobby
            this._updateLobbyPlayers();
            this.ui.hideLoading();
            this.ui.showScreen('lobby');
            this.ui.showToast('Room created!', 'success');
        } catch (err) {
            this.ui.hideLoading();
            this.ui.showToast('Failed to create room: ' + (err.message || err), 'error');
            console.error('Create room error:', err);
        } finally {
            this._roomRequestInFlight = false;
        }
    }

    _setupHostNetworkCallbacks() {
        this.game.onBotAction = (result) => {
            this._announceAction(result);
            this._broadcastGameState();
            this._renderMyGameState();
            if (result.action === 'win') this._handleGameEnd();
        };

        this.network.onPlayerJoined = (playerId, playerName) => {
            if (this.game.gameStatus === 'playing') {
                // Check if re-joining a disconnected bot seat
                const reclaimed = this.game.reclaimPlayer(playerName, playerId, playerName);
                if (reclaimed) {
                    this.ui.showToast(`${playerName} reconnected!`, 'success');
                    this._broadcastGameState();
                    return;
                }
            }

            if (this.game.gameStatus === 'waiting') {
                const added = this.game.addPlayer(playerId, playerName);
                if (!added) {
                    this.network.sendToPlayer(playerId, {
                        type: 'ERROR',
                        message: 'Room is full'
                    });
                    return;
                }

                this.ui.showToast(`${playerName} joined!`, 'info');
                this._updateLobbyPlayers();
                this._broadcastLobbyUpdate();
            } else {
                this.network.sendToPlayer(playerId, {
                    type: 'ERROR',
                    message: 'Game already in progress'
                });
            }
        };

        this.network.onPlayerLeft = (playerId) => {
            const player = this.game.getPlayer(playerId);
            const playerName = player?.name || 'A player';

            if (this.game.gameStatus === 'playing') {
                this.game.markPlayerDisconnected(playerId);
                this.ui.showToast(`${playerName} disconnected — AI bot taking over turn`, 'warning');

                this._broadcastGameState();
                this._renderMyGameState();
            } else {
                this.game.removePlayer(playerId);
                this.ui.showToast(`${playerName} left`, 'info');
                this._updateLobbyPlayers();
                this._broadcastLobbyUpdate();
            }
        };

        this.network.onMessage = (data, fromPlayerId) => {
            this._handleHostMessage(data, fromPlayerId);
        };
    }

    // ----------------------------------------------------------
    // Room Joining (Client)
    // ----------------------------------------------------------

    async _joinRoom(name, code) {
        if (this._roomRequestInFlight) return;
        this._roomRequestInFlight = true;
        this.myPlayerName = name;
        this.ui.showLoading('Joining room...');

        try {
            const { peerId } = await this.network.joinRoom(code, name);
            this.isHost = false;
            this.myPlayerId = peerId;
            this.roomCode = code.toUpperCase();

            // Setup network callbacks for client
            this._setupClientNetworkCallbacks();

            this.ui.hideLoading();
            this.ui.showScreen('lobby');
            this.ui.showToast('Joined the room!', 'success');
        } catch (err) {
            this.ui.hideLoading();
            this.ui.showToast(err.message || 'Failed to join room', 'error');
            console.error('Join room error:', err);
        } finally {
            this._roomRequestInFlight = false;
        }
    }

    _setupClientNetworkCallbacks() {
        this.network.onMessage = (data) => {
            this._handleClientMessage(data);
        };

        this.network.onDisconnected = (reason) => {
            this.ui.showToast('Disconnected: ' + reason, 'error', 5000);
            this.ui.showScreen('home');
        };
    }

    // ----------------------------------------------------------
    // Leave Room
    // ----------------------------------------------------------

    _leaveRoom() {
        this.network.disconnect();
        this.game.reset();
        this._lobbyPlayers = [];
        this.ui.showScreen('home');
        this.ui.showToast('Left the room', 'info');
    }

    _checkTurnTimer() {
        if (!this.isHost || this.game.gameStatus !== 'playing') return;

        const result = this.game.handleTurnTimeout();
        if (result) {
            this.ui.showToast(`${result.playerId ? this.game.getPlayer(result.playerId)?.name || 'Player' : 'Player'} timed out`, 'warning');
            this._announceAction(result);
            this._broadcastGameState();
            this._renderMyGameState();
            if (result.action === 'win') this._handleGameEnd();
            return;
        }

        // Update only the clock between moves. Re-rendering the board here causes
        // cards to be recreated and animated every second.
        const seconds = this.game.getStateForPlayer(this.myPlayerId).turnTimeRemaining;
        this.network.broadcast({ type: 'TURN_TIMER', seconds });
        this.ui.updateTurnTimer(seconds);
    }

    // ----------------------------------------------------------
    // Lobby Management
    // ----------------------------------------------------------

    _updateLobbyPlayers() {
        this._lobbyPlayers = this.game.players.map((p, index) => ({
            id: p.id,
            name: p.name,
            isHost: index === 0 // First player is always host
        }));

        this.ui.updateLobby(this.roomCode, this._lobbyPlayers, this.isHost);
    }

    _broadcastLobbyUpdate() {
        const lobbyData = {
            type: 'LOBBY_UPDATE',
            players: this.game.players.map((p, index) => ({
                id: p.id,
                name: p.name,
                isHost: index === 0
            })),
            roomCode: this.roomCode
        };
        this.network.broadcast(lobbyData);
    }

    // ----------------------------------------------------------
    // Game Start
    // ----------------------------------------------------------

    _startGame() {
        if (!this.isHost) return;
        if (this.game.players.length < 2) {
            this.ui.showToast('Need at least 2 players', 'warning');
            return;
        }

        const started = this.game.startGame();
        if (!started) {
            this.ui.showToast('Failed to start game', 'error');
            return;
        }

        // Notify all clients
        this.network.broadcast({ type: 'GAME_START' });

        // Send initial game state to each player
        this._broadcastGameState();

        // Show game screen for host
        this.ui.showScreen('game');
        this._renderMyGameState();
        this.ui.showToast('Game started!', 'success');
    }

    // ----------------------------------------------------------
    // Host Message Handler
    // ----------------------------------------------------------

    _handleHostMessage(data, fromPlayerId) {
        if (!data || !data.type) return;

        let result;

        switch (data.type) {
            case 'PLAY_CARD':
                result = this.game.playCard(fromPlayerId, data.cardIndex, data.chosenColor);
                break;

            case 'DRAW_CARD':
                result = this.game.drawCard(fromPlayerId);
                break;

            case 'PLAY_DRAWN_CARD':
                result = this.game.playDrawnCard(fromPlayerId, data.shouldPlay, data.chosenColor);
                break;

            case 'CALL_UNO':
                result = this.game.callUno(fromPlayerId);
                break;

            case 'CATCH_UNO':
                result = this.game.catchUno(fromPlayerId, data.targetId);
                break;

            case 'CHALLENGE_DRAW_FOUR':
                result = this.game.challengeDrawFour(fromPlayerId);
                break;

            case 'ACCEPT_DRAW_FOUR':
                result = this.game.acceptDrawFour(fromPlayerId);
                break;

            case 'SEND_EMOJI':
                const sender = this.game.getPlayer(fromPlayerId);
                const senderName = sender?.name || 'Someone';
                this.ui.showEmojiReaction(fromPlayerId, data.emoji, senderName);
                this.network.broadcastExcept(fromPlayerId, {
                    type: 'REACTION_EMOJI',
                    playerId: fromPlayerId,
                    playerName: senderName,
                    emoji: data.emoji
                });
                return;

            default:
                console.warn('[Host] Unknown message type:', data.type);
                return;
        }

        if (result) {
            // Send action result toast to relevant players
            this._announceAction(result);

            // Broadcast updated state to all players
            this._broadcastGameState();

            // Update host's own UI
            this._renderMyGameState();

            // Check for game end
            if (result.action === 'win') {
                this._handleGameEnd();
            }
        }
    }

    // ----------------------------------------------------------
    // Client Message Handler
    // ----------------------------------------------------------

    _handleClientMessage(data) {
        if (!data || !data.type) return;

        switch (data.type) {
            case 'LOBBY_UPDATE':
                this._lobbyPlayers = data.players;
                this.ui.updateLobby(data.roomCode || this.roomCode, data.players, false);
                break;

            case 'GAME_START':
                this.ui.showScreen('game');
                this.ui.showToast('Game started!', 'success');
                break;

            case 'GAME_STATE':
                this._handleGameStateUpdate(data.state);
                break;

            case 'TURN_TIMER':
                this.ui.updateTurnTimer(data.seconds);
                break;

            case 'ACTION_TOAST':
                this.ui.showToast(data.message, data.toastType || 'info');
                break;

            case 'REACTION_EMOJI':
                this.ui.showEmojiReaction(data.playerId, data.emoji, data.playerName);
                break;

            case 'GAME_OVER':
                this._handleGameOverClient(data);
                break;

            case 'BACK_TO_LOBBY':
                this.ui.showScreen('lobby');
                if (data.players) {
                    this._lobbyPlayers = data.players;
                    this.ui.updateLobby(this.roomCode, data.players, false);
                }
                break;

            case 'ERROR':
                this.ui.showToast(data.message, 'error');
                break;
        }
    }

    _handleGameStateUpdate(state) {
        // Store the state and render
        this._currentGameState = state;
        state.roomCode = this.roomCode;
        this.ui.renderGameState(state, this.myPlayerId);
    }

    // ----------------------------------------------------------
    // Game Actions (from UI)
    // ----------------------------------------------------------

    _handlePlayCard(cardIndex, card) {
        // Check if it's a wild card — need color picker
        if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            this._pendingWildCardIndex = cardIndex;
            this._pendingWildCardData = card;
            this.ui.showColorPicker();
            return;
        }

        if (this.isHost) {
            const result = this.game.playCard(this.myPlayerId, cardIndex);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
                if (result.action === 'win') this._handleGameEnd();
            } else {
                this.ui.showToast(result.error || 'Invalid move', 'warning');
            }
        } else {
            this.network.sendToHost({
                type: 'PLAY_CARD',
                cardIndex
            });
        }
    }

    _handleColorChosen(color) {
        const cardIndex = this._pendingWildCardIndex;
        const card = this._pendingWildCardData;
        this._pendingWildCardIndex = null;
        this._pendingWildCardData = null;

        if (cardIndex === null) return;

        if (this.isHost) {
            const result = this.game.playCard(this.myPlayerId, cardIndex, color);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
                if (result.action === 'win') this._handleGameEnd();
            } else {
                this.ui.showToast(result.error || 'Invalid move', 'warning');
            }
        } else {
            this.network.sendToHost({
                type: 'PLAY_CARD',
                cardIndex,
                chosenColor: color
            });
        }
    }

    _handleDrawCard() {
        if (this.isHost) {
            const result = this.game.drawCard(this.myPlayerId);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
            } else {
                this.ui.showToast(result.error || 'Cannot draw', 'warning');
            }
        } else {
            this.network.sendToHost({ type: 'DRAW_CARD' });
        }
    }

    _handlePlayDrawnCard() {
        // The drawn card might be wild
        if (this.isHost) {
            const state = this.game.getStateForPlayer(this.myPlayerId);
            const hand = state.players.find(p => p.id === this.myPlayerId)?.hand;
            if (hand && hand.length > 0) {
                const drawnCard = hand[hand.length - 1];
                if (drawnCard.type === CARD_TYPES.WILD || drawnCard.type === CARD_TYPES.WILD_DRAW_FOUR) {
                    this._pendingWildCardIndex = -1; // Special flag for drawn card
                    this._pendingWildCardData = drawnCard;
                    this.ui.showColorPicker();
                    return;
                }
            }

            const result = this.game.playDrawnCard(this.myPlayerId, true);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
                if (result.action === 'win') this._handleGameEnd();
            }
        } else {
            // Client needs to check if drawn card is wild
            if (this._currentGameState) {
                const hand = this._currentGameState.players.find(p => p.id === this.myPlayerId)?.hand;
                if (hand && hand.length > 0) {
                    const drawnCard = hand[hand.length - 1];
                    if (drawnCard.type === CARD_TYPES.WILD || drawnCard.type === CARD_TYPES.WILD_DRAW_FOUR) {
                        this._pendingWildCardIndex = -1;
                        this._pendingWildCardData = drawnCard;
                        this.ui.showColorPicker();
                        return;
                    }
                }
            }
            this.network.sendToHost({ type: 'PLAY_DRAWN_CARD', shouldPlay: true });
        }
    }

    _handlePassDrawnCard() {
        if (this.isHost) {
            const result = this.game.playDrawnCard(this.myPlayerId, false);
            if (result.success) {
                this._broadcastGameState();
                this._renderMyGameState();
            }
        } else {
            this.network.sendToHost({ type: 'PLAY_DRAWN_CARD', shouldPlay: false });
        }
    }

    _handleCallUno() {
        if (this.isHost) {
            const result = this.game.callUno(this.myPlayerId);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
            }
        } else {
            this.network.sendToHost({ type: 'CALL_UNO' });
        }
    }

    _handleCatchUno() {
        const targetId = this.ui.btnCatch._catchTarget;
        if (!targetId) return;

        if (this.isHost) {
            const result = this.game.catchUno(this.myPlayerId, targetId);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
            }
        } else {
            this.network.sendToHost({ type: 'CATCH_UNO', targetId });
        }
    }

    _handleChallengeDrawFour() {
        if (this.isHost) {
            const result = this.game.challengeDrawFour(this.myPlayerId);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
            }
        } else {
            this.network.sendToHost({ type: 'CHALLENGE_DRAW_FOUR' });
        }
    }

    _handleAcceptDrawFour() {
        if (this.isHost) {
            const result = this.game.acceptDrawFour(this.myPlayerId);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
            }
        } else {
            this.network.sendToHost({ type: 'ACCEPT_DRAW_FOUR' });
        }
    }

    _handleSendEmoji(emoji) {
        if (!emoji) return;

        this.ui.showEmojiReaction(this.myPlayerId, emoji, this.myPlayerName);

        if (this.isHost) {
            this.network.broadcast({
                type: 'REACTION_EMOJI',
                playerId: this.myPlayerId,
                playerName: this.myPlayerName,
                emoji
            });
        } else {
            this.network.sendToHost({
                type: 'SEND_EMOJI',
                emoji
            });
        }
    }

    // ----------------------------------------------------------
    // Color chosen for drawn card special case
    // ----------------------------------------------------------

    // Override _handleColorChosen to handle drawn card case
    _handleColorChosenOriginal = null;

    // Already handled in _handleColorChosen above — when _pendingWildCardIndex === -1,
    // it means we're playing a drawn card that's wild
    // Let me update the _handleColorChosen to handle this:

    // (The _handleColorChosen method above already dispatches to playCard.
    //  For drawn cards, we need special handling.)

    // ----------------------------------------------------------
    // State Broadcasting (Host)
    // ----------------------------------------------------------

    _broadcastGameState() {
        // Send personalized state to each connected player
        for (const [playerId] of this.network.connections) {
            const state = this.game.getStateForPlayer(playerId);
            state.roomCode = this.roomCode;
            this.network.sendToPlayer(playerId, {
                type: 'GAME_STATE',
                state
            });
        }
    }

    _renderMyGameState() {
        if (!this.isHost) return;
        const state = this.game.getStateForPlayer(this.myPlayerId);
        state.roomCode = this.roomCode;
        this._currentGameState = state;
        this.ui.renderGameState(state, this.myPlayerId);
    }

    // ----------------------------------------------------------
    // Action Announcements
    // ----------------------------------------------------------

    _announceAction(result) {
        if (!result || !result.success) return;

        let message = '';
        let toastType = 'info';

        const getPlayerName = (id) => {
            return this.game.getPlayer(id)?.name || 'Someone';
        };

        switch (result.action) {
            case 'skip':
                message = `${getPlayerName(result.playerId)} skipped ${getPlayerName(result.skippedPlayer)}!`;
                toastType = 'warning';
                break;
            case 'reverse':
            case 'reverse_skip':
                message = `${getPlayerName(result.playerId)} reversed the direction!`;
                toastType = 'info';
                break;
            case 'draw_two':
                message = `${getPlayerName(result.targetPlayer)} draws 2 cards!`;
                toastType = 'warning';
                break;
            case 'wild':
                message = `${getPlayerName(result.playerId)} changed color to ${result.chosenColor}`;
                toastType = 'info';
                break;
            case 'wild_draw_four':
                message = `${getPlayerName(result.playerId)} played +4!`;
                toastType = 'warning';
                break;
            case 'accept_draw_four':
                message = `${getPlayerName(result.playerId)} accepted and drew 4 cards`;
                toastType = 'info';
                break;
            case 'challenge_success':
                message = `Challenge successful! ${getPlayerName(result.challengedId)} draws 4!`;
                toastType = 'success';
                break;
            case 'challenge_fail':
                message = `Challenge failed! ${getPlayerName(result.challengerId)} draws 6!`;
                toastType = 'error';
                break;
            case 'uno_called':
                message = `${getPlayerName(result.playerId)} called UNO! 🔔`;
                toastType = 'warning';
                break;
            case 'uno_caught':
                message = `${getPlayerName(result.targetId)} was caught! Draws 2 cards 🚨`;
                toastType = 'error';
                break;
            case 'win':
                message = `${getPlayerName(result.winner)} wins the round! 🏆`;
                toastType = 'success';
                break;
            default:
                return; // No announcement for normal plays
        }

        if (message) {
            // Show toast locally
            this.ui.showToast(message, toastType);

            // Broadcast toast to clients
            if (this.isHost) {
                this.network.broadcast({
                    type: 'ACTION_TOAST',
                    message,
                    toastType
                });
            }
        }
    }

    // ----------------------------------------------------------
    // Game End
    // ----------------------------------------------------------

    _handleGameEnd() {
        if (!this.isHost) return;

        const winner = this.game.getPlayer(this.game.winner);
        const scores = this.game._getScoreboard();

        // Show results for host
        setTimeout(() => {
            this.ui.showResults(winner?.name || 'Unknown', scores, true);
        }, 1500);

        // Broadcast game over to clients
        this.network.broadcast({
            type: 'GAME_OVER',
            winnerName: winner?.name || 'Unknown',
            winnerId: this.game.winner,
            scores
        });
    }

    _handleGameOverClient(data) {
        setTimeout(() => {
            this.ui.showResults(data.winnerName, data.scores, false);
        }, 1500);
    }

    // ----------------------------------------------------------
    // Play Again / Back to Lobby
    // ----------------------------------------------------------

    _playAgain() {
        if (!this.isHost) return;

        const started = this.game.startGame();
        if (started) {
            this.network.broadcast({ type: 'GAME_START' });
            this._broadcastGameState();
            this.ui.showScreen('game');
            this._renderMyGameState();
            this.ui.showToast('New round started!', 'success');
        }
    }

    _backToLobby() {
        if (!this.isHost) return;

        this.game.gameStatus = 'waiting';
        // Clear hands
        for (const player of this.game.players) {
            player.hand = [];
        }

        this.ui.showScreen('lobby');
        this._updateLobbyPlayers();

        // Notify clients
        this.network.broadcast({
            type: 'BACK_TO_LOBBY',
            players: this.game.players.map((p, i) => ({
                id: p.id,
                name: p.name,
                isHost: i === 0
            }))
        });
    }
}

// ----------------------------------------------------------
// Fix: Handle drawn wild card color selection
// ----------------------------------------------------------

// Patch the _handleColorChosen method to support drawn cards
const _origHandleColorChosen = App.prototype._handleColorChosen;
App.prototype._handleColorChosen = function (color) {
    const cardIndex = this._pendingWildCardIndex;

    // Special case: drawn card (index === -1)
    if (cardIndex === -1) {
        this._pendingWildCardIndex = null;
        this._pendingWildCardData = null;

        if (this.isHost) {
            const result = this.game.playDrawnCard(this.myPlayerId, true, color);
            if (result.success) {
                this._announceAction(result);
                this._broadcastGameState();
                this._renderMyGameState();
                if (result.action === 'win') this._handleGameEnd();
            }
        } else {
            this.network.sendToHost({
                type: 'PLAY_DRAWN_CARD',
                shouldPlay: true,
                chosenColor: color
            });
        }
        return;
    }

    // Normal wild card from hand
    _origHandleColorChosen.call(this, color);
};

// ----------------------------------------------------------
// Global Button Handlers & Initialization
// ----------------------------------------------------------
window.handleCreateRoom = function () {
    console.log('[UI] Create Room pressed');
    const nameInput = document.getElementById('player-name');
    let name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
        name = 'Player ' + Math.floor(100 + Math.random() * 900);
        if (nameInput) nameInput.value = name;
    }
    if (window.app) {
        window.app._createRoom(name);
    } else {
        initApp();
        if (window.app) window.app._createRoom(name);
    }
};

window.handleJoinRoom = function () {
    console.log('[UI] Join Room pressed');
    const nameInput = document.getElementById('player-name');
    const codeInput = document.getElementById('room-code-input');
    let name = nameInput ? nameInput.value.trim() : '';
    let code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if (!name) {
        name = 'Player ' + Math.floor(100 + Math.random() * 900);
        if (nameInput) nameInput.value = name;
    }
    if (!code || code.length < 4) {
        if (window.app && window.app.ui) window.app.ui.showToast('Please enter a valid 6-letter room code', 'warning');
        return;
    }
    if (window.app) {
        window.app._joinRoom(name, code);
    } else {
        initApp();
        if (window.app) window.app._joinRoom(name, code);
    }
};

let app;
function initApp() {
    if (!app) {
        app = new App();
        window.app = app;
        console.log('🎮 UNO Online initialized');
    }
}

// Execute immediately
initApp();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
}
