// Particle system for CedericWoyFormer

class Particle {
  constructor(x, y, vx, vy, color, size, maxLife, type = 'dust') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = maxLife;
    this.maxLife = maxLife;
    this.type = type;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;

    if (this.type === 'dust') {
      this.vy += 2 * dt; // slight gravity
      this.size = Math.max(0.1, this.size * (1 - dt * 2));
    } else if (this.type === 'coin') {
      this.vx += Math.sin(this.life * 10) * 2; // wobbly drift
      this.size = Math.max(0.1, this.size * (1 - dt * 1));
    } else if (this.type === 'hazard') {
      this.vy += 8 * dt; // heavier gravity
      this.vx *= 0.98; // air resistance
    } else if (this.type === 'dash') {
      this.size = Math.max(0.1, this.size * (1 - dt * 4));
    } else if (this.type === 'portal') {
      // Swirling motion around a center point
      // (center is passed in vx/vy initially, but here we just simulate slow rising + vortex)
      this.vy -= 10 * dt;
      this.vx += Math.sin(this.life * 5) * 5;
    } else if (this.type === 'electricity') {
      this.size = Math.max(0.1, this.size * (1 - dt * 6));
      this.vx += (Math.random() - 0.5) * 800 * dt;
      this.vy += (Math.random() - 0.5) * 800 * dt;
    } else if (this.type === 'shield') {
      this.vx *= 0.95;
      this.vy *= 0.95;
      this.size = Math.max(0.1, this.size * (1 - dt * 2.5));
    } else if (this.type === 'gravity_float') {
      this.vy -= 30 * dt;
      this.vx += Math.sin(this.life * 8) * 3;
      this.size = Math.max(0.1, this.size * (1 - dt * 1.5));
    } else if (this.type === 'teleport') {
      const angle = this.life * 12;
      this.vx = Math.cos(angle) * 60;
      this.vy = Math.sin(angle) * 60 - 40;
      this.size = Math.max(0.1, this.size * (1 - dt * 3));
    }
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    
    // Draw glowing circles or squares
    const isGlowing = this.type === 'coin' || this.type === 'hazard' || this.type === 'portal' || this.type === 'electricity' || this.type === 'shield' || this.type === 'teleport';
    
    if (this.type === 'dust' || this.type === 'hazard' || this.type === 'electricity') {
      // Performance optimization: Render fast retro square block particles instead of arcs
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x - this.size, this.y - this.size, this.size * 2, this.size * 2);
    } else {
      if (isGlowing) {
        // Draw outer soft glow circle
        ctx.globalAlpha = alpha * 0.35;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  clear() {
    this.particles = [];
  }

  createRunningDust(x, y, dir) {
    // Spawns dust particles behind the player (opposite to velocity direction)
    const count = Math.random() > 0.6 ? 1 : 0;
    for (let i = 0; i < count; i++) {
      const vx = -dir * (20 + Math.random() * 30);
      const vy = -Math.random() * 20 - 5;
      const size = 2 + Math.random() * 3;
      const life = 0.3 + Math.random() * 0.3;
      this.particles.push(new Particle(x, y, vx, vy, 'rgba(0, 242, 254, 0.4)', size, life, 'dust'));
    }
  }

  createJumpBurst(x, y) {
    // Spawns dust burst downwards when player jumps or lands
    const count = 12 + Math.floor(Math.random() * 8);
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * (Math.random() * 0.6 + 0.2); // directed downwards-ish
      const speed = 40 + Math.random() * 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 3 + Math.random() * 4;
      const life = 0.4 + Math.random() * 0.4;
      this.particles.push(new Particle(x, y, vx, vy, 'rgba(255, 255, 255, 0.6)', size, life, 'dust'));
    }
  }

  createCoinSparkles(x, y) {
    // Spawns floating golden stars/circles when coin is collected
    const count = 10 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 50;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 20; // bias upwards
      const size = 2 + Math.random() * 3;
      const life = 0.5 + Math.random() * 0.5;
      this.particles.push(new Particle(x, y, vx, vy, '#ffd700', size, life, 'coin'));
    }
  }

  createDashTrail(x, y, color = 'rgba(0, 242, 254, 0.6)') {
    // Spawns trailing ghosts/particles behind the player
    const count = 2;
    for (let i = 0; i < count; i++) {
      const vx = (Math.random() - 0.5) * 10;
      const vy = (Math.random() - 0.5) * 10;
      const size = 4 + Math.random() * 6;
      const life = 0.2 + Math.random() * 0.15;
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'dash'));
    }
  }

  createExplosion(x, y, color = '#ff0064') {
    // Explodes the player on death
    const count = 40 + Math.floor(Math.random() * 20);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 140;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 3 + Math.random() * 5;
      const life = 0.6 + Math.random() * 0.8;
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'hazard'));
    }
  }

  createPortalGlow(x, y) {
    // Swirling portal particles
    if (Math.random() > 0.4) return;
    const offsetAngle = Math.random() * Math.PI * 2;
    const distance = 15 + Math.random() * 15;
    const px = x + Math.cos(offsetAngle) * distance;
    const py = y + Math.sin(offsetAngle) * distance;
    
    // speed towards center + slow rise
    const vx = -Math.cos(offsetAngle) * 10;
    const vy = -Math.sin(offsetAngle) * 10 - 20;
    const size = 1.5 + Math.random() * 2.5;
    const life = 0.6 + Math.random() * 0.6;
    
    // Choose neon purple or neon green
    const color = Math.random() > 0.5 ? 'hsl(280, 100%, 70%)' : 'hsl(320, 100%, 65%)';
    this.particles.push(new Particle(px, py, vx, vy, color, size, life, 'portal'));
  }

  update(dt) {
    // Performance optimization: limit max particle array length to prevent memory/render drops
    if (this.particles.length > 250) {
      this.particles.splice(0, this.particles.length - 250);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    ctx.save();
    for (const p of this.particles) {
      p.draw(ctx);
    }
    ctx.restore();
  }

  createBossShockwave(x, y) {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      const speed = 150 + Math.random() * 200;
      const vx = dir * speed;
      const vy = -15 - Math.random() * 20; // low vertical drift
      const size = 3 + Math.random() * 4;
      const life = 0.4 + Math.random() * 0.3;
      this.particles.push(new Particle(x, y, vx, vy, '#ff0000', size, life, 'hazard'));
    }
  }

  createBossGlitchParticles(x, y) {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 120;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 2 + Math.random() * 5;
      const life = 0.5 + Math.random() * 0.5;
      const color = Math.random() > 0.5 ? '#ff0000' : (Math.random() > 0.5 ? '#ff0055' : '#000000');
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'hazard'));
    }
  }

  createElectricityBurst(x, y) {
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + Math.random() * 120;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 1.5 + Math.random() * 2.5;
      const life = 0.15 + Math.random() * 0.2;
      const color = Math.random() > 0.5 ? '#88ccff' : '#ffffff';
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'electricity'));
    }
  }

  createShieldShimmer(x, y, radius) {
    if (Math.random() > 0.3) return;
    const angle = Math.random() * Math.PI * 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    const vx = Math.cos(angle + Math.PI / 2) * 20;
    const vy = Math.sin(angle + Math.PI / 2) * 20;
    const size = 1.5 + Math.random() * 2;
    const life = 0.4 + Math.random() * 0.3;
    this.particles.push(new Particle(px, py, vx, vy, 'rgba(0, 200, 255, 0.7)', size, life, 'shield'));
  }

  createGravityFloatParticles(x, y, w, h) {
    if (Math.random() > 0.15) return;
    const px = x + Math.random() * w;
    const py = y + Math.random() * h;
    const vx = (Math.random() - 0.5) * 15;
    const vy = -10 - Math.random() * 20;
    const size = 1 + Math.random() * 2;
    const life = 0.8 + Math.random() * 0.6;
    const color = Math.random() > 0.5 ? 'rgba(180, 100, 255, 0.5)' : 'rgba(255, 150, 255, 0.4)';
    this.particles.push(new Particle(px, py, vx, vy, color, size, life, 'gravity_float'));
  }

  createTeleportBurst(x, y) {
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 80;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      const size = 2 + Math.random() * 3;
      const life = 0.4 + Math.random() * 0.4;
      const color = Math.random() > 0.5 ? '#ff00ff' : '#00ffff';
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'teleport'));
    }
  }

  createKeySparkles(x, y, color) {
    const count = 15;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 60;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed - 20;
      const size = 2 + Math.random() * 3;
      const life = 0.5 + Math.random() * 0.5;
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'coin'));
    }
  }

  createWalkerSparks(x, y, dir) {
    const count = Math.random() > 0.7 ? 2 : 0;
    for (let i = 0; i < count; i++) {
      const vx = -dir * (10 + Math.random() * 20);
      const vy = -Math.random() * 15 - 5;
      const size = 1 + Math.random() * 2;
      const life = 0.2 + Math.random() * 0.15;
      this.particles.push(new Particle(x, y, vx, vy, '#ff8800', size, life, 'dust'));
    }
  }

  createTurretMuzzleFlash(x, y, angle) {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 0.5;
      const a = angle + spread;
      const speed = 60 + Math.random() * 80;
      const vx = Math.cos(a) * speed;
      const vy = Math.sin(a) * speed;
      const size = 2 + Math.random() * 2;
      const life = 0.1 + Math.random() * 0.15;
      this.particles.push(new Particle(x, y, vx, vy, '#ff4400', size, life, 'hazard'));
    }
  }

  createDoorDissolve(x, y, w, h, color) {
    const count = 25;
    for (let i = 0; i < count; i++) {
      const px = x + Math.random() * w;
      const py = y + Math.random() * h;
      const vx = (Math.random() - 0.5) * 60;
      const vy = -20 - Math.random() * 40;
      const size = 2 + Math.random() * 3;
      const life = 0.5 + Math.random() * 0.5;
      this.particles.push(new Particle(px, py, vx, vy, color, size, life, 'coin'));
    }
  }
}
export const particles = new ParticleSystem();
