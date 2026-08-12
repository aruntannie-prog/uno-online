// ============================================================
// ui.js — UI Rendering, Animations & Screen Management
// ============================================================

class UIManager {
    constructor() {
        // Screen elements
        this.screens = {
            home: document.getElementById('screen-home'),
            lobby: document.getElementById('screen-lobby'),
            game: document.getElementById('screen-game'),
            results: document.getElementById('screen-results')
        };

        // Home screen elements
        this.playerNameInput = document.getElementById('player-name');
        this.roomCodeInput = document.getElementById('room-code-input');
        this.btnCreateRoom = document.getElementById('btn-create-room');
        this.btnJoinRoom = document.getElementById('btn-join-room');

        // Lobby elements
        this.lobbyRoomCode = document.getElementById('lobby-room-code');
        this.playerList = document.getElementById('player-list');
        this.playerCountBadge = document.getElementById('player-count-badge');
        this.btnStartGame = document.getElementById('btn-start-game');
        this.btnLeaveLobby = document.getElementById('btn-leave-lobby');
        this.btnCopyCode = document.getElementById('btn-copy-code');
        this.lobbyStatus = document.getElementById('lobby-status');

        // Game screen elements
        this.gameRoomCode = document.getElementById('game-room-code');
        this.directionIndicator = document.getElementById('direction-indicator');
        this.opponentsArea = document.getElementById('opponents-area');
        this.drawPile = document.getElementById('draw-pile');
        this.drawPileCount = document.getElementById('draw-pile-count');
        this.discardPile = document.getElementById('discard-pile');
        this.colorDot = document.getElementById('color-dot');
        this.colorLabel = document.getElementById('color-label');
        this.turnMessage = document.getElementById('turn-message');
        this.turnTimer = document.getElementById('turn-timer');
        this.handScroll = document.getElementById('hand-scroll');
        this.btnUno = document.getElementById('btn-uno');
        this.btnDraw = document.getElementById('btn-draw');
        this.btnCatch = document.getElementById('btn-catch');
        this.drawnCardDecision = document.getElementById('drawn-card-decision');
        this.btnPlayDrawn = document.getElementById('btn-play-drawn');
        this.btnPassDrawn = document.getElementById('btn-pass-drawn');
        this.btnGameMenu = document.getElementById('btn-game-menu');

        // Results elements
        this.winnerName = document.getElementById('winner-name');
        this.scoresTable = document.getElementById('scores-table');
        this.btnPlayAgain = document.getElementById('btn-play-again');
        this.btnBackLobby = document.getElementById('btn-back-lobby');

        // Modals
        this.modalColorPicker = document.getElementById('modal-color-picker');
        this.modalChallenge = document.getElementById('modal-challenge');
        this.challengeText = document.getElementById('challenge-text');
        this.modalGameMenu = document.getElementById('modal-game-menu');

        // Loading
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.loadingText = document.getElementById('loading-text');

        // Toast
        this.toastContainer = document.getElementById('toast-container');
        this.orientationPrompt = document.getElementById('orientation-prompt');

        // Player color assignments
        this.playerColors = ['#8B5CF6', '#06B6D4', '#F59E0B', '#EF4444', '#22C55E', '#EC4899'];

        // Callbacks (set by App)
        this.onCreateRoom = null;
        this.onJoinRoom = null;
        this.onLeaveRoom = null;
        this.onStartGame = null;
        this.onPlayCard = null;
        this.onDrawCard = null;
        this.onPlayDrawnCard = null;
        this.onPassDrawnCard = null;
        this.onCallUno = null;
        this.onCatchUno = null;
        this.onChooseColor = null;
        this.onChallengeDrawFour = null;
        this.onAcceptDrawFour = null;
        this.onLeaveGame = null;
        this.onPlayAgain = null;
        this.onBackToLobby = null;

        this._setupEventListeners();
        window.addEventListener('resize', () => this._updateOrientationPrompt());
        window.addEventListener('orientationchange', () => this._updateOrientationPrompt());
    }

    // ----------------------------------------------------------
    // Event Listeners
    // ----------------------------------------------------------

    _setupEventListeners() {
        // Home screen
        this.btnCreateRoom.addEventListener('click', () => {
            let name = this.playerNameInput.value.trim();
            if (!name) {
                name = 'Player ' + Math.floor(100 + Math.random() * 900);
                this.playerNameInput.value = name;
            }
            if (this.onCreateRoom) this.onCreateRoom(name);
        });

        this.btnJoinRoom.addEventListener('click', () => {
            let name = this.playerNameInput.value.trim();
            const code = this.roomCodeInput.value.trim().toUpperCase();
            if (!name) {
                name = 'Player ' + Math.floor(100 + Math.random() * 900);
                this.playerNameInput.value = name;
            }
            if (!code || code.length < 3) {
                this.roomCodeInput.focus();
                this.showToast('Please enter a valid 3-character room code', 'warning');
                return;
            }
            if (this.onJoinRoom) this.onJoinRoom(name, code);
        });

        // Allow Enter key on room code input
        this.roomCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.btnJoinRoom.click();
        });
        this.playerNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.roomCodeInput.value.trim()) {
                    this.btnJoinRoom.click();
                } else {
                    this.btnCreateRoom.click();
                }
            }
        });

        // Lobby
        this.btnStartGame.addEventListener('click', () => {
            if (this.onStartGame) this.onStartGame();
        });

        this.btnLeaveLobby.addEventListener('click', () => {
            if (this.onLeaveRoom) this.onLeaveRoom();
        });

        this.btnCopyCode.addEventListener('click', () => {
            const code = this.lobbyRoomCode.textContent;
            navigator.clipboard.writeText(code).then(() => {
                this.showToast('Room code copied!', 'success');
            }).catch(() => {
                this.showToast(`Room code: ${code}`, 'info');
            });
        });

        // Game actions
        this.drawPile.addEventListener('click', () => {
            if (this.onDrawCard) this.onDrawCard();
        });

        if (this.btnDraw) {
            this.btnDraw.addEventListener('click', () => {
                if (this.onDrawCard) this.onDrawCard();
            });
        }

        this.btnUno.addEventListener('click', () => {
            if (this.onCallUno) this.onCallUno();
        });

        this.btnCatch.addEventListener('click', () => {
            if (this.onCatchUno) this.onCatchUno();
        });

        this.btnPlayDrawn.addEventListener('click', () => {
            if (this.onPlayDrawnCard) this.onPlayDrawnCard();
        });

        this.btnPassDrawn.addEventListener('click', () => {
            if (this.onPassDrawnCard) this.onPassDrawnCard();
        });

        // Game menu
        this.btnGameMenu.addEventListener('click', () => {
            this.showModal('modal-game-menu');
        });

        document.getElementById('btn-leave-game').addEventListener('click', () => {
            this.hideModal('modal-game-menu');
            if (this.onLeaveGame) this.onLeaveGame();
        });

        document.getElementById('btn-close-menu').addEventListener('click', () => {
            this.hideModal('modal-game-menu');
        });

        // Color picker
        document.querySelectorAll('.color-pick').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                this.hideModal('modal-color-picker');
                if (this.onChooseColor) this.onChooseColor(color);
            });
        });

        // Challenge modal
        document.getElementById('btn-challenge').addEventListener('click', () => {
            this.hideModal('modal-challenge');
            if (this.onChallengeDrawFour) this.onChallengeDrawFour();
        });

        document.getElementById('btn-accept-four').addEventListener('click', () => {
            this.hideModal('modal-challenge');
            if (this.onAcceptDrawFour) this.onAcceptDrawFour();
        });

        // Emoji bar buttons
        document.querySelectorAll('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const emoji = btn.dataset.emoji;
                if (this.onSendEmoji) this.onSendEmoji(emoji);
            });
        });

        // Results
        this.btnPlayAgain.addEventListener('click', () => {
            if (this.onPlayAgain) this.onPlayAgain();
        });

        this.btnBackLobby.addEventListener('click', () => {
            if (this.onBackToLobby) this.onBackToLobby();
        });

        // Close modals on backdrop click
        document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                // Don't close challenge or color picker on backdrop click
                const modal = e.target.closest('.modal');
                if (modal && modal.id === 'modal-game-menu') {
                    this.hideModal('modal-game-menu');
                }
            });
        });
    }

    // ----------------------------------------------------------
    // Screen Management
    // ----------------------------------------------------------

    showScreen(screenName) {
        for (const [name, el] of Object.entries(this.screens)) {
            el.classList.toggle('active', name === screenName);
        }

        if (screenName === 'game') {
            this._requestLandscape();
        } else {
            this.orientationPrompt.classList.add('hidden');
            if (screen.orientation?.unlock) screen.orientation.unlock();
        }
    }

    _requestLandscape() {
        const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
        if (!isMobile) return;

        if (screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
        }
        this._updateOrientationPrompt();
    }

    _updateOrientationPrompt() {
        const isMobile = window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 768;
        const isGame = this.screens.game.classList.contains('active');
        const portrait = window.matchMedia('(orientation: portrait)').matches;
        this.orientationPrompt.classList.toggle('hidden', !(isMobile && isGame && portrait));
    }

    // ----------------------------------------------------------
    // Modal Management
    // ----------------------------------------------------------

    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    hideModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    // ----------------------------------------------------------
    // Loading
    // ----------------------------------------------------------

    showLoading(text = 'Connecting...') {
        this.loadingText.textContent = text;
        this.loadingOverlay.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingOverlay.classList.add('hidden');
    }

    // ----------------------------------------------------------
    // Toast Notifications
    // ----------------------------------------------------------

    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.animationDuration = `0.3s, 0.3s`;
        toast.style.animationDelay = `0s, ${(duration - 300) / 1000}s`;
        this.toastContainer.appendChild(toast);

        setTimeout(() => {
            if (toast.parentNode) toast.remove();
        }, duration);
    }

    // ----------------------------------------------------------
    // Lobby Screen
    // ----------------------------------------------------------

    updateLobby(roomCode, players, isHost) {
        this.lobbyRoomCode.textContent = roomCode;
        this.playerCountBadge.textContent = `${players.length}/6`;

        // Render player list
        this.playerList.innerHTML = '';
        players.forEach((player, index) => {
            const li = document.createElement('li');

            const avatar = document.createElement('div');
            avatar.className = 'player-avatar';
            avatar.style.background = this.playerColors[index % this.playerColors.length];
            avatar.textContent = player.name.charAt(0).toUpperCase();

            const nameSpan = document.createElement('span');
            nameSpan.textContent = player.name;

            li.appendChild(avatar);
            li.appendChild(nameSpan);

            if (player.isHost) {
                const badge = document.createElement('span');
                badge.className = 'host-badge';
                badge.textContent = 'HOST';
                li.appendChild(badge);
            }

            this.playerList.appendChild(li);
        });

        // Start button (host only, needs 2+ players)
        this.btnStartGame.style.display = isHost ? '' : 'none';
        this.btnStartGame.disabled = players.length < 2;

        if (!isHost) {
            this.lobbyStatus.textContent = 'Waiting for host to start...';
        } else if (players.length < 2) {
            this.lobbyStatus.textContent = 'Need at least 2 players to start';
        } else {
            this.lobbyStatus.textContent = `${players.length} players ready!`;
        }
    }

    // ----------------------------------------------------------
    // Game Screen Rendering
    // ----------------------------------------------------------

    renderGameState(state, myPlayerId) {
        if (!state) return;

        // Room code
        this.gameRoomCode.textContent = state.roomCode || '';

        // Direction indicator
        this.directionIndicator.className = 'direction-indicator ' +
            (state.direction === 1 ? 'clockwise' : 'counter-clockwise');

        // Draw pile count
        this.drawPileCount.textContent = state.drawPileCount;

        // Discard pile top card
        this._renderDiscardPile(state.topCard);

        // Current color indicator
        this._renderColorIndicator(state.currentColor);

        // Opponents
        this._renderOpponents(state, myPlayerId);

        // Player hand
        this._renderHand(state);

        // Turn message
        this._renderTurnMessage(state, myPlayerId);

        // UNO / Catch buttons
        this._renderActionButtons(state, myPlayerId);

        // Drawn card decision
        if (state.awaitingDrawnCardDecision) {
            this.drawnCardDecision.classList.remove('hidden');
        } else {
            this.drawnCardDecision.classList.add('hidden');
        }

        // Challenge modal
        if (state.pendingDrawFour && state.isYourTurn) {
            const challenger = state.players.find(p => p.id === state.drawFourPlayerId);
            this.challengeText.textContent = `${challenger?.name || 'A player'} played +4 on you!`;
            this.showModal('modal-challenge');
        }
    }

    _renderDiscardPile(topCard) {
        if (!topCard) return;
        this.discardPile.innerHTML = '';
        const cardEl = this.createCardElement(topCard);
        this.discardPile.appendChild(cardEl);
    }

    _renderColorIndicator(color) {
        if (!color) return;
        this.colorDot.className = `color-dot ${color}`;
        this.colorLabel.textContent = color.charAt(0).toUpperCase() + color.slice(1);
    }

    _renderOpponents(state, myPlayerId) {
        this.opponentsArea.innerHTML = '';

        const myIndex = state.players.findIndex(p => p.id === myPlayerId);
        if (myIndex === -1) return;

        // Show all players except self, in order starting from next player
        const orderedOpponents = [];
        for (let i = 1; i < state.players.length; i++) {
            const idx = (myIndex + i) % state.players.length;
            orderedOpponents.push({ ...state.players[idx], _originalIndex: idx });
        }

        orderedOpponents.forEach((player, displayIndex) => {
            const slot = document.createElement('div');
            slot.className = 'opponent-slot';
            slot.dataset.playerId = player.id;
            if (player.id === state.currentPlayerId) {
                slot.classList.add('active-turn');
            }

            const avatar = document.createElement('div');
            avatar.className = 'opponent-avatar';
            avatar.style.background = this.playerColors[player._originalIndex % this.playerColors.length];
            avatar.textContent = player.name.charAt(0).toUpperCase();

            const name = document.createElement('div');
            name.className = 'opponent-name';
            name.textContent = player.isDisconnected ? `${player.name} (disconnected)` : player.name;
            if (player.isDisconnected) slot.classList.add('disconnected');

            const cards = document.createElement('div');
            cards.className = 'opponent-cards';
            cards.innerHTML = `<span class="card-icon">🃏</span> ${player.cardCount}`;

            slot.appendChild(avatar);
            slot.appendChild(name);
            slot.appendChild(cards);

            // UNO badge
            if (player.cardCount === 1 && state.unoCalled && state.unoCalled[player.id]) {
                const unoBadge = document.createElement('div');
                unoBadge.className = 'opponent-uno-badge';
                unoBadge.textContent = 'UNO!';
                slot.appendChild(unoBadge);
            }

            this.opponentsArea.appendChild(slot);
        });
    }

    _renderHand(state) {
        const currentCards = this.handScroll.querySelectorAll('.card');
        const newCards = state.players.find(p => p.hand)?.hand || [];
        const playableIndices = new Set(state.playableCardIndices || []);
        const isMyTurn = state.isYourTurn;

        this.handScroll.innerHTML = '';

        newCards.forEach((card, index) => {
            const cardEl = this.createCardElement(card);

            if (isMyTurn && !state.pendingDrawFour) {
                if (playableIndices.has(index)) {
                    cardEl.classList.add('playable');
                    cardEl.addEventListener('click', () => {
                        if (this.onPlayCard) this.onPlayCard(index, card);
                    });
                } else if (!state.awaitingDrawnCardDecision) {
                    cardEl.classList.add('dimmed');
                }
            }

            // Highlight drawn card
            if (state.awaitingDrawnCardDecision && index === newCards.length - 1) {
                cardEl.classList.add('drawn-highlight');
                cardEl.classList.remove('dimmed');
            }

            this.handScroll.appendChild(cardEl);
        });
    }

    _renderTurnMessage(state, myPlayerId) {
        if (state.gameStatus !== 'playing') {
            this.turnMessage.textContent = '';
            this.turnTimer.classList.add('hidden');
            return;
        }

        this.turnTimer.textContent = `${Math.max(0, state.turnTimeRemaining ?? 30)}s`;
        this.turnTimer.classList.toggle('urgent', (state.turnTimeRemaining ?? 30) <= 10);
        this.turnTimer.classList.remove('hidden');

        if (state.isYourTurn) {
            if (state.awaitingDrawnCardDecision) {
                this.turnMessage.textContent = 'Play the drawn card or pass';
                this.turnMessage.className = 'turn-message highlight';
            } else if (state.drawPenalty > 0) {
                this.turnMessage.textContent = `Stack +2/+4 or draw ${state.drawPenalty} cards`;
                this.turnMessage.className = 'turn-message highlight';
            } else {
                this.turnMessage.textContent = 'Your turn — play a card or draw';
                this.turnMessage.className = 'turn-message highlight';
            }
        } else {
            const currentPlayer = state.players.find(p => p.id === state.currentPlayerId);
            const status = currentPlayer?.isDisconnected ? 'disconnected; bot is playing' : 'turn';
            this.turnMessage.textContent = `${currentPlayer?.name || 'Someone'}'s ${status}`;
            this.turnMessage.className = 'turn-message';
        }
    }

    updateTurnTimer(seconds) {
        if (!this.turnTimer) return;
        const value = Math.max(0, Number(seconds) || 0);
        this.turnTimer.textContent = `${value}s`;
        this.turnTimer.classList.toggle('urgent', value <= 10);
        this.turnTimer.classList.toggle('hidden', value === 0);
    }

    _renderActionButtons(state, myPlayerId) {
        const myPlayer = state.players.find(p => p.id === myPlayerId);
        const myHandSize = myPlayer?.hand ? myPlayer.hand.length : myPlayer?.cardCount || 0;

        // Draw Card button — active when it's your turn
        if (this.btnDraw) {
            const isMyTurn = state.isYourTurn && !state.pendingDrawFour && !state.awaitingDrawnCardDecision;
            this.btnDraw.disabled = !isMyTurn;
            const hasNoPlayable = isMyTurn && (state.playableCardIndices?.length === 0);
            this.btnDraw.classList.toggle('pulse-draw', hasNoPlayable);
        }

        // UNO button — show when player has 2 cards (or 1 card) and hasn't called UNO yet
        const mustCall = state.mustCallUno?.[myPlayerId];
        const alreadyCalled = state.unoCalled?.[myPlayerId];
        const showUno = myPlayer && !alreadyCalled && (mustCall || myHandSize === 1 || (state.isYourTurn && myHandSize === 2));

        this.btnUno.classList.toggle('hidden', !showUno);

        // Catch button — show when any opponent has 1 card and hasn't called UNO
        let catchTarget = null;
        if (state.mustCallUno) {
            for (const [pid, must] of Object.entries(state.mustCallUno)) {
                if (pid !== myPlayerId && must && !state.unoCalled?.[pid]) {
                    catchTarget = pid;
                    break;
                }
            }
        }

        this.btnCatch.classList.toggle('hidden', !catchTarget);
        this.btnCatch._catchTarget = catchTarget;
    }

    // ----------------------------------------------------------
    // Card Element Creation
    // ----------------------------------------------------------

    createCardElement(card) {
        const el = document.createElement('div');
        el.className = 'card';
        el.dataset.cardId = card.id;

        // Color class
        if (card.color) {
            el.classList.add(`card-${card.color}`);
        } else if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            el.classList.add('card-wild');
        }

        // Inner container
        const inner = document.createElement('div');
        inner.className = 'card-inner';

        // Display value
        const displayVal = getCardDisplay(card);
        const isAction = card.type !== CARD_TYPES.NUMBER && card.type !== CARD_TYPES.WILD;

        // Corner top-left
        const cornerTL = document.createElement('span');
        cornerTL.className = 'card-corner top-left';
        cornerTL.textContent = (card.type === CARD_TYPES.WILD) ? '' : displayVal;

        // Corner bottom-right
        const cornerBR = document.createElement('span');
        cornerBR.className = 'card-corner bottom-right';
        cornerBR.textContent = (card.type === CARD_TYPES.WILD) ? '' : displayVal;

        inner.appendChild(cornerTL);
        inner.appendChild(cornerBR);

        // Center White Oval
        const oval = document.createElement('div');
        oval.className = 'card-oval';

        if (card.type === CARD_TYPES.WILD || card.type === CARD_TYPES.WILD_DRAW_FOUR) {
            // Wild 4-color wheel inside the white oval
            const wildWheel = document.createElement('div');
            wildWheel.className = 'wild-wheel';
            ['red', 'blue', 'yellow', 'green'].forEach(c => {
                const q = document.createElement('div');
                q.className = `wild-quadrant wq-${c}`;
                wildWheel.appendChild(q);
            });
            oval.appendChild(wildWheel);

            if (card.type === CARD_TYPES.WILD_DRAW_FOUR) {
                const plusFour = document.createElement('span');
                plusFour.className = 'wild-plus-four';
                plusFour.textContent = '+4';
                oval.appendChild(plusFour);
            }
        } else {
            const center = document.createElement('span');
            center.className = 'card-center' + (isAction ? ' action-text' : '');
            center.textContent = displayVal;
            oval.appendChild(center);
        }

        inner.appendChild(oval);
        el.appendChild(inner);

        return el;
    }

    // ----------------------------------------------------------
    // Color Picker
    // ----------------------------------------------------------

    showColorPicker() {
        this.showModal('modal-color-picker');
    }

    // ----------------------------------------------------------
    // Results Screen
    // ----------------------------------------------------------

    showResults(winnerName, scores, isHost) {
        this.winnerName.textContent = `${winnerName} wins! 🎉`;

        // Render scores
        this.scoresTable.innerHTML = '';
        if (scores) {
            scores.forEach(entry => {
                const row = document.createElement('div');
                row.className = 'score-row' + (entry.cardsLeft === 0 ? ' winner-row' : '');

                const name = document.createElement('div');
                name.className = 'score-name';
                name.innerHTML = (entry.cardsLeft === 0 ? '🏆 ' : '') + entry.name;

                const points = document.createElement('div');
                points.className = 'score-points';
                points.textContent = entry.score + ' pts';

                row.appendChild(name);
                row.appendChild(points);
                this.scoresTable.appendChild(row);
            });
        }

        // Show/hide host actions
        this.btnPlayAgain.style.display = isHost ? '' : 'none';
        this.btnBackLobby.style.display = isHost ? '' : 'none';

        this.showScreen('results');
        this._spawnConfetti();
    }

    showEmojiReaction(playerId, emoji, playerName) {
        let targetEl = null;

        const slots = this.opponentsArea.querySelectorAll('.opponent-slot');
        slots.forEach(slot => {
            if (slot.dataset.playerId === playerId) {
                targetEl = slot;
            }
        });

        if (!targetEl) {
            targetEl = document.getElementById('hand-area') || document.body;
        }

        const el = document.createElement('div');
        el.className = 'floating-emoji';
        el.textContent = emoji;

        const rect = targetEl.getBoundingClientRect();
        el.style.left = Math.max(10, Math.min(window.innerWidth - 60, rect.left + rect.width / 2 - 20)) + 'px';
        el.style.top = Math.max(10, rect.top - 20) + 'px';

        document.body.appendChild(el);

        setTimeout(() => {
            if (el.parentNode) el.remove();
        }, 1800);
    }

    _spawnConfetti() {
        const container = document.getElementById('confetti-container');
        container.innerHTML = '';
        const colors = ['#E74C3C', '#2980D9', '#27AE60', '#F1C40F', '#8B5CF6', '#EC4899'];

        for (let i = 0; i < 40; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.left = Math.random() * 100 + '%';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.setProperty('--fall-duration', (2 + Math.random() * 3) + 's');
            piece.style.setProperty('--fall-delay', Math.random() * 1 + 's');
            piece.style.width = (6 + Math.random() * 8) + 'px';
            piece.style.height = (6 + Math.random() * 8) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            container.appendChild(piece);
        }
    }
}
