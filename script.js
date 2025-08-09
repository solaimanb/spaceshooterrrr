(() => {
  'use strict';

  /*
   * Space Shooter Game Script
   * - Organized, documented, and mobile-first
   * - Sections follow a consistent order:
   *   1) Constants / Config
   *   2) DOM & Assets
   *   3) Sizing & Resolution
   *   4) Game State
   *   5) Entity Definitions & Collections
   *   6) Input
   *   7) Utilities
   *   8) Gameplay (spawning, logic)
   *   9) Game Loop & Update
   *  10) Rendering
   *  11) Bootstrap / Init
   */

  /**
   * 1) Constants / Config
   * Tunable numeric parameters for gameplay and rendering.
   */
  const CANVAS_WIDTH = 800;  // base landscape logical width
  const CANVAS_HEIGHT = 600; // base landscape logical height
  const PORTRAIT_WIDTH = 600;  // base portrait logical width
  const PORTRAIT_HEIGHT = 800; // base portrait logical height
  const PLAYER_SPEED = 320; // px/s
  const BULLET_SPEED = 700; // px/s
  const ENEMY_MIN_SPEED = 70; // px/s
  const ENEMY_MAX_SPEED = 160; // px/s
  const SHOOT_COOLDOWN_SEC = 0.22;
  const INVULNERABILITY_SEC = 1.5;
  const ENEMY_SPAWN_MIN_SEC = 0.45;
  const ENEMY_SPAWN_MAX_SEC = 0.9;
  const MAX_LIVES = 3;
  const POWERUP_DURATION_SEC = 5.0;
  const POWERUP_SPAWN_MIN_SEC = 8.0;
  const POWERUP_SPAWN_MAX_SEC = 16.0;
  const POWERUP_SPEED = 90;
  const ENEMY_BULLET_SPEED = 280; // px/s
  const ENEMY_SHOOT_MIN_SEC = 1.0;
  const ENEMY_SHOOT_MAX_SEC = 2.5;
  const DIFFICULTY_INTERVAL_SEC = 60; // every minute
  const DIFFICULTY_SPEED_STEP = 0.15; // +15% enemy speed per interval

  /**
   * 2) DOM & Assets
   */
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const overlayEl = document.getElementById('overlay');
  const helpEl = document.querySelector('.help');

  // Assets
  const jetImg = new Image();
  jetImg.src = 'public/jet.png';
  const enemyImg = new Image();
  enemyImg.src = 'public/enemy.png';

  /**
   * 3) Sizing & Resolution
   * Maintain a logical coordinate system decoupled from physical pixels.
   * The canvas backing store is sized to CSS size × devicePixelRatio.
   */
  let GAME_WIDTH = CANVAS_WIDTH;
  let GAME_HEIGHT = CANVAS_HEIGHT;
  let renderScaleX = 1;
  let renderScaleY = 1;
  let lastLogicalWidth = GAME_WIDTH;
  let lastLogicalHeight = GAME_HEIGHT;

  /**
   * Resize the backing store to match CSS size and devicePixelRatio.
   * Also adapts logical game size based on orientation (portrait vs landscape).
   */
  function resizeCanvas() {
    // Keep CSS aspect ratio from attributes; match backing store to CSS * DPR
    const rect = canvas.getBoundingClientRect();
    const devicePixelRatio = Math.max(1, window.devicePixelRatio || 1);
    const displayWidth = Math.max(1, Math.floor(rect.width * devicePixelRatio));
    const displayHeight = Math.max(1, Math.floor(rect.height * devicePixelRatio));

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    const isPortrait = rect.height > rect.width;
    const newGameWidth = isPortrait ? PORTRAIT_WIDTH : CANVAS_WIDTH;
    const newGameHeight = isPortrait ? PORTRAIT_HEIGHT : CANVAS_HEIGHT;

    // If logical size changed (e.g., orientation), rescale positions proportionally
    if (newGameWidth !== GAME_WIDTH || newGameHeight !== GAME_HEIGHT) {
      const scaleX = newGameWidth / GAME_WIDTH;
      const scaleY = newGameHeight / GAME_HEIGHT;

      player.x *= scaleX;
      player.y *= scaleY;
      for (const e of enemies) { e.x *= scaleX; e.y *= scaleY; }
      for (const b of bullets) { b.x *= scaleX; b.y *= scaleY; }
      for (const p of particles) { p.x *= scaleX; p.y *= scaleY; }

      GAME_WIDTH = newGameWidth;
      GAME_HEIGHT = newGameHeight;
      lastLogicalWidth = GAME_WIDTH;
      lastLogicalHeight = GAME_HEIGHT;

      // Clamp player after rescale
      player.x = clamp(player.x, 0, GAME_WIDTH - player.width);
      player.y = clamp(player.y, 0, GAME_HEIGHT - player.height);
    }

    renderScaleX = canvas.width / GAME_WIDTH;
    renderScaleY = canvas.height / GAME_HEIGHT;
  }

  /**
   * 4) Game State
   */
  let currentScore = 0;
  let remainingLives = MAX_LIVES;
  let gameState = 'playing'; // 'playing' | 'gameover'

  /**
   * 5) Entity Definitions & Collections
   * Define core entity shapes via JSDoc typedefs for clarity.
   */
  /** @typedef {{x:number,y:number,width:number,height:number,vy:number,shootTimerSec:number}} Enemy */
  /** @typedef {{x:number,y:number,width:number,height:number,vy:number}} PlayerBullet */
  /** @typedef {{x:number,y:number,life:number,dx:number,dy:number,color:string}} Particle */
  /** @typedef {{x:number,y:number,size:number,vy:number,type:'double'}} PowerUp */
  /** @typedef {{x:number,y:number,width:number,height:number,vx:number,vy:number}} EnemyBullet */

  const player = {
    x: CANVAS_WIDTH / 2 - 18,
    y: CANVAS_HEIGHT - 70,
    width: 36,
    height: 46,
    color: '#00e5ff',
    cooldownSec: 0,
    invulnerableSec: 0,
  };

  /** Collections */
  /** @type {Enemy[]} */
  let enemies = [];
  /** @type {PlayerBullet[]} */
  let bullets = [];
  /** @type {Particle[]} */
  let particles = [];
  /** @type {PowerUp[]} */
  let powerUps = [];
  /** @type {EnemyBullet[]} */
  let enemyBullets = [];

  /**
   * 6) Input
   * Keyboard and pointer input, with touch-friendly behavior.
   */
  const pressedKeys = new Set();
  let pointerActive = false;
  let pointerLogicalX = 0;
  let pointerLogicalY = 0;
  let shootRequested = false;
  let doubleShotSec = 0;
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    // Prevent page scroll on game keys
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();
    }
    pressedKeys.add(e.code);

    if (gameState === 'gameover' && e.code === 'Enter') {
      resetGame();
      return;
    }
  });
  window.addEventListener('keyup', (e) => {
    pressedKeys.delete(e.code);
  });

  /**
   * Convert a pointer event client position into logical game coordinates
   * based on current CSS size and GAME_WIDTH × GAME_HEIGHT.
   */
  function getPointerPosLogical(evt) {
    const rect = canvas.getBoundingClientRect();
    const xCss = evt.clientX - rect.left;
    const yCss = evt.clientY - rect.top;
    // Map CSS pixels to logical game coordinates (GAME_WIDTH × GAME_HEIGHT)
    const x = (xCss / Math.max(1, rect.width)) * GAME_WIDTH;
    const y = (yCss / Math.max(1, rect.height)) * GAME_HEIGHT;
    return { x, y };
  }

  function onPointerDown(evt) {
    evt.preventDefault();
    if (gameState === 'gameover') {
      resetGame();
      return;
    }
    pointerActive = true;
    const p = getPointerPosLogical(evt);
    pointerLogicalX = p.x;
    pointerLogicalY = p.y;
    shootRequested = true; // hold to auto-fire
  }
  function onPointerMove(evt) {
    if (!pointerActive) return;
    evt.preventDefault();
    const p = getPointerPosLogical(evt);
    pointerLogicalX = p.x;
    pointerLogicalY = p.y;
  }
  function onPointerUp() {
    pointerActive = false;
    shootRequested = false;
  }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  canvas.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('pointerleave', onPointerUp);

  /**
   * 7) Utilities
   */
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rectsOverlap(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /** Spawn a single enemy at a random X along the top. */
  function spawnEnemy() {
    const width = 36;
    const height = 36;
    const x = Math.random() * (GAME_WIDTH - width);
    const y = -height - 4;
    const vy = ENEMY_MIN_SPEED + Math.random() * (ENEMY_MAX_SPEED - ENEMY_MIN_SPEED);
    const shootTimerSec = randomRange(ENEMY_SHOOT_MIN_SEC, ENEMY_SHOOT_MAX_SEC);
    enemies.push({ x, y, width, height, vy, shootTimerSec });
  }

  /** Spawn a double-shot power-up (green orb). */
  function spawnPowerUp() {
    const size = 22;
    const x = Math.random() * (GAME_WIDTH - size);
    const y = -size - 6;
    powerUps.push({ x, y, size, vy: POWERUP_SPEED, type: 'double' });
  }

  /** Emit a particle explosion at (x,y). */
  function emitExplosion(x, y, color = '#ffd166', count = 12) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 220;
      particles.push({
        x,
        y,
        life: 0.6 + Math.random() * 0.6,
        dx: Math.cos(angle) * speed,
        dy: Math.sin(angle) * speed,
        color,
      });
    }
  }

  /** Fire player bullet(s); honors double-shot power-up. */
  function shootBullet() {
    const width = 5;
    const height = 12;
    const baseX = player.x + player.width / 2 - width / 2;
    const y = player.y - height;
    if (doubleShotSec > 0) {
      const offset = Math.max(6, Math.min(14, player.width * 0.22));
      bullets.push({ x: baseX - offset, y, width, height, vy: -BULLET_SPEED });
      bullets.push({ x: baseX + offset, y, width, height, vy: -BULLET_SPEED });
    } else {
      bullets.push({ x: baseX, y, width, height, vy: -BULLET_SPEED });
    }
  }

  /** Reset game state to a fresh playing session. */
  function resetGame() {
    currentScore = 0;
    remainingLives = MAX_LIVES;
    enemies = [];
    bullets = [];
    particles = [];
    powerUps = [];
    enemyBullets = [];
    player.x = GAME_WIDTH / 2 - player.width / 2;
    player.y = GAME_HEIGHT - 70;
    player.cooldownSec = 0;
    player.invulnerableSec = 1.0;
    doubleShotSec = 0;
    gameState = 'playing';
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    enemySpawnTimerSec = randomRange(ENEMY_SPAWN_MIN_SEC, ENEMY_SPAWN_MAX_SEC);
    powerUpSpawnTimerSec = randomRange(POWERUP_SPAWN_MIN_SEC, POWERUP_SPAWN_MAX_SEC);
    difficultyElapsedSec = 0;
    difficultyLevel = 0;
    enemySpeedMultiplier = 1;
    updateHud();
  }

  /** Update HUD labels for lives and score. */
  function updateHud() {
    livesEl.textContent = `Lives: ${remainingLives}`;
    scoreEl.textContent = `Score: ${currentScore}`;
  }

  /** Inclusive-exclusive random float in [min, max). */
  function randomRange(min, max) {
    return min + Math.random() * (max - min);
  }

  /**
   * 9) Game Loop & Update
   */
  let lastTimestamp = performance.now();
  let enemySpawnTimerSec = randomRange(ENEMY_SPAWN_MIN_SEC, ENEMY_SPAWN_MAX_SEC);
  let powerUpSpawnTimerSec = randomRange(POWERUP_SPAWN_MIN_SEC, POWERUP_SPAWN_MAX_SEC);
  let difficultyElapsedSec = 0;
  let difficultyLevel = 0;
  let enemySpeedMultiplier = 1;

  /** Update game state for the current frame. */
  function update(dt) {
    if (gameState !== 'playing') return;

    // Difficulty scaling
    difficultyElapsedSec += dt;
    if (difficultyElapsedSec >= DIFFICULTY_INTERVAL_SEC) {
      difficultyElapsedSec -= DIFFICULTY_INTERVAL_SEC;
      difficultyLevel += 1;
      enemySpeedMultiplier = 1 + difficultyLevel * DIFFICULTY_SPEED_STEP;
    }

    // Power-ups timer decay
    if (doubleShotSec > 0) doubleShotSec = Math.max(0, doubleShotSec - dt);

    // Movement
    let moveX = 0;
    let moveY = 0;
    if (pressedKeys.has('ArrowLeft') || pressedKeys.has('KeyA')) moveX -= 1;
    if (pressedKeys.has('ArrowRight') || pressedKeys.has('KeyD')) moveX += 1;
    if (pressedKeys.has('ArrowUp') || pressedKeys.has('KeyW')) moveY -= 1;
    if (pressedKeys.has('ArrowDown') || pressedKeys.has('KeyS')) moveY += 1;

    if (pointerActive) {
      // Direct control under finger
      player.x = pointerLogicalX - player.width / 2;
      player.y = pointerLogicalY - player.height / 2;
    } else {
      const length = Math.hypot(moveX, moveY) || 1;
      player.x += (moveX / length) * PLAYER_SPEED * dt;
      player.y += (moveY / length) * PLAYER_SPEED * dt;
    }

    player.x = clamp(player.x, 0, GAME_WIDTH - player.width);
    player.y = clamp(player.y, 0, GAME_HEIGHT - player.height);

    // Shooting
    player.cooldownSec -= dt;
    if ((pressedKeys.has('Space') || pressedKeys.has('KeyJ') || shootRequested) && player.cooldownSec <= 0) {
      shootBullet();
      player.cooldownSec = SHOOT_COOLDOWN_SEC;
    }

    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.y += b.vy * dt;
      if (b.y + b.height < 0) bullets.splice(i, 1);
    }

    // Spawn enemies
    enemySpawnTimerSec -= dt;
    if (enemySpawnTimerSec <= 0) {
      spawnEnemy();
      enemySpawnTimerSec = randomRange(ENEMY_SPAWN_MIN_SEC, ENEMY_SPAWN_MAX_SEC);
    }

    // Spawn power-ups
    powerUpSpawnTimerSec -= dt;
    if (powerUpSpawnTimerSec <= 0) {
      spawnPowerUp();
      powerUpSpawnTimerSec = randomRange(POWERUP_SPAWN_MIN_SEC, POWERUP_SPAWN_MAX_SEC);
    }

    // Update enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.y += (e.vy * enemySpeedMultiplier) * dt;
      // Enemy shooting timer
      e.shootTimerSec -= dt;
      if (e.shootTimerSec <= 0) {
        // Shoot towards player's current center
        const sx = e.x + e.width / 2;
        const sy = e.y + e.height;
        const tx = player.x + player.width / 2;
        const ty = player.y + player.height / 2;
        const dx = tx - sx;
        const dy = ty - sy;
        const len = Math.hypot(dx, dy) || 1;
        const vx = (dx / len) * ENEMY_BULLET_SPEED;
        const vy = (dy / len) * ENEMY_BULLET_SPEED;
        enemyBullets.push({ x: sx - 2, y: sy, width: 4, height: 10, vx, vy });
        // Reset timer; slightly faster with difficulty
        const factor = Math.max(0.6, 1 - difficultyLevel * 0.06);
        e.shootTimerSec = randomRange(ENEMY_SHOOT_MIN_SEC * factor, ENEMY_SHOOT_MAX_SEC * factor);
      }
      if (e.y > GAME_HEIGHT) {
        enemies.splice(i, 1);
        loseLife();
      }
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > GAME_HEIGHT + 20 || b.x < -20 || b.x > GAME_WIDTH + 20) {
        enemyBullets.splice(i, 1);
        continue;
      }
      // Collide with player
      if (player.invulnerableSec <= 0) {
        const pr = { x: player.x, y: player.y, width: player.width, height: player.height };
        if (rectsOverlap(pr, b)) {
          player.invulnerableSec = INVULNERABILITY_SEC;
          enemyBullets.splice(i, 1);
          loseLife();
        }
      }
    }

    // Update power-ups
    for (let i = powerUps.length - 1; i >= 0; i--) {
      const p = powerUps[i];
      p.y += p.vy * dt;
      if (p.y > GAME_HEIGHT + 40) { powerUps.splice(i, 1); continue; }
      const pr = { x: player.x, y: player.y, width: player.width, height: player.height };
      const puRect = { x: p.x, y: p.y, width: p.size, height: p.size };
      if (rectsOverlap(pr, puRect)) {
        doubleShotSec = POWERUP_DURATION_SEC;
        emitExplosion(p.x + p.size / 2, p.y + p.size / 2, '#7dfc7d', 14);
        powerUps.splice(i, 1);
      }
    }

    // Collisions: bullets -> enemies
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        if (rectsOverlap(e, b)) {
          emitExplosion(e.x + e.width / 2, e.y + e.height / 2, '#ff6b6b');
          enemies.splice(i, 1);
          bullets.splice(j, 1);
          currentScore += 100;
          updateHud();
          break;
        }
      }
    }

    // Collisions: player -> enemies
    if (player.invulnerableSec > 0) {
      player.invulnerableSec -= dt;
    }
    if (player.invulnerableSec <= 0) {
      const pr = { x: player.x, y: player.y, width: player.width, height: player.height };
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (rectsOverlap(pr, e)) {
          emitExplosion(player.x + player.width / 2, player.y + player.height / 2, '#00e5ff', 18);
          enemies.splice(i, 1);
          player.invulnerableSec = INVULNERABILITY_SEC;
          loseLife();
          break;
        }
      }
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.dx * dt;
      p.y += p.dy * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /** Decrement lives, handle game over, and reposition player. */
  function loseLife() {
    remainingLives -= 1;
    updateHud();
    if (remainingLives <= 0) {
      endGame();
      return;
    }
    // Nudge player back to a safe position
    player.x = GAME_WIDTH / 2 - player.width / 2;
    player.y = GAME_HEIGHT - 90;
  }

  /**
   * 10) Rendering
   * All drawing uses logical coordinates; a transform scales to device pixels.
   */
  function draw() {
    // Ensure transform matches current render scale
    ctx.setTransform(renderScaleX, 0, 0, renderScaleY, 0, 0);

    // Clear in logical coordinates
    ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Subtle backdrop vignette
    const gradient = ctx.createRadialGradient(
      GAME_WIDTH / 2,
      GAME_HEIGHT * 0.3,
      0,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH * 0.9
    );
    gradient.addColorStop(0, 'rgba(0, 229, 255, 0.05)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Draw bullets
    for (const b of bullets) {
      ctx.fillStyle = '#f1fa8c';
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // Draw enemies
    for (const e of enemies) {
      if (enemyImg.complete && enemyImg.naturalWidth > 0) {
        ctx.drawImage(enemyImg, e.x, e.y, e.width, e.height);
      } else {
        ctx.fillStyle = '#ff4757';
        ctx.fillRect(e.x, e.y, e.width, e.height);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(e.x + 2, e.y + 2, e.width - 4, e.height - 4);
      }
    }

    // Draw player ship (triangle)
    const flicker = (player.invulnerableSec > 0) && Math.floor(performance.now() / 100) % 2 === 0;
    if (!flicker) {
      drawPlayerShip(player.x, player.y, player.width, player.height, player.color);
    }

    // Particles
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
      ctx.globalAlpha = 1;
    }

    // Enemy bullets
    for (const b of enemyBullets) {
      ctx.fillStyle = '#ff9f43';
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // Power-ups (draw last to ensure visibility)
    for (const pu of powerUps) {
      const cx = pu.x + pu.size / 2;
      const cy = pu.y + pu.size / 2;
      const radius = pu.size / 2;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      g.addColorStop(0, 'rgba(125, 252, 125, 0.95)');
      g.addColorStop(1, 'rgba(125, 252, 125, 0.1)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // icon
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 6, cy - 1, 12, 2);
      ctx.fillRect(cx - 1, cy - 6, 2, 12);
    }
  }

  /** Draw the player ship sprite; fall back to a vector if not ready. */
  function drawPlayerShip(x, y, width, height, color) {
    if (jetImg.complete && jetImg.naturalWidth > 0) {
      ctx.drawImage(jetImg, x, y, width, height);
      return;
    }
    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    ctx.beginPath();
    ctx.moveTo(0, -height / 2);
    ctx.lineTo(width / 2, height / 2);
    ctx.lineTo(0, height / 3);
    ctx.lineTo(-width / 2, height / 2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  /** Switch to game over state and present restart instructions. */
  function endGame() {
    gameState = 'gameover';
    overlayEl.classList.remove('hidden');
    const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const restartHint = isTouch
      ? 'Tap anywhere to play again'
      : 'Press <strong>Enter</strong> to play again';
    overlayEl.innerHTML = `
      <div>
        <div style="font-size:28px;font-weight:800;margin-bottom:8px;letter-spacing:0.6px;">Game Over</div>
        <div style="opacity:0.9;margin-bottom:14px">Final Score: <strong>${currentScore}</strong></div>
        <div style="font-size:14px;opacity:0.9">${restartHint}</div>
      </div>
    `;
  }

  /** Animation frame callback; drives update/draw at ~60fps. */
  function frame(timestamp) {
    // Ensure backing store matches current CSS size/DPR
    resizeCanvas();
    const dt = Math.min(0.033, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(frame);
  }

  /**
   * 11) Bootstrap / Init
   */
  // Initial UI
  updateHud();
  overlayEl.classList.add('hidden');

  // Make overlay tappable to restart on mobile
  overlayEl.addEventListener('click', () => {
    if (gameState === 'gameover') resetGame();
  });

  // Show mobile-friendly help on touch devices
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && helpEl) {
    helpEl.innerHTML = '<div>Drag: Move</div><div>Hold: Auto‑fire</div><div>Catch green orb: Double‑shot (5s)</div><div>Tap: Restart</div>';
  }

  // Initial sizing + resize listener
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  requestAnimationFrame((ts) => {
    lastTimestamp = ts;
    requestAnimationFrame(frame);
  });
})();
