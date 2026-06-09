// Level manager that imports maps dynamically from the root levels/ directory.
import level1 from '../levels/level1.json';
import level2 from '../levels/level2.json';
import level3 from '../levels/level3.json';
import level4 from '../levels/level4.json';
import level5 from '../levels/level5.json';
import level6 from '../levels/level6.json';

// Legend:
// ' ' : Empty air
// '#' : Solid cyber block
// '_' : Semi-solid platform (jump through from bottom)
// '^' : Floor spikes (danger)
// '<' : Left spikes (danger)
// '>' : Right spikes (danger)
// 'v' : Ceiling spikes (danger)
// '*' : Collectible coin
// 'P' : Player spawn point
// 'E' : Exit Portal
// 'B' : Bounce pad
// 'I' : Ice block (slippery solid)
// 'H' : Patrol Enemy (moves horizontally)
// 'G' : Gun pickup (Cyber Blaster)
// 'M' : Security Drone (flying AI enemy)
// 'L' : Turret (stationary rotating cannon)
// 'W' : Ground Walker (gravity-bound patrol bot)
// '1' : Red Key
// '2' : Blue Key
// '3' : Green Key
// '!' : Red Door (solid until red key collected)
// '@' : Blue Door (solid until blue key collected)
// '$' : Green Door (solid until green key collected)
// 'T' : Teleporter pad (paired)
// 'Z' : Gravity Zone (reverses gravity)

export const LEVEL_THEMES = {
  1: {
    primary: 'hsl(190, 100%, 50%)', // Neon Blue
    secondary: 'rgba(0, 242, 254, 0.15)',
    gridColor: 'rgba(0, 242, 254, 0.05)',
    name: 'MAINFRAME ENTRANCE'
  },
  2: {
    primary: 'hsl(320, 100%, 60%)', // Neon Pink
    secondary: 'rgba(255, 0, 120, 0.15)',
    gridColor: 'rgba(255, 0, 120, 0.05)',
    name: 'SECURITY GRID'
  },
  3: {
    primary: 'hsl(140, 100%, 55%)', // Neon Green
    secondary: 'rgba(0, 255, 120, 0.15)',
    gridColor: 'rgba(0, 255, 120, 0.05)',
    name: 'DATA STREAM'
  },
  4: {
    primary: 'hsl(50, 100%, 50%)', // Neon Yellow / Gold
    secondary: 'rgba(255, 200, 0, 0.15)',
    gridColor: 'rgba(255, 200, 0, 0.05)',
    name: 'THE INNER CORE'
  },
  5: {
    primary: 'hsl(0, 100%, 50%)', // Corrupted Red
    secondary: 'rgba(255, 0, 0, 0.15)',
    gridColor: 'rgba(255, 0, 0, 0.05)',
    name: 'MAINFRAME CORE'
  },
  6: {
    primary: 'hsl(270, 100%, 65%)', // Quantum Purple
    secondary: 'rgba(180, 100, 255, 0.15)',
    gridColor: 'rgba(180, 100, 255, 0.05)',
    name: 'QUANTUM NEXUS'
  }
};

export const LEVELS = [
  level1,
  level2,
  level3,
  level4,
  level5,
  level6
];
