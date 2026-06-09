# Cederic WoyFormer 🕹️⚡

A chiptune, modern retro vector platformer built with HTML5 Canvas, Vanilla JS, and styled with cyber-neon glassmorphism. Create your own custom levels with a built-in interactive editor featuring undo/redo history, and share/download custom zones instantly with the Cloudflare Pages Functions serverless KV database backend.

## Key Features
- **Fluid Cyber-Dash Physics**: Perform diagonal, horizontal, and vertical dashes with velocity vector normalization.
- **Player Customization**: Select player sex/avatar with state persistence across play-throughs.
- **Advanced Beaver Carrying & Throwing Mechanics**: Safe pickup and carrying of AIs. Charge throw trajectory vectors and launch to trigger blood red explosions and screen-space camera shakes on impact.
- **Destructible Blocks**: Crack open hidden paths and crumble yellow grid barriers using beaver explosions.
- **Next-Gen Level Editor**: Equipped with custom brush palettes, paint fill, clean resizing constraints, and a complete Undo/Redo history stack (`Ctrl+Z` / `Ctrl+Y`).
- **Unified 2-in-1 Pages Backend**: Fetch campaign maps or share custom level designs seamlessly with built-in Cloudflare Pages Functions and KV storage.

## Controls Guide
- `A` / `D` (or `←` / `→`): Walk Left / Right
- `W` (or `↑` or `SPACE`): Jump / Double Jump
- `SHIFT` or `K`: Air Dash
- `E`: Pick up Beaver / Drop Beaver
- `Left Click` (Hold & Release): Charge throwing arc / Launch Beaver
- `R`: Quick Restart Level
- `ESC` or `P`: Pause Game

## Technical Specifications
- **Build Tool**: Vite 6
- **Graphics**: HTML5 Canvas Rendering Context 2D
- **Backend API**: Cloudflare Pages Functions (Serverless V8 Workers)
- **Database**: Cloudflare Workers Key-Value (KV) Storage
