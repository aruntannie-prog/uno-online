// ============================================================
// network.js — PeerJS WebRTC Networking
// Host/client architecture with star topology
// ============================================================

class NetworkManager {
    constructor() {
        this.peer = null;
        this.connections = new Map(); // peerId -> { conn, playerId, playerName }
        this.isHost = false;
        this.hostConnection = null;  // Only set for clients
        this.roomCode = '';
        this.peerId = '';
        this.playerName = '';

        // Event callbacks
        this.onPlayerJoined = null;   // (playerId, playerName)
        this.onPlayerLeft = null;     // (playerId)
        this.onMessage = null;        // (message, fromPlayerId)
        this.onConnected = null;      // ()
        this.onDisconnected = null;   // (reason)
        this.onError = null;          // (error)
    }

    /**
     * Generate a 3-character room code (no ambiguous chars like 0/O, 1/I/L).
     */
    _generateRoomCode() {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 3; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
        return code;
    }

    /**
     * Create a new room (host mode).
     * @param {string} playerName - Host player's display name
     * @returns {Promise<{roomCode: string, peerId: string}>}
     */
    createRoom(playerName) {
        return new Promise((resolve, reject) => {
            if (typeof Peer === 'undefined') {
                return reject(new Error('PeerJS network library not loaded. Please check your connection and refresh.'));
            }

            // Disconnect previous peer connection if any
            this.disconnect();

            this.isHost = true;
            this.playerName = playerName;
            this.roomCode = this._generateRoomCode();
            const peerId = `uno-${this.roomCode}`;

            let isSettled = false;

            const timeout = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    this.disconnect();
                    reject(new Error('Connection to network timed out. Please try again.'));
                }
            }, 10000);

            try {
                this.peer = new Peer(peerId, {
                    debug: 0
                });
            } catch (err) {
                clearTimeout(timeout);
                isSettled = true;
                return reject(err);
            }

            this.peer.on('open', (id) => {
                if (isSettled) return;
                isSettled = true;
                clearTimeout(timeout);

                this.peerId = id;
                console.log(`[Host] Room created: ${this.roomCode} | PeerId: ${id}`);

                this.peer.on('connection', (conn) => {
                    this._handleIncomingConnection(conn);
                });

                resolve({ roomCode: this.roomCode, peerId: id });
            });

            this.peer.on('error', (err) => {
                console.error('[Host] PeerJS error:', err);
                if (err.type === 'unavailable-id' && !isSettled) {
                    clearTimeout(timeout);
                    isSettled = true;
                    this.disconnect();
                    this.createRoom(playerName).then(resolve).catch(reject);
                } else if (!isSettled) {
                    isSettled = true;
                    clearTimeout(timeout);
                    if (this.onError) this.onError(err);
                    reject(err);
                }
            });

            this.peer.on('disconnected', () => {
                console.log('[Host] Disconnected from signaling server, attempting reconnect...');
                if (this.peer && !this.peer.destroyed) {
                    this.peer.reconnect();
                }
            });
        });
    }

    /**
     * Join an existing room (client mode).
     * @param {string} roomCode - 3-char room code
     * @param {string} playerName - Player's display name
     * @returns {Promise<{peerId: string}>}
     */
    joinRoom(roomCode, playerName) {
        return new Promise((resolve, reject) => {
            if (typeof Peer === 'undefined') {
                return reject(new Error('PeerJS network library not loaded. Please check your connection and refresh.'));
            }

            this.disconnect();

            this.isHost = false;
            this.playerName = playerName;
            this.roomCode = roomCode.toUpperCase().trim();
            const hostPeerId = `uno-${this.roomCode}`;

            let isSettled = false;

            const timeout = setTimeout(() => {
                if (!isSettled) {
                    isSettled = true;
                    this.disconnect();
                    reject(new Error('Connection timed out. Check the room code and try again.'));
                }
            }, 10000);

            try {
                this.peer = new Peer(undefined, {
                    debug: 0
                });
            } catch (err) {
                clearTimeout(timeout);
                isSettled = true;
                return reject(err);
            }

            this.peer.on('open', (id) => {
                this.peerId = id;
                console.log(`[Client] My PeerId: ${id} | Connecting to room: ${this.roomCode}`);

                const conn = this.peer.connect(hostPeerId, {
                    reliable: true,
                    metadata: { playerName, peerId: id }
                });

                conn.on('open', () => {
                    if (isSettled) return;
                    isSettled = true;
                    clearTimeout(timeout);
                    this.hostConnection = conn;
                    console.log(`[Client] Connected to host`);

                    this.sendToHost({
                        type: 'JOIN',
                        playerName: this.playerName,
                        playerId: this.peerId
                    });

                    conn.on('data', (data) => {
                        if (this.onMessage) this.onMessage(data, 'host');
                    });

                    conn.on('close', () => {
                        console.log('[Client] Disconnected from host');
                        if (this.onDisconnected) this.onDisconnected('Host disconnected');
                    });

                    resolve({ peerId: id });
                });

                conn.on('error', (err) => {
                    if (!isSettled) {
                        isSettled = true;
                        clearTimeout(timeout);
                        this.disconnect();
                        reject(err);
                    }
                });
            });

            this.peer.on('error', (err) => {
                console.error('[Client] PeerJS error:', err);
                if (!isSettled) {
                    isSettled = true;
                    clearTimeout(timeout);
                    this.disconnect();
                    reject(new Error(err.type === 'peer-unavailable' ? 'Room not found. Check the room code!' : err.message));
                }
            });
        });
    }

    /**
     * Handle a new incoming connection (host only).
     */
    _handleIncomingConnection(conn) {
        console.log('[Host] New connection from:', conn.peer);

        conn.on('open', () => {
            // Wait for JOIN message with player info
            const joinTimeout = setTimeout(() => {
                console.log('[Host] Connection timed out waiting for JOIN');
                conn.close();
            }, 5000);

            conn.on('data', (data) => {
                if (data.type === 'JOIN') {
                    clearTimeout(joinTimeout);
                    const playerId = data.playerId || conn.peer;
                    const playerName = data.playerName || 'Player';

                    // Store connection
                    this.connections.set(playerId, {
                        conn,
                        playerId,
                        playerName
                    });

                    console.log(`[Host] Player joined: ${playerName} (${playerId})`);

                    if (this.onPlayerJoined) {
                        this.onPlayerJoined(playerId, playerName);
                    }
                } else {
                    // Game message
                    const playerId = this._getPlayerIdByConn(conn);
                    if (this.onMessage) this.onMessage(data, playerId);
                }
            });

            conn.on('close', () => {
                const playerId = this._getPlayerIdByConn(conn);
                if (playerId) {
                    console.log(`[Host] Player left: ${playerId}`);
                    this.connections.delete(playerId);
                    if (this.onPlayerLeft) this.onPlayerLeft(playerId);
                }
            });

            conn.on('error', (err) => {
                console.error('[Host] Connection error:', err);
            });
        });
    }

    /**
     * Find a player ID by their connection object.
     */
    _getPlayerIdByConn(conn) {
        for (const [playerId, info] of this.connections) {
            if (info.conn === conn) return playerId;
        }
        return null;
    }

    // ----------------------------------------------------------
    // Messaging
    // ----------------------------------------------------------

    /**
     * Send a message to the host (client only).
     */
    sendToHost(data) {
        if (!this.hostConnection || !this.hostConnection.open) {
            console.warn('[Client] Cannot send — not connected to host');
            return false;
        }
        this.hostConnection.send(data);
        return true;
    }

    /**
     * Send a message to a specific player (host only).
     */
    sendToPlayer(playerId, data) {
        const info = this.connections.get(playerId);
        if (!info || !info.conn.open) {
            console.warn(`[Host] Cannot send to ${playerId} — not connected`);
            return false;
        }
        info.conn.send(data);
        return true;
    }

    /**
     * Broadcast a message to ALL connected players (host only).
     */
    broadcast(data) {
        for (const [playerId, info] of this.connections) {
            if (info.conn.open) {
                info.conn.send(data);
            }
        }
    }

    /**
     * Broadcast a message to all players EXCEPT the specified one.
     */
    broadcastExcept(excludePlayerId, data) {
        for (const [playerId, info] of this.connections) {
            if (playerId !== excludePlayerId && info.conn.open) {
                info.conn.send(data);
            }
        }
    }

    /**
     * Get list of connected player IDs and names.
     */
    getConnectedPlayers() {
        const players = [];
        for (const [playerId, info] of this.connections) {
            players.push({ id: playerId, name: info.playerName });
        }
        return players;
    }

    /**
     * Get number of connected players (excluding host).
     */
    getPlayerCount() {
        return this.connections.size;
    }

    // ----------------------------------------------------------
    // Disconnect
    // ----------------------------------------------------------

    /**
     * Cleanly disconnect from the network.
     */
    disconnect() {
        console.log('[Network] Disconnecting...');

        // Close all connections
        for (const [, info] of this.connections) {
            if (info.conn.open) info.conn.close();
        }
        this.connections.clear();

        // Close host connection (client)
        if (this.hostConnection && this.hostConnection.open) {
            this.hostConnection.close();
        }
        this.hostConnection = null;

        // Destroy peer
        if (this.peer && !this.peer.destroyed) {
            this.peer.destroy();
        }
        this.peer = null;

        this.roomCode = '';
        this.peerId = '';
        this.isHost = false;
    }

    /**
     * Check if still connected.
     */
    isConnected() {
        if (this.isHost) {
            return this.peer && !this.peer.destroyed;
        }
        return this.hostConnection && this.hostConnection.open;
    }
}
