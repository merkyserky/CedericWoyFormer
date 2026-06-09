// Core Game Engine and Physics for CedericWoyFormer
import { LEVELS, LEVEL_THEMES } from './levels.js';
import { audio } from './audio.js';
import { particles } from './particles.js';
import PF from 'pathfinding';

export class GameEngine {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    
    // Core Game States
    this.gameState = 'MENU'; // MENU, PLAYING, PAUSED, GAME_OVER, LEVEL_COMPLETE, VICTORY
    this.currentLevelIdx = 0;
    this.deaths = 0;
    this.totalCoinsCollected = 0;
    this.levelTime = 0;
    this.levelCoinsCollected = 0;
    this.levelTotalCoins = 0;
    this.levelStartTime = 0;
    
    // Input state
    this.keys = {};
    
    // Physics constants
    this.tileSize = 40;
    this.gravity = 1400; // px/s^2
    this.terminalVelocity = 700;
    this.runSpeed = 260;
    this.iceRunSpeed = 340;
    this.jumpForce = 520;
    this.bounceForce = 750;
    
    this.gunAcquiredBeforeLevel = false;
    this.showPaths = false;
    
    // Post-processing
    this.scanlinePattern = null;
    this.screenFlash = { alpha: 0, color: '#ff0044' };
    this.chromaticAberration = 0;
    
    // Noise events for AI awareness
    this.noiseEvents = [];
    this.soundRipples = [];
    
    // Player structure
    this.player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      width: 30,
      height: 38,
      isGrounded: false,
      coyoteTimer: 0,
      jumpBuffer: 0,
      canDoubleJump: true,
      canDash: true,
      isDashing: false,
      dashTimer: 0,
      dashCooldown: 0,
      dashDir: 1,
      dashDirX: 1,
      dashDirY: 0,
      facingDir: 1, // 1 = right, -1 = left
      isAlive: true,
      invulnTimer: 0,
      squishX: 1,
      squishY: 1,
      hasGun: false,
      shootCooldown: 0,
      lasers: [],
      canVariableJumpCut: false,
      godMode: false,
      noclip: false,
      heldBeaver: null,
      isChargingThrow: false,
      throwPower: 150
    };

    this.playerSex = 'male';

    // Sprite assets
    this.playerHead = new Image();
    this.playerHead.src = './character.jpg';
    this.headLoaded = false;
    this.playerHead.onload = () => {
      this.headLoaded = true;
    };

    // Camera settings
    this.camera = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      shakeTimer: 0,
      shakeIntensity: 0
    };

    // Level objects
    this.tiles = [];
    this.coins = [];
    this.enemies = [];
    this.movingPlatforms = [];
    this.exitPortal = { x: 0, y: 0, radius: 25 };
    
    // New entity arrays
    this.turrets = [];
    this.walkers = [];
    this.keys = [];
    this.doors = [];
    this.teleporters = [];
    this.gravityZones = [];
    this.turretProjectiles = [];
    this.collectedKeys = { red: false, blue: false, green: false };
    this.bouncePads = [];
    
    this.beavers = [];
    this.kangaroos = [];

    // Offscreen canvas for pre-rendering static tiles and grid
    this.tileCanvas = document.createElement('canvas');
    this.tileCtx = this.tileCanvas.getContext('2d');

    // Boss properties
    this.boss = null;
    this.bossProjectiles = [];

    // Timers
    this.lastTime = 0;
    
    // Weapon slots state & mouse tracking
    this.selectedWeapon = 0; // 0 = unarmed, 1 = blaster
    this.mouse = { x: 0, y: 0 };
    
    this.setupInputs();
  }

  // Setup keyboard and touch control listeners
  setupInputs() {
    // Canvas mouse coordinates tracking
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    });

    // Mouse click shooting or charging beaver throw
    this.canvas.addEventListener('mousedown', (e) => {
      if (this.gameState === 'PLAYING' && this.player.isAlive) {
        if (e.button === 0) { // Left click
          if (this.player.heldBeaver) {
            this.player.isChargingThrow = true;
            this.player.throwPower = 150;
          } else if (this.selectedWeapon === 1 && this.player.hasGun) {
            this.shootLaserTowardsMouse();
          }
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0 && this.player.isChargingThrow) {
        this.throwBeaver();
      }
    });

    window.addEventListener('keydown', (e) => {
      // If typing in the admin input, ignore game inputs!
      if (document.activeElement && document.activeElement.id === 'admin-input') {
        if (e.key === 'Enter') {
          this.executeAdminCommand();
        }
        if (e.key === 'Escape') {
          this.toggleAdminBar(false);
        }
        return;
      }

      // Toggle Admin console on backtick key
      if (e.key === '`') {
        e.preventDefault();
        this.toggleAdminBar();
        return;
      }

      const code = e.code;
      const isRepeat = this.keys[code];
      this.keys[code] = true;
      
      if (!isRepeat) {
        // Handle Jump (fresh press only)
        if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
          this.player.jumpBuffer = 0.12;
        }
        
        // Pick up or drop beaver
        if (code === 'KeyE' && this.gameState === 'PLAYING' && this.player.isAlive) {
          if (this.player.heldBeaver) {
            this.dropBeaver();
          } else {
            this.pickupBeaver();
          }
        }
        
        // Slot selection keys
        if (code === 'Digit1') {
          this.selectWeapon(0); // Key 1 equips Fist (Slot 0)
        }
        if (code === 'Digit2') {
          this.selectWeapon(1); // Key 2 equips Blaster (Slot 1)
        }
      }
      
      // Handle Pause Toggle
      if (code === 'Escape' || code === 'KeyP') {
        if (this.gameState === 'PLAYING') {
          this.setGameState('PAUSED');
        } else if (this.gameState === 'PAUSED') {
          this.setGameState('PLAYING');
        }
      }
      
      // Handle Quick Restart
      if (code === 'KeyR' && this.gameState === 'PLAYING') {
        this.triggerLevelTransition(() => {
          this.resetLevel();
        });
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener('blur', () => {
      this.keys = {};
    });

    // Touch controls helper
    const hookTouchBtn = (id, keyCode) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const isRepeat = this.keys[keyCode];
        this.keys[keyCode] = true;
        if (!isRepeat && (keyCode === 'Space' || keyCode === 'KeyW' || keyCode === 'ArrowUp')) {
          this.player.jumpBuffer = 0.12;
        }
      });
      btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.keys[keyCode] = false;
      });
    };

    hookTouchBtn('touch-left', 'ArrowLeft');
    hookTouchBtn('touch-right', 'ArrowRight');
    hookTouchBtn('touch-jump', 'Space');
    hookTouchBtn('touch-dash', 'ShiftLeft');
    hookTouchBtn('touch-shoot', 'KeyF');

    // Setup Toolbar Slots click triggers
    const slot0 = document.getElementById('slot-0');
    const slot1 = document.getElementById('slot-1');
    if (slot0) slot0.addEventListener('click', () => this.selectWeapon(0));
    if (slot1) slot1.addEventListener('click', () => this.selectWeapon(1));

    // Setup HUD terminal toggle trigger
    const termToggle = document.getElementById('hud-terminal-toggle');
    if (termToggle) termToggle.addEventListener('click', () => this.toggleAdminBar());
  }

  // Set current game state and manage UI transitions
  setGameState(state) {
    this.gameState = state;
    
    // Hide all overlays
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('game-hud').classList.add('hidden');
    document.getElementById('hud-pause-tip').classList.add('hidden');
    document.getElementById('touch-controls').classList.add('hidden');
    document.getElementById('game-toolbar').classList.add('hidden');
    this.toggleAdminBar(false);
    
    // Activate current UI overlays
    if (state === 'MENU') {
      document.getElementById('main-menu').classList.add('active');
      audio.init();
    } else if (state === 'PLAYING') {
      document.getElementById('game-hud').classList.remove('hidden');
      document.getElementById('hud-pause-tip').classList.remove('hidden');
      document.getElementById('game-toolbar').classList.remove('hidden');
      this.updateToolbarUI();
      
      // Detect touch screen to show touch buttons
      if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        document.getElementById('touch-controls').classList.remove('hidden');
      }
      
      audio.init();
    } else if (state === 'PAUSED') {
      document.getElementById('pause-screen').classList.add('active');
    } else if (state === 'GAME_OVER') {
      document.getElementById('game-over-screen').classList.add('active');
    } else if (state === 'LEVEL_COMPLETE') {
      document.getElementById('complete-coins').innerText = `${this.levelCoinsCollected} / ${this.levelTotalCoins}`;
      const timeSec = ((Date.now() - this.levelStartTime) / 1000).toFixed(1);
      document.getElementById('complete-time').innerText = `${timeSec}s`;
      document.getElementById('level-complete-screen').classList.add('active');
    } else if (state === 'VICTORY') {
      document.getElementById('victory-total-coins').innerText = this.totalCoinsCollected;
      document.getElementById('victory-total-deaths').innerText = this.deaths;
      document.getElementById('victory-screen').classList.add('active');
    }
  }

  // Load a level and initialize map coordinates
  loadLevel(levelIdx) {
    this.currentLevelIdx = levelIdx;
    const lvl = LEVELS[levelIdx];
    
    // Update player head image based on selected sex
    let imgSrc = './character.jpg';
    if (this.playerSex === 'female') {
      imgSrc = './female_avatar.png';
    } else if (this.playerSex === 'cyber') {
      imgSrc = './cyber_avatar.png';
    }
    this.playerHead.src = imgSrc;
    
    // Gun status setup (Sector 5 directly gives the gun for convenience)
    if (levelIdx === 0) {
      this.player.hasGun = false;
      this.gunAcquiredBeforeLevel = false;
      this.selectedWeapon = 0;
    } else if (levelIdx === 4) {
      this.player.hasGun = true;
      this.gunAcquiredBeforeLevel = true;
      this.selectedWeapon = 1;
    } else {
      this.player.hasGun = this.gunAcquiredBeforeLevel;
      this.selectedWeapon = this.player.hasGun ? 1 : 0;
    }
    this.player.shootCooldown = 0;
    this.player.lasers = [];
    this.gunPickup = null;

    // Show/hide touch shoot button based on weapon status
    const touchShootBtn = document.getElementById('touch-shoot');
    if (touchShootBtn) {
      if (this.player.hasGun) {
        touchShootBtn.classList.remove('hidden');
      } else {
        touchShootBtn.classList.add('hidden');
      }
    }

    this.tiles = [];
    this.coins = [];
    this.enemies = [];
    this.movingPlatforms = [];
    this.bouncePads = [];
    this.turrets = [];
    this.walkers = [];
    this.beavers = [];
    this.kangaroos = [];
    this.keys = [];
    this.doors = [];
    this.teleporters = [];
    this.gravityZones = [];
    this.turretProjectiles = [];
    this.collectedKeys = { red: false, blue: false, green: false };
    this.noiseEvents = [];
    this.soundRipples = [];
    this.boss = null;
    this.bossProjectiles = [];
    particles.clear();
    
    // Play correct chiptune music track (normal vs boss)
    audio.startMusic(lvl.isBossLevel);
    
    this.levelCoinsCollected = 0;
    this.levelTotalCoins = 0;
    
    // Parse map
    const map = lvl.map;
    const rows = map.length;
    const cols = map[0].length;
    
    for (let r = 0; r < rows; r++) {
      this.tiles[r] = [];
      for (let c = 0; c < cols; c++) {
        const char = map[r][c];
        this.tiles[r][c] = char;
        
        const px = c * this.tileSize;
        const py = r * this.tileSize;
        
        if (char === 'P') {
          // Spawn position
          this.player.x = px + (this.tileSize - this.player.width) / 2;
          this.player.y = py + (this.tileSize - this.player.height);
          this.player.vx = 0;
          this.player.vy = 0;
          this.player.isAlive = true;
          this.player.canDoubleJump = true;
          this.player.canDash = true;
          this.player.isDashing = false;
          this.player.canVariableJumpCut = false;
          // Clear P tile to make it empty
          this.tiles[r][c] = ' ';
        } else if (char === '*') {
          // Coin
          this.coins.push({ x: px + this.tileSize / 2, y: py + this.tileSize / 2, collected: false });
          this.levelTotalCoins++;
          this.tiles[r][c] = ' ';
        } else if (char === 'G') {
          // Gun pickup
          this.gunPickup = { x: px + this.tileSize / 2, y: py + this.tileSize / 2, collected: false };
          this.tiles[r][c] = ' ';
        } else if (char === 'E') {
          // Exit Portal
          this.exitPortal.x = px + this.tileSize / 2;
          this.exitPortal.y = py + this.tileSize / 2;
          this.tiles[r][c] = ' ';
        } else if (char === 'B') {
          // Bounce pad
          this.bouncePads.push({ x: px, y: py, width: this.tileSize, height: this.tileSize });
        } else if (char === 'M') {
          // Patrol Drone Enemy (placed via level editor)
          this.enemies.push({
            startX: px,
            startY: py + 4,
            x: px,
            y: py + 4,
            vx: 0,
            vy: 0,
            width: 32,
            height: 32,
            rangeX: 120, // default range
            speed: 60, // default speed
            dir: 1,
            hoverTimer: Math.random() * Math.PI * 2
          });
          this.tiles[r][c] = ' ';
        } else if (char === 'L') {
          // Turret (stationary rotating cannon)
          this.turrets.push({
            x: px + this.tileSize / 2,
            y: py + this.tileSize / 2,
            angle: 0,
            fireTimer: 1.5 + Math.random(),
            fireCooldown: 2.0,
            range: 280,
            alive: true
          });
          this.tiles[r][c] = ' ';
        } else if (char === 'W') {
          // Ground Walker (gravity-bound patrol bot)
          this.walkers.push({
            x: px,
            y: py,
            vx: 0,
            vy: 0,
            width: 30,
            height: 28,
            speed: 100,
            dir: 1,
            isGrounded: false,
            alive: true,
            stepTimer: 0
          });
          this.tiles[r][c] = ' ';
        } else if (char === 'V') {
          // Beaver
          this.beavers.push({
            x: px,
            y: py,
            vx: 60, // walks at 60px/s
            vy: 0,
            width: 32,
            height: 24,
            dir: 1,
            chewTimer: 0,
            chewCooldown: 0,
            isGrounded: false,
            alive: true
          });
          this.tiles[r][c] = ' ';
        } else if (char === 'K') {
          // Kangaroo
          this.kangaroos.push({
            x: px,
            y: py,
            vx: 0,
            vy: 0,
            width: 28,
            height: 38,
            dir: 1,
            hopTimer: 1.0 + Math.random(),
            isGrounded: false,
            alive: true
          });
          this.tiles[r][c] = ' ';
        } else if (char === '1' || char === '2' || char === '3') {
          // Key pickup
          const keyType = char === '1' ? 'red' : char === '2' ? 'blue' : 'green';
          const keyColor = char === '1' ? '#ff4444' : char === '2' ? '#4488ff' : '#44ff44';
          this.keys.push({
            x: px + this.tileSize / 2,
            y: py + this.tileSize / 2,
            type: keyType,
            color: keyColor,
            collected: false
          });
          this.tiles[r][c] = ' ';
        } else if (char === '!' || char === '@' || char === '$') {
          // Door tile (stays in tilemap as solid until key collected)
          const doorType = char === '!' ? 'red' : char === '@' ? 'blue' : 'green';
          const doorColor = char === '!' ? '#ff4444' : char === '@' ? '#4488ff' : '#44ff44';
          this.doors.push({
            r: r,
            c: c,
            type: doorType,
            color: doorColor,
            char: char
          });
          // Door tile stays in the tilemap and is treated as solid
        } else if (char === 'T') {
          // Teleporter pad
          this.teleporters.push({
            x: px + this.tileSize / 2,
            y: py + this.tileSize / 2,
            cooldown: 0,
            paired: null // will be paired after parsing
          });
          this.tiles[r][c] = ' ';
        } else if (char === 'Z') {
          // Gravity zone (tile stays in map for rendering)
          this.gravityZones.push({
            x: px,
            y: py,
            width: this.tileSize,
            height: this.tileSize
          });
          // Z tiles stay in the tilemap for rendering but are NOT solid
        }
      }
    }
    
    // Add moving platforms
    if (lvl.movingPlatforms) {
      lvl.movingPlatforms.forEach((p) => {
        this.movingPlatforms.push({
          startX: p.x * this.tileSize,
          startY: p.y * this.tileSize,
          x: p.x * this.tileSize,
          y: p.y * this.tileSize,
          width: p.width * this.tileSize,
          height: p.height * this.tileSize,
          rangeX: p.rangeX * this.tileSize,
          rangeY: p.rangeY * this.tileSize,
          speed: p.speed,
          timer: 0
        });
      });
    }

    // Add enemies
    if (lvl.patrols) {
      lvl.patrols.forEach((e) => {
        this.enemies.push({
          startX: e.x * this.tileSize,
          startY: e.y * this.tileSize,
          x: e.x * this.tileSize,
          y: e.y * this.tileSize,
          vx: 0,
          vy: 0,
          width: 32,
          height: 32,
          rangeX: e.rangeX,
          speed: e.speed,
          dir: 1,
          hoverTimer: Math.random() * Math.PI * 2
        });
      });
    }
    
    // Set level time start
    this.levelStartTime = Date.now();
    this.updateHUD();
    
    // Reset camera instantly on player, centering levels if they are smaller than viewport
    const mapMaxX = cols * this.tileSize;
    const mapMaxY = rows * this.tileSize;
    const targetX = this.player.x - this.canvas.width / 2;
    const targetY = this.player.y - this.canvas.height / 2;
    
    if (mapMaxX > this.canvas.width) {
      this.camera.x = Math.max(0, Math.min(mapMaxX - this.canvas.width, targetX));
    } else {
      this.camera.x = (mapMaxX - this.canvas.width) / 2;
    }
    
    if (mapMaxY > this.canvas.height) {
      this.camera.y = Math.max(0, Math.min(mapMaxY - this.canvas.height, targetY));
    } else {
      this.camera.y = (mapMaxY - this.canvas.height) / 2;
    }

    // Setup Boss properties if it is Sector 5 (Mainframe Core)
    if (lvl.isBossLevel) {
      this.boss = {
        x: (lvl.width * this.tileSize) / 2 - 50,
        y: 100,
        vx: 120,
        vy: 0,
        width: 100,
        height: 116,
        health: 3,
        maxHealth: 3,
        shield: 100,
        maxShield: 100,
        state: 'INTRO', // INTRO, PATROL, STOMP_PREP, STOMP_FALL, STUNNED, DEFEATED
        stateTimer: 1.5,
        facingDir: -1,
        hitCooldown: 0,
        attackCooldown: 1.5,
        targetY: 140,
        floatOffset: 0,
        isGlowRed: false
      };
      this.exitPortal = null;
    }

    this.preRenderTilemap();
    this.updateToolbarUI();
  }

  resetLevel() {
    this.loadLevel(this.currentLevelIdx);
  }

  // Update loop
  update(dt) {
    if (this.gameState !== 'PLAYING') return;

    // Tick camera shake
    if (this.camera.shakeTimer > 0) {
      this.camera.shakeTimer -= dt;
    }

    // Tick particle system
    particles.update(dt);

    if (this.player.isAlive) {
      this.updatePlayerPhysics(dt);
      this.checkPlayerCollisions(dt);
      this.updateLasers(dt);
      
      // Charge beaver throw power if charging
      if (this.player.heldBeaver && this.player.isChargingThrow) {
        this.player.throwPower = Math.min(800, (this.player.throwPower || 150) + dt * 650);
      }
    } else {
      // dead: wait a bit and trigger retry screen
      if (Date.now() - this.deathTime > 1000 && this.gameState === 'PLAYING') {
        this.setGameState('GAME_OVER');
      }
    }
    
    // Update boss logic and boss projectiles
    if (this.boss) {
      this.updateBoss(dt);
    }
    if (this.bossProjectiles && this.bossProjectiles.length > 0) {
      this.updateBossProjectiles(dt);
    }
    
    this.updateEntities(dt);
    this.updateCamera(dt);
    this.updateHUD();
  }

  // Apply inputs and calculate movement vectors
  updatePlayerPhysics(dt) {
    // NoClip developer mode flight logic
    if (this.player.noclip) {
      const left = this.keys['ArrowLeft'] || this.keys['KeyA'];
      const right = this.keys['ArrowRight'] || this.keys['KeyD'];
      const up = this.keys['ArrowUp'] || this.keys['KeyW'] || this.keys['Space'];
      const down = this.keys['ArrowDown'] || this.keys['KeyS'];
      
      this.player.vy = 0;
      this.player.vx = 0;
      
      const flySpeed = 450;
      if (left) this.player.vx = -flySpeed;
      if (right) this.player.vx = flySpeed;
      if (up) this.player.vy = -flySpeed;
      if (down) this.player.vy = flySpeed;
      
      this.player.x += this.player.vx * dt;
      this.player.y += this.player.vy * dt;
      
      // Scale bounce/stretch timers back to normal
      this.player.squishX += (1 - this.player.squishX) * dt * 10;
      this.player.squishY += (1 - this.player.squishY) * dt * 10;
      return;
    }

    // Cooldown timers
    if (this.player.dashCooldown > 0) this.player.dashCooldown -= dt;
    if (this.player.invulnTimer > 0) this.player.invulnTimer -= dt;
    if (this.player.shootCooldown > 0) this.player.shootCooldown -= dt;
    
    // Coyote Time (grace period for jumping off edges)
    if (this.player.isGrounded) {
      this.player.coyoteTimer = 0.12; // 120ms coyote window
    } else {
      this.player.coyoteTimer -= dt;
    }
    
    // Jump Buffer timer
    if (this.player.jumpBuffer > 0) {
      this.player.jumpBuffer -= dt;
    }

    // 1. Dash logic
    if (this.player.isDashing) {
      this.player.dashTimer -= dt;
      this.player.vx = this.player.dashDirX * 650;
      this.player.vy = this.player.dashDirY * 650;
      
      // Emit cyan/pink dash trail particles
      const theme = this.getCurrentTheme();
      particles.createDashTrail(
        this.player.x + this.player.width / 2, 
        this.player.y + this.player.height / 2, 
        theme.primary
      );
      
      if (this.player.dashTimer <= 0) {
        this.player.isDashing = false;
        this.player.vx *= 0.5; // lose some velocity
        this.player.vy *= 0.5; // lose Y velocity too
      }
      
      return;
    }

    // 2. Dash Trigger
    const wantDash = this.keys['ShiftLeft'] || this.keys['KeyK'];
    if (wantDash && this.player.canDash && this.player.dashCooldown <= 0) {
      this.player.isDashing = true;
      this.player.canDash = false;
      this.player.dashTimer = 0.16; // 160ms dash
      this.player.dashCooldown = 0.7; // 700ms cooldown
      
      // Diagonal Dashing Direction Input Resolver
      let dx = 0;
      let dy = 0;
      if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx = -1;
      else if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

      if (this.keys['ArrowUp'] || this.keys['KeyW']) dy = -1;
      else if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;

      if (dx === 0 && dy === 0) {
        dx = this.player.facingDir;
      }

      // Normalize directional vector
      const length = Math.sqrt(dx * dx + dy * dy);
      this.player.dashDirX = dx / length;
      this.player.dashDirY = dy / length;
      
      // Sync legacy dashDir for camera tilt context
      this.player.dashDir = dx !== 0 ? (dx > 0 ? 1 : -1) : this.player.facingDir;

      // Update facingDir if there is horizontal movement
      if (dx !== 0) {
        this.player.facingDir = dx > 0 ? 1 : -1;
      }

      this.camera.shakeTimer = 0.12;
      this.camera.shakeIntensity = 3.5;
      audio.playDash();
      return;
    }

    // 3. Horizontal Movement Input
    const left = this.keys['ArrowLeft'] || this.keys['KeyA'];
    const right = this.keys['ArrowRight'] || this.keys['KeyD'];
    
    // Check if player is standing on Ice (custom physics friction)
    const onIce = this.checkIfStandingOnIce();
    const acceleration = onIce ? 250 : (this.player.isGrounded ? 1500 : 900);
    const deceleration = onIce ? 100 : (this.player.isGrounded ? 2200 : 700);
    const targetMaxSpeed = onIce ? this.iceRunSpeed : this.runSpeed;
    
    if (left) {
      this.player.vx = Math.max(-targetMaxSpeed, this.player.vx - acceleration * dt);
      this.player.facingDir = -1;
      // Footstep particles
      if (this.player.isGrounded) {
        particles.createRunningDust(this.player.x + this.player.width, this.player.y + this.player.height - 2, -1);
      }
    } else if (right) {
      this.player.vx = Math.min(targetMaxSpeed, this.player.vx + acceleration * dt);
      this.player.facingDir = 1;
      // Footstep particles
      if (this.player.isGrounded) {
        particles.createRunningDust(this.player.x, this.player.y + this.player.height - 2, 1);
      }
    } else {
      // Slide/Decelerate
      if (this.player.vx > 0) {
        this.player.vx = Math.max(0, this.player.vx - deceleration * dt);
      } else if (this.player.vx < 0) {
        this.player.vx = Math.min(0, this.player.vx + deceleration * dt);
      }
    }

    // 4. Gravity
    if (!this.player.isGrounded) {
      this.player.vy = Math.min(this.terminalVelocity, this.player.vy + this.gravity * dt);
    }

    // 5. Jump Buffer / Coyote Jump Trigger
    // (Buffer is set on keydown event in setupInputs to prevent auto-double-jump)

    if (this.player.jumpBuffer > 0) {
      if (this.player.coyoteTimer > 0) {
        // Normal Jump
        this.player.vy = -this.jumpForce;
        this.player.isGrounded = false;
        this.player.coyoteTimer = 0;
        this.player.jumpBuffer = 0;
        audio.playJump();
        // Squish player mesh
        this.player.squishX = 0.75;
        this.player.squishY = 1.35;
        particles.createJumpBurst(this.player.x + this.player.width / 2, this.player.y + this.player.height);
        this.player.canVariableJumpCut = true;
      } else if (this.player.canDoubleJump) {
        // Double Jump
        this.player.vy = -this.jumpForce * 0.95;
        this.player.canDoubleJump = false;
        this.player.jumpBuffer = 0;
        audio.playJump();
        this.player.squishX = 0.75;
        this.player.squishY = 1.35;
        particles.createJumpBurst(this.player.x + this.player.width / 2, this.player.y + this.player.height);
        this.player.canVariableJumpCut = true;
      }
    }

    // Variable Jump Height (cutting jump velocity short if key released early)
    if (this.player.canVariableJumpCut) {
      const jumpPressed = this.keys['Space'] || this.keys['KeyW'] || this.keys['ArrowUp'];
      if (!jumpPressed && this.player.vy < -150) {
        this.player.vy = -150; // clamp upward velocity
        this.player.canVariableJumpCut = false;
      }
    }

    // Turn player towards mouse if gun is active
    if (this.selectedWeapon === 1 && this.gameState === 'PLAYING') {
      const playerScreenX = (this.player.x + this.player.width / 2) - Math.floor(this.camera.x);
      const dx = this.mouse.x - playerScreenX;
      if (dx < -10) {
        this.player.facingDir = -1;
      } else if (dx > 10) {
        this.player.facingDir = 1;
      }
    }

    // Cyber Blaster Shooting (Keyboard / Touch fallback)
    if (this.player.hasGun && this.selectedWeapon === 1 && this.player.shootCooldown <= 0) {
      const shootPressed = this.keys['KeyF'] || this.keys['KeyJ'] || this.keys['KeyX'];
      if (shootPressed) {
        this.shootLaserHorizontal();
      }
    }

    // 6. Scale bounce/stretch timers back to normal
    this.player.squishX += (1 - this.player.squishX) * dt * 10;
    this.player.squishY += (1 - this.player.squishY) * dt * 10;

  }

  // Custom function to check if player is standing on ice blocks
  checkIfStandingOnIce() {
    const bottomY = this.player.y + this.player.height + 2;
    const leftX = this.player.x;
    const rightX = this.player.x + this.player.width;
    
    const tileRow = Math.floor(bottomY / this.tileSize);
    const tileColL = Math.floor(leftX / this.tileSize);
    const tileColR = Math.floor(rightX / this.tileSize);
    
    if (tileRow >= 0 && tileRow < this.tiles.length) {
      const charL = this.tiles[tileRow][tileColL];
      const charR = this.tiles[tileRow][tileColR];
      return charL === 'I' || charR === 'I';
    }
    return false;
  }

  // Helper to check solid tile collision for any bounding box
  checkSolid(x, y, w, h) {
    const startCol = Math.floor(x / this.tileSize);
    const endCol = Math.floor((x + w - 0.1) / this.tileSize);
    const startRow = Math.floor(y / this.tileSize);
    const endRow = Math.floor((y + h - 0.1) / this.tileSize);
    
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r >= 0 && r < this.tiles.length && c >= 0 && c < this.tiles[0].length) {
          const tile = this.tiles[r][c];
          if (tile === '#' || tile === 'I' || tile === 'D') {
            return { col: c, row: r, tile };
          }
        }
      }
    }
    return null;
  }

  checkPlayerCollisions(dt) {
    if (this.player.noclip) {
      this.resolveNoclipCollectibles(dt);
      return;
    }

    const wasGrounded = this.player.isGrounded;
    const pw = this.player.width;
    const ph = this.player.height;

    // Helper: check solid tile collision
    const checkSolidCollision = (px, py) => {
      const startCol = Math.floor(px / this.tileSize);
      const endCol = Math.floor((px + pw - 0.1) / this.tileSize);
      const startRow = Math.floor(py / this.tileSize);
      const endRow = Math.floor((py + ph - 0.1) / this.tileSize);
      
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r >= 0 && r < this.tiles.length && c >= 0 && c < this.tiles[0].length) {
            const tile = this.tiles[r][c];
            if (tile === '#' || tile === 'I' || tile === 'D') {
              return { col: c, row: r, tile };
            }
          }
        }
      }
      return null;
    };

    // Helper: check spike hazards
    const checkSpikes = () => {
      const startCol = Math.floor(this.player.x / this.tileSize);
      const endCol = Math.floor((this.player.x + pw - 0.1) / this.tileSize);
      const startRow = Math.floor(this.player.y / this.tileSize);
      const endRow = Math.floor((this.player.y + ph - 0.1) / this.tileSize);
      
      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          if (r >= 0 && r < this.tiles.length && c >= 0 && c < this.tiles[0].length) {
            const tile = this.tiles[r][c];
            if (tile === '^' || tile === 'v' || tile === '<' || tile === '>') {
              return true;
            }
          }
        }
      }
      return false;
    };

    // 1. Move and resolve X Axis
    this.player.x += this.player.vx * dt;
    
    // Boundary check
    if (this.player.x < 0) {
      this.player.x = 0;
      this.player.vx = 0;
    }
    const mapMaxX = this.tiles[0].length * this.tileSize;
    if (this.player.x + pw > mapMaxX) {
      this.player.x = mapMaxX - pw;
      this.player.vx = 0;
    }

    let colResult = checkSolidCollision(this.player.x, this.player.y);
    if (colResult) {
      if (this.player.vx > 0) {
        // Moving right: snap to left edge of solid block
        this.player.x = colResult.col * this.tileSize - pw - 0.1;
      } else if (this.player.vx < 0) {
        // Moving left: snap to right edge of solid block
        this.player.x = (colResult.col + 1) * this.tileSize;
      }
      this.player.vx = 0;
    }

    // 2. Move and resolve Y Axis
    this.player.y += this.player.vy * dt;
    this.player.isGrounded = false;

    // Resolve Bounce Pads (B) before solid tile collisions to prevent snapping to ground underneath
    let bounced = false;
    this.bouncePads.forEach((pad) => {
      const padLeft = pad.x;
      const padRight = pad.x + pad.width;
      const padTop = pad.y + 16; // Align with the visual spring plate top
      const padBottom = pad.y + pad.height;
      
      const pLeft = this.player.x;
      const pRight = this.player.x + pw;
      const pTop = this.player.y;
      const pBottom = this.player.y + ph;
      
      if (pRight > padLeft && pLeft < padRight && pBottom >= padTop && pTop < padBottom) {
        // Trigger bounce if falling or walking onto it
        if (this.player.vy >= -50) {
          this.player.y = padTop - ph;
          this.player.vy = -this.bounceForce;
          this.player.isGrounded = false;
          this.player.canDoubleJump = true;
          this.player.canDash = true;
          this.player.canVariableJumpCut = false; // Bounces bypass variable jump cut
          
          this.player.squishX = 0.65;
          this.player.squishY = 1.45;
          this.camera.shakeTimer = 0.2;
          this.camera.shakeIntensity = 5.0;
          audio.playJump();
          particles.createJumpBurst(this.player.x + pw / 2, padTop);
          bounced = true;
        }
      }
    });

    if (!bounced) {
      let rowResult = checkSolidCollision(this.player.x, this.player.y);
      if (rowResult) {
        if (this.player.vy > 0) {
          // Moving down: snap to top of solid block
          this.player.y = rowResult.row * this.tileSize - ph;
          this.player.vy = 0;
          this.player.isGrounded = true;
          this.player.canDoubleJump = true;
          this.player.canDash = true;
        } else if (this.player.vy < 0) {
          // Moving up: snap to bottom of solid block (ceiling collision)
          this.player.y = (rowResult.row + 1) * this.tileSize;
          this.player.vy = 0;
        }
      }
    }

    // 3. Resolve Semi-solid platforms (_)
    if (this.player.vy >= 0) {
      const leftCol = Math.floor(this.player.x / this.tileSize);
      const rightCol = Math.floor((this.player.x + pw - 0.1) / this.tileSize);
      const bottomRow = Math.floor((this.player.y + ph) / this.tileSize);
      
      if (bottomRow >= 0 && bottomRow < this.tiles.length) {
        for (let c = leftCol; c <= rightCol; c++) {
          if (c >= 0 && c < this.tiles[0].length && this.tiles[bottomRow][c] === '_') {
            const topOfTile = bottomRow * this.tileSize;
            const prevBottom = this.player.y + ph - this.player.vy * dt;
            if (prevBottom <= topOfTile + 8 && this.player.y + ph >= topOfTile) {
              this.player.y = topOfTile - ph;
              this.player.vy = 0;
              this.player.isGrounded = true;
              this.player.canDoubleJump = true;
              this.player.canDash = true;
              break;
            }
          }
        }
      }
    }

    // 4. Resolve Bounce Pads (B) - Handled before solid Y resolution to prevent platform snapping

    // 5. Resolve Moving Platforms (AABB + Rider logic)
    this.movingPlatforms.forEach((plat) => {
      const platLeft = plat.x;
      const platRight = plat.x + plat.width;
      const platTop = plat.y;
      
      const prevBottom = this.player.y + ph - this.player.vy * dt;
      const currentBottom = this.player.y + ph;
      
      if (this.player.x + pw > platLeft && this.player.x < platRight) {
        // If moving down or flat on platform
        if (this.player.vy >= 0 && prevBottom <= platTop + 8 - (plat.vy || 0) && currentBottom >= platTop) {
          this.player.y = platTop - ph;
          this.player.vy = 0;
          this.player.isGrounded = true;
          this.player.canDoubleJump = true;
          this.player.canDash = true;
          
          // Carry player with platform velocity
          this.player.x += plat.vx || 0;
          this.player.y += plat.vy || 0;
        }
      }
    });

    // 6. Spike Hazards
    if (checkSpikes()) {
      this.killPlayer();
      return;
    }
    
    // Bottom bound (falling out of map)
    const mapMaxY = this.tiles.length * this.tileSize;
    if (this.player.y > mapMaxY) {
      this.killPlayer();
      return;
    }

    // 7. Collectibles (Coins)
    this.coins.forEach((c) => {
      if (!c.collected) {
        const dx = (this.player.x + pw / 2) - c.x;
        const dy = (this.player.y + ph / 2) - c.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 26) {
          c.collected = true;
          this.levelCoinsCollected++;
          this.totalCoinsCollected++;
          audio.playCoin();
          particles.createCoinSparkles(c.x, c.y);
        }
      }
    });

    // Gun Pickup Collision
    if (this.gunPickup && !this.gunPickup.collected) {
      const dx = (this.player.x + pw / 2) - this.gunPickup.x;
      const dy = (this.player.y + ph / 2) - this.gunPickup.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 28) {
        this.gunPickup.collected = true;
        this.player.hasGun = true;
        audio.playGunPickup();
        particles.createCoinSparkles(this.gunPickup.x, this.gunPickup.y);
        
        // Show touch shoot button if touch screen controls are active
        const touchShootBtn = document.getElementById('touch-shoot');
        if (touchShootBtn) {
          touchShootBtn.classList.remove('hidden');
        }
      }
    }

    // 8. Exit Portal
    if (this.exitPortal) {
      const portalDx = (this.player.x + pw / 2) - this.exitPortal.x;
      const portalDy = (this.player.y + ph / 2) - this.exitPortal.y;
      const portalDist = Math.sqrt(portalDx * portalDx + portalDy * portalDy);
      
      if (portalDist < 30) {
        this.triggerLevelWin();
      }
    }

    // 9. Boss Collision Checks
    if (this.boss && this.boss.state !== 'DEFEATED' && this.boss.state !== 'INTRO' && this.player.isAlive) {
      const pLeft = this.player.x;
      const pRight = this.player.x + pw;
      const pTop = this.player.y;
      const pBottom = this.player.y + ph;
      
      const bLeft = this.boss.x;
      const bRight = this.boss.x + this.boss.width;
      const bTop = this.boss.y;
      const bBottom = this.boss.y + this.boss.height;
      
      if (pRight > bLeft && pLeft < bRight && pBottom > bTop && pTop < bBottom) {
        // Player lands on Boss's Head
        const prevBottom = this.player.y + ph - this.player.vy * dt;
        if (this.player.vy > 0 && prevBottom <= bTop + 16 && this.boss.hitCooldown <= 0) {
          this.boss.health--;
          this.boss.hitCooldown = 0.8;
          this.player.vy = -this.jumpForce * 1.15;
          this.player.isGrounded = false;
          
          this.player.squishX = 0.8;
          this.player.squishY = 1.35;
          
          audio.playBossHit();
          particles.createBossGlitchParticles(this.boss.x + this.boss.width/2, this.boss.y);
          this.camera.shakeTimer = 0.3;
          this.camera.shakeIntensity = 8;
          
          if (this.boss.health <= 0) {
            this.boss.state = 'DEFEATED';
            this.boss.stateTimer = 1.8;
            this.boss.vy = -200; // float up slightly then fall
            audio.playWin();
            // Spawn Exit portal
            this.exitPortal = {
              x: 12.5 * this.tileSize,
              y: 7.5 * this.tileSize,
              radius: 25
            };
          }
        } else if (this.boss.hitCooldown <= 0) {
          // Standard contact hurts player
          this.killPlayer();
        }
      }
    }

    if (!wasGrounded && this.player.isGrounded && this.player.isAlive) {
      particles.createJumpBurst(this.player.x + pw / 2, this.player.y + ph);
    }
  }

  // Trigger player digitization explosion
  killPlayer() {
    if (this.player.godMode) return;
    if (!this.player.isAlive) return;
    this.player.isAlive = false;
    this.deaths++;
    this.deathTime = Date.now();
    
    // Camera shake
    this.camera.shakeTimer = 0.4;
    this.camera.shakeIntensity = 12;
    
    // Synth explosion
    audio.playDeath();
    
    // Spawn red/pink hazard particles
    particles.createExplosion(this.player.x + this.player.width / 2, this.player.y + this.player.height / 2, '#ff0064');
  }

  // Exit portal hit
  triggerLevelWin() {
    this.gunAcquiredBeforeLevel = this.player.hasGun;
    // If last level is complete, show credits/victory. Otherwise, go to Complete sector screen.
    audio.playWin();
    
    // Clear particles
    particles.clear();
    
    if (this.currentLevelIdx >= LEVELS.length - 1) {
      this.setGameState('VICTORY');
    } else {
      this.setGameState('LEVEL_COMPLETE');
    }
  }

  // Update Moving platforms and Patrol Enemies positions
  updateEntities(dt) {
    // 1. Moving Platforms
    this.movingPlatforms.forEach((plat) => {
      plat.timer += dt * (plat.speed / 100);
      
      const prevX = plat.x;
      const prevY = plat.y;
      
      // Sinusoidal movement path
      if (plat.rangeX > 0) {
        plat.x = plat.startX + Math.sin(plat.timer) * (plat.rangeX / 2);
      }
      if (plat.rangeY > 0) {
        plat.y = plat.startY + Math.sin(plat.timer) * (plat.rangeY / 2);
      }
      
      // Store actual velocity to push rider player
      plat.vx = plat.x - prevX;
      plat.vy = plat.y - prevY;
    });

    // 2. Patrol Enemies (with Chase AI & Line of Sight)
    this.enemies.forEach((enemy) => {
      const dx = (this.player.x + this.player.width/2) - (enemy.x + enemy.width/2);
      const dy = (this.player.y + this.player.height/2) - (enemy.y + enemy.height/2);
      const distToPlayer = Math.sqrt(dx*dx + dy*dy);
      
      const detectionRange = (enemy.isChasing || enemy.isSearching) ? 300 : 220;
      let hasLineOfSight = false;
      
      if (distToPlayer <= detectionRange && this.player.isAlive) {
        hasLineOfSight = true;
        // Precise pixel-stepping raycast check (every 8px) along line of sight to player
        const steps = Math.ceil(distToPlayer / 8);
        for (let i = 1; i < steps; i++) {
          const cx = enemy.x + enemy.width / 2 + dx * (i / steps);
          const cy = enemy.y + enemy.height / 2 + dy * (i / steps);
          const col = Math.floor(cx / this.tileSize);
          const row = Math.floor(cy / this.tileSize);
          if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[0].length) {
            const tile = this.tiles[row][col];
            if (tile === '#' || tile === 'I' || tile === 'D') {
              hasLineOfSight = false;
              break;
            }
          }
        }
      }
      
      if (enemy.vx === undefined) enemy.vx = 0;
      if (enemy.vy === undefined) enemy.vy = 0;
      if (enemy.hoverTimer === undefined) enemy.hoverTimer = Math.random() * Math.PI * 2;

      if (hasLineOfSight) {
        enemy.isChasing = true;
        enemy.isSearching = false;
        enemy.searchTimer = 0;
        enemy.lastKnownX = this.player.x + this.player.width/2 - enemy.width/2;
        enemy.lastKnownY = this.player.y + this.player.height/2 - enemy.height/2;
        
        // Recalculate A* path periodically
        if (enemy.pathTimer === undefined) enemy.pathTimer = 0;
        enemy.pathTimer -= dt;
        
        const startRow = Math.floor((enemy.y + enemy.height / 2) / this.tileSize);
        const startCol = Math.floor((enemy.x + enemy.width / 2) / this.tileSize);
        const targetRow = Math.floor((this.player.y + this.player.height / 2) / this.tileSize);
        const targetCol = Math.floor((this.player.x + this.player.width / 2) / this.tileSize);
        
        if (enemy.pathTimer <= 0) {
          enemy.pathTimer = 0.15; // recalculate path every 0.15 seconds
          enemy.path = this.findPath(startRow, startCol, targetRow, targetCol);
          enemy.pathIndex = 1; // start from next tile node
        }
        
        // Follow path if we have it
        let movedWithPath = false;
        if (enemy.path && enemy.pathIndex < enemy.path.length) {
          const nextNode = enemy.path[enemy.pathIndex];
          const nodeX = nextNode[1] * this.tileSize + this.tileSize / 2;
          const nodeY = nextNode[0] * this.tileSize + this.tileSize / 2;
          
          const ndx = nodeX - (enemy.x + enemy.width / 2);
          const ndy = nodeY - (enemy.y + enemy.height / 2);
          const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
          
          if (ndist < 16) {
            enemy.pathIndex++;
          }
          
          if (enemy.pathIndex < enemy.path.length) {
            const nextNodeLive = enemy.path[enemy.pathIndex];
            const liveNodeX = nextNodeLive[1] * this.tileSize + this.tileSize / 2;
            const liveNodeY = nextNodeLive[0] * this.tileSize + this.tileSize / 2;
            
            const ldx = liveNodeX - (enemy.x + enemy.width / 2);
            const ldy = liveNodeY - (enemy.y + enemy.height / 2);
            const ldist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
            
            const targetVx = (ldx / ldist) * enemy.speed * 1.5;
            const targetVy = (ldy / ldist) * enemy.speed * 1.2;
            
            enemy.vx += (targetVx - enemy.vx) * dt * 4.0;
            enemy.vy += (targetVy - enemy.vy) * dt * 4.0;
            enemy.dir = Math.sign(ldx) || 1;
            movedWithPath = true;
          }
        }
        
        // Fallback if pathfinding fails or path is finished
        if (!movedWithPath) {
          const targetVx = (dx / distToPlayer) * enemy.speed * 1.5;
          const targetVy = (dy / distToPlayer) * enemy.speed * 0.9;
          
          enemy.vx += (targetVx - enemy.vx) * dt * 3.5;
          enemy.vy += (targetVy - enemy.vy) * dt * 3.5;
          enemy.dir = Math.sign(dx) || 1;
        }
        
        // Dash trail particles
        if (Math.random() > 0.82) {
          particles.createDashTrail(enemy.x + enemy.width/2, enemy.y + enemy.height/2, 'rgba(255, 0, 100, 0.4)');
        }
      } else {
        // If it was chasing or is already searching, it stays in search/alert state
        if (enemy.isChasing || enemy.isSearching) {
          if (!enemy.isSearching) {
            enemy.isChasing = false;
            enemy.isSearching = true;
            enemy.searchPhase = 'MOVE';
            enemy.searchStateTimer = 3.5; // max 3.5 seconds to reach last known pos
            
            // Generate path to last known position tile once when starting to search
            const startRow = Math.floor((enemy.y + enemy.height / 2) / this.tileSize);
            const startCol = Math.floor((enemy.x + enemy.width / 2) / this.tileSize);
            const targetRow = Math.floor(enemy.lastKnownY / this.tileSize);
            const targetCol = Math.floor(enemy.lastKnownX / this.tileSize);
            enemy.path = this.findPath(startRow, startCol, targetRow, targetCol);
            enemy.pathIndex = 1;
          }
          
          if (enemy.searchPhase === 'MOVE') {
            enemy.searchStateTimer -= dt;
            const lkDx = enemy.lastKnownX - enemy.x;
            const lkDy = enemy.lastKnownY - enemy.y;
            const lkDist = Math.sqrt(lkDx * lkDx + lkDy * lkDy);
            
            let movedWithPath = false;
            if (enemy.path && enemy.pathIndex < enemy.path.length && enemy.searchStateTimer > 0) {
              const nextNode = enemy.path[enemy.pathIndex];
              const nodeX = nextNode[1] * this.tileSize + this.tileSize / 2;
              const nodeY = nextNode[0] * this.tileSize + this.tileSize / 2;
              
              const ndx = nodeX - (enemy.x + enemy.width / 2);
              const ndy = nodeY - (enemy.y + enemy.height / 2);
              const ndist = Math.sqrt(ndx * ndx + ndy * ndy);
              
              if (ndist < 16) {
                enemy.pathIndex++;
              }
              
              if (enemy.pathIndex < enemy.path.length) {
                const nextNodeLive = enemy.path[enemy.pathIndex];
                const liveNodeX = nextNodeLive[1] * this.tileSize + this.tileSize / 2;
                const liveNodeY = nextNodeLive[0] * this.tileSize + this.tileSize / 2;
                
                const ldx = liveNodeX - (enemy.x + enemy.width / 2);
                const ldy = liveNodeY - (enemy.y + enemy.height / 2);
                const ldist = Math.sqrt(ldx * ldx + ldy * ldy) || 1;
                
                const targetVx = (ldx / ldist) * enemy.speed * 1.25;
                const targetVy = (ldy / ldist) * enemy.speed * 1.25;
                enemy.vx += (targetVx - enemy.vx) * dt * 4;
                enemy.vy += (targetVy - enemy.vy) * dt * 4;
                enemy.dir = Math.sign(ldx) || 1;
                movedWithPath = true;
              }
            }
            
            if (!movedWithPath) {
              if (lkDist > 20 && enemy.searchStateTimer > 0) {
                const targetVx = (lkDx / lkDist) * enemy.speed * 1.25;
                const targetVy = (lkDy / lkDist) * enemy.speed * 1.25;
                enemy.vx += (targetVx - enemy.vx) * dt * 4;
                enemy.vy += (targetVy - enemy.vy) * dt * 4;
                enemy.dir = Math.sign(lkDx) || 1;
              } else {
                // Arrived or timed out: look around/scan
                enemy.searchPhase = 'SCAN';
                enemy.searchTimer = 1.5; // scan for 1.5s
              }
            } else if (lkDist <= 20) {
              // Reached last known player position
              enemy.searchPhase = 'SCAN';
              enemy.searchTimer = 1.5;
            }
          } else if (enemy.searchPhase === 'SCAN') {
            enemy.vx += (0 - enemy.vx) * dt * 8;
            enemy.vy += (0 - enemy.vy) * dt * 8;
            enemy.searchTimer -= dt;
            if (enemy.searchTimer <= 0) {
              enemy.searchPhase = 'WANDER';
              enemy.searchTimer = 4.0; // wander search for 4 seconds
            }
          } else if (enemy.searchPhase === 'WANDER') {
            enemy.searchTimer -= dt;
            
            if (enemy.dirX === undefined || (enemy.dirX === 0 && enemy.dirY === 0)) {
              enemy.dirX = Math.random() > 0.5 ? 1 : -1;
              enemy.dirY = 0;
            }
            
            const targetVx = enemy.dirX * enemy.speed * 1.2;
            const targetVy = enemy.dirY * enemy.speed * 1.2 + Math.sin(enemy.hoverTimer) * 4;
            
            enemy.vx += (targetVx - enemy.vx) * dt * 4;
            enemy.vy += (targetVy - enemy.vy) * dt * 4;
            
            if (enemy.dirX !== 0) enemy.dir = enemy.dirX;
            
            const tx = Math.floor((enemy.x + enemy.width / 2) / this.tileSize);
            const ty = Math.floor((enemy.y + enemy.height / 2) / this.tileSize);
            
            if (enemy.lastTileX === undefined) {
              enemy.lastTileX = tx;
              enemy.lastTileY = ty;
            }
            
            if (tx !== enemy.lastTileX || ty !== enemy.lastTileY) {
              enemy.lastTileX = tx;
              enemy.lastTileY = ty;
              
              const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
              const validDirs = dirs.filter(d => {
                const ntx = tx + d.x;
                const nty = ty + d.y;
                if (nty >= 0 && nty < this.tiles.length && ntx >= 0 && ntx < this.tiles[0].length) {
                  const tile = this.tiles[nty][ntx];
                  return tile !== '#' && tile !== 'I';
                }
                return false;
              });
              
              let forwardDirs = validDirs.filter(d => !(d.x === -enemy.dirX && d.y === -enemy.dirY));
              if (forwardDirs.length === 0) forwardDirs = validDirs;
              
              if (forwardDirs.length > 0 && Math.random() < 0.45) {
                const nextD = forwardDirs[Math.floor(Math.random() * forwardDirs.length)];
                enemy.dirX = nextD.x;
                enemy.dirY = nextD.y;
              }
            }
            
            if (enemy.searchTimer <= 0) {
              // Give up, return to normal
              enemy.isSearching = false;
              enemy.searchPhase = undefined;
              enemy.lastKnownX = null;
              enemy.lastKnownY = null;
            }
          }
        } else {
          // Normal preset horizontal patrol or grid wandering
          enemy.hoverTimer += dt * 4;
          
          if (enemy.rangeX === undefined || enemy.rangeX <= 0) {
            if (enemy.scanTimer > 0) {
              enemy.scanTimer -= dt;
              enemy.vx += (0 - enemy.vx) * dt * 8;
              enemy.vy += (0 - enemy.vy) * dt * 8;
            } else {
              if (enemy.dirX === undefined) enemy.dirX = Math.random() > 0.5 ? 1 : -1;
              if (enemy.dirY === undefined) enemy.dirY = 0;
              
              const targetVx = enemy.dirX * enemy.speed;
              const targetVy = enemy.dirY * enemy.speed + Math.sin(enemy.hoverTimer) * 4;
              
              enemy.vx += (targetVx - enemy.vx) * dt * 4;
              enemy.vy += (targetVy - enemy.vy) * dt * 4;
              
              if (enemy.dirX !== 0) enemy.dir = enemy.dirX;
              
              const tx = Math.floor((enemy.x + enemy.width / 2) / this.tileSize);
              const ty = Math.floor((enemy.y + enemy.height / 2) / this.tileSize);
              
              if (enemy.lastTileX === undefined) {
                enemy.lastTileX = tx;
                enemy.lastTileY = ty;
              }
              
              if (tx !== enemy.lastTileX || ty !== enemy.lastTileY) {
                enemy.lastTileX = tx;
                enemy.lastTileY = ty;
                
                const dirs = [{x:1,y:0}, {x:-1,y:0}, {x:0,y:1}, {x:0,y:-1}];
                const validDirs = dirs.filter(d => {
                  const ntx = tx + d.x;
                  const nty = ty + d.y;
                  if (nty >= 0 && nty < this.tiles.length && ntx >= 0 && ntx < this.tiles[0].length) {
                    const tile = this.tiles[nty][ntx];
                    return tile !== '#' && tile !== 'I';
                  }
                  return false;
                });
                
                let forwardDirs = validDirs.filter(d => !(d.x === -enemy.dirX && d.y === -enemy.dirY));
                if (forwardDirs.length === 0) forwardDirs = validDirs;
                
                if (forwardDirs.length > 1 && Math.random() < 0.25) {
                  enemy.scanTimer = 0.7;
                  const nextD = forwardDirs[Math.floor(Math.random() * forwardDirs.length)];
                  enemy.dirX = nextD.x;
                  enemy.dirY = nextD.y;
                } else if (forwardDirs.length > 0 && (enemy.dirX === 0 && enemy.dirY === 0)) {
                  const nextD = forwardDirs[Math.floor(Math.random() * forwardDirs.length)];
                  enemy.dirX = nextD.x;
                  enemy.dirY = nextD.y;
                }
              }
            }
          } else {
            const targetVx = enemy.dir * enemy.speed;
            const targetVy = (enemy.startY + Math.sin(enemy.hoverTimer) * 6 - enemy.y) * 4;
            
            enemy.vx += (targetVx - enemy.vx) * dt * 4;
            enemy.vy += (targetVy - enemy.vy) * dt * 4;
            
            const dist = Math.abs(enemy.x - enemy.startX);
            if (dist >= enemy.rangeX / 2) {
              enemy.dir = enemy.x < enemy.startX ? 1 : -1;
            }
          }
        }
      }
      
      // Obstacle avoidance force: push away from nearby walls
      if (enemy.isChasing || enemy.isSearching) {
        let avoidVx = 0;
        let avoidVy = 0;
        const droneCenterX = enemy.x + enemy.width / 2;
        const droneCenterY = enemy.y + enemy.height / 2;
        const currentTileRow = Math.floor(droneCenterY / this.tileSize);
        const currentTileCol = Math.floor(droneCenterX / this.tileSize);
        
        for (let rOffset = -1; rOffset <= 1; rOffset++) {
          for (let cOffset = -1; cOffset <= 1; cOffset++) {
            if (rOffset === 0 && cOffset === 0) continue;
            const r = currentTileRow + rOffset;
            const c = currentTileCol + cOffset;
            if (r >= 0 && r < this.tiles.length && c >= 0 && c < this.tiles[0].length) {
              const tile = this.tiles[r][c];
              if (tile === '#' || tile === 'I' || tile === 'D') {
                const wallCenterX = c * this.tileSize + this.tileSize / 2;
                const wallCenterY = r * this.tileSize + this.tileSize / 2;
                const adx = droneCenterX - wallCenterX;
                const ady = droneCenterY - wallCenterY;
                const adist = Math.sqrt(adx * adx + ady * ady) || 1;
                
                const safetyDistance = this.tileSize * 1.05; // 42px
                if (adist < safetyDistance) {
                  const pushIntensity = (1 - adist / safetyDistance) * enemy.speed * 2.0;
                  avoidVx += (adx / adist) * pushIntensity;
                  avoidVy += (ady / adist) * pushIntensity;
                }
              }
            }
          }
        }
        
        enemy.vx += avoidVx * dt * 4.5;
        enemy.vy += avoidVy * dt * 4.5;
        
        // Clamp velocities to prevent extreme speed jumps
        const maxSpeed = enemy.speed * 1.8;
        const currentSpeed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
        if (currentSpeed > maxSpeed) {
          enemy.vx = (enemy.vx / currentSpeed) * maxSpeed;
          enemy.vy = (enemy.vy / currentSpeed) * maxSpeed;
        }
      }
      
      // Apply velocities and perform solid collision checks to prevent clipping
      enemy.x += enemy.vx * dt;
      let colResult = this.checkSolid(enemy.x, enemy.y, enemy.width, enemy.height);
      if (colResult) {
        if (enemy.vx > 0) {
          enemy.x = colResult.col * this.tileSize - enemy.width - 0.1;
        } else if (enemy.vx < 0) {
          enemy.x = (colResult.col + 1) * this.tileSize;
        }
        
        if (!enemy.isChasing && !enemy.isSearching) {
          if (enemy.rangeX === undefined || enemy.rangeX <= 0) {
            // Grid drone: trigger scan and pick new direction
            enemy.vx = 0;
            enemy.dirX = 0; // stop moving horizontally
            enemy.scanTimer = 0.6;
            enemy.lastTileX = -1; // force direction evaluation on next active movement tick
          } else {
            enemy.vx = -enemy.vx * 0.5; // bounce back
            enemy.dir = -enemy.dir; // reverse patrol
          }
        } else {
          // Slide response: zero out colliding velocity component
          enemy.vx = 0;
        }
      }
      
      enemy.y += enemy.vy * dt;
      let rowResult = this.checkSolid(enemy.x, enemy.y, enemy.width, enemy.height);
      if (rowResult) {
        if (enemy.vy > 0) {
          enemy.y = rowResult.row * this.tileSize - enemy.height - 0.1;
        } else if (enemy.vy < 0) {
          enemy.y = (rowResult.row + 1) * this.tileSize;
        }
        
        if (!enemy.isChasing && !enemy.isSearching) {
          if (enemy.rangeX === undefined || enemy.rangeX <= 0) {
            // Grid drone: trigger scan and pick new direction
            enemy.vy = 0;
            enemy.dirY = 0; // stop moving vertically
            enemy.scanTimer = 0.6;
            enemy.lastTileY = -1; // force direction evaluation
          } else {
            enemy.vy = -enemy.vy * 0.5; // bounce back
          }
        } else {
          // Slide response: zero out colliding velocity component
          enemy.vy = 0;
        }
      }
      
      // Collision with player
      if (this.player.isAlive) {
        const pLeft = this.player.x;
        const pRight = this.player.x + this.player.width;
        const pTop = this.player.y;
        const pBottom = this.player.y + this.player.height;
        
        const eLeft = enemy.x;
        const eRight = enemy.x + enemy.width;
        const eTop = enemy.y;
        const eBottom = enemy.y + enemy.height;
        
        if (pRight > eLeft && pLeft < eRight && pBottom > eTop && pTop < eBottom) {
          // If falling on top, bounce off them and destroy bot, otherwise die
          if (pBottom <= eTop + 14 && this.player.vy > 0) {
            this.player.vy = -this.jumpForce * 0.85;
            audio.playHit();
            particles.createExplosion(enemy.x + enemy.width/2, enemy.y, '#ffd700');
            
            // Remove enemy from world array
            const idx = this.enemies.indexOf(enemy);
            if (idx > -1) this.enemies.splice(idx, 1);
          } else {
            this.killPlayer();
          }
        }
      }
    });

    // 3. Portal particles
    if (this.exitPortal) {
      particles.createPortalGlow(this.exitPortal.x, this.exitPortal.y);
    }

    // Update Beavers and Kangaroos
    this.updateBeavers(dt);
    this.updateKangaroos(dt);
  }

  updateBeavers(dt) {
    this.beavers.forEach((beaver) => {
      // 0. Thrown state physics
      if (beaver.isThrown) {
        beaver.vy = Math.min(this.terminalVelocity, beaver.vy + this.gravity * dt);
        
        const nextX = beaver.x + beaver.vx * dt;
        const nextY = beaver.y + beaver.vy * dt;
        
        let exploded = false;
        let explodeX = beaver.x + beaver.width / 2;
        let explodeY = beaver.y + beaver.height / 2;
        
        // Check solid tile collision
        let colResult = this.checkSolid(nextX, nextY, beaver.width, beaver.height);
        if (colResult) {
          exploded = true;
          explodeX = colResult.col * this.tileSize + this.tileSize / 2;
          explodeY = colResult.row * this.tileSize + this.tileSize / 2;
        }
        
        // Check map boundaries
        if (!exploded) {
          const mapWidth = this.tiles[0].length * this.tileSize;
          const mapHeight = this.tiles.length * this.tileSize;
          if (nextX < 0 || nextX + beaver.width > mapWidth || nextY < 0 || nextY + beaver.height > mapHeight) {
            exploded = true;
            if (nextX < 0) explodeX = 0;
            else if (nextX + beaver.width > mapWidth) explodeX = mapWidth;
            if (nextY < 0) explodeY = 0;
            else if (nextY + beaver.height > mapHeight) explodeY = mapHeight;
          }
        }
        
        // Check enemy collisions
        if (!exploded) {
          for (let j = this.enemies.length - 1; j >= 0; j--) {
            const enemy = this.enemies[j];
            if (nextX + beaver.width > enemy.x && nextX < enemy.x + enemy.width &&
                nextY + beaver.height > enemy.y && nextY < enemy.y + enemy.height) {
              particles.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ff0000', 16);
              this.enemies.splice(j, 1);
              exploded = true;
              explodeX = enemy.x + enemy.width / 2;
              explodeY = enemy.y + enemy.height / 2;
              break;
            }
          }
        }
        
        // Check walker collisions
        if (!exploded) {
          for (let j = this.walkers.length - 1; j >= 0; j--) {
            const walker = this.walkers[j];
            if (nextX + beaver.width > walker.x && nextX < walker.x + walker.width &&
                nextY + beaver.height > walker.y && nextY < walker.y + walker.height) {
              particles.createExplosion(walker.x + walker.width / 2, walker.y + walker.height / 2, '#ff0000', 16);
              this.walkers.splice(j, 1);
              exploded = true;
              explodeX = walker.x + walker.width / 2;
              explodeY = walker.y + walker.height / 2;
              break;
            }
          }
        }
        
        if (exploded) {
          audio.playHit();
          particles.createExplosion(explodeX, explodeY, '#ff0000', 12);
          
          this.camera.shakeTimer = 0.25;
          this.camera.shakeIntensity = 6.5;
          
          // Trigger destructible block check
          this.checkDestructibleExplosion(explodeX, explodeY, 65);
          
          const idx = this.beavers.indexOf(beaver);
          if (idx > -1) this.beavers.splice(idx, 1);
        } else {
          beaver.x = nextX;
          beaver.y = nextY;
          beaver.spinAngle = (beaver.spinAngle || 0) + dt * 10 * Math.sign(beaver.vx || 1);
        }
        return;
      }

      // 1. Gravity
      if (!beaver.isGrounded) {
        beaver.vy = Math.min(this.terminalVelocity, beaver.vy + this.gravity * dt);
      }
      
      // Chewing State update
      if (beaver.chewTimer > 0) {
        beaver.chewTimer -= dt;
        beaver.vx = 0;
        
        // Spawn wood/chew particles (orange/brown sparks)
        if (Math.random() > 0.4) {
          const contactX = beaver.dir > 0 ? beaver.x + beaver.width : beaver.x;
          const contactY = beaver.y + beaver.height / 2;
          particles.createRunningDust(contactX, contactY, beaver.dir);
        }
        
        if (beaver.chewTimer <= 0) {
          beaver.dir = -beaver.dir;
          beaver.chewCooldown = 1.8; // cooldown before chewing again
        }
      } else {
        if (beaver.chewCooldown > 0) beaver.chewCooldown -= dt;
        beaver.vx = beaver.dir * 60;
      }
      
      // 2. Move X and resolve X collisions
      beaver.x += beaver.vx * dt;
      let colResult = this.checkSolid(beaver.x, beaver.y, beaver.width, beaver.height);
      if (colResult) {
        if (beaver.vx > 0) {
          beaver.x = colResult.col * this.tileSize - beaver.width - 0.1;
        } else if (beaver.vx < 0) {
          beaver.x = (colResult.col + 1) * this.tileSize;
        }
        
        beaver.vx = 0;
        if (beaver.chewCooldown <= 0 && beaver.chewTimer <= 0) {
          beaver.chewTimer = 1.2; // chew for 1.2 seconds
          audio.playHit(); // play chew click/crunch sound
        } else {
          beaver.dir = -beaver.dir;
        }
      }
      
      // 3. Move Y and resolve Y collisions
      beaver.y += beaver.vy * dt;
      beaver.isGrounded = false;
      let rowResult = this.checkSolid(beaver.x, beaver.y, beaver.width, beaver.height);
      if (rowResult) {
        if (beaver.vy > 0) {
          beaver.y = rowResult.row * this.tileSize - beaver.height - 0.1;
          beaver.vy = 0;
          beaver.isGrounded = true;
        } else if (beaver.vy < 0) {
          beaver.y = (rowResult.row + 1) * this.tileSize;
          beaver.vy = 0;
        }
      }
      
      // 4. Edge Detection (Avoid walking off platforms)
      if (beaver.isGrounded && beaver.chewTimer <= 0) {
        const checkX = beaver.dir > 0 ? beaver.x + beaver.width + 4 : beaver.x - 4;
        const checkY = beaver.y + beaver.height + 4;
        
        const col = Math.floor(checkX / this.tileSize);
        const row = Math.floor(checkY / this.tileSize);
        
        let hasSupport = false;
        if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[0].length) {
          const tile = this.tiles[row][col];
          if (tile === '#' || tile === 'I' || tile === 'D') {
            hasSupport = true;
          }
        }
        
        if (!hasSupport) {
          this.bouncePads.forEach(pad => {
            if (checkX >= pad.x && checkX <= pad.x + pad.width &&
                checkY >= pad.y && checkY <= pad.y + pad.height) {
              hasSupport = true;
            }
          });
        }
        
        if (!hasSupport) {
          beaver.dir = -beaver.dir;
          beaver.vx = beaver.dir * 60;
        }
      }
    });
  }

  checkDestructibleExplosion(explodeX, explodeY, radius = 65) {
    if (!this.tiles || this.tiles.length === 0 || !this.tiles[0]) return;
    const startCol = Math.max(0, Math.floor((explodeX - radius) / this.tileSize));
    const endCol = Math.min(this.tiles[0].length - 1, Math.floor((explodeX + radius) / this.tileSize));
    const startRow = Math.max(0, Math.floor((explodeY - radius) / this.tileSize));
    const endRow = Math.min(this.tiles.length - 1, Math.floor((explodeY + radius) / this.tileSize));
    
    let anyDestroyed = false;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (this.tiles[r][c] === 'D') {
          // Check distance between tile center and explosion point
          const tileCenterX = c * this.tileSize + this.tileSize / 2;
          const tileCenterY = r * this.tileSize + this.tileSize / 2;
          const dx = tileCenterX - explodeX;
          const dy = tileCenterY - explodeY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= radius) {
            // Destroy the block!
            this.tiles[r][c] = ' ';
            anyDestroyed = true;
            
            // Spawn debris particles (yellowish/orange/brown crumbling particles)
            for (let i = 0; i < 8; i++) {
              particles.createExplosion(tileCenterX, tileCenterY, '#ffaa00', 8);
            }
          }
        }
      }
    }
    
    if (anyDestroyed) {
      this.preRenderTilemap();
    }
  }

  updateKangaroos(dt) {
    this.kangaroos.forEach((kangaroo) => {
      // 1. Gravity
      if (!kangaroo.isGrounded) {
        kangaroo.vy = Math.min(this.terminalVelocity, kangaroo.vy + this.gravity * dt);
      }
      
      // 2. Hopping State
      if (kangaroo.isGrounded) {
        kangaroo.vx = 0;
        kangaroo.hopTimer -= dt;
        
        if (kangaroo.hopTimer <= 0) {
          if (this.player.isAlive) {
            const pDx = this.player.x - kangaroo.x;
            if (Math.abs(pDx) < 350) {
              kangaroo.dir = Math.sign(pDx) || 1;
            }
          }
          
          kangaroo.vy = -450;
          kangaroo.vx = kangaroo.dir * 180;
          kangaroo.isGrounded = false;
          
          audio.playJump();
        }
      }
      
      // 3. Move X and resolve X collisions
      kangaroo.x += kangaroo.vx * dt;
      let colResult = this.checkSolid(kangaroo.x, kangaroo.y, kangaroo.width, kangaroo.height);
      if (colResult) {
        if (kangaroo.vx > 0) {
          kangaroo.x = colResult.col * this.tileSize - kangaroo.width - 0.1;
        } else if (kangaroo.vx < 0) {
          kangaroo.x = (colResult.col + 1) * this.tileSize;
        }
        kangaroo.vx = -kangaroo.vx * 0.25;
        kangaroo.dir = -kangaroo.dir;
      }
      
      // 4. Move Y and resolve Y collisions
      kangaroo.y += kangaroo.vy * dt;
      let wasGrounded = kangaroo.isGrounded;
      kangaroo.isGrounded = false;
      let rowResult = this.checkSolid(kangaroo.x, kangaroo.y, kangaroo.width, kangaroo.height);
      if (rowResult) {
        if (kangaroo.vy > 0) {
          kangaroo.y = rowResult.row * this.tileSize - kangaroo.height - 0.1;
          kangaroo.vy = 0;
          kangaroo.isGrounded = true;
          kangaroo.vx = 0;
          
          if (!wasGrounded) {
            kangaroo.hopTimer = 0.8 + Math.random() * 0.8;
            particles.createJumpBurst(kangaroo.x + kangaroo.width/2, kangaroo.y + kangaroo.height);
          }
        } else if (kangaroo.vy < 0) {
          kangaroo.y = (rowResult.row + 1) * this.tileSize;
          kangaroo.vy = 0;
        }
      }
      
      // Boundary check
      if (kangaroo.x < 0) {
        kangaroo.x = 0;
        kangaroo.dir = 1;
      }
      const mapWidth = this.tiles[0].length * this.tileSize;
      if (kangaroo.x + kangaroo.width > mapWidth) {
        kangaroo.x = mapWidth - kangaroo.width;
        kangaroo.dir = -1;
      }
      
      // Player interaction collision check
      if (this.player.isAlive) {
        const pLeft = this.player.x;
        const pRight = this.player.x + this.player.width;
        const pTop = this.player.y;
        const pBottom = this.player.y + this.player.height;
        
        const kLeft = kangaroo.x;
        const kRight = kangaroo.x + kangaroo.width;
        const kTop = kangaroo.y;
        const kBottom = kangaroo.y + kangaroo.height;
        
        if (pRight > kLeft && pLeft < kRight && pBottom > kTop && pTop < kBottom) {
          // Stomp collision
          if (pBottom <= kTop + 14 && this.player.vy > 0) {
            this.player.vy = -this.jumpForce * 0.85;
            audio.playHit();
            particles.createExplosion(kangaroo.x + kangaroo.width/2, kangaroo.y + kangaroo.height/2, '#ffaa00');
            
            const idx = this.kangaroos.indexOf(kangaroo);
            if (idx > -1) this.kangaroos.splice(idx, 1);
          } else {
            this.killPlayer();
          }
        }
      }
    });
  }

  // Smooth camera tracking with lookahead lead
  updateCamera(dt) {
    if (!this.player.isAlive) return;

    // Soft velocity-based camera lookahead lead
    const lookAheadX = this.player.noclip ? 0 : this.player.vx * 0.18;
    const lookAheadY = this.player.noclip ? 0 : this.player.vy * 0.08;

    // Follow player center + lookahead
    this.camera.targetX = (this.player.x + this.player.width / 2) - this.canvas.width / 2 + lookAheadX;
    this.camera.targetY = (this.player.y + this.player.height / 2) - this.canvas.height / 2 + lookAheadY;
    
    // Constrain camera bounds to map width, or center map if it is smaller than viewport
    const mapMaxX = this.tiles[0].length * this.tileSize;
    const mapMaxY = this.tiles.length * this.tileSize;
    
    if (mapMaxX > this.canvas.width) {
      this.camera.targetX = Math.max(0, Math.min(mapMaxX - this.canvas.width, this.camera.targetX));
    } else {
      this.camera.targetX = (mapMaxX - this.canvas.width) / 2;
    }

    if (mapMaxY > this.canvas.height) {
      this.camera.targetY = Math.max(0, Math.min(mapMaxY - this.canvas.height, this.camera.targetY));
    } else {
      this.camera.targetY = (mapMaxY - this.canvas.height) / 2;
    }
    
    // Exponential decay interpolation for organic feel
    const cameraSpeed = 6.5;
    this.camera.x += (this.camera.targetX - this.camera.x) * (1 - Math.exp(-cameraSpeed * dt));
    this.camera.y += (this.camera.targetY - this.camera.y) * (1 - Math.exp(-cameraSpeed * dt));

    // Dynamic camera context tilt based on velocity/dashing
    this.camera.tilt = (this.camera.tilt || 0);
    const targetTilt = this.player.isDashing ? (this.player.dashDir * 0.018) : (this.player.vx * 0.00003);
    this.camera.tilt += (targetTilt - this.camera.tilt) * dt * 4;
  }

  // Update HUD text elements
  updateHUD() {
    document.getElementById('hud-coins').innerText = `${this.levelCoinsCollected} / ${this.levelTotalCoins}`;
    document.getElementById('hud-level-num').innerText = String(this.currentLevelIdx + 1).padStart(2, '0');
    
    const timeElapsed = Date.now() - this.levelStartTime;
    const minutes = Math.floor(timeElapsed / 60000);
    const seconds = Math.floor((timeElapsed % 60000) / 1000);
    document.getElementById('hud-timer').innerText = 
      `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  // Main Drawing Function
  draw() {
    // Performance: Avoid rendering the main game canvas when screens are overlayed
    if (this.gameState === 'MENU' || this.gameState === 'LEVEL_EDITOR' || this.gameState === 'LEVEL_SELECT' || this.gameState === 'HOW_TO_PLAY') {
      return;
    }

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Guard against rendering before a level is loaded
    if (!this.tiles || this.tiles.length === 0 || !this.tiles[0]) {
      return;
    }
    
    this.ctx.save();
    
    // Apply camera shake if any
    let shakeOffset = { x: 0, y: 0 };
    if (this.camera.shakeTimer > 0) {
      shakeOffset.x = (Math.random() - 0.5) * this.camera.shakeIntensity;
      shakeOffset.y = (Math.random() - 0.5) * this.camera.shakeIntensity;
    }
    
    this.ctx.translate(-Math.floor(this.camera.x) + shakeOffset.x, -Math.floor(this.camera.y) + shakeOffset.y);
    
    // Smooth camera context tilt roll
    if (this.camera.tilt && Math.abs(this.camera.tilt) > 0.0001) {
      this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
      this.ctx.rotate(this.camera.tilt);
      this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
    }
    
    // Draw pre-rendered static grid & tiles
    this.ctx.drawImage(this.tileCanvas, 0, 0);
    
    // Draw dynamic assets
    this.drawPortal();
    this.drawBouncePads();
    this.drawMovingPlatforms();
    this.drawCoins();
    this.drawGunPickup();
    this.drawEnemies();
    this.drawBeavers();
    this.drawKangaroos();
    
    // Draw boss projectiles
    if (this.bossProjectiles && this.bossProjectiles.length > 0) {
      this.drawBossProjectiles();
    }
    
    // Draw particles
    particles.draw(this.ctx);
    
    // Draw player
    if (this.player.isAlive) {
      this.drawPlayer();
      this.drawPlayerLasers();
    }
    
    // Draw trajectory visualizer if charging throw
    if (this.player.heldBeaver && this.player.isChargingThrow) {
      this.drawTrajectoryCurve();
    }
    
    // Draw boss
    if (this.boss) {
      this.drawBoss();
    }
    
    this.ctx.restore();
    
    // Draw high-speed screen-space vignette during dash
    if (this.player.isAlive && this.player.isDashing) {
      const theme = this.getCurrentTheme();
      const grad = this.ctx.createRadialGradient(
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.45,
        this.canvas.width / 2, this.canvas.height / 2, this.canvas.width * 0.75
      );
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, this.hexToRGBA(theme.primary, 0.22));
      
      this.ctx.save();
      this.ctx.fillStyle = grad;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }
    
    // Draw screen-space Boss HUD
    this.drawBossHUD();
  }

  // Draw background cyber grid
  drawGrid(ctx) {
    const theme = this.getCurrentTheme();
    ctx.strokeStyle = theme.gridColor;
    ctx.lineWidth = 1;
    
    const mapMaxX = this.tiles[0].length * this.tileSize;
    const mapMaxY = this.tiles.length * this.tileSize;
    
    ctx.beginPath();
    // vertical grid lines
    for (let x = 0; x <= mapMaxX; x += this.tileSize) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, mapMaxY);
    }
    // horizontal grid lines
    for (let y = 0; y <= mapMaxY; y += this.tileSize) {
      ctx.moveTo(0, y);
      ctx.lineTo(mapMaxX, y);
    }
    ctx.stroke();
  }

  // Draw solid level geometry with neon colors
  drawTiles(ctx) {
    const theme = this.getCurrentTheme();
    
    const rows = this.tiles.length;
    const cols = this.tiles[0].length;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.tiles[r][c];
        const x = c * this.tileSize;
        const y = r * this.tileSize;
        
        if (tile === '#' || tile === 'S') {
          // Cyber Solid Block (with glass/matrix effect)
          ctx.fillStyle = theme.secondary;
          ctx.strokeStyle = theme.primary;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 4;
          ctx.shadowColor = theme.primary;
          
          ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
          ctx.strokeRect(x + 1, y + 1, this.tileSize - 2, this.tileSize - 2);
          ctx.shadowBlur = 0; // reset
        } 
        else if (tile === 'I') {
          // Ice block (glowing cyan / white border)
          ctx.fillStyle = 'rgba(0, 242, 254, 0.2)';
          ctx.strokeStyle = '#00f2fe';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00f2fe';
          
          ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
          ctx.strokeRect(x + 1, y + 1, this.tileSize - 2, this.tileSize - 2);
          
          // Ice details (slashes inside)
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 20);
          ctx.lineTo(x + 20, y + 8);
          ctx.moveTo(x + 20, y + 32);
          ctx.lineTo(x + 32, y + 20);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (tile === 'D') {
          // Destructible block (Orange / Yellow with warning stripes or cracks)
          ctx.fillStyle = 'rgba(255, 170, 0, 0.15)';
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ffaa00';
          
          ctx.fillRect(x + 2, y + 2, this.tileSize - 4, this.tileSize - 4);
          ctx.strokeRect(x + 1, y + 1, this.tileSize - 2, this.tileSize - 2);
          
          // Draw crack details inside to show it's fragile
          ctx.strokeStyle = 'rgba(255, 170, 0, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 6, y + 6);
          ctx.lineTo(x + 18, y + 18);
          ctx.lineTo(x + 10, y + 28);
          ctx.moveTo(x + 34, y + 6);
          ctx.lineTo(x + 22, y + 18);
          ctx.lineTo(x + 30, y + 32);
          ctx.moveTo(x + 18, y + 18);
          ctx.lineTo(x + 32, y + 22);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (tile === '_') {
          // Semi solid platforms
          ctx.strokeStyle = theme.primary;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 5;
          ctx.shadowColor = theme.primary;
          ctx.beginPath();
          ctx.moveTo(x, y + 4);
          ctx.lineTo(x + this.tileSize, y + 4);
          ctx.stroke();
          ctx.shadowBlur = 0;
        } 
        else if (tile === '^') {
          // Floor Spikes
          this.drawSpike(ctx, x, y, 'up');
        } 
        else if (tile === 'v') {
          // Ceiling Spikes
          this.drawSpike(ctx, x, y, 'down');
        }
        else if (tile === '<') {
          // Left Spikes
          this.drawSpike(ctx, x, y, 'left');
        }
        else if (tile === '>') {
          // Right Spikes
          this.drawSpike(ctx, x, y, 'right');
        }
      }
    }
  }

  // Draw spikes with a cool glowing neon outline
  drawSpike(ctx, x, y, dir) {
    ctx.strokeStyle = '#ff0064';
    ctx.fillStyle = 'rgba(255, 0, 100, 0.2)';
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ff0064';
    
    ctx.beginPath();
    
    if (dir === 'up') {
      // 3 spikes per block
      const count = 3;
      const spikeW = this.tileSize / count;
      for (let i = 0; i < count; i++) {
        const sx = x + (i * spikeW);
        ctx.moveTo(sx, y + this.tileSize);
        ctx.lineTo(sx + spikeW / 2, y + 8);
        ctx.lineTo(sx + spikeW, y + this.tileSize);
      }
    } else if (dir === 'down') {
      const count = 3;
      const spikeW = this.tileSize / count;
      for (let i = 0; i < count; i++) {
        const sx = x + (i * spikeW);
        ctx.moveTo(sx, y);
        ctx.lineTo(sx + spikeW / 2, y + this.tileSize - 8);
        ctx.lineTo(sx + spikeW, y);
      }
    } else if (dir === 'left') {
      const count = 3;
      const spikeH = this.tileSize / count;
      for (let i = 0; i < count; i++) {
        const sy = y + (i * spikeH);
        ctx.moveTo(x + this.tileSize, sy);
        ctx.lineTo(x + 8, sy + spikeH / 2);
        ctx.lineTo(x + this.tileSize, sy + spikeH);
      }
    } else if (dir === 'right') {
      const count = 3;
      const spikeH = this.tileSize / count;
      for (let i = 0; i < count; i++) {
        const sy = y + (i * spikeH);
        ctx.moveTo(x, sy);
        ctx.lineTo(x + this.tileSize - 8, sy + spikeH / 2);
        ctx.lineTo(x, sy + spikeH);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Pre-render static tiles & grid to the offscreen canvas
  preRenderTilemap() {
    if (!this.tiles || this.tiles.length === 0 || !this.tiles[0]) return;
    const rows = this.tiles.length;
    const cols = this.tiles[0].length;
    this.tileCanvas.width = cols * this.tileSize;
    this.tileCanvas.height = rows * this.tileSize;
    
    this.tileCtx.clearRect(0, 0, this.tileCanvas.width, this.tileCanvas.height);
    this.drawGrid(this.tileCtx);
    this.drawTiles(this.tileCtx);
  }

  // Draw bouncing launch pads
  drawBouncePads() {
    this.bouncePads.forEach((pad) => {
      this.ctx.fillStyle = 'rgba(0, 255, 150, 0.15)';
      this.ctx.strokeStyle = '#00ff96';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#00ff96';
      
      // Draw standard base
      this.ctx.fillRect(pad.x + 2, pad.y + 28, pad.width - 4, 12);
      this.ctx.strokeRect(pad.x + 1, pad.y + 27, pad.width - 2, 13);
      
      // Draw neon spring/plate top
      this.ctx.fillStyle = '#00ff96';
      this.ctx.fillRect(pad.x + 4, pad.y + 22, pad.width - 8, 5);
      this.ctx.shadowBlur = 0;
    });
  }

  // Draw platform loops
  drawMovingPlatforms() {
    const theme = this.getCurrentTheme();
    this.movingPlatforms.forEach((p) => {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      this.ctx.strokeStyle = theme.primary;
      this.ctx.lineWidth = 3;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = theme.primary;
      
      this.ctx.fillRect(p.x, p.y, p.width, p.height);
      this.ctx.strokeRect(p.x, p.y, p.width, p.height);
      
      // Draw neon core design inside platform
      this.ctx.fillStyle = theme.primary;
      this.ctx.fillRect(p.x + 10, p.y + p.height/2 - 2, p.width - 20, 4);
      
      this.ctx.shadowBlur = 0;
    });
  }

  // Draw shiny collectible coins
  drawCoins() {
    const time = Date.now() / 200;
    this.coins.forEach((c) => {
      if (c.collected) return;
      
      const bounce = Math.sin(time + c.x) * 4;
      const spinScale = Math.sin(time * 1.5 + c.x);
      
      this.ctx.save();
      this.ctx.translate(c.x, c.y + bounce);
      
      // Glow
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = '#ffd700';
      this.ctx.strokeStyle = '#ffd700';
      this.ctx.lineWidth = 2;
      this.ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
      
      // Draw spin-warping circle
      this.ctx.beginPath();
      this.ctx.ellipse(0, 0, 10 * Math.abs(spinScale), 10, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      
      // Draw star inner symbol
      this.ctx.fillStyle = '#ffd700';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, 4 * Math.abs(spinScale), 0, Math.PI * 2);
      this.ctx.fill();
      
      this.ctx.restore();
    });
  }

  // Draw Exit Portal Gate
  drawPortal() {
    if (!this.exitPortal) return;
    
    const time = Date.now() / 400;
    
    this.ctx.save();
    this.ctx.translate(this.exitPortal.x, this.exitPortal.y);
    
    // Draw multiple rotating neon ring bounds
    for (let r = 0; r < 3; r++) {
      const radius = 25 - r * 6;
      const angle = time * (1 + r * 0.4) * (r % 2 === 0 ? 1 : -1);
      
      this.ctx.strokeStyle = r % 2 === 0 ? 'hsl(280, 100%, 65%)' : 'hsl(320, 100%, 60%)';
      this.ctx.shadowBlur = 15;
      this.ctx.shadowColor = this.ctx.strokeStyle;
      this.ctx.lineWidth = 3 - r * 0.5;
      
      this.ctx.beginPath();
      this.ctx.arc(0, 0, radius, angle, angle + Math.PI * 1.4);
      this.ctx.stroke();
    }
    
    // Draw vortex core glow
    const grad = this.ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    grad.addColorStop(0, '#fff');
    grad.addColorStop(0.5, 'hsl(280, 100%, 75%)');
    grad.addColorStop(1, 'transparent');
    
    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, 18, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
    this.ctx.shadowBlur = 0;
  }

  drawBeavers() {
    const time = Date.now() / 120;
    
    this.beavers.forEach((beaver) => {
      this.ctx.save();
      this.ctx.translate(beaver.x + beaver.width/2, beaver.y + beaver.height/2);
      
      // Check distance to player for HUD prompt and selection outline
      const pCenterX = this.player.x + this.player.width / 2;
      const pCenterY = this.player.y + this.player.height / 2;
      const bCenterX = beaver.x + beaver.width / 2;
      const bCenterY = beaver.y + beaver.height / 2;
      const dx = bCenterX - pCenterX;
      const dy = bCenterY - pCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isNear = dist < 60 && !this.player.heldBeaver && this.player.isAlive && !beaver.isThrown;
      
      if (beaver.isThrown) {
        this.ctx.rotate(beaver.spinAngle || 0);
      } else {
        let scaleX = 1;
        let scaleY = 1;
        if (beaver.chewTimer > 0) {
          scaleX = 1.05 + Math.sin(time * 3) * 0.08;
          scaleY = 0.95 + Math.cos(time * 3) * 0.08;
        } else {
          scaleX = 1.0 + Math.sin(time) * 0.04;
          scaleY = 1.0 - Math.sin(time) * 0.04;
        }
        this.ctx.scale(scaleX, scaleY);
        this.ctx.scale(beaver.dir, 1);
      }
      
      // Apply neon cyan outline styling if player is near, otherwise default orange
      if (isNear) {
        this.ctx.strokeStyle = '#00f2fe';
        this.ctx.lineWidth = 3.5;
        this.ctx.shadowBlur = 14;
        this.ctx.shadowColor = '#00f2fe';
      } else {
        this.ctx.strokeStyle = '#ffaa66';
        this.ctx.lineWidth = 2.5;
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#ffaa66';
      }
      
      // 1. Tail
      this.ctx.save();
      this.ctx.translate(-12, 4);
      let tailAngle = Math.sin(time) * 0.3;
      if (beaver.chewTimer > 0) tailAngle = Math.sin(time * 4) * 0.1;
      this.ctx.rotate(tailAngle);
      this.ctx.fillStyle = '#ffaa66';
      this.ctx.fillRect(-8, -3, 8, 5);
      this.ctx.strokeRect(-8, -3, 8, 5);
      this.ctx.restore();
      
      // 2. Body
      this.ctx.fillStyle = 'rgba(50, 30, 20, 0.9)';
      this.ctx.beginPath();
      this.ctx.roundRect(-12, -8, 24, 16, 6);
      this.ctx.fill();
      this.ctx.stroke();
      
      // 3. Teeth
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 0;
      this.ctx.fillRect(8, 2, 2, 5);
      this.ctx.fillRect(10, 2, 2, 5);
      
      // 4. Eye
      this.ctx.fillStyle = '#ffaa66';
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ffaa66';
      this.ctx.fillRect(4, -3, 4, 3);
      
      // 5. Feet
      this.ctx.fillStyle = '#ffaa66';
      this.ctx.fillRect(-8, 7, 4, 3);
      this.ctx.fillRect(4, 7, 4, 3);
      
      // 6. Draw "E" to Pickup floating text prompt
      if (isNear) {
        this.ctx.save();
        this.ctx.scale(beaver.dir, 1); // unflip text (undoes the scale(beaver.dir, 1) above)
        this.ctx.fillStyle = '#ffffff';
        this.ctx.strokeStyle = '#02030f';
        this.ctx.lineWidth = 3;
        this.ctx.font = "bold 9px 'Outfit', sans-serif";
        this.ctx.textAlign = 'center';
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#00f2fe';
        this.ctx.strokeText('E TO PICKUP', 0, -22);
        this.ctx.fillText('E TO PICKUP', 0, -22);
        this.ctx.restore();
      }
      
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
    });
  }

  drawKangaroos() {
    const time = Date.now() / 150;
    
    this.kangaroos.forEach((kangaroo) => {
      this.ctx.save();
      this.ctx.translate(kangaroo.x + kangaroo.width/2, kangaroo.y + kangaroo.height/2);
      
      let scaleX = 1;
      let scaleY = 1;
      if (!kangaroo.isGrounded) {
        scaleX = 0.85;
        scaleY = 1.15;
      } else if (kangaroo.hopTimer < 0.25) {
        scaleX = 1.25;
        scaleY = 0.75;
      }
      this.ctx.scale(scaleX, scaleY);
      this.ctx.scale(kangaroo.dir, 1);
      
      this.ctx.strokeStyle = '#ffaa00';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ffaa00';
      
      // 1. Tail
      this.ctx.fillStyle = '#ffaa00';
      this.ctx.fillRect(-12, 8, 6, 4);
      
      // 2. Body
      this.ctx.fillStyle = 'rgba(45, 30, 0, 0.95)';
      this.ctx.beginPath();
      this.ctx.roundRect(-8, -14, 16, 28, 5);
      this.ctx.fill();
      this.ctx.stroke();
      
      // 3. Ears
      this.ctx.fillStyle = '#ffaa00';
      this.ctx.fillRect(-5, -22, 3, 9);
      this.ctx.fillRect(2, -22, 3, 9);
      
      // 4. Arms
      this.ctx.fillRect(2, -4, 5, 2);
      
      // 5. Pouch
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowColor = '#00f2fe';
      this.ctx.beginPath();
      this.ctx.arc(0, 4, 5, 0, Math.PI);
      this.ctx.stroke();
      
      // 6. Eye
      this.ctx.fillStyle = '#ffaa00';
      this.ctx.shadowColor = '#ffaa00';
      this.ctx.fillRect(1, -9, 3, 2);
      
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
    });
  }

  // Draw Patrol Bots
  drawEnemies() {
    const time = Date.now() / 150;
    
    // Draw paths if enabled
    if (this.showPaths) {
      this.enemies.forEach((enemy) => {
        if (enemy.path && enemy.path.length > 0) {
          this.ctx.save();
          this.ctx.strokeStyle = 'rgba(0, 255, 150, 0.6)';
          this.ctx.lineWidth = 3;
          this.ctx.setLineDash([4, 4]);
          
          this.ctx.beginPath();
          // Start the line at the enemy's current center
          this.ctx.moveTo(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          
          // Draw lines through all the path nodes
          enemy.path.forEach((node) => {
            const nodeX = node[1] * this.tileSize + this.tileSize / 2;
            const nodeY = node[0] * this.tileSize + this.tileSize / 2;
            this.ctx.lineTo(nodeX, nodeY);
          });
          this.ctx.stroke();
          
          // Draw small marker squares at each node
          this.ctx.fillStyle = '#00ff96';
          enemy.path.forEach((node) => {
            const nodeX = node[1] * this.tileSize + this.tileSize / 2;
            const nodeY = node[0] * this.tileSize + this.tileSize / 2;
            this.ctx.fillRect(nodeX - 4, nodeY - 4, 8, 8);
          });
          
          this.ctx.restore();
        }
      });
    }

    this.enemies.forEach((enemy) => {
      this.ctx.save();
      this.ctx.translate(enemy.x + enemy.width/2, enemy.y + enemy.height/2);
      
      // Floating motion
      const bounce = Math.sin(time + enemy.x) * 3;
      this.ctx.translate(0, bounce);
      
      const isChasing = enemy.isChasing;
      const isSearching = enemy.isSearching;
      
      let eyeColor = '#ff0064';
      if (isChasing) {
        eyeColor = (Math.floor(Date.now() / 80) % 2 === 0 ? '#ff0000' : '#ffff00');
      } else if (isSearching) {
        eyeColor = '#ffaa00';
      }
      
      // Draw alert exclamation / question mark indicators
      if (isChasing) {
        this.ctx.save();
        this.ctx.fillStyle = '#ff0000';
        this.ctx.font = "bold 14px 'Press Start 2P', monospace, sans-serif";
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#ff0000';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("!", 0, -22);
        this.ctx.restore();
      } else if (isSearching) {
        this.ctx.save();
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.font = "bold 14px 'Press Start 2P', monospace, sans-serif";
        this.ctx.shadowBlur = 8;
        this.ctx.shadowColor = '#ffaa00';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("?", 0, -22);
        this.ctx.restore();
      }

      // Draw body base (cederic face, or neon red/grey drone core fallback)
      this.ctx.strokeStyle = eyeColor;
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = isChasing ? 18 : 12;
      this.ctx.shadowColor = eyeColor;
      
      if (this.headLoaded) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
        this.ctx.clip();
        this.ctx.drawImage(this.playerHead, -14, -14, 28, 28);
        this.ctx.restore();
        
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
        this.ctx.stroke();
      } else {
        this.ctx.fillStyle = isChasing ? 'rgba(45, 10, 20, 0.9)' : 'rgba(28, 28, 48, 0.85)';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, 14, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.stroke();
      }
      
      // Draw scanner visor (eye glow, sweeps left/right when scanning/looking around)
      let lookOffset = enemy.dir * 4;
      if ((enemy.scanTimer !== undefined && enemy.scanTimer > 0) || (enemy.isSearching && enemy.searchPhase === 'SCAN')) {
        lookOffset = Math.sin(Date.now() / 80) * 8;
      }
      this.ctx.fillStyle = eyeColor;
      this.ctx.fillRect(lookOffset - 5, -3, 10, 5);
      
      // Side wings/thrusters
      this.ctx.fillStyle = eyeColor;
      this.ctx.fillRect(-19, -2, 5, 4);
      this.ctx.fillRect(14, -2, 5, 4);
      
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
    });
  }

  // Draw Player head (Cederic) + body
  drawPlayer() {
    const p = this.player;
    const theme = this.getCurrentTheme();

    // Render dash ghost trails
    if (!p.ghosts) p.ghosts = [];
    if (p.isDashing && p.isAlive) {
      const tilt = p.vx * 0.0006;
      p.ghosts.push({
        x: p.x,
        y: p.y,
        squishX: p.squishX,
        squishY: p.squishY,
        tilt: tilt,
        facingDir: p.facingDir,
        alpha: 0.35
      });
      if (p.ghosts.length > 5) {
        p.ghosts.shift();
      }
    } else {
      p.ghosts.forEach(g => g.alpha -= 0.04);
      p.ghosts = p.ghosts.filter(g => g.alpha > 0);
    }

    p.ghosts.forEach((ghost) => {
      this.ctx.save();
      this.ctx.translate(ghost.x + p.width / 2, ghost.y + p.height);
      this.ctx.scale(ghost.squishX, ghost.squishY);
      this.ctx.rotate(ghost.tilt);
      
      this.ctx.fillStyle = theme.primary;
      this.ctx.globalAlpha = ghost.alpha;
      
      this.ctx.fillRect(-12, -4, 8, 4);
      this.ctx.fillRect(4, -4, 8, 4);
      this.ctx.fillRect(-10, -18, 20, 14);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(ghost.facingDir > 0 ? 0 : -8, -15, 8, 8);
      this.ctx.restore();
    });
    
    this.ctx.save();
    
    // Draw character at bottom-center of player bbox
    this.ctx.translate(p.x + p.width / 2, p.y + p.height);
    
    // Apply squish/stretch animations
    this.ctx.scale(p.squishX, p.squishY);
    
    // Apply head tilt based on horizontal velocity
    let tilt = p.vx * 0.0006;
    
    // Add running wobble
    if (p.isGrounded && Math.abs(p.vx) > 10) {
      tilt += Math.sin(Date.now() / 60) * 0.08;
    }
    
    this.ctx.rotate(tilt);
    
    // 1. Draw animated spacesuit/robot body (neon cyan highlights)
    
    // Feet (running animation)
    const walkTimer = Date.now() / 100;
    let footYOffset1 = 0;
    let footYOffset2 = 0;
    
    if (p.isGrounded && Math.abs(p.vx) > 10) {
      footYOffset1 = Math.sin(walkTimer) * 5;
      footYOffset2 = -Math.sin(walkTimer) * 5;
    }
    
    this.ctx.fillStyle = '#222538';
    this.ctx.strokeStyle = theme.primary;
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 6;
    this.ctx.shadowColor = theme.primary;
    
    // Left Foot
    this.ctx.fillRect(-12, -4 + footYOffset1, 8, 4);
    this.ctx.strokeRect(-12, -4 + footYOffset1, 8, 4);
    // Right Foot
    this.ctx.fillRect(4, -4 + footYOffset2, 8, 4);
    this.ctx.strokeRect(4, -4 + footYOffset2, 8, 4);
    
    // Spacesuit body
    this.ctx.fillStyle = 'rgba(24, 25, 40, 0.95)';
    this.ctx.fillRect(-10, -18, 20, 14);
    this.ctx.strokeRect(-10, -18, 20, 14);
    
    // Draw cyber suit emblem (glowing star or line)
    this.ctx.fillStyle = theme.primary;
    this.ctx.fillRect(-4, -13, 8, 4);

    // Draw blaster weapon if active slot is selected
    if (p.hasGun && this.selectedWeapon === 1) {
      this.ctx.save();
      
      // Position weapon at player's side/hand (bottom-center relative is 0,0)
      this.ctx.translate(0, -12);
      
      // Calculate angle from player center to mouse
      const shakeX = this.camera.shakeTimer > 0 ? (Math.random() - 0.5) * this.camera.shakeIntensity : 0;
      const shakeY = this.camera.shakeTimer > 0 ? (Math.random() - 0.5) * this.camera.shakeIntensity : 0;
      const pScreenX = (p.x + p.width / 2) - Math.floor(this.camera.x) + shakeX;
      const pScreenY = (p.y + p.height / 2) - Math.floor(this.camera.y) + shakeY;
      
      const dx = this.mouse.x - pScreenX;
      const dy = this.mouse.y - pScreenY;
      const angle = Math.atan2(dy, dx);
      
      // Rotate the gun context towards the mouse angle
      this.ctx.rotate(angle);
      if (p.facingDir === -1) {
        this.ctx.scale(1, -1);
      }
      
      this.ctx.fillStyle = '#1c1b24';
      this.ctx.strokeStyle = theme.primary;
      this.ctx.lineWidth = 1.5;
      
      this.ctx.beginPath();
      this.ctx.moveTo(0, -3);
      this.ctx.lineTo(12, -3);
      this.ctx.lineTo(12, 0);
      this.ctx.lineTo(14, 0);
      this.ctx.lineTo(14, 1.5);
      this.ctx.lineTo(12, 1.5);
      this.ctx.lineTo(12, 3);
      this.ctx.lineTo(6, 3);
      this.ctx.lineTo(2, 7); // handle
      this.ctx.lineTo(-2, 5);
      this.ctx.lineTo(0, 1);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      
      // Glow dot
      this.ctx.fillStyle = theme.primary;
      this.ctx.fillRect(6, -1, 4, 2);
      
      this.ctx.restore();
    }

    this.ctx.restore(); // restore to clean coordinate systems
    
    // 2. Draw Cederic's head (with circular clip & glass visor neon frame)
    this.ctx.save();
    
    // We target the head coordinate box (top half of player bbox)
    const headSize = 32;
    const hx = p.x + (p.width - headSize) / 2;
    const hy = p.y;
    
    this.ctx.translate(hx + headSize/2, hy + headSize/2);
    this.ctx.scale(p.squishX, p.squishY);
    this.ctx.rotate(tilt);
    
    if (this.headLoaded) {
      // Draw circular head clip
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      this.ctx.clip();
      
      // Draw face image
      this.ctx.drawImage(this.playerHead, -headSize / 2, -headSize / 2, headSize, headSize);
      this.ctx.restore();
    } else {
      // Fallback if image fails to load (Cute green matrix retro head)
      this.ctx.fillStyle = '#0f0';
      this.ctx.strokeStyle = '#fff';
      this.ctx.lineWidth = 2.5;
      
      this.ctx.beginPath();
      this.ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      
      this.ctx.fillStyle = '#000';
      this.ctx.fillRect(-6, -4, 4, 4);
      this.ctx.fillRect(2, -4, 4, 4);
      this.ctx.fillRect(-4, 3, 8, 2);
    }
    
    // Visor neon frame (glass bubble border)
    this.ctx.strokeStyle = theme.primary;
    this.ctx.lineWidth = 2.5;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = theme.primary;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, headSize / 2 + 1, 0, Math.PI * 2);
    this.ctx.stroke();
    
    this.ctx.restore();
    
    // Draw held beaver above player's head
    if (p.heldBeaver) {
      this.ctx.save();
      this.ctx.translate(p.x + p.width / 2, p.y - 10);
      this.ctx.scale(p.facingDir, 1);
      
      this.ctx.strokeStyle = '#ffaa66';
      this.ctx.lineWidth = 2.5;
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#ffaa66';
      
      // Tail
      this.ctx.fillStyle = '#ffaa66';
      this.ctx.fillRect(-17, 0, 5, 4);
      this.ctx.strokeRect(-17, 0, 5, 4);
      
      // Body
      this.ctx.fillStyle = 'rgba(50, 30, 20, 0.9)';
      this.ctx.beginPath();
      this.ctx.roundRect(-12, -8, 24, 16, 6);
      this.ctx.fill();
      this.ctx.stroke();
      
      // Teeth
      this.ctx.fillStyle = '#ffffff';
      this.ctx.shadowBlur = 0;
      this.ctx.fillRect(8, 2, 2, 4);
      this.ctx.fillRect(10, 2, 2, 4);
      
      // Eye
      this.ctx.fillStyle = '#ffaa66';
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = '#ffaa66';
      this.ctx.fillRect(4, -3, 3, 2);
      
      this.ctx.restore();
    }
    
    this.ctx.shadowBlur = 0;
  }

  // BOSS HELPER METHODS
  updateBoss(dt) {
    if (!this.boss) return;

    const boss = this.boss;

    // Hit cooldown
    if (boss.hitCooldown > 0) boss.hitCooldown -= dt;

    const playerMidX = this.player.x + this.player.width / 2;
    const bossMidX = boss.x + boss.width / 2;

    // Face player
    boss.facingDir = playerMidX < bossMidX ? -1 : 1;

    // Float offset calculation for animation
    boss.floatOffset = Math.sin(Date.now() / 150) * 8;

    // Boss Evade Mechanic: dashes away if player is landing on it while in active state
    if (this.player.isAlive && boss.hitCooldown <= 0 && 
        (boss.state === 'PATROL' || boss.state === 'STOMP_PREP')) {
      const pLeft = this.player.x;
      const pRight = this.player.x + this.player.width;
      const pBottom = this.player.y + this.player.height;
      const pMidX = pLeft + this.player.width / 2;
      
      const bLeft = boss.x;
      const bRight = boss.x + boss.width;
      const bTop = boss.y;
      const bMidX = bLeft + boss.width / 2;
      
      if (this.player.vy > 0 && pBottom < bTop + 10 && pBottom >= bTop - 120 && 
          pRight > bLeft - 10 && pLeft < bRight + 10) {
        
        // Evade sideways!
        const evadeDir = pMidX < bMidX ? 1 : -1;
        const mapWidth = 25 * this.tileSize;
        
        let targetX = boss.x + evadeDir * 130;
        if (targetX < 80 || targetX + boss.width > mapWidth - 80) {
          targetX = boss.x - evadeDir * 130; // evade in opposite direction
        }
        
        boss.x = Math.max(80, Math.min(mapWidth - 80 - boss.width, targetX));
        boss.hitCooldown = 0.45; // brief hit immunity
        audio.playDash();
        
        // Spawn dash trails
        particles.createDashTrail(boss.x + boss.width/2, boss.y + boss.height/2, '#ff0000');
        particles.createDashTrail(boss.x + boss.width/2 - evadeDir * 50, boss.y + boss.height/2, '#ff0055');
      }
    }

    if (boss.state === 'INTRO') {
      boss.stateTimer -= dt;
      // Hover down slowly
      boss.y += (140 - boss.y) * dt * 2;
      if (boss.stateTimer <= 0) {
        boss.state = 'PATROL';
        boss.stateTimer = 4.0; // time before stomp/swoop is ready
      }
      return;
    }

    if (boss.state === 'DEFEATED') {
      boss.stateTimer -= dt;
      boss.vy += 200 * dt; // slide/fall down
      boss.y += boss.vy * dt;
      
      // Emit explosion debris particles
      if (Math.random() > 0.4) {
        particles.createBossGlitchParticles(boss.x + Math.random() * boss.width, boss.y + Math.random() * boss.height);
      }
      
      if (boss.stateTimer <= 0) {
        this.boss = null; // remove boss
      }
      return;
    }

    if (boss.state === 'STUNNED') {
      boss.stateTimer -= dt;
      boss.vx = 0;
      boss.vy = 0;
      boss.isGlowRed = false;
      if (boss.stateTimer <= 0) {
        boss.state = 'PATROL';
        boss.stateTimer = 3.5; // patrol time
        boss.attackCooldown = 1.0;
      }
      return;
    }

    if (boss.state === 'STOMP_PREP') {
      boss.stateTimer -= dt;
      boss.vx = 0;
      // Float upwards to prep height
      boss.y += (60 - boss.y) * dt * 3;
      boss.isGlowRed = true;

      // Glow effect particles
      if (Math.random() > 0.6) {
        particles.createDashTrail(boss.x + Math.random() * boss.width, boss.y + boss.height, '#ff0000');
      }

      if (boss.stateTimer <= 0) {
        boss.state = 'STOMP_FALL';
        boss.vy = 800; // fast fall speed
      }
      return;
    }

    if (boss.state === 'STOMP_FALL') {
      boss.y += boss.vy * dt;
      
      // Check floor collision
      const floorY = 13 * this.tileSize - boss.height; // snapped to floor row 13
      if (boss.y >= floorY) {
        boss.y = floorY;
        boss.state = 'STUNNED';
        boss.stateTimer = 2.0; // stunned for 2 seconds
        
        // Screen shake + particles
        this.camera.shakeTimer = 0.5;
        this.camera.shakeIntensity = 12;
        audio.playHit();
        particles.createBossShockwave(boss.x + boss.width / 2, boss.y + boss.height);
        
        // Damage player if they are on ground
        if (this.player.isAlive && this.player.isGrounded) {
          this.killPlayer();
        }
      }
      return;
    }

    if (boss.state === 'SWOOP_PREP') {
      boss.stateTimer -= dt;
      boss.vx = 0;
      boss.vy = 0;
      boss.isGlowRed = true;
      
      // Shake body
      boss.x += Math.sin(Date.now() / 20) * 2;
      
      if (boss.stateTimer <= 0) {
        boss.state = 'SWOOP';
        boss.stateTimer = 1.6; // swoop duration
        boss.vx = (playerMidX < bossMidX ? -1 : 1) * 380;
        boss.vy = 0;
        boss.startY = boss.y;
        audio.playDash();
      }
      return;
    }

    if (boss.state === 'SWOOP') {
      boss.stateTimer -= dt;
      boss.isGlowRed = true;

      // Swoop in a U-shape/crescent using sine wave for Y offset
      const progress = (1.6 - boss.stateTimer) / 1.6; // 0 to 1
      const yOffset = Math.sin(progress * Math.PI) * 220; // dip down 220px
      
      boss.x += boss.vx * dt;
      boss.y = boss.startY + yOffset;
      
      // Emit red trails
      if (Math.random() > 0.6) {
        particles.createDashTrail(boss.x + boss.width/2, boss.y + boss.height/2, '#ff0055');
      }

      // Clamp X bounds (bounce off walls during swoop)
      const mapWidth = 25 * this.tileSize;
      if (boss.x <= 40) {
        boss.vx = Math.abs(boss.vx);
        boss.x = 40;
      } else if (boss.x + boss.width >= mapWidth - 40) {
        boss.vx = -Math.abs(boss.vx);
        boss.x = mapWidth - 40 - boss.width;
      }

      if (boss.stateTimer <= 0) {
        boss.state = 'PATROL';
        boss.stateTimer = 4.0;
        boss.attackCooldown = 1.0;
      }
      return;
    }

    if (boss.state === 'DESPERATION') {
      // Slowly drift left and right in a wide sine wave around the center
      const driftX = Math.sin(Date.now() / 600) * 160;
      const targetX = boss.targetX + driftX;
      boss.x += (targetX - boss.x) * dt * 2.0;
      
      // Float at target Y smoothly
      const targetY = boss.targetY + boss.floatOffset;
      boss.y += (targetY - boss.y) * dt * 2.0;

      boss.isGlowRed = true;

      // Projectile ring attack
      boss.attackCooldown -= dt;
      if (boss.attackCooldown <= 0 && this.player.isAlive) {
        this.shootBossProjectileRing();
        boss.attackCooldown = 1.6; // ring every 1.6s
      }
      return;
    }

    if (boss.state === 'PATROL') {
      // Phase 2 Desperation trigger
      if (boss.health === 1) {
        boss.state = 'DESPERATION';
        boss.stateTimer = 1.0;
        boss.targetX = (25 * this.tileSize) / 2 - boss.width / 2;
        boss.targetY = 100;
        return;
      }

      boss.stateTimer -= dt;
      
      // Move horizontally to track player
      const tx = this.player.x + this.player.width/2 - boss.width/2;
      boss.x += (tx - boss.x) * dt * (boss.health === 3 ? 1.5 : 2.5); // faster track at 2 HP
      
      // Float at target Y smoothly
      const targetY = boss.targetY + boss.floatOffset;
      boss.y += (targetY - boss.y) * dt * 3.0;
      boss.isGlowRed = false;

      // Clamp X
      const mapWidth = 25 * this.tileSize;
      boss.x = Math.max(80, Math.min(mapWidth - 80 - boss.width, boss.x));

      // Projectile Attacks
      boss.attackCooldown -= dt;
      if (boss.attackCooldown <= 0 && this.player.isAlive) {
        this.shootBossProjectile();
        boss.attackCooldown = boss.health === 3 ? 1.8 : 1.1; // faster shoot at 2 HP
      }

      // Transition to Stomp prep (only if aligned vertically) or Swoop
      if (boss.stateTimer <= 0) {
        const dxToPlayer = Math.abs(playerMidX - bossMidX);
        if (dxToPlayer < 60) {
          boss.state = 'STOMP_PREP';
          boss.stateTimer = 0.9; // stomp prep
        } else {
          // Swoop instead
          boss.state = 'SWOOP_PREP';
          boss.stateTimer = 0.8;
        }
      }
    }
  }

  shootBossProjectileRing() {
    if (!this.boss) return;
    const count = 8;
    const speed = 200;
    const bx = this.boss.x + this.boss.width / 2;
    const by = this.boss.y + this.boss.height / 2;
    
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count + (Math.random() * 0.2 - 0.1);
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      
      this.bossProjectiles.push({
        x: bx,
        y: by,
        vx: vx,
        vy: vy,
        radius: 7
      });
    }
    
    audio.playBossShoot();
    
    // Screen shake on ring fire
    this.camera.shakeTimer = 0.25;
    this.camera.shakeIntensity = 5;
  }

  shootBossProjectile() {
    if (!this.boss || !this.player.isAlive) return;
    const dx = (this.player.x + this.player.width/2) - (this.boss.x + this.boss.width/2);
    const dy = (this.player.y + this.player.height/2) - (this.boss.y + this.boss.height/2);
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    const speed = 240;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    
    this.bossProjectiles.push({
      x: this.boss.x + this.boss.width/2,
      y: this.boss.y + this.boss.height/2,
      vx: vx,
      vy: vy,
      radius: 7
    });
    
    audio.playBossShoot();
  }

  updateBossProjectiles(dt) {
    for (let i = this.bossProjectiles.length - 1; i >= 0; i--) {
      const proj = this.bossProjectiles[i];
      proj.x += proj.vx * dt;
      proj.y += proj.vy * dt;
      
      // Check collision with solid tiles
      const col = Math.floor(proj.x / this.tileSize);
      const row = Math.floor(proj.y / this.tileSize);
      if (row >= 0 && row < this.tiles.length && col >= 0 && col < this.tiles[0].length) {
        const tile = this.tiles[row][col];
        if (tile === '#' || tile === 'I' || tile === 'D') {
          this.bossProjectiles.splice(i, 1);
          continue;
        }
      }
      
      // Check bounds
      if (proj.x < 0 || proj.x > 25 * this.tileSize || proj.y > 15 * this.tileSize) {
        this.bossProjectiles.splice(i, 1);
        continue;
      }
      
      // Check collision with player
      if (this.player.isAlive) {
        const pdx = proj.x - (this.player.x + this.player.width/2);
        const pdy = proj.y - (this.player.y + this.player.height/2);
        const dist = Math.sqrt(pdx*pdx + pdy*pdy);
        if (dist < proj.radius + this.player.width/2 - 2) {
          this.bossProjectiles.splice(i, 1);
          this.killPlayer();
        }
      }
    }
  }

  drawBossProjectiles() {
    this.bossProjectiles.forEach((proj) => {
      this.ctx.save();
      this.ctx.shadowBlur = 10;
      this.ctx.shadowColor = '#ff0000';
      this.ctx.fillStyle = '#ff0000';
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 1.5;
      
      this.ctx.beginPath();
      this.ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
      this.ctx.restore();
    });
  }

  drawBoss() {
    const boss = this.boss;
    this.ctx.save();
    
    // Position at bottom center of boss bbox
    this.ctx.translate(boss.x + boss.width/2, boss.y + boss.height);
    
    // Scale mechanical boss body by 2
    this.ctx.scale(2, 2);
    
    // Wobble hover motion
    const wobble = Math.sin(Date.now() / 150) * 0.04;
    this.ctx.rotate(wobble);
    
    // 1. Draw mechanical boss body (red accents)
    this.ctx.fillStyle = '#1c1b24';
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 1.25; // Halved because of scale(2, 2)
    this.ctx.shadowBlur = boss.isGlowRed ? 7.5 : 3;
    this.ctx.shadowColor = '#ff0000';
    
    // Mech shoulders/thrusters
    this.ctx.fillRect(-22, -18, 44, 8);
    this.ctx.strokeRect(-22, -18, 44, 8);
    
    // Mech body
    this.ctx.fillStyle = 'rgba(20, 15, 20, 0.95)';
    this.ctx.fillRect(-15, -28, 30, 24);
    this.ctx.strokeRect(-15, -28, 30, 24);
    
    // Glow core emblem (Red glitch cross/square)
    this.ctx.fillStyle = '#ff0000';
    this.ctx.fillRect(-6, -20, 12, 6);
    
    // Thruster flame at base (for hovering)
    if (boss.state !== 'STUNNED' && boss.state !== 'STOMP_FALL') {
      const flameH = 10 + Math.random() * 12;
      this.ctx.fillStyle = '#ff0055';
      this.ctx.beginPath();
      this.ctx.moveTo(-8, -4);
      this.ctx.lineTo(0, -4 + flameH);
      this.ctx.lineTo(8, -4);
      this.ctx.closePath();
      this.ctx.fill();
    }
    
    this.ctx.restore();
    
    // 2. Draw head (Circular clip, red overlay/tint, glowing red eyes)
    this.ctx.save();
    const headSize = 84; // doubled size (was 42)
    const hx = boss.x + (boss.width - headSize) / 2;
    const hy = boss.y;
    
    this.ctx.translate(hx + headSize/2, hy + headSize/2);
    this.ctx.rotate(wobble);
    
    if (this.headLoaded) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      this.ctx.clip();
      
      // Draw face
      this.ctx.drawImage(this.playerHead, -headSize / 2, -headSize / 2, headSize, headSize);
      
      // Draw Red Glitch Overlay
      this.ctx.fillStyle = 'rgba(255, 0, 50, 0.35)'; // Red tint
      this.ctx.globalCompositeOperation = 'source-atop';
      this.ctx.fillRect(-headSize / 2, -headSize / 2, headSize, headSize);
      this.ctx.restore();
    } else {
      // Fallback
      this.ctx.fillStyle = '#ff0000';
      this.ctx.beginPath();
      this.ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
      this.ctx.fill();
    }
    
    // Visor neon frame (Dark red/crimson glowing glass bubble border)
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 3;
    this.ctx.shadowBlur = boss.hitCooldown > 0 ? 25 : 10;
    this.ctx.shadowColor = '#ff0000';
    this.ctx.beginPath();
    this.ctx.arc(0, 0, headSize / 2 + 1, 0, Math.PI * 2);
    this.ctx.stroke();
    
    // Draw Glowing Red Eyes on top of Cederic's head (scaled up by 2)
    this.ctx.shadowBlur = 12;
    this.ctx.fillStyle = '#ffffff';
    // Draw white eye centers with red glow
    this.ctx.beginPath();
    this.ctx.arc(-14 + wobble * 20, -4, 6, 0, Math.PI * 2);
    this.ctx.arc(14 + wobble * 20, -4, 6, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.fillStyle = '#ff0000';
    this.ctx.beginPath();
    this.ctx.arc(-14 + wobble * 20, -4, 3, 0, Math.PI * 2);
    this.ctx.arc(14 + wobble * 20, -4, 3, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
    this.ctx.shadowBlur = 0;
  }

  drawBossHUD() {
    if (!this.boss || this.boss.state === 'DEFEATED') return;
    
    const barWidth = 300;
    const barHeight = 14;
    const bx = (this.canvas.width - barWidth) / 2;
    const by = 80; // place it below the top HUD
    
    // Draw Bar BG
    this.ctx.fillStyle = 'rgba(28, 28, 48, 0.7)';
    this.ctx.strokeStyle = '#ff0000';
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 8;
    this.ctx.shadowColor = '#ff0000';
    
    this.ctx.fillRect(bx, by, barWidth, barHeight);
    this.ctx.strokeRect(bx, by, barWidth, barHeight);
    
    // Draw Bar Fill
    const fillPercent = this.boss.health / this.boss.maxHealth;
    const fillWidth = (barWidth - 4) * fillPercent;
    
    this.ctx.fillStyle = '#ff0055';
    this.ctx.fillRect(bx + 2, by + 2, fillWidth, barHeight - 4);
    
    // Draw Text Label
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = "10px 'Press Start 2P', monospace";
    this.ctx.textAlign = 'center';
    this.ctx.shadowBlur = 0; // reset
    this.ctx.fillText("EVIL CEDERIC", this.canvas.width / 2, by - 12);

    // If shield is active, draw Shield Bar below HP Bar
    if (this.boss.state !== 'DESPERATION') {
      const sby = by + 22; // 102
      
      // Shield Bar BG
      this.ctx.fillStyle = 'rgba(28, 28, 48, 0.7)';
      this.ctx.strokeStyle = '#00f2fe';
      this.ctx.lineWidth = 1.5;
      this.ctx.shadowBlur = 6;
      this.ctx.shadowColor = '#00f2fe';
      
      this.ctx.fillRect(bx, sby, barWidth, 8); // slightly thinner than HP bar
      this.ctx.strokeRect(bx, sby, barWidth, 8);
      
      // Shield Fill
      const shieldPercent = this.boss.shield / this.boss.maxShield;
      const shieldFillWidth = (barWidth - 4) * shieldPercent;
      
      this.ctx.fillStyle = '#00f2fe';
      this.ctx.fillRect(bx + 2, sby + 2, shieldFillWidth, 4);
      
      // Label text
      this.ctx.fillStyle = '#00f2fe';
      this.ctx.font = "6px 'Press Start 2P', monospace";
      this.ctx.textAlign = 'left';
      this.ctx.shadowBlur = 0;
      this.ctx.fillText("SHIELD ARMOR", bx, sby - 4);
    } else {
      // In desperation phase, show "SHIELD OFFLINE"
      const sby = by + 22;
      this.ctx.fillStyle = 'rgba(255, 0, 85, 0.6)';
      this.ctx.font = "bold 6px 'Press Start 2P', monospace";
      this.ctx.textAlign = 'center';
      this.ctx.shadowBlur = 0;
      this.ctx.fillText("CRITICAL OVERLOAD: SHIELD DOWN!", this.canvas.width / 2, sby + 4);
    }
  }

  // Gun and laser gameplay methods
  shootLaserHorizontal() {
    if (this.player.shootCooldown > 0) return;
    this.player.shootCooldown = 0.25; // 250ms cooldown
    this.camera.shakeTimer = 0.08;
    this.camera.shakeIntensity = 2.5;
    audio.playLaserShoot();
    
    const direction = this.player.facingDir;
    const lx = direction > 0 ? this.player.x + this.player.width : this.player.x - 12;
    const ly = this.player.y + 12;
    
    this.player.lasers.push({
      x: lx,
      y: ly,
      vx: direction * 650,
      vy: 0,
      width: 14,
      height: 4
    });
  }

  shootLaserTowardsMouse() {
    if (this.player.shootCooldown > 0) return;
    this.player.shootCooldown = 0.25; // 250ms cooldown
    this.camera.shakeTimer = 0.08;
    this.camera.shakeIntensity = 2.5;
    audio.playLaserShoot();
    
    // Calculate vector to mouse
    const shakeX = this.camera.shakeTimer > 0 ? (Math.random() - 0.5) * this.camera.shakeIntensity : 0;
    const shakeY = this.camera.shakeTimer > 0 ? (Math.random() - 0.5) * this.camera.shakeIntensity : 0;
    const pScreenX = (this.player.x + this.player.width / 2) - Math.floor(this.camera.x) + shakeX;
    const pScreenY = (this.player.y + this.player.height / 2) - Math.floor(this.camera.y) + shakeY;
    
    const dx = this.mouse.x - pScreenX;
    const dy = this.mouse.y - pScreenY;
    const dist = Math.sqrt(dx*dx + dy*dy);
    
    const speed = 750;
    const vx = (dx / dist) * speed;
    const vy = (dy / dist) * speed;
    
    // Spawn at player's hand center
    const lx = this.player.x + this.player.width / 2;
    const ly = this.player.y + this.player.height / 2 - 6;
    
    this.player.lasers.push({
      x: lx,
      y: ly,
      vx: vx,
      vy: vy,
      width: 6,
      height: 6,
      angle: Math.atan2(vy, vx)
    });
  }

  updateLasers(dt) {
    if (!this.player.lasers) return;
    
    for (let i = this.player.lasers.length - 1; i >= 0; i--) {
      const laser = this.player.lasers[i];
      laser.x += laser.vx * dt;
      if (laser.vy !== undefined) {
        laser.y += laser.vy * dt;
      }
      
      // Tile collision check
      let colResult = this.checkSolid(laser.x, laser.y, laser.width, laser.height);
      if (colResult) {
        const theme = this.getCurrentTheme();
        particles.createExplosion(laser.x, laser.y, theme.primary, 4);
        this.triggerLaserHitShake(laser.x, laser.y);
        this.player.lasers.splice(i, 1);
        continue;
      }
      
      // Bounds check
      const mapWidth = this.tiles[0].length * this.tileSize;
      const mapHeight = this.tiles.length * this.tileSize;
      if (laser.x < 0 || laser.x > mapWidth || laser.y < 0 || laser.y > mapHeight) {
        this.player.lasers.splice(i, 1);
        continue;
      }
      
      // Enemy collision check
      let hitEnemy = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const enemy = this.enemies[j];
        const eLeft = enemy.x;
        const eRight = enemy.x + enemy.width;
        const eTop = enemy.y;
        const eBottom = enemy.y + enemy.height;
        
        if (laser.x + laser.width > eLeft && laser.x < eRight &&
            laser.y + laser.height > eTop && laser.y < eBottom) {
          
          audio.playHit();
          particles.createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, '#ffd700', 8);
          this.triggerLaserHitShake(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          this.enemies.splice(j, 1);
          hitEnemy = true;
          break;
        }
      }
      
      // Beaver collision check
      if (!hitEnemy) {
        for (let j = this.beavers.length - 1; j >= 0; j--) {
          const beaver = this.beavers[j];
          const bLeft = beaver.x;
          const bRight = beaver.x + beaver.width;
          const bTop = beaver.y;
          const bBottom = beaver.y + beaver.height;
          
          if (laser.x + laser.width > bLeft && laser.x < bRight &&
              laser.y + laser.height > bTop && laser.y < bBottom) {
            audio.playHit();
            particles.createExplosion(beaver.x + beaver.width / 2, beaver.y + beaver.height / 2, '#ffaa66', 8);
            this.triggerLaserHitShake(beaver.x + beaver.width / 2, beaver.y + beaver.height / 2);
            this.beavers.splice(j, 1);
            hitEnemy = true;
            break;
          }
        }
      }
      
      // Kangaroo collision check
      if (!hitEnemy) {
        for (let j = this.kangaroos.length - 1; j >= 0; j--) {
          const kangaroo = this.kangaroos[j];
          const kLeft = kangaroo.x;
          const kRight = kangaroo.x + kangaroo.width;
          const kTop = kangaroo.y;
          const kBottom = kangaroo.y + kangaroo.height;
          
          if (laser.x + laser.width > kLeft && laser.x < kRight &&
              laser.y + laser.height > kTop && laser.y < kBottom) {
            audio.playHit();
            particles.createExplosion(kangaroo.x + kangaroo.width / 2, kangaroo.y + kangaroo.height / 2, '#ffaa00', 8);
            this.triggerLaserHitShake(kangaroo.x + kangaroo.width / 2, kangaroo.y + kangaroo.height / 2);
            this.kangaroos.splice(j, 1);
            hitEnemy = true;
            break;
          }
        }
      }
      
      if (hitEnemy) {
        this.player.lasers.splice(i, 1);
        continue;
      }
      
      // Boss collision check
      if (this.boss && this.boss.state !== 'DEFEATED' && this.boss.state !== 'INTRO') {
        const bLeft = this.boss.x;
        const bRight = this.boss.x + this.boss.width;
        const bTop = this.boss.y;
        const bBottom = this.boss.y + this.boss.height;
        
        if (laser.x + laser.width > bLeft && laser.x < bRight &&
            laser.y + laser.height > bTop && laser.y < bBottom) {
          
          this.player.lasers.splice(i, 1);
          
          if (this.boss.state === 'DESPERATION' || this.boss.state === 'STUNNED') {
            // Direct HP damage!
            if (this.boss.hitCooldown <= 0) {
              this.boss.health--;
              this.boss.hitCooldown = 0.8;
              audio.playBossHit();
              particles.createBossGlitchParticles(this.boss.x + this.boss.width/2, this.boss.y);
              this.camera.shakeTimer = 0.3;
              this.camera.shakeIntensity = 8;
              
              if (this.boss.health <= 0) {
                this.boss.state = 'DEFEATED';
                this.boss.stateTimer = 1.8;
                this.boss.vy = -200;
                audio.playWin();
                this.exitPortal = {
                  x: 12.5 * this.tileSize,
                  y: 7.5 * this.tileSize,
                  radius: 25
                };
              }
            }
          } else if (this.boss.hitCooldown <= 0) {
            // Phase 1 & 2: Shield damage!
            this.boss.shield = Math.max(0, this.boss.shield - 10);
            this.boss.hitCooldown = 0.15; // prevent spam
            audio.playShieldHit();
            particles.createBossGlitchParticles(laser.x, laser.y);
            this.triggerLaserHitShake(laser.x, laser.y);
            
            if (this.boss.shield <= 0) {
              this.boss.state = 'STUNNED';
              this.boss.stateTimer = 2.5;
              this.boss.shield = this.boss.maxShield;
              audio.playShieldBreak();
            }
          }
        }
      }
    }
  }

  drawPlayerLasers() {
    if (!this.player.lasers) return;
    
    this.player.lasers.forEach((laser) => {
      this.ctx.save();
      const theme = this.getCurrentTheme();
      this.ctx.shadowBlur = 8;
      this.ctx.shadowColor = theme.primary;
      
      if (laser.angle !== undefined) {
        // Draw rotated laser capsule
        this.ctx.translate(laser.x, laser.y);
        this.ctx.rotate(laser.angle);
        
        this.ctx.fillStyle = theme.primary;
        this.ctx.fillRect(-8, -2, 16, 4);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(-6, -1, 12, 2);
      } else {
        // Fallback for old horizontal lasers
        this.ctx.fillStyle = theme.primary;
        this.ctx.fillRect(laser.x, laser.y, laser.width, laser.height);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(laser.x + 2, laser.y + 1, laser.width - 4, laser.height - 2);
      }
      this.ctx.restore();
    });
  }

  // Toolbar & Admin Console helper methods
  toggleAdminBar(forceState) {
    const adminBar = document.getElementById('admin-bar');
    const adminInput = document.getElementById('admin-input');
    if (!adminBar || !adminInput) return;
    
    const isCurrentlyHidden = adminBar.classList.contains('hidden');
    const show = forceState !== undefined ? forceState : isCurrentlyHidden;
    
    if (show) {
      adminBar.classList.remove('hidden');
      adminInput.value = '';
      setTimeout(() => adminInput.focus(), 50);
      this.keys = {}; // Clear game keys to prevent player sliding
    } else {
      adminBar.classList.add('hidden');
      adminInput.blur();
      this.canvas.focus();
    }
  }

  executeAdminCommand() {
    const adminInput = document.getElementById('admin-input');
    if (!adminInput) return;
    
    const commandText = adminInput.value.trim().toLowerCase();
    adminInput.value = '';
    
    if (!commandText) return;
    
    const args = commandText.split(' ');
    const cmd = args[0];
    
    let feedbackColor = '#00ff96';
    let feedbackText = '';
    
    if (cmd === 'god') {
      this.player.godMode = !this.player.godMode;
      feedbackText = `God Mode: ${this.player.godMode ? 'ON' : 'OFF'}`;
      audio.playGunPickup();
    } 
    else if (cmd === 'noclip') {
      this.player.noclip = !this.player.noclip;
      feedbackText = `NoClip: ${this.player.noclip ? 'ON' : 'OFF'}`;
      audio.playGunPickup();
    }
    else if (cmd === 'showpath' || cmd === 'path' || cmd === 'visualizepath' || cmd === 'debugpath') {
      this.showPaths = !this.showPaths;
      feedbackText = `Path Debugging: ${this.showPaths ? 'ON' : 'OFF'}`;
      audio.playGunPickup();
    }
    else if (cmd === 'give' && args[1] === 'gun') {
      this.player.hasGun = true;
      this.gunAcquiredBeforeLevel = true;
      this.selectWeapon(1);
      feedbackText = "Blaster weapon granted!";
      audio.playGunPickup();
      
      const touchShootBtn = document.getElementById('touch-shoot');
      if (touchShootBtn) touchShootBtn.classList.remove('hidden');
    }
    else if (cmd === 'level' || cmd === 'sector') {
      const targetLvl = parseInt(args[1]) - 1;
      if (!isNaN(targetLvl) && targetLvl >= 0 && targetLvl < LEVELS.length) {
        this.loadLevel(targetLvl);
        this.setGameState('PLAYING');
        feedbackText = `Teleporting to Sector ${targetLvl + 1}...`;
        audio.playWin();
      } else {
        feedbackText = "Error: Invalid Sector index (1-5)";
        feedbackColor = '#ff0055';
      }
    }
    else if (cmd === 'kill') {
      this.killPlayer();
      feedbackText = "Player terminated.";
      feedbackColor = '#ff0055';
    }
    else if (cmd === 'clear') {
      this.enemies = [];
      feedbackText = "Security entities cleared.";
      audio.playWin();
    }
    else if (cmd === 'speed') {
      const speedMult = parseFloat(args[1]);
      if (!isNaN(speedMult) && speedMult > 0 && speedMult <= 5) {
        this.runSpeed = 260 * speedMult;
        this.iceRunSpeed = 340 * speedMult;
        feedbackText = `Movement Speed set to ${speedMult}x`;
        audio.playGunPickup();
      } else {
        feedbackText = "Error: Speed scale must be 0.1 to 5";
        feedbackColor = '#ff0055';
      }
    }
    else {
      feedbackText = `Unknown command: "${cmd}"`;
      feedbackColor = '#ff0055';
    }
    
    adminInput.placeholder = feedbackText;
    adminInput.blur();
    
    setTimeout(() => {
      const input = document.getElementById('admin-input');
      if (input) {
        input.placeholder = "Type command (god, noclip, showpath, give gun, level 5, kill, speed)...";
      }
    }, 2500);
    
    this.toggleAdminBar(false);
  }

  resolveNoclipCollectibles(dt) {
    const pw = this.player.width;
    const ph = this.player.height;
    
    // Coins
    this.coins.forEach((c) => {
      if (!c.collected) {
        const dx = (this.player.x + pw / 2) - c.x;
        const dy = (this.player.y + ph / 2) - c.y;
        if (Math.sqrt(dx*dx + dy*dy) < 26) {
          c.collected = true;
          this.levelCoinsCollected++;
          this.totalCoinsCollected++;
          audio.playCoin();
          particles.createCoinSparkles(c.x, c.y);
        }
      }
    });

    // Gun
    if (this.gunPickup && !this.gunPickup.collected) {
      const dx = (this.player.x + pw / 2) - this.gunPickup.x;
      const dy = (this.player.y + ph / 2) - this.gunPickup.y;
      if (Math.sqrt(dx*dx + dy*dy) < 28) {
        this.gunPickup.collected = true;
        this.player.hasGun = true;
        audio.playGunPickup();
        particles.createCoinSparkles(this.gunPickup.x, this.gunPickup.y);
        this.selectWeapon(1);
      }
    }

    // Exit
    if (this.exitPortal) {
      const dx = (this.player.x + pw / 2) - this.exitPortal.x;
      const dy = (this.player.y + ph / 2) - this.exitPortal.y;
      if (Math.sqrt(dx*dx + dy*dy) < 30) {
        this.triggerLevelWin();
      }
    }
  }

  updateToolbarUI() {
    const slot0 = document.getElementById('slot-0');
    const slot1 = document.getElementById('slot-1');
    if (!slot0 || !slot1) return;
    
    if (this.player.hasGun) {
      slot1.classList.remove('hidden');
      slot1.title = "Cyber Blaster (Equip: 2)";
    } else {
      slot1.classList.add('hidden');
      if (this.selectedWeapon === 1) {
        this.selectedWeapon = 0;
      }
    }
    
    if (this.selectedWeapon === 0) {
      slot0.classList.add('active');
      slot1.classList.remove('active');
    } else if (this.selectedWeapon === 1 && this.player.hasGun) {
      slot0.classList.remove('active');
      slot1.classList.add('active');
    }
  }

  selectWeapon(slotIdx) {
    if (slotIdx === 1) {
      if (!this.player.hasGun) return;
      this.selectedWeapon = 1;
    } else {
      this.selectedWeapon = 0;
    }
    this.updateToolbarUI();
  }

  drawGunPickup() {
    if (!this.gunPickup || this.gunPickup.collected) return;
    
    const time = Date.now() / 250;
    const bounce = Math.sin(time) * 4;
    
    this.ctx.save();
    this.ctx.translate(this.gunPickup.x, this.gunPickup.y + bounce);
    
    this.ctx.shadowBlur = 12;
    this.ctx.shadowColor = '#00f2fe';
    this.ctx.strokeStyle = '#00f2fe';
    this.ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
    this.ctx.lineWidth = 2;
    
    this.ctx.beginPath();
    this.ctx.moveTo(-10, -4);
    this.ctx.lineTo(8, -4);
    this.ctx.lineTo(8, -1);
    this.ctx.lineTo(12, -1);
    this.ctx.lineTo(12, 1);
    this.ctx.lineTo(8, 1);
    this.ctx.lineTo(8, 4);
    this.ctx.lineTo(2, 4);
    this.ctx.lineTo(-4, 10);
    this.ctx.lineTo(-8, 8);
    this.ctx.lineTo(-4, 3);
    this.ctx.lineTo(-10, 3);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    this.ctx.fillStyle = '#ff0055';
    this.ctx.beginPath();
    this.ctx.arc(2, 0, 2.5, 0, Math.PI * 2);
    this.ctx.fill();
    
    this.ctx.restore();
    this.ctx.shadowBlur = 0;
  }

  loadCustomLevel(levelData) {
    const customIndex = LEVELS.findIndex(lvl => lvl.isCustom);
    if (customIndex !== -1) {
      LEVELS[customIndex] = { ...levelData, isCustom: true };
      this.loadLevel(customIndex);
    } else {
      levelData.isCustom = true;
      LEVELS.push(levelData);
      this.loadLevel(LEVELS.length - 1);
    }
  }

  getCurrentTheme() {
    const lvl = LEVELS[this.currentLevelIdx];
    if (lvl && lvl.isCustom && lvl.primaryColor) {
      return {
        primary: lvl.primaryColor,
        secondary: this.hexToRGBA(lvl.secondaryColor || lvl.primaryColor, 0.15),
        gridColor: this.hexToRGBA(lvl.gridColor || lvl.primaryColor, 0.05),
        name: lvl.name || 'CUSTOM ZONE'
      };
    }
    const themeIdx = (lvl && lvl.theme) ? lvl.theme : (this.currentLevelIdx + 1);
    return LEVEL_THEMES[themeIdx] || LEVEL_THEMES[1];
  }

  hexToRGBA(hex, alpha = 0.15) {
    let c;
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      c = hex.substring(1).split('');
      if (c.length === 3) {
        c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      }
      c = '0x' + c.join('');
      return `rgba(${[(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',')},${alpha})`;
    }
    return hex;
  }

  triggerLaserHitShake(hitX, hitY) {
    if (!this.player.isAlive) return;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    const dx = px - hitX;
    const dy = py - hitY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    const maxDist = 300; // Only shake if within 300 pixels
    if (dist < maxDist) {
      const intensity = (1 - dist / maxDist) * 3.5;
      if (intensity > 0.5) {
        this.camera.shakeTimer = Math.max(this.camera.shakeTimer || 0, 0.1);
        this.camera.shakeIntensity = Math.max(this.camera.shakeIntensity || 0, intensity);
      }
    }
  }

  // Trigger high-tech scanline level transition effect
  triggerLevelTransition(onMidway, onComplete) {
    const overlay = document.getElementById('level-transition-overlay');
    if (!overlay) {
      if (onMidway) onMidway();
      if (onComplete) onComplete();
      return;
    }
    
    overlay.classList.add('active');
    setTimeout(() => {
      if (onMidway) onMidway();
      overlay.classList.remove('active');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 500);
    }, 500);
  }

  // A*-based Grid Pathfinding utilizing PathFinding.js (with diagonal flight support)
  findPath(startRow, startCol, targetRow, targetCol) {
    try {
      const rows = this.tiles.length;
      const cols = this.tiles[0].length;
      
      if (startRow < 0 || startRow >= rows || startCol < 0 || startCol >= cols) return null;
      if (targetRow < 0 || targetRow >= rows || targetCol < 0 || targetCol >= cols) return null;
      
      // Build a 0/1 grid matrix for the pathfinder (0 = walkable, 1 = obstacle)
      const matrix = Array(rows).fill(null).map((_, r) => {
        return Array(cols).fill(null).map((_, c) => {
          const tile = this.tiles[r][c];
          return (tile === '#' || tile === 'I' || tile === 'D') ? 1 : 0;
        });
      });
      
      // Override start and target nodes to be walkable to prevent pathfinder failure
      matrix[startRow][startCol] = 0;
      matrix[targetRow][targetCol] = 0;
      
      const grid = new PF.Grid(matrix);
      const finder = new PF.AStarFinder({
        allowDiagonal: true,
        dontCrossCorners: true
      });
      
      // PF.Grid uses (x, y) coordinates -> (col, row)
      const path = finder.findPath(startCol, startRow, targetCol, targetRow, grid);
      
      // Convert node elements from [col, row] back to [row, col] format
      if (path && path.length > 0) {
        return path.map(node => [node[1], node[0]]);
      }
      return null;
    } catch (e) {
      console.error("Pathfinding error:", e);
      return null;
    }
  }

  pickupBeaver() {
    const pCenterX = this.player.x + this.player.width / 2;
    const pCenterY = this.player.y + this.player.height / 2;
    let nearestBeaver = null;
    let nearestDist = 60; // pickup range
    
    this.beavers.forEach((beaver) => {
      const bCenterX = beaver.x + beaver.width / 2;
      const bCenterY = beaver.y + beaver.height / 2;
      const dx = bCenterX - pCenterX;
      const dy = bCenterY - pCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestBeaver = beaver;
      }
    });
    
    if (nearestBeaver) {
      this.player.heldBeaver = nearestBeaver;
      const idx = this.beavers.indexOf(nearestBeaver);
      if (idx > -1) {
        this.beavers.splice(idx, 1);
      }
      audio.playHit(); // play pickup sound
    }
  }

  dropBeaver() {
    const beaver = this.player.heldBeaver;
    if (!beaver) return;
    
    beaver.x = this.player.x + (this.player.width - beaver.width) / 2;
    beaver.y = this.player.y - beaver.height - 5;
    beaver.vx = this.player.facingDir * 50;
    beaver.vy = -100;
    beaver.isThrown = true;
    beaver.thrownTimer = 2.0;
    beaver.isGrounded = false;
    beaver.spinAngle = 0;
    
    this.beavers.push(beaver);
    this.player.heldBeaver = null;
    this.player.isChargingThrow = false;
    audio.playDash(); // drop sound
  }

  throwBeaver() {
    const beaver = this.player.heldBeaver;
    if (!beaver) return;
    
    const pCenterX = this.player.x + this.player.width / 2;
    const pCenterY = this.player.y + this.player.height / 2 - 10;
    
    const mouseWorldX = this.mouse.x + this.camera.x;
    const mouseWorldY = this.mouse.y + this.camera.y;
    
    const dx = mouseWorldX - pCenterX;
    const dy = mouseWorldY - pCenterY;
    const angle = Math.atan2(dy, dx);
    const power = this.player.throwPower || 150;
    
    beaver.x = pCenterX - beaver.width / 2;
    beaver.y = pCenterY - beaver.height / 2 - 10;
    beaver.vx = Math.cos(angle) * power;
    beaver.vy = Math.sin(angle) * power;
    beaver.isThrown = true;
    beaver.thrownTimer = 3.0;
    beaver.isGrounded = false;
    beaver.spinAngle = 0;
    
    this.beavers.push(beaver);
    this.player.heldBeaver = null;
    this.player.isChargingThrow = false;
    audio.playDash(); // throw sound whoosh
  }

  drawTrajectoryCurve() {
    const pCenterX = this.player.x + this.player.width / 2;
    const pCenterY = this.player.y + this.player.height / 2 - 10;
    
    const mouseWorldX = this.mouse.x + this.camera.x;
    const mouseWorldY = this.mouse.y + this.camera.y;
    
    const dx = mouseWorldX - pCenterX;
    const dy = mouseWorldY - pCenterY;
    const angle = Math.atan2(dy, dx);
    const power = this.player.throwPower || 150;
    
    let simX = pCenterX;
    let simY = pCenterY - 15;
    let simVx = Math.cos(angle) * power;
    let simVy = Math.sin(angle) * power;
    
    const stepDt = 0.04;
    const totalSteps = 24;
    
    this.ctx.save();
    this.ctx.shadowBlur = 8;
    this.ctx.lineWidth = 2;
    
    for (let i = 0; i < totalSteps; i++) {
      const alpha = 1.0 - (i / totalSteps) * 0.7;
      this.ctx.fillStyle = `rgba(0, 242, 254, ${alpha})`;
      this.ctx.shadowColor = '#00f2fe';
      
      this.ctx.beginPath();
      this.ctx.arc(simX, simY, 3.5 - (i / totalSteps) * 1.5, 0, Math.PI * 2);
      this.ctx.fill();
      
      simX += simVx * stepDt;
      simVy += this.gravity * stepDt;
      simY += simVy * stepDt;
      
      if (this.checkSolid(simX - 16, simY - 12, 32, 24)) {
        break;
      }
    }
    this.ctx.restore();
  }
}
