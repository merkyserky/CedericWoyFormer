// Level Editor controller for CedericWoyFormer
export function setupEditor(game) {
  const canvas = document.getElementById('editor-canvas');
  const ctx = canvas.getContext('2d');
  
  const lvlNameInput = document.getElementById('editor-lvl-name');
  const lvlThemeSelect = document.getElementById('editor-lvl-theme');
  const jsonArea = document.getElementById('editor-json-area');
  const primaryColorInput = document.getElementById('editor-primary-color');
  const secondaryColorInput = document.getElementById('editor-secondary-color');
  const gridColorInput = document.getElementById('editor-grid-color');
  
  const rotateBtn = document.getElementById('editor-rotate-btn');
  const selectionCoords = document.getElementById('editor-selection-coords');
  const selectionTile = document.getElementById('editor-selection-tile');
  
  const lvlWidthInput = document.getElementById('editor-lvl-width');
  const lvlHeightInput = document.getElementById('editor-lvl-height');
  
  let rows = 15;
  let cols = 25;
  const cellSize = 40; // canvas width 1000 / 25, height 600 / 15
  
  let currentBrush = '#';
  let isDrawing = false;
  let lastPaintedCell = null;
  let selectedCell = { r: 12, c: 2 }; // default to spawn point
  
  // Undo/Redo stack history
  const undoStack = [];
  const redoStack = [];
  const maxHistory = 50;

  function saveHistory() {
    undoStack.push(gridData.map(row => [...row]));
    if (undoStack.length > maxHistory) {
      undoStack.shift();
    }
    // Clear redo history on new action
    redoStack.length = 0;
  }
  
  // Theme hex defaults
  const themeColors = {
    1: { primary: '#00f2fe', secondary: '#00f2fe', grid: '#00f2fe' },
    2: { primary: '#ff00a0', secondary: '#ff00a0', grid: '#ff00a0' },
    3: { primary: '#00ff96', secondary: '#00ff96', grid: '#00ff96' },
    4: { primary: '#ffd700', secondary: '#ffd700', grid: '#ffd700' },
    5: { primary: '#ff0000', secondary: '#ff0000', grid: '#ff0000' }
  };
  
  // Load player image for spawn preview
  const playerHead = new Image();
  playerHead.src = './character.jpg';
  let headLoaded = false;
  playerHead.onload = () => {
    headLoaded = true;
    drawEditor();
  };

  // Grid data (default borders solid, middle empty)
  let gridData = Array(rows).fill(null).map((_, r) => {
    return Array(cols).fill(null).map((_, c) => {
      if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
        return '#';
      }
      return ' ';
    });
  });

  // Pre-place player spawn and exit portal
  gridData[rows - 3][2] = 'P'; // Spawn
  gridData[rows - 3][cols - 3] = 'E'; // Exit

  // Hex to RGBA conversion helper
  function hexToRGBA(hex, alpha = 1) {
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

  function getTileName(tile) {
    if (tile === '#') return 'Solid Wall (🧱)';
    if (tile === 'I') return 'Slippery Ice (❄️)';
    if (tile === 'D') return 'Destructible (💥)';
    if (tile === '_') return 'Platform (➖)';
    if (tile === '^') return 'Spike Up (▲)';
    if (tile === '>') return 'Spike Right (▶)';
    if (tile === 'v') return 'Spike Down (▼)';
    if (tile === '<') return 'Spike Left (◀)';
    if (tile === 'B') return 'Bounce Pad (🟢)';
    if (tile === '*') return 'Cyber Coin (💎)';
    if (tile === 'G') return 'Cyber Blaster (🔫)';
    if (tile === 'V') return 'Beaver (🦫)';
    if (tile === 'K') return 'Kangaroo (🦘)';
    if (tile === 'P') return 'Spawn Point (👊)';
    if (tile === 'E') return 'Exit Portal (🌀)';
    if (tile === 'M') return 'Security Drone (👾)';
    if (tile === 'L') return 'Turret (🔫)';
    if (tile === 'W') return 'Ground Walker (🤖)';
    if (tile === '1') return 'Red Key (🔑)';
    if (tile === '2') return 'Blue Key (🔑)';
    if (tile === '3') return 'Green Key (🔑)';
    if (tile === '!') return 'Red Door (🚪)';
    if (tile === '@') return 'Blue Door (🚪)';
    if (tile === '$') return 'Green Door (🚪)';
    if (tile === 'T') return 'Teleporter (🌀)';
    if (tile === 'Z') return 'Gravity Zone (⬆)';
    return 'Empty (❌)';
  }

  function updateSelectionUI() {
    if (!selectionCoords || !selectionTile) return;
    selectionCoords.innerText = `Row ${selectedCell.r}, Col ${selectedCell.c}`;
    const tile = gridData[selectedCell.r][selectedCell.c];
    selectionTile.innerText = getTileName(tile);
    
    // Disable rotate button if selected tile is not rotateable
    if (rotateBtn) {
      if (['^', '>', 'v', '<'].includes(tile)) {
        rotateBtn.disabled = false;
      } else {
        rotateBtn.disabled = true;
      }
    }
  }

  // Draw the editor canvas viewport
  function drawEditor() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const primaryColor = primaryColorInput.value;
    const secondaryColor = secondaryColorInput.value;
    const gridColor = gridColorInput.value;
    
    // 1. Draw Grid Lines
    ctx.strokeStyle = hexToRGBA(gridColor, 0.08);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) {
      ctx.moveTo(c * cellSize, 0);
      ctx.lineTo(c * cellSize, rows * cellSize);
    }
    for (let r = 0; r <= rows; r++) {
      ctx.moveTo(0, r * cellSize);
      ctx.lineTo(cols * cellSize, r * cellSize);
    }
    ctx.stroke();
    
    // 2. Draw static blocks & items
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = gridData[r][c];
        const x = c * cellSize;
        const y = r * cellSize;
        
        if (tile === '#') {
          // Solid Wall
          ctx.fillStyle = hexToRGBA(secondaryColor, 0.2);
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2;
          ctx.shadowBlur = 4;
          ctx.shadowColor = primaryColor;
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.shadowBlur = 0;
        } 
        else if (tile === 'I') {
          // Ice Block
          ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
          ctx.strokeStyle = '#00f2fe';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#00f2fe';
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          
          // Ice details
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + 8, y + 20); ctx.lineTo(x + 20, y + 8);
          ctx.moveTo(x + 20, y + 32); ctx.lineTo(x + 32, y + 20);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (tile === 'D') {
          // Destructible Block
          ctx.fillStyle = 'rgba(255, 170, 0, 0.2)';
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ffaa00';
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          
          // Draw cracks
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
          // Platform
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 5;
          ctx.shadowColor = primaryColor;
          ctx.beginPath();
          ctx.moveTo(x, y + 6);
          ctx.lineTo(x + cellSize, y + 6);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (['^', 'v', '<', '>'].includes(tile)) {
          // Spikes (Up, Down, Left, Right)
          ctx.strokeStyle = '#ff0064';
          ctx.fillStyle = 'rgba(255, 0, 100, 0.25)';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ff0064';
          ctx.beginPath();
          
          const count = 3;
          if (tile === '^') {
            const spikeW = cellSize / count;
            for (let i = 0; i < count; i++) {
              const sx = x + (i * spikeW);
              ctx.moveTo(sx, y + cellSize);
              ctx.lineTo(sx + spikeW / 2, y + 8);
              ctx.lineTo(sx + spikeW, y + cellSize);
            }
          } else if (tile === 'v') {
            const spikeW = cellSize / count;
            for (let i = 0; i < count; i++) {
              const sx = x + (i * spikeW);
              ctx.moveTo(sx, y);
              ctx.lineTo(sx + spikeW / 2, y + cellSize - 8);
              ctx.lineTo(sx + spikeW, y);
            }
          } else if (tile === '<') {
            const spikeH = cellSize / count;
            for (let i = 0; i < count; i++) {
              const sy = y + (i * spikeH);
              ctx.moveTo(x + cellSize, sy);
              ctx.lineTo(x + 8, sy + spikeH / 2);
              ctx.lineTo(x + cellSize, sy + spikeH);
            }
          } else if (tile === '>') {
            const spikeH = cellSize / count;
            for (let i = 0; i < count; i++) {
              const sy = y + (i * spikeH);
              ctx.moveTo(x, sy);
              ctx.lineTo(x + cellSize - 8, sy + spikeH / 2);
              ctx.lineTo(x, sy + spikeH);
            }
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        else if (tile === 'B') {
          // Bounce pad
          ctx.fillStyle = 'rgba(0, 255, 150, 0.15)';
          ctx.strokeStyle = '#00ff96';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00ff96';
          
          ctx.fillRect(x + 2, y + 28, cellSize - 4, 12);
          ctx.strokeRect(x + 1, y + 27, cellSize - 2, 13);
          
          ctx.fillStyle = '#00ff96';
          ctx.fillRect(x + 4, y + 22, cellSize - 8, 5);
          ctx.shadowBlur = 0;
        }
        else if (tile === '*') {
          // Coin
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ffd700';
          ctx.strokeStyle = '#ffd700';
          ctx.lineWidth = 1.5;
          ctx.fillStyle = 'rgba(255, 215, 0, 0.35)';
          ctx.beginPath();
          ctx.ellipse(0, 0, 10, 10, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ffd700';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        else if (tile === 'G') {
          // Gun Blaster
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#00f2fe';
          ctx.strokeStyle = '#00f2fe';
          ctx.fillStyle = 'rgba(0, 242, 254, 0.25)';
          ctx.lineWidth = 1.5;
          
          ctx.beginPath();
          ctx.moveTo(-10, -4); ctx.lineTo(8, -4); ctx.lineTo(8, -1);
          ctx.lineTo(12, -1); ctx.lineTo(12, 1); ctx.lineTo(8, 1);
          ctx.lineTo(8, 4); ctx.lineTo(2, 4); ctx.lineTo(-4, 10);
          ctx.lineTo(-8, 8); ctx.lineTo(-4, 3); ctx.lineTo(-10, 3);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
        else if (tile === 'V') {
          // Beaver
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.fillStyle = 'rgba(255, 170, 102, 0.25)';
          ctx.strokeStyle = '#ffaa66';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ffaa66';
          
          // Beaver tail
          ctx.fillStyle = '#ffaa66';
          ctx.fillRect(-17, 0, 6, 4);
          
          // Beaver body
          ctx.fillStyle = 'rgba(255, 170, 102, 0.25)';
          ctx.fillRect(-12, -6, 24, 14);
          ctx.strokeRect(-12, -6, 24, 14);
          
          // Buck teeth
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(8, 2, 2, 4);
          ctx.fillRect(10, 2, 2, 4);
          
          // Orange glowing eyes
          ctx.fillStyle = '#ffaa66';
          ctx.fillRect(4, -3, 3, 2);
          
          ctx.restore();
        }
        else if (tile === 'K') {
          // Kangaroo
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.fillStyle = 'rgba(255, 170, 0, 0.25)';
          ctx.strokeStyle = '#ffaa00';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ffaa00';
          
          // Body (tall)
          ctx.fillRect(-8, -12, 16, 24);
          ctx.strokeRect(-8, -12, 16, 24);
          
          // Ears
          ctx.fillStyle = '#ffaa00';
          ctx.fillRect(-6, -18, 3, 6);
          ctx.fillRect(3, -18, 3, 6);
          
          // Tail
          ctx.fillRect(-13, 6, 5, 4);
          
          ctx.restore();
        }
        else if (tile === 'M') {
          // Security Drone Monster
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          
          if (headLoaded) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(playerHead, -10, -10, 20, 20);
            ctx.restore();
          } else {
            ctx.fillStyle = 'rgba(28, 28, 48, 0.85)';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();
          }
          
          ctx.strokeStyle = '#ff0064';
          ctx.lineWidth = 1.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#ff0064';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.stroke();
          
          // Eye visor
          ctx.fillStyle = '#ff0064';
          ctx.fillRect(-4, -2, 8, 3);
          
          // Wings
          ctx.fillRect(-13, -1, 3, 2);
          ctx.fillRect(10, -1, 3, 2);
          ctx.restore();
        }
        else if (tile === 'E') {
          // Exit Portal
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.strokeStyle = 'hsl(280, 100%, 65%)';
          ctx.shadowBlur = 10;
          ctx.shadowColor = 'hsl(280, 100%, 65%)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 1.5);
          ctx.stroke();
          ctx.strokeStyle = 'hsl(320, 100%, 60%)';
          ctx.beginPath();
          ctx.arc(0, 0, 10, Math.PI * 0.5, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        else if (tile === 'P') {
          // Player Spawn
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          const headSize = 28;
          if (headLoaded) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(0, 0, headSize / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(playerHead, -headSize / 2, -headSize / 2, headSize, headSize);
            ctx.restore();
          } else {
            ctx.fillStyle = '#0f0';
            ctx.beginPath();
            ctx.arc(0, 0, headSize/2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = 2.5;
          ctx.shadowBlur = 8;
          ctx.shadowColor = primaryColor;
          ctx.beginPath();
          ctx.arc(0, 0, headSize / 2 + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        else if (tile === 'L') {
          // Turret
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.fillStyle = 'rgba(100, 100, 120, 0.6)';
          ctx.strokeStyle = '#ff4400';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ff4400';
          ctx.fillRect(-12, -6, 24, 12);
          ctx.strokeRect(-12, -6, 24, 12);
          ctx.fillStyle = '#ff4400';
          ctx.fillRect(8, -3, 10, 6);
          ctx.restore();
        }
        else if (tile === 'W') {
          // Ground Walker
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.fillStyle = 'rgba(40, 40, 60, 0.8)';
          ctx.strokeStyle = '#ff8800';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#ff8800';
          ctx.fillRect(-10, -8, 20, 14);
          ctx.strokeRect(-10, -8, 20, 14);
          ctx.fillStyle = '#ff8800';
          ctx.fillRect(-6, -5, 12, 4);
          ctx.fillRect(-10, 6, 6, 4);
          ctx.fillRect(4, 6, 6, 4);
          ctx.restore();
        }
        else if (tile === '1' || tile === '2' || tile === '3') {
          // Key tiles
          const keyColors = { '1': '#ff4444', '2': '#4488ff', '3': '#44ff44' };
          const kColor = keyColors[tile];
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.shadowBlur = 10;
          ctx.shadowColor = kColor;
          ctx.strokeStyle = kColor;
          ctx.fillStyle = kColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -4, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillRect(-2, 2, 4, 10);
          ctx.fillRect(-4, 8, 8, 3);
          ctx.restore();
        }
        else if (tile === '!' || tile === '@' || tile === '$') {
          // Door tiles
          const doorColors = { '!': '#ff4444', '@': '#4488ff', '$': '#44ff44' };
          const dColor = doorColors[tile];
          ctx.save();
          ctx.fillStyle = dColor + '40';
          ctx.strokeStyle = dColor;
          ctx.lineWidth = 3;
          ctx.shadowBlur = 8;
          ctx.shadowColor = dColor;
          ctx.fillRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeRect(x + 2, y + 2, cellSize - 4, cellSize - 4);
          ctx.strokeStyle = dColor + 'aa';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x + cellSize/2, y + 4);
          ctx.lineTo(x + cellSize/2, y + cellSize - 4);
          ctx.stroke();
          ctx.restore();
        }
        else if (tile === 'T') {
          // Teleporter
          ctx.save();
          ctx.translate(x + cellSize/2, y + cellSize/2);
          ctx.strokeStyle = '#ff00ff';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#ff00ff';
          ctx.beginPath();
          ctx.arc(0, 0, 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = '#00ffff';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, Math.PI * 1.5);
          ctx.stroke();
          ctx.fillStyle = '#ff00ff';
          ctx.beginPath();
          ctx.arc(0, 0, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        else if (tile === 'Z') {
          // Gravity Zone
          ctx.save();
          ctx.fillStyle = 'rgba(180, 100, 255, 0.15)';
          ctx.strokeStyle = 'rgba(180, 100, 255, 0.6)';
          ctx.lineWidth = 2;
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#b464ff';
          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          ctx.strokeRect(x + 1, y + 1, cellSize - 2, cellSize - 2);
          // Draw up arrows
          ctx.fillStyle = 'rgba(180, 100, 255, 0.6)';
          ctx.beginPath();
          ctx.moveTo(x + cellSize/2 - 6, y + cellSize/2 + 4);
          ctx.lineTo(x + cellSize/2, y + cellSize/2 - 8);
          ctx.lineTo(x + cellSize/2 + 6, y + cellSize/2 + 4);
          ctx.fill();
          ctx.restore();
        }
      }
    }
    
    // 3. Draw Selected Cell Highlight (glowing gold selector block)
    if (selectedCell) {
      const sx = selectedCell.c * cellSize;
      const sy = selectedCell.r * cellSize;
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 3;
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#ffff00';
      ctx.strokeRect(sx, sy, cellSize, cellSize);
      ctx.shadowBlur = 0;
    }
  }

  // Paint tile at coordinate cell
  function paintCell(r, c) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return;
    
    // Border boundaries restriction
    if ((r === 0 || r === rows - 1 || c === 0 || c === cols - 1) && currentBrush !== '#' && currentBrush !== 'I' && currentBrush !== '!' && currentBrush !== '@' && currentBrush !== '$') {
      return; 
    }
    
    // Cycle spike on same brush click (check if both are any type of spike)
    if (['^', '>', 'v', '<'].includes(gridData[r][c]) && ['^', '>', 'v', '<'].includes(currentBrush)) {
      rotateTileAt(r, c);
      return;
    }
    
    // Clear old spawn, portal, or gun single-instances
    if (currentBrush === 'P' || currentBrush === 'E' || currentBrush === 'G') {
      for (let gr = 0; gr < rows; gr++) {
        for (let gc = 0; gc < cols; gc++) {
          if (gridData[gr][gc] === currentBrush) {
            gridData[gr][gc] = ' ';
          }
        }
      }
    }

    gridData[r][c] = currentBrush;
    exportLevelData(false);
    drawEditor();
  }

  // Rotate tile at coordinates
  function rotateTileAt(r, c) {
    const tile = gridData[r][c];
    let nextTile = tile;
    
    if (tile === '^') nextTile = '>';
    else if (tile === '>') nextTile = 'v';
    else if (tile === 'v') nextTile = '<';
    else if (tile === '<') nextTile = '^';
    
    if (nextTile !== tile) {
      gridData[r][c] = nextTile;
      exportLevelData(false);
      drawEditor();
      updateSelectionUI();
    }
  }

  // Mouse coordinate resolution
  function getMouseGridCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    
    return {
      r: Math.max(0, Math.min(rows - 1, Math.floor(clickY / cellSize))),
      c: Math.max(0, Math.min(cols - 1, Math.floor(clickX / cellSize)))
    };
  }

  // Mouse Listener Bindings
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const coords = getMouseGridCoords(e);
    
    if (e.button === 0) { // Left click selects & draws
      saveHistory(); // Save state before painting
      selectedCell = coords;
      isDrawing = true;
      lastPaintedCell = coords;
      paintCell(coords.r, coords.c);
    } else if (e.button === 2) { // Right click selects & rotates
      saveHistory(); // Save state before rotating
      selectedCell = coords;
      rotateTileAt(coords.r, coords.c);
    }
    updateSelectionUI();
  });

  canvas.addEventListener('mousemove', (e) => {
    if (isDrawing) {
      const coords = getMouseGridCoords(e);
      // Only paint if the cursor moved to a different cell to avoid rapid cycling
      if (!lastPaintedCell || lastPaintedCell.r !== coords.r || lastPaintedCell.c !== coords.c) {
        selectedCell = coords;
        lastPaintedCell = coords;
        paintCell(coords.r, coords.c);
        updateSelectionUI();
      }
    }
  });

  window.addEventListener('mouseup', () => {
    isDrawing = false;
    lastPaintedCell = null;
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // prevent browser context menu
  });

  // Hotkey R to rotate selection, Ctrl+Z to undo, Ctrl+Y to redo
  window.addEventListener('keydown', (e) => {
    // Only check hotkeys if editor screen is currently active
    if (game.gameState === 'LEVEL_EDITOR') {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        return; // ignore if typing a name
      }
      
      // Ctrl+Z (Undo) and Ctrl+Y / Ctrl+Shift+Z (Redo)
      if (e.ctrlKey) {
        if (e.code === 'KeyZ') {
          e.preventDefault();
          if (e.shiftKey) {
            redo();
          } else {
            undo();
          }
        } else if (e.code === 'KeyY') {
          e.preventDefault();
          redo();
        }
      } else if (e.code === 'KeyR') {
        saveHistory();
        if (selectedCell) {
          rotateTileAt(selectedCell.r, selectedCell.c);
        }
      }
    }
  });

  // Brush palette selection hooks
  const brushItems = document.querySelectorAll('.brush-item');
  brushItems.forEach((item) => {
    item.addEventListener('click', () => {
      brushItems.forEach(b => b.classList.remove('active'));
      item.classList.add('active');
      currentBrush = item.getAttribute('data-tile');
    });
  });

  // Export grid state as levels JSON
  function exportLevelData(alertUser = true) {
    const customLevel = {
      name: lvlNameInput.value.trim() || "CUSTOM ZONE",
      width: cols,
      height: rows,
      theme: parseInt(lvlThemeSelect.value) || 1,
      primaryColor: primaryColorInput ? primaryColorInput.value : '#00f2fe',
      secondaryColor: secondaryColorInput ? secondaryColorInput.value : '#00f2fe',
      gridColor: gridColorInput ? gridColorInput.value : '#00f2fe',
      map: gridData.map(row => row.join('')),
      movingPlatforms: [],
      patrols: []
    };
    
    const hasSpawn = gridData.some(row => row.includes('P'));
    const hasExit = gridData.some(row => row.includes('E'));
    
    if (!hasSpawn) {
      customLevel.map[rows - 3] = customLevel.map[rows - 3].substring(0, 2) + 'P' + customLevel.map[rows - 3].substring(3);
    }
    if (!hasExit) {
      customLevel.map[rows - 3] = customLevel.map[rows - 3].substring(0, cols - 3) + 'E' + customLevel.map[rows - 3].substring(cols - 2);
    }

    const jsonStr = JSON.stringify(customLevel);
    jsonArea.value = jsonStr;
    
    if (alertUser) {
      navigator.clipboard.writeText(jsonStr);
      alert("Level exported and copied to clipboard!");
    }
    return customLevel;
  }

  // Import JSON level representation
  function importLevelData() {
    const dataStr = prompt("Paste exported Level JSON:");
    if (!dataStr) return;
    
    try {
      saveHistory(); // Save state before importing new data!
      const parsed = JSON.parse(dataStr);
      if (!parsed.map || !parsed.width || !parsed.height) {
        throw new Error("Invalid Level JSON structure.");
      }
      
      lvlNameInput.value = parsed.name || "IMPORTED LEVEL";
      lvlThemeSelect.value = String(parsed.theme || 1);
      
      if (primaryColorInput) primaryColorInput.value = parsed.primaryColor || '#00f2fe';
      if (secondaryColorInput) secondaryColorInput.value = parsed.secondaryColor || '#00f2fe';
      if (gridColorInput) gridColorInput.value = parsed.gridColor || '#00f2fe';
      
      const newWidth = parsed.width || parsed.map[0].length;
      const newHeight = parsed.height || parsed.map.length;
      
      if (lvlWidthInput) lvlWidthInput.value = String(newWidth);
      if (lvlHeightInput) lvlHeightInput.value = String(newHeight);
      
      rows = newHeight;
      cols = newWidth;
      canvas.width = cols * cellSize;
      canvas.height = rows * cellSize;
      
      gridData = Array(rows).fill(null).map((_, r) => {
        return Array(cols).fill(null).map((_, c) => {
          return parsed.map[r][c] || ' ';
        });
      });
      
      exportLevelData(false);
      drawEditor();
      updateSelectionUI();
      alert("Level imported successfully!");
    } catch (e) {
      alert("Failed to parse JSON: " + e.message);
    }
  }

  // Clear Editor Grid
  function clearGrid() {
    if (!confirm("Are you sure you want to clear the grid?")) return;
    
    saveHistory(); // Save state before clearing!
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          gridData[r][c] = '#';
        } else {
          gridData[r][c] = ' ';
        }
      }
    }
    gridData[rows - 3][2] = 'P';
    gridData[rows - 3][cols - 3] = 'E';
    
    exportLevelData(false);
    drawEditor();
    updateSelectionUI();
  }

  // Undo/Redo functions
  function undo() {
    if (undoStack.length === 0) return;
    const currentSnapshot = gridData.map(row => [...row]);
    redoStack.push(currentSnapshot);
    
    gridData = undoStack.pop();
    
    // Update variables & UI
    rows = gridData.length;
    cols = gridData[0].length;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    if (lvlWidthInput) lvlWidthInput.value = cols;
    if (lvlHeightInput) lvlHeightInput.value = rows;
    
    exportLevelData(false);
    drawEditor();
    updateSelectionUI();
  }

  function redo() {
    if (redoStack.length === 0) return;
    const currentSnapshot = gridData.map(row => [...row]);
    undoStack.push(currentSnapshot);
    
    gridData = redoStack.pop();
    
    // Update variables & UI
    rows = gridData.length;
    cols = gridData[0].length;
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    if (lvlWidthInput) lvlWidthInput.value = cols;
    if (lvlHeightInput) lvlHeightInput.value = rows;
    
    exportLevelData(false);
    drawEditor();
    updateSelectionUI();
  }

  // Fill inside area with selected brush
  function fillGrid() {
    if (currentBrush === 'P' || currentBrush === 'E' || currentBrush === 'G') {
      alert("Cannot fill the map with player spawn, exit portal, or cyber blaster. These must be single instances!");
      return;
    }
    
    const tileName = getTileName(currentBrush);
    if (!confirm(`Are you sure you want to fill all interior cells with ${tileName}?`)) return;
    
    saveHistory();
    
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        // Retain player spawn and exit portal
        if (gridData[r][c] === 'P' || gridData[r][c] === 'E') {
          continue;
        }
        gridData[r][c] = currentBrush;
      }
    }
    
    exportLevelData(false);
    drawEditor();
    updateSelectionUI();
  }

  // Upload Custom Level to Cloudflare Worker
  async function uploadCustomLevel() {
    const levelData = exportLevelData(false);
    
    const levelName = prompt("Enter Level Name:", levelData.name || "My Custom Level");
    if (levelName === null) return; // cancel
    if (!levelName.trim()) {
      alert("Level name cannot be empty!");
      return;
    }
    
    const authorName = prompt("Enter Author Name:", "Anonymous");
    if (authorName === null) return; // cancel
    
    const finalLevelData = {
      ...levelData,
      name: levelName.trim(),
      author: authorName.trim() || "Anonymous"
    };
    
    // Save to local storage custom worker URL if overridden, or default
    const DEFAULT_WORKER_URL = '';
    const WORKER_URL = localStorage.getItem('cederic_custom_worker_url') || DEFAULT_WORKER_URL;
    
    const uploadBtn = document.getElementById('editor-upload-btn');
    const originalText = uploadBtn.innerText;
    uploadBtn.innerText = "UPLOADING...";
    uploadBtn.disabled = true;
    
    try {
      const res = await fetch(`${WORKER_URL}/api/levels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(finalLevelData)
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP error ${res.status}`);
      }
      
      const resData = await res.json();
      alert(`Success! Level uploaded to Cloudflare Community.\nID: ${resData.id}`);
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      uploadBtn.innerText = originalText;
      uploadBtn.disabled = false;
    }
  }

  // DOM Button Trigger Listeners
  document.getElementById('editor-clear-btn').addEventListener('click', clearGrid);
  document.getElementById('editor-export-btn').addEventListener('click', () => exportLevelData(true));
  document.getElementById('editor-import-btn').addEventListener('click', importLevelData);
  document.getElementById('editor-undo-btn').addEventListener('click', undo);
  document.getElementById('editor-redo-btn').addEventListener('click', redo);
  document.getElementById('editor-fill-btn').addEventListener('click', fillGrid);
  document.getElementById('editor-upload-btn').addEventListener('click', uploadCustomLevel);
  if (rotateBtn) rotateBtn.addEventListener('click', () => {
    if (selectedCell) {
      saveHistory(); // Save history before rotation
      rotateTileAt(selectedCell.r, selectedCell.c);
    }
  });
  
  document.getElementById('editor-play-btn').addEventListener('click', () => {
    const levelData = exportLevelData(false);
    game.triggerLevelTransition(() => {
      game.loadCustomLevel(levelData);
      game.setGameState('PLAYING');
    });
  });

  document.getElementById('editor-back-btn').addEventListener('click', () => {
    game.setGameState('MENU');
  });

  // Toggler from Main Menu
  const editorBtn = document.getElementById('level-editor-btn');
  if (editorBtn) {
    editorBtn.addEventListener('click', () => {
      game.setGameState('LEVEL_EDITOR');
      document.getElementById('level-editor-screen').classList.add('active');
      
      // Update editor player head preview based on selected sex
      let imgSrc = './character.jpg';
      if (game.playerSex === 'female') {
        imgSrc = './female_avatar.png';
      } else if (game.playerSex === 'cyber') {
        imgSrc = './cyber_avatar.png';
      }
      playerHead.src = imgSrc;
      
      // Auto-set initial color picker values matching theme
      const initialTheme = parseInt(lvlThemeSelect.value) || 1;
      const colors = themeColors[initialTheme];
      if (colors && primaryColorInput && secondaryColorInput && gridColorInput) {
        primaryColorInput.value = colors.primary;
        secondaryColorInput.value = colors.secondary;
        gridColorInput.value = colors.grid;
      }
      
      // Reset width/height inputs to defaults
      rows = 15;
      cols = 25;
      if (lvlWidthInput) lvlWidthInput.value = '25';
      if (lvlHeightInput) lvlHeightInput.value = '15';
      canvas.width = cols * cellSize;
      canvas.height = rows * cellSize;
      
      // Re-initialize clean gridData
      gridData = Array(rows).fill(null).map((_, r) => {
        return Array(cols).fill(null).map((_, c) => {
          if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
            return '#';
          }
          return ' ';
        });
      });
      gridData[rows - 3][2] = 'P';
      gridData[rows - 3][cols - 3] = 'E';
      
      selectedCell = { r: rows - 3, c: 2 }; // highlight spawn
      drawEditor();
      updateSelectionUI();
      exportLevelData(false);
    });
  }

  // Hook color updates to re-export
  const colorChangeHandler = () => {
    exportLevelData(false);
    drawEditor();
  };
  if (primaryColorInput) primaryColorInput.addEventListener('input', colorChangeHandler);
  if (secondaryColorInput) secondaryColorInput.addEventListener('input', colorChangeHandler);
  if (gridColorInput) gridColorInput.addEventListener('input', colorChangeHandler);

  // Hook name & theme select changes
  lvlNameInput.addEventListener('input', () => exportLevelData(false));
  lvlThemeSelect.addEventListener('change', () => {
    const themeIdx = parseInt(lvlThemeSelect.value) || 1;
    const colors = themeColors[themeIdx];
    if (colors && primaryColorInput && secondaryColorInput && gridColorInput) {
      primaryColorInput.value = colors.primary;
      secondaryColorInput.value = colors.secondary;
      gridColorInput.value = colors.grid;
    }
    exportLevelData(false);
    drawEditor();
  });

  // Dynamic grid resizing function
  function resizeGrid(newRows, newCols) {
    newRows = Math.max(10, Math.min(30, newRows));
    newCols = Math.max(15, Math.min(100, newCols));
    
    saveHistory(); // Save state before resizing grid!
    
    const oldRows = rows;
    const oldCols = cols;
    
    rows = newRows;
    cols = newCols;
    
    canvas.width = cols * cellSize;
    canvas.height = rows * cellSize;
    
    const newGrid = Array(rows).fill(null).map((_, r) => {
      return Array(cols).fill(null).map((_, c) => {
        // Outer border
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          return '#';
        }
        // Copy original inner tiles if within bounds
        if (r > 0 && r < oldRows - 1 && c > 0 && c < oldCols - 1) {
          return gridData[r][c];
        }
        return ' ';
      });
    });
    
    gridData = newGrid;
    
    // Ensure Spawn 'P' and Exit 'E' exist inside inner area
    let hasSpawn = false;
    let hasExit = false;
    for (let r = 1; r < rows - 1; r++) {
      for (let c = 1; c < cols - 1; c++) {
        if (gridData[r][c] === 'P') hasSpawn = true;
        if (gridData[r][c] === 'E') hasExit = true;
      }
    }
    
    if (!hasSpawn) {
      gridData[rows - 3][2] = 'P';
    }
    if (!hasExit) {
      gridData[rows - 3][cols - 3] = 'E';
    }
    
    exportLevelData(false);
    drawEditor();
    updateSelectionUI();
  }

  // Hook size input listeners
  if (lvlWidthInput) {
    lvlWidthInput.addEventListener('change', () => {
      const w = parseInt(lvlWidthInput.value) || 25;
      resizeGrid(rows, w);
    });
  }
  
  if (lvlHeightInput) {
    lvlHeightInput.addEventListener('change', () => {
      const h = parseInt(lvlHeightInput.value) || 15;
      resizeGrid(h, cols);
    });
  }
}
