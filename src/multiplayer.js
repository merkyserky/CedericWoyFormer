// Client-side WebSocket Multiplayer Coordinator

export class MultiplayerManager {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.playerId = null;
    this.isConnected = false;
    this.updateInterval = null;
    
    // Throttling updates (30 updates/sec = ~33.3ms)
    this.lastSentTime = 0;
    this.sendRateMs = 33.3; 
  }

  connect(serverUrl, nickname, sex, color, roomName, onSuccess, onError) {
    this.disconnect();
    
    try {
      this.socket = new WebSocket(serverUrl);
    } catch (e) {
      if (onError) onError(e);
      return;
    }

    this.socket.onopen = () => {
      this.isConnected = true;
      
      // Request joining the room
      this.socket.send(JSON.stringify({
        type: 'join',
        name: nickname,
        sex: sex,
        color: color,
        room: roomName
      }));
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleServerMessage(data);
      } catch (e) {
        console.error('Error handling socket message:', e);
      }
    };

    this.socket.onclose = () => {
      this.disconnect();
      this.game.setGameState('MENU');
      alert('Disconnected from multiplayer server.');
    };

    this.socket.onerror = (err) => {
      console.error('WebSocket error:', err);
      if (onError) onError(err);
    };

    this.onSuccessCallback = onSuccess;
  }

  disconnect() {
    this.isConnected = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    if (this.socket) {
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.close();
      this.socket = null;
    }
    this.playerId = null;
    this.game.otherPlayers = {};
  }

  handleServerMessage(data) {
    if (data.type === 'join_success') {
      this.playerId = data.id;
      if (this.onSuccessCallback) {
        this.onSuccessCallback(data.id);
        this.onSuccessCallback = null;
      }
    }
    
    else if (data.type === 'room_players') {
      data.players.forEach(p => {
        this.game.otherPlayers[p.id] = {
          name: p.name,
          sex: p.sex,
          color: p.color,
          x: p.x,
          y: p.y,
          vx: p.vx || 0,
          vy: p.vy || 0,
          facingDir: p.facingDir || 1,
          isDashing: p.isDashing || false,
          squishX: 1,
          squishY: 1,
          isAlive: true
        };
      });
    }

    else if (data.type === 'player_joined') {
      this.game.otherPlayers[data.id] = {
        name: data.name,
        sex: data.sex,
        color: data.color,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        facingDir: 1,
        isDashing: false,
        squishX: 1,
        squishY: 1,
        isAlive: true
      };
      
      // Spawn entering portal/particles for fun
      this.game.triggerSpawnGlow(data.id);
    }

    else if (data.type === 'player_moved') {
      const p = this.game.otherPlayers[data.id];
      if (p) {
        p.x = data.x;
        p.y = data.y;
        p.vx = data.vx;
        p.vy = data.vy;
        p.facingDir = data.facingDir;
        p.isDashing = data.isDashing;
        p.squishX = data.squishX || 1;
        p.squishY = data.squishY || 1;
        p.isAlive = data.isAlive;
      }
    }

    else if (data.type === 'player_shot') {
      this.game.spawnRemoteLaser(data.x, data.y, data.vx, data.vy, data.color);
    }

    else if (data.type === 'block_broken') {
      this.game.breakDestructibleBlockLocally(data.r, data.c);
    }

    else if (data.type === 'beaver_action') {
      this.game.syncRemoteBeaverAction(data.actionType, data.id, data.x, data.y, data.vx, data.vy);
    }

    else if (data.type === 'player_left') {
      delete this.game.otherPlayers[data.id];
    }
  }

  // Sends player positions at 30Hz
  sendMovementUpdate() {
    if (!this.isConnected || !this.socket || this.socket.readyState !== 1) return;
    
    const now = performance.now();
    if (now - this.lastSentTime < this.sendRateMs) return;
    this.lastSentTime = now;

    const p = this.game.player;
    this.socket.send(JSON.stringify({
      type: 'move',
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      facingDir: p.facingDir,
      isDashing: p.isDashing,
      squishX: p.squishX || 1,
      squishY: p.squishY || 1,
      isAlive: p.isAlive
    }));
  }

  // Broadcast laser fire
  sendLaserFire(x, y, vx, vy) {
    if (!this.isConnected || !this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({
      type: 'shoot',
      x,
      y,
      vx,
      vy
    }));
  }

  // Broadcast block destruction
  sendBlockBreak(r, c) {
    if (!this.isConnected || !this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({
      type: 'block_break',
      r,
      c
    }));
  }

  // Broadcast beaver interactions
  sendBeaverAction(actionType, id, x, y, vx, vy) {
    if (!this.isConnected || !this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({
      type: 'beaver_action',
      actionType,
      id,
      x,
      y,
      vx,
      vy
    }));
  }
}
