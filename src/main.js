// Main Application Entry Point and UI Coordinator
import { GameEngine } from './game.js';
import { audio } from './audio.js';
import { LEVELS } from './levels.js';
import { setupEditor } from './editor.js';
import { MultiplayerManager } from './multiplayer.js';

// Initialize Game Engine
const game = new GameEngine('game-canvas');
game.multiplayer = new MultiplayerManager(game);
setupEditor(game);

// Sex Selection Handlers
const menuAvatar = document.getElementById('menu-avatar');
const hudAvatar = document.querySelector('.hud-avatar');
const victoryAvatar = document.querySelector('.victory-avatar');

function setPlayerSex(sex) {
  game.playerSex = sex;
  localStorage.setItem('cederic_player_sex', sex);
  
  // Update active state of sex selector buttons
  document.querySelectorAll('.btn-sex').forEach(btn => {
    if (btn.dataset.sex === sex) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Update avatar images
  let imgSrc = './character.jpg';
  if (sex === 'female') {
    imgSrc = './female_avatar.png';
  } else if (sex === 'cyber') {
    imgSrc = './cyber_avatar.png';
  }
  
  if (menuAvatar) menuAvatar.src = imgSrc;
  if (hudAvatar) hudAvatar.src = imgSrc;
  if (victoryAvatar) victoryAvatar.src = imgSrc;
}

// Add click listeners to sex selector buttons
document.querySelectorAll('.btn-sex').forEach(btn => {
  btn.addEventListener('click', () => {
    audio.init();
    setPlayerSex(btn.dataset.sex);
  });
});

// Initialize sex from storage or default
const savedSex = localStorage.getItem('cederic_player_sex') || 'male';
setPlayerSex(savedSex);

// Coordinate UI Resize
function resizeCanvas() {
  const canvas = game.canvas;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  
  // Re-adjust camera if game is running to prevent sudden jumps
  if (game.gameState === 'PLAYING' && game.player) {
    game.camera.x = game.player.x - canvas.width / 2;
    game.camera.y = game.player.y - canvas.height / 2;
  }
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas(); // initial call

// Auto-blur buttons on click so spacebar does not re-trigger them during gameplay
document.addEventListener('click', (e) => {
  if (document.activeElement && (document.activeElement.tagName === 'BUTTON' || document.activeElement.classList.contains('level-card'))) {
    document.activeElement.blur();
  }
});

// Create Level Buttons Grid in DOM
const levelsGrid = document.getElementById('level-buttons-grid');
LEVELS.forEach((level, idx) => {
  const btn = document.createElement('div');
  btn.className = 'level-card';
  btn.innerHTML = `
    <span class="lvl-num">${idx + 1}</span>
    <span class="lvl-title">${level.name.split(' ')[0]}</span>
  `;
  
  btn.addEventListener('click', () => {
    // Start selected level
    audio.init();
    game.triggerLevelTransition(() => {
      game.loadLevel(idx);
      game.setGameState('PLAYING');
    });
  });
  
  levelsGrid.appendChild(btn);
});

// UI Screen Click Handlers
document.getElementById('start-game-btn').addEventListener('click', () => {
  audio.init();
  game.triggerLevelTransition(() => {
    game.loadLevel(0);
    game.setGameState('PLAYING');
  });
});

document.getElementById('level-select-btn').addEventListener('click', () => {
  game.setGameState('LEVEL_SELECT');
  document.getElementById('level-select-menu').classList.add('active');
});

document.getElementById('how-to-play-btn').addEventListener('click', () => {
  game.setGameState('HOW_TO_PLAY');
  document.getElementById('how-to-play-menu').classList.add('active');
});

document.getElementById('sound-toggle').addEventListener('click', () => {
  audio.init();
  const enabled = audio.toggle();
  const soundIcon = document.getElementById('sound-icon');
  soundIcon.innerText = enabled ? '🔊' : '🔇';
  const toggleBtn = document.getElementById('sound-toggle');
  toggleBtn.innerHTML = `<span id="sound-icon">${enabled ? '🔊' : '🔇'}</span> Music & SFX: ${enabled ? 'ON' : 'OFF'}`;
});

// Multiplayer Screen Triggers
document.getElementById('multiplayer-btn').addEventListener('click', () => {
  audio.init();
  game.setGameState('MULTIPLAYER_LOBBY');
});

document.getElementById('back-to-menu-from-mp').addEventListener('click', () => {
  game.setGameState('MENU');
});

document.getElementById('join-lobby-btn').addEventListener('click', () => {
  audio.init();
  const nickname = document.getElementById('mp-nickname').value || 'Cederic';
  const roomName = document.getElementById('mp-room').value || 'CYBER-ROOM';
  const color = document.getElementById('mp-color').value || '#00f2fe';
  const serverUrl = document.getElementById('mp-server-url').value || 'ws://localhost:8080';
  const sex = game.playerSex;
  
  const joinBtn = document.getElementById('join-lobby-btn');
  joinBtn.innerText = 'CONNECTING...';
  joinBtn.disabled = true;
  
  game.multiplayer.connect(serverUrl, nickname, sex, color, roomName,
    (playerId) => {
      joinBtn.innerText = 'JOIN SERVER';
      joinBtn.disabled = false;
      game.triggerLevelTransition(() => {
        game.loadLevel(0);
        game.setGameState('PLAYING');
      });
    },
    (err) => {
      alert('Failed to connect to multiplayer server: ' + err.message);
      joinBtn.innerText = 'JOIN SERVER';
      joinBtn.disabled = false;
    }
  );
});

// Back buttons
document.getElementById('back-to-menu-from-levels').addEventListener('click', () => {
  game.setGameState('MENU');
});

document.getElementById('back-to-menu-from-how').addEventListener('click', () => {
  game.setGameState('MENU');
});

// Pause Screen
document.getElementById('resume-btn').addEventListener('click', () => {
  game.setGameState('PLAYING');
});

document.getElementById('restart-level-btn').addEventListener('click', () => {
  game.triggerLevelTransition(() => {
    game.resetLevel();
    game.setGameState('PLAYING');
  });
});

document.getElementById('exit-to-menu-btn').addEventListener('click', () => {
  game.setGameState('MENU');
});

// Game Over Screen
document.getElementById('retry-btn').addEventListener('click', () => {
  game.triggerLevelTransition(() => {
    game.resetLevel();
    game.setGameState('PLAYING');
  });
});

document.getElementById('game-over-exit-btn').addEventListener('click', () => {
  game.setGameState('MENU');
});

// Level Complete Screen
document.getElementById('next-level-btn').addEventListener('click', () => {
  const nextLvl = game.currentLevelIdx + 1;
  if (nextLvl < LEVELS.length) {
    game.triggerLevelTransition(() => {
      game.loadLevel(nextLvl);
      game.setGameState('PLAYING');
    });
  } else {
    game.triggerLevelTransition(() => {
      game.setGameState('VICTORY');
    });
  }
});

document.getElementById('level-comp-exit-btn').addEventListener('click', () => {
  game.setGameState('MENU');
});

// Victory Screen
document.getElementById('victory-exit-btn').addEventListener('click', () => {
  game.setGameState('MENU');
});

// Campaign & Community Level Tab Switching and Fetching Logic
const campaignTabBtn = document.getElementById('tab-campaign-btn');
const communityTabBtn = document.getElementById('tab-community-btn');
const campaignGrid = document.getElementById('level-buttons-grid');
const communityGrid = document.getElementById('community-levels-grid');

// Default to relative path for Pages Functions, with support for custom overrides
const DEFAULT_WORKER_URL = '';
const WORKER_URL = localStorage.getItem('cederic_custom_worker_url') || DEFAULT_WORKER_URL;

if (campaignTabBtn && communityTabBtn) {
  campaignTabBtn.addEventListener('click', () => {
    campaignTabBtn.classList.add('active');
    communityTabBtn.classList.remove('active');
    campaignGrid.classList.remove('hidden');
    communityGrid.classList.add('hidden');
  });

  communityTabBtn.addEventListener('click', () => {
    communityTabBtn.classList.add('active');
    campaignTabBtn.classList.remove('active');
    campaignGrid.classList.add('hidden');
    communityGrid.classList.remove('hidden');
    loadCommunityLevels();
  });
}

async function loadCommunityLevels() {
  communityGrid.innerHTML = '<div class="loading-spinner">FETCHING DATA STREAM...</div>';
  try {
    const res = await fetch(`${WORKER_URL}/api/levels`);
    if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
    const levels = await res.json();
    
    if (levels.length === 0) {
      communityGrid.innerHTML = '<div class="loading-spinner">NO COMMUNITY MAPS FOUND. CREATE ONE!</div>';
      return;
    }
    
    communityGrid.innerHTML = '';
    levels.forEach((lvl) => {
      const card = document.createElement('div');
      card.className = 'level-card community-card';
      card.innerHTML = `
        <span class="lvl-num">★</span>
        <span class="lvl-title">${lvl.name.split(' ')[0]}</span>
        <span class="lvl-author">BY ${lvl.author.toUpperCase()}</span>
      `;
      
      card.addEventListener('click', async () => {
        audio.init();
        card.innerHTML = '<span class="lvl-author">LOADING...</span>';
        try {
          const detailRes = await fetch(`${WORKER_URL}/api/levels/${lvl.id}`);
          if (!detailRes.ok) throw new Error("Could not download level details.");
          const levelData = await detailRes.json();
          
          game.triggerLevelTransition(() => {
            game.loadCustomLevel(levelData);
            game.setGameState('PLAYING');
          });
        } catch (err) {
          alert(`Download failed: ${err.message}`);
          loadCommunityLevels(); // refresh
        }
      });
      
      communityGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Worker fetch error:", err);
    communityGrid.innerHTML = `<div class="loading-spinner" style="color: #ff0055">CANT CONNECT TO CF WORKER<br><span style="font-size: 0.5rem; opacity: 0.7; display: block; margin-top: 5px;">${err.message}</span></div>`;
  }
}

// Main Loop ticker
let lastTime = performance.now();
function gameLoop(time) {
  // Calculate delta-time (capped to 100ms to avoid physics teleports on tab change)
  const dt = Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  
  // Update game state
  game.update(dt);
  
  // Render frame
  game.draw();
  
  requestAnimationFrame(gameLoop);
}

// Start game loop ticker
requestAnimationFrame(gameLoop);

// Set default initial screen
game.setGameState('MENU');
