const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const hud = document.getElementById('hud');
const gameOverScreen = document.getElementById('game-over-screen');

const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

const timeDisplay = document.getElementById('time-display');
const scoreDisplay = document.getElementById('score-display');
const healthBar = document.getElementById('health-bar');

const finalTime = document.getElementById('final-time');
const finalScore = document.getElementById('final-score');
const finalHits = document.getElementById('final-hits');

// Game Settings
let GAME_STATE = 'START'; // START, PLAYING, GAMEOVER
let lastTime = 0;
let animationId;

// Game State Variables
let survivalTime = 0;
let score = 0;
let hitCount = 0;
const maxHealth = 3;
let currentHealth = maxHealth;
let currentMapType = 'crossroad'; // 'crossroad', 'straight_h', 'straight_v', 'roundabout', 'freeway', 'interchange_up'

// Resize Canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Input Handling
const keys = {
    w: false, a: false, s: false, d: false,
    ArrowUp: false, ArrowLeft: false, ArrowDown: false, ArrowRight: false
};

window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key)) keys[e.key] = false;
});

// Utility
function randomRange(min, max) {
    return Math.random() * (max - min) + min;
}

// Entities
class Player {
    constructor() {
        this.radius = 15;
        this.x = canvas.width / 2;
        this.y = canvas.height / 2;
        this.speed = 400; // pixels per second
        this.history = []; // For tail
        this.tailLength = 40; // Decreased length to 2/3 of 60
        this.segmentDist = 5; // Distance between segments
        this.invincibleTimer = 0;
    }

    update(dt) {
        if (this.invincibleTimer > 0) {
            this.invincibleTimer -= dt;
        }

        let dx = 0;
        let dy = 0;

        if (keys.w || keys.ArrowUp) dy -= 1;
        if (keys.s || keys.ArrowDown) dy += 1;
        if (keys.a || keys.ArrowLeft) dx -= 1;
        if (keys.d || keys.ArrowRight) dx += 1;

        // Normalize
        if (dx !== 0 && dy !== 0) {
            const length = Math.sqrt(dx * dx + dy * dy);
            dx /= length;
            dy /= length;
        }

        let newX = this.x + dx * this.speed * dt;
        let newY = this.y + dy * this.speed * dt;

        if (currentMapType === 'freeway' && dx < 0) {
            GAME_STATE = 'GAME_OVER';
            window.gameOverReason = 'ticket';
            showGameOver();
            return;
        }

        if (!isPointInGrass(newX, this.y, this.radius)) {
            this.x = newX;
        }
        if (!isPointInGrass(this.x, newY, this.radius)) {
            this.y = newY;
        }

        // Screen exits
        if (this.x < 0) {
            this.x = canvas.width;
            transitionMap('left');
        } else if (this.x > canvas.width) {
            this.x = 0;
            transitionMap('right');
        } else if (this.y < 0) {
            this.y = canvas.height;
            transitionMap('up');
        } else if (this.y > canvas.height) {
            this.y = 0;
            transitionMap('down');
        }

        // Save history for tail ONLY if moved enough
        if (this.history.length === 0) {
            this.history.unshift({x: this.x, y: this.y});
        } else {
            const last = this.history[0];
            const dist = distance(this.x, this.y, last.x, last.y);
            if (dist >= this.segmentDist) {
                this.history.unshift({x: this.x, y: this.y});
                if (this.history.length > this.tailLength) {
                    this.history.pop();
                }
            }
        }

        // Removed self-collision check
    }

    draw(ctx) {
        // Flash if invincible
        if (this.invincibleTimer > 0 && Math.floor(this.invincibleTimer * 10) % 2 === 0) {
            return;
        }

        // Draw tail
        ctx.beginPath();
        for (let i = 0; i < this.history.length; i++) {
            const pos = this.history[i];
            if (i === 0) {
                ctx.moveTo(pos.x, pos.y);
            } else {
                ctx.lineTo(pos.x, pos.y);
            }
        }
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = this.radius * 1.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        // Draw head
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#4ade80';
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#4ade80';
        
        // Eyes
        ctx.beginPath();
        ctx.fillStyle = '#064e3b';
        ctx.arc(this.x - 5, this.y - 3, 3, 0, Math.PI * 2);
        ctx.arc(this.x + 5, this.y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // reset shadow
    }

    hit() {
        if (this.invincibleTimer <= 0) {
            this.invincibleTimer = 1.5; // 1.5s invincibility
            currentHealth -= 1;
            hitCount += 1;
            updateHUD();

            // Screen shake effect
            document.body.style.transform = 'translate(10px, 10px)';
            setTimeout(() => { document.body.style.transform = 'translate(-10px, -10px)'; }, 50);
            setTimeout(() => { document.body.style.transform = 'translate(10px, -10px)'; }, 100);
            setTimeout(() => { document.body.style.transform = 'translate(0, 0)'; }, 150);

            if (currentHealth <= 0) {
                endGame();
            }
        }
    }
}

class Car {
    constructor() {
        this.type = Math.random() > 0.5 ? 'fast_blind' : 'slow_aware';
        const isHorizontal = Math.random() > 0.5;
        let speedBase = 200 + (survivalTime * 5); // Speed increases over time
        
        if (this.type === 'fast_blind') {
            speedBase *= 1.5;
            this.color = '#334155'; // Dark color for fast cars
        } else {
            speedBase *= 0.6;
            this.color = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6'][Math.floor(Math.random() * 4)];
        }
        
        this.speed = randomRange(speedBase * 0.8, speedBase * 1.5);
        this.isHorizontal = isHorizontal;
        
        this.width = 90;
        this.height = 50;
        
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        if (currentMapType === 'freeway') {
            const horizY = canvas.height / 2;
            const halfRw = 250;
            this.isHorizontal = true;
            this.y = randomRange(horizY - halfRw + 50, horizY + halfRw - 50);
            // All cars enter from the left, going right only
            this.x = -this.width / 2;
            this.vx = this.speed;
            this.vy = 0;
            this.angle = 0;
            return;
        }

        if (currentMapType === 'interchange_down') {
            const horizY_bot = canvas.height - 200;
            const halfRw = 150;
            this.isHorizontal = true;
            this.y = randomRange(horizY_bot - halfRw + 50, horizY_bot + halfRw - 50);
            if (Math.random() > 0.5) {
                this.x = -this.width / 2;
                this.vx = this.speed;
            } else {
                this.x = canvas.width + this.width / 2;
                this.vx = -this.speed;
            }
            this.vy = 0;
            this.angle = Math.atan2(this.vy, this.vx);
            return;
        }

        if (currentMapType === 'interchange_up') {
            const horizY = canvas.height - 200;
            const halfRw = 150;
            
            this.isHorizontal = true;
            this.y = randomRange(horizY - halfRw + 50, horizY + halfRw - 50);
            if (Math.random() > 0.5) {
                this.x = -this.width / 2;
                this.vx = this.speed;
            } else {
                this.x = canvas.width + this.width / 2;
                this.vx = -this.speed;
            }
            this.vy = 0;
            this.angle = Math.atan2(this.vy, this.vx);
            return;
        }

        let spawnHorizontal = Math.random() > 0.5;
        if (currentMapType === 'straight_h') spawnHorizontal = true;
        if (currentMapType === 'straight_v') spawnHorizontal = false;

        const rwForSpawning = currentMapType === 'roundabout' ? 300 : 600;
        const halfRwSpawn = rwForSpawning / 2;

        this.isHorizontal = spawnHorizontal;
        if (this.isHorizontal) {
            this.y = randomRange(cy - halfRwSpawn + 50, cy + halfRwSpawn - 50);
            if (Math.random() > 0.5) {
                this.x = -this.width / 2;
                this.vx = this.speed;
            } else {
                this.x = canvas.width + this.width / 2;
                this.vx = -this.speed;
            }
            this.vy = 0;
        } else {
            this.x = randomRange(cx - halfRwSpawn + 50, cx + halfRwSpawn - 50);
            if (Math.random() > 0.5) {
                this.y = -this.width / 2;
                this.vy = this.speed;
            } else {
                this.y = canvas.height + this.width / 2;
                this.vy = -this.speed;
            }
            this.vx = 0;
        }
        this.angle = Math.atan2(this.vy, this.vx);
    }

    getClosestPlayerPoint(player) {
        let minDist = distance(this.x, this.y, player.x, player.y);
        let pt = {x: player.x, y: player.y};
        
        for (let i = 0; i < player.history.length; i += 3) { // check every 3rd segment for performance
            let d = distance(this.x, this.y, player.history[i].x, player.history[i].y);
            if (d < minDist) {
                minDist = d;
                pt = player.history[i];
            }
        }
        return {dist: minDist, pt: pt};
    }

    update(dt, player) {
        if (this.type === 'slow_aware' && player) {
            const closest = this.getClosestPlayerPoint(player);
            if (closest.dist < 400) { 
                const intensity = Math.pow((400 - closest.dist) / 400, 2); 
                const evadeForce = 2500 * intensity * dt; 
                
                if (this.isHorizontal) {
                    const dir = this.y - closest.pt.y > 0 ? 1 : -1;
                    this.vy += dir * evadeForce;
                    this.vy = Math.max(-250, Math.min(250, this.vy)); 
                } else {
                    const dir = this.x - closest.pt.x > 0 ? 1 : -1;
                    this.vx += dir * evadeForce;
                    this.vx = Math.max(-250, Math.min(250, this.vx));
                }
            } else {
                if (this.isHorizontal) {
                    this.vy += (0 - this.vy) * 2 * dt;
                } else {
                    this.vx += (0 - this.vx) * 2 * dt;
                }
            }
        }

        let newX = this.x + this.vx * dt;
        let newY = this.y + this.vy * dt;
        const carCollisionRadius = 25; 

        if (!isPointInGrass(newX, this.y, carCollisionRadius)) {
            this.x = newX;
        } else {
            this.vx = 0; 
        }
        
        if (!isPointInGrass(this.x, newY, carCollisionRadius)) {
            this.y = newY;
        } else {
            this.vy = 0;
        }

        if (this.vx !== 0 || this.vy !== 0) {
            this.angle = Math.atan2(this.vy, this.vx);
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        // Draw car body centered
        ctx.beginPath();
        ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 8);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Draw headlights (at front: right side)
        if (this.type === 'slow_aware') {
            ctx.fillStyle = '#fef08a'; // bright yellow
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#fef08a';
        } else {
            ctx.fillStyle = '#0f172a'; // dark unlit color matching bg
            ctx.shadowBlur = 0;
        }
        
        ctx.beginPath();
        ctx.arc(this.width / 2, -this.height / 2 + 10, 5, 0, Math.PI*2);
        ctx.arc(this.width / 2, this.height / 2 - 10, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.restore();
    }

    isOffscreen() {
        const bound = 120;
        return (this.x < -bound || this.x > canvas.width + bound || 
                this.y < -bound || this.y > canvas.height + bound);
    }
}

class Item {
    constructor() {
        this.radius = 18;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        
        if (currentMapType === 'interchange_up') {
            const horizY = canvas.height - 200;
            const halfRw = 150;
            const arcCx = canvas.width / 2 - 150;
            const R_out = 600;
            const R_in = 300;
            const C_x = arcCx + R_out;
            const C_y = horizY - halfRw;

            if (Math.random() > 0.5) {
                this.x = randomRange(50, canvas.width - 50);
                this.y = randomRange(horizY - halfRw + 40, horizY + halfRw - 40);
            } else {
                // spawn in curve
                const angle = randomRange(Math.PI, Math.PI * 1.5);
                const r = randomRange(R_in + 40, R_out - 40);
                this.x = C_x + Math.cos(angle) * r;
                this.y = C_y + Math.sin(angle) * r;
            }
            this.pulse = 0;
            return;
        }

        if (currentMapType === 'freeway') {
            const horizY = canvas.height / 2;
            const halfRw = 250;
            this.x = randomRange(50, canvas.width - 50);
            this.y = randomRange(horizY - halfRw + 40, horizY + halfRw - 40);
            this.pulse = 0;
            return;
        }

        if (currentMapType === 'interchange_down') {
            const horizY_bot = canvas.height - 200;
            const halfRw = 150;
            this.x = randomRange(50, canvas.width - 50);
            this.y = randomRange(horizY_bot - halfRw + 40, horizY_bot + halfRw - 40);
            this.pulse = 0;
            return;
        }

        let validArea = 'h';
        if (currentMapType === 'crossroad' || currentMapType === 'roundabout') {
            validArea = Math.random() > 0.5 ? 'h' : 'v';
        } else if (currentMapType === 'straight_v') {
            validArea = 'v';
        }

        let rwSpawn = currentMapType === 'roundabout' ? 300 : 600;
        let halfRwSpawn = rwSpawn / 2;

        if (validArea === 'h') {
            this.x = randomRange(50, canvas.width - 50);
            this.y = randomRange(cy - halfRwSpawn + 40, cy + halfRwSpawn - 40);
        } else {
            this.x = randomRange(cx - halfRwSpawn + 40, cx + halfRwSpawn - 40);
            this.y = randomRange(50, canvas.height - 50);
        }
        
        // Retry until not in grass
        let attempts = 0;
        while (isPointInGrass(this.x, this.y, this.radius) && attempts < 50) {
            if (validArea === 'h') {
                this.x = randomRange(50, canvas.width - 50);
                this.y = randomRange(cy - halfRwSpawn + 40, cy + halfRwSpawn - 40);
            } else {
                this.x = randomRange(cx - halfRwSpawn + 40, cx + halfRwSpawn - 40);
                this.y = randomRange(50, canvas.height - 50);
            }
            attempts++;
        }
        
        this.pulse = 0;
    }

    update(dt) {
        this.pulse += dt * 5;
    }

    draw(ctx) {
        const p = Math.sin(this.pulse) * 4;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius + p, 0, Math.PI * 2);
        ctx.fillStyle = '#34d399';
        ctx.fill();
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#34d399';
        
        ctx.fillStyle = '#064e3b';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px "Noto Sans TC"';
        ctx.fillText('🌿', this.x, this.y);
        ctx.shadowBlur = 0;
    }
}

let player;
let cars = [];
let items = [];
let carSpawnTimer = 0;
let itemSpawnTimer = 0;

function resetGame() {
    survivalTime = 0;
    score = 0;
    hitCount = 0;
    currentHealth = maxHealth;
    currentMapType = 'crossroad'; // Always start at crossroad
    window.gameOverReason = 'crash'; // Reset reason
    
    player = new Player();
    cars = [];
    items = [new Item()];
    
    updateHUD();
}

function startGame() {
    startScreen.classList.remove('active');
    gameOverScreen.classList.remove('active');
    hud.classList.add('active');
    GAME_STATE = 'PLAYING';
    resetGame();
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
    GAME_STATE = 'GAME_OVER';
    showGameOver();
}

function showGameOver() {
    GAME_STATE = 'GAME_OVER';
    hud.classList.remove('active');
    gameOverScreen.classList.add('active');
    
    finalTime.innerText = Math.floor(survivalTime) + 's';
    finalScore.innerText = score;
    finalHits.innerText = hitCount;

    const title = document.querySelector('#game-over-screen h2');
    if (window.gameOverReason === 'ticket') {
        title.innerHTML = '📝 收到罰單！<br><span style="font-size:0.55em;color:#fca5a5;">高速公路嚴禁逆向行駛！</span>';
    } else {
        title.textContent = '遊戲結束';
    }
}

function updateHUD() {
    timeDisplay.innerText = Math.floor(survivalTime) + 's';
    scoreDisplay.innerText = score;
    
    const healthPercent = (currentHealth / maxHealth) * 100;
    healthBar.style.width = `${healthPercent}%`;
    if (currentHealth === 1) {
        healthBar.classList.add('low');
    } else {
        healthBar.classList.remove('low');
    }
}

// Collision detection (OBB vs Circle)
function circleObbCollide(circle, obb) {
    const dx = circle.x - obb.x;
    const dy = circle.y - obb.y;
    
    // Rotate point backwards by obb.angle
    const localX = dx * Math.cos(-obb.angle) - dy * Math.sin(-obb.angle);
    const localY = dx * Math.sin(-obb.angle) + dy * Math.cos(-obb.angle);
    
    const halfW = obb.width / 2;
    const halfH = obb.height / 2;
    
    const closestX = Math.max(-halfW, Math.min(halfW, localX));
    const closestY = Math.max(-halfH, Math.min(halfH, localY));
    
    const distX = localX - closestX;
    const distY = localY - closestY;
    
    return (distX * distX + distY * distY) <= (circle.radius * circle.radius);
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
}

function isPointInGrass(x, y, radius) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    if (currentMapType === 'freeway') {
        const horizY = canvas.height / 2;
        const halfRw = 250;
        return Math.abs(y - horizY) > halfRw - radius;
    } else if (currentMapType === 'interchange_down') {
        const horizY_bot = canvas.height - 200;
        const halfRw_bot = 150;
        const C_x = 0;
        const C_y = horizY_bot - halfRw_bot; // = canvas.height - 350, top of bottom road
        const R_out = 400;
        const R_in = 100;

        // Bottom horizontal road (from C_y down)
        const inH = (y >= C_y - radius) && (y <= horizY_bot + halfRw_bot + radius);
        // Ramp: upper-right quadrant of (C_x=0, C_y)
        const d = distance(x, y, C_x, C_y);
        const inCurve = (x >= C_x - radius) && (y <= C_y + radius) &&
                        (d >= R_in - radius) && (d <= R_out + radius);

        return !(inH || inCurve);
    } else if (currentMapType === 'interchange_up') {
        const horizY = canvas.height - 200;
        const halfRw = 150;
        const C_x = canvas.width;
        const C_y = horizY - halfRw; // Top edge of horizontal road = center of curve
        const R_out = 400;
        const R_in = 100;

        // Horizontal road: from top edge (C_y) down to bottom
        const inH = (y >= C_y - radius) && (y <= horizY + halfRw + radius);

        // Ramp: quarter-circle annular sector in upper-left quadrant of (C_x, C_y)
        const d = distance(x, y, C_x, C_y);
        const inCurve = (x <= C_x + radius) && (y <= C_y + radius) &&
                        (d >= R_in - radius) && (d <= R_out + radius);

        return !(inH || inCurve);
    } else if (currentMapType === 'roundabout') {
        const halfRw = 150;
        const R_in = 320;
        const R_out = 480;
        const dist = distance(x, y, cx, cy);
        
        const inH = Math.abs(y - cy) <= halfRw - radius;
        const inV = Math.abs(x - cx) <= halfRw - radius;
        const inRing = dist >= R_in + radius && dist <= R_out - radius;
        
        return !(inH || inV || inRing);
    } else {
        const halfRw = 300;
        let inH = Math.abs(y - cy) <= halfRw - radius;
        let inV = Math.abs(x - cx) <= halfRw - radius;
        
        if (currentMapType === 'straight_h') inV = false;
        if (currentMapType === 'straight_v') inH = false;
        
        return !(inH || inV);
    }
}

function gameLoop(timestamp) {
    if (GAME_STATE !== 'PLAYING') return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    survivalTime += dt;
    
    // Periodically update HUD for time
    if (Math.floor(survivalTime) > Math.floor(survivalTime - dt)) {
        updateHUD();
    }

    // Spawn Cars
    carSpawnTimer += dt;
    // Spawn rate increases over time
    let spawnRate = Math.max(0.3, 1.5 - (survivalTime * 0.02)); 
    if (currentMapType === 'roundabout') spawnRate *= 0.5; // High traffic
    if (carSpawnTimer >= spawnRate) {
        carSpawnTimer = 0;
        cars.push(new Car());
    }

    // Spawn Items
    itemSpawnTimer += dt;
    if (itemSpawnTimer >= 4 && items.length < 3) {
        itemSpawnTimer = 0;
        items.push(new Item());
    }

    // Update Entities
    player.update(dt);
    
    cars.forEach(car => car.update(dt, player));
    cars = cars.filter(car => !car.isOffscreen());

    items.forEach(item => item.update(dt));

    // Check Collisions
    // Cars
    cars.forEach(car => {
        let hit = false;
        // Check head collision
        if (circleObbCollide(player, car)) {
            hit = true;
        } else {
            // Check body collision
            const tailRadius = player.radius * 0.75;
            for (let i = 0; i < player.history.length; i++) {
                const segment = {
                    x: player.history[i].x,
                    y: player.history[i].y,
                    radius: tailRadius
                };
                if (circleObbCollide(segment, car)) {
                    hit = true;
                    break;
                }
            }
        }

        if (hit) {
            player.hit();
        }
    });

    // Items
    for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        if (distance(player.x, player.y, item.x, item.y) < player.radius + item.radius) {
            score += 100;
            items.splice(i, 1);
            updateHUD();
            // Optional: particle effect here
        }
    }

    // Render
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawBackground(ctx);

    items.forEach(item => item.draw(ctx));
    player.draw(ctx);
    cars.forEach(car => car.draw(ctx));

    if (GAME_STATE === 'PLAYING') {
        animationId = requestAnimationFrame(gameLoop);
    }
}

function drawBackground(ctx) {
    if (currentMapType === 'freeway') {
        const horizY = canvas.height / 2;
        const halfRw = 250;
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, horizY - halfRw, canvas.width, halfRw * 2);
        
        // White guard rails
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(0, horizY - halfRw); ctx.lineTo(canvas.width, horizY - halfRw);
        ctx.moveTo(0, horizY + halfRw); ctx.lineTo(canvas.width, horizY + halfRw);
        ctx.stroke();
        
        // Lane dividers (3 lanes)
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 5;
        ctx.setLineDash([40, 30]);
        ctx.beginPath();
        const laneH = (halfRw * 2) / 3;
        ctx.moveTo(0, horizY - halfRw + laneH); ctx.lineTo(canvas.width, horizY - halfRw + laneH);
        ctx.moveTo(0, horizY - halfRw + laneH * 2); ctx.lineTo(canvas.width, horizY - halfRw + laneH * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
    }

    // Interchange Down Visuals (left-right mirror of interchange_up)
    if (currentMapType === 'interchange_down') {
        const horizY_bot = canvas.height - 200;
        const halfRw = 150;
        const C_x = 0;
        const C_y = horizY_bot - halfRw; // Top edge of bottom road = center of curve
        const R_out = 400;
        const R_in = 100;

        ctx.fillStyle = '#166534';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Road fill
        ctx.fillStyle = '#1e293b';
        // Bottom horizontal road
        ctx.fillRect(0, horizY_bot - halfRw, canvas.width, halfRw * 2);
        // Quarter-circle annular sector (upper-right quadrant of C_x=0, C_y)
        ctx.beginPath();
        ctx.arc(C_x, C_y, R_out, -Math.PI / 2, 0, false); // from top to right
        ctx.arc(C_x, C_y, R_in, 0, -Math.PI / 2, true);  // back
        ctx.closePath();
        ctx.fill();

        // Borders
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 10;
        // Outer arc (ramp outer edge)
        ctx.beginPath();
        ctx.arc(C_x, C_y, R_out, -Math.PI / 2, 0, false);
        ctx.stroke();
        // Outer arc right end → right edge of canvas top of bottom road
        ctx.beginPath();
        ctx.moveTo(R_out, C_y);
        ctx.lineTo(canvas.width, C_y);
        ctx.stroke();
        // Inner arc (ramp inner wall)
        ctx.beginPath();
        ctx.arc(C_x, C_y, R_in, -Math.PI / 2, 0, false);
        ctx.stroke();
        // Inner arc right end → right edge
        ctx.beginPath();
        ctx.moveTo(R_in, C_y);
        ctx.lineTo(canvas.width, C_y);
        ctx.stroke();
        // Bottom road bottom edge
        ctx.beginPath();
        ctx.moveTo(0, horizY_bot + halfRw);
        ctx.lineTo(canvas.width, horizY_bot + halfRw);
        ctx.stroke();

        // Dashed center lines
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 30]);
        ctx.beginPath();
        ctx.moveTo(0, horizY_bot);
        ctx.lineTo(canvas.width, horizY_bot);
        const R_mid = R_in + 150;
        ctx.arc(C_x, C_y, R_mid, -Math.PI / 2, 0, false);
        ctx.stroke();
        ctx.setLineDash([]);

        // Text label
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 54px "Noto Sans TC"';
        ctx.textAlign = 'center';
        ctx.fillText('高 速 公 路', canvas.width - 200, C_y - 200);

        return;
    }

    // Interchange Up Visuals
    if (currentMapType === 'interchange_up') {
        const horizY = canvas.height - 200;
        const halfRw = 150;
        const C_x = canvas.width;
        const C_y = horizY - halfRw;
        const R_out = 400;
        const R_in = 100;

        ctx.fillStyle = '#166534';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, horizY - halfRw, canvas.width, halfRw * 2);
        
        ctx.beginPath();
        ctx.arc(C_x, C_y, R_out, Math.PI, Math.PI * 1.5, false);
        ctx.arc(C_x, C_y, R_in, Math.PI * 1.5, Math.PI, true);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(0, horizY - halfRw);
        ctx.lineTo(C_x - R_out, horizY - halfRw);
        ctx.arc(C_x, C_y, R_out, Math.PI, Math.PI * 1.5, false);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(C_x - R_in, horizY - halfRw);
        ctx.lineTo(canvas.width, horizY - halfRw);
        ctx.moveTo(C_x - R_in, horizY - halfRw);
        ctx.arc(C_x, C_y, R_in, Math.PI, Math.PI * 1.5, false);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, horizY + halfRw);
        ctx.lineTo(canvas.width, horizY + halfRw);
        ctx.stroke();

        // Dashed lines
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 30]);
        ctx.beginPath();
        ctx.moveTo(0, horizY);
        ctx.lineTo(canvas.width, horizY);
        
        const R_mid = R_in + 150;
        ctx.arc(C_x, C_y, R_mid, Math.PI, Math.PI * 1.5, false);
        ctx.stroke();
        ctx.setLineDash([]);

        // Text
        ctx.fillStyle = '#fef08a';
        ctx.font = 'bold 60px "Noto Sans TC"';
        ctx.textAlign = 'center';
        ctx.fillText('高 速 公 路', C_x - 350, C_y - 250);
        
        return; 
    }

    const rw = 600; 
    const halfRw = rw / 2;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Draw Grass Background
    ctx.fillStyle = '#166534'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Asphalt
    ctx.fillStyle = '#1e293b'; 
    if (currentMapType !== 'straight_v') {
        ctx.fillRect(0, cy - halfRw, canvas.width, rw);
    }
    if (currentMapType !== 'straight_h') {
        ctx.fillRect(cx - halfRw, 0, rw, canvas.height);
    }

    // Draw Walls / Curbs
    ctx.fillStyle = '#94a3b8'; 
    const wallThick = 10;
    
    if (currentMapType === 'crossroad' || currentMapType === 'roundabout') {
        ctx.fillRect(0, cy - halfRw - wallThick, cx - halfRw, wallThick);
        ctx.fillRect(cx - halfRw - wallThick, 0, wallThick, cy - halfRw);
        
        ctx.fillRect(cx + halfRw, cy - halfRw - wallThick, canvas.width - cx - halfRw, wallThick);
        ctx.fillRect(cx + halfRw, 0, wallThick, cy - halfRw);
        
        ctx.fillRect(0, cy + halfRw, cx - halfRw, wallThick);
        ctx.fillRect(cx - halfRw - wallThick, cy + halfRw, wallThick, canvas.height - cy - halfRw);
        
        ctx.fillRect(cx + halfRw, cy + halfRw, canvas.width - cx - halfRw, wallThick);
        ctx.fillRect(cx + halfRw, cy + halfRw, wallThick, canvas.height - cy - halfRw);
    } else if (currentMapType === 'straight_h') {
        ctx.fillRect(0, cy - halfRw - wallThick, canvas.width, wallThick);
        ctx.fillRect(0, cy + halfRw, canvas.width, wallThick);
    } else if (currentMapType === 'straight_v') {
        ctx.fillRect(cx - halfRw - wallThick, 0, wallThick, canvas.height);
        ctx.fillRect(cx + halfRw, 0, wallThick, canvas.height);
    }

    // Roundabout Visuals (Huzhou style)
    if (currentMapType === 'roundabout') {
        const rwR = 300;
        const halfRwR = rwR / 2; // 150
        const R_in = 320;
        const R_out = 480;

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, canvas.width, canvas.height); 
        
        ctx.fillStyle = '#166534';
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 10;

        function drawQuadrant(signX, signY) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(signX, signY);
            
            // Inner pie-slice island
            ctx.beginPath();
            ctx.moveTo(halfRwR, halfRwR);
            ctx.lineTo(Math.sqrt(R_in*R_in - halfRwR*halfRwR), halfRwR);
            ctx.arc(0, 0, R_in, Math.asin(halfRwR/R_in), Math.acos(halfRwR/R_in), false);
            ctx.lineTo(halfRwR, Math.sqrt(R_in*R_in - halfRwR*halfRwR));
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Outer grass corners
            ctx.beginPath();
            ctx.arc(0, 0, R_out, Math.acos(halfRwR/R_out), Math.asin(halfRwR/R_out), true);
            ctx.lineTo(canvas.width, halfRwR);
            ctx.lineTo(canvas.width, canvas.height);
            ctx.lineTo(halfRwR, canvas.height);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            ctx.restore();
        }

        drawQuadrant(1, 1);
        drawQuadrant(-1, 1);
        drawQuadrant(1, -1);
        drawQuadrant(-1, -1);
    }

    // Draw Dashed Road Lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 6;
    ctx.setLineDash([30, 30]);
    ctx.beginPath();
    
    if (currentMapType === 'straight_h' || currentMapType === 'crossroad' || currentMapType === 'roundabout') {
        ctx.moveTo(0, cy); ctx.lineTo((currentMapType === 'crossroad' || currentMapType === 'roundabout') ? cx - halfRw : canvas.width, cy);
        if (currentMapType === 'crossroad' || currentMapType === 'roundabout') {
            ctx.moveTo(cx + halfRw, cy); ctx.lineTo(canvas.width, cy);
        }
    }
    if (currentMapType === 'straight_v' || currentMapType === 'crossroad' || currentMapType === 'roundabout') {
        ctx.moveTo(cx, 0); 
        ctx.lineTo(cx, (currentMapType === 'crossroad' || currentMapType === 'roundabout') ? cy - halfRw : canvas.height);
        if (currentMapType === 'crossroad' || currentMapType === 'roundabout') {
            ctx.moveTo(cx, cy + halfRw); ctx.lineTo(cx, canvas.height);
        }
    }
    
    if (currentMapType === 'roundabout') {
        ctx.moveTo(cx + 400, cy);
        ctx.arc(cx, cy, 400, 0, Math.PI * 2);
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
}

function transitionMap(exitDir) {
    cars = [];
    items = [];
    player.history = []; // Reset tail to avoid line across screen
    
    let validMaps = [];
    if (currentMapType === 'freeway') {
        // 75% stay on freeway, 25% enter downward interchange
        if (Math.random() < 0.25) {
            validMaps = ['interchange_down'];
        } else {
            validMaps = ['freeway'];
        }
    } else if (currentMapType === 'interchange_down') {
        const horizY_bot = canvas.height - 200;
        const halfRw_bot = 150;
        // Only left/right exits from the bottom road return to normal maps
        if (player.y >= horizY_bot - halfRw_bot - 50) {
            validMaps = ['crossroad', 'straight_h', 'roundabout'];
        } else {
            validMaps = ['freeway']; // ramp exits back to freeway
        }
    } else if (currentMapType === 'interchange_up' && exitDir === 'right') {
        const horizY = canvas.height - 200;
        const halfRw = 150;
        const C_y = horizY - halfRw; // Top edge of horizontal road
        // Player exited via the ramp (above the horizontal road top edge)
        // Note: player.x is already set to 0 when transitionMap is called,
        // but player.y still reflects where they exited
        if (player.y <= C_y + 30) {
            validMaps = ['freeway'];
        } else {
            validMaps = ['crossroad', 'straight_h'];
        }
    } else if (exitDir === 'left' || exitDir === 'right') {
        validMaps = ['crossroad', 'straight_h', 'roundabout', 'interchange_up'];
    } else if (exitDir === 'up') {
        validMaps = ['crossroad', 'straight_v', 'roundabout'];
    } else if (exitDir === 'down') {
        validMaps = ['crossroad', 'straight_v', 'roundabout'];
    }

    currentMapType = validMaps[Math.floor(Math.random() * validMaps.length)];

    if (currentMapType === 'freeway') {
        const horizY = canvas.height / 2;
        const halfRw = 250;
        player.y = Math.max(horizY - halfRw + player.radius, Math.min(horizY + halfRw - player.radius, player.y));
        player.x = player.radius; // Enter from left side
    } else if (currentMapType === 'interchange_down') {
        // Clamp player to ramp entry on left edge (upper-right quadrant zone)
        const horizY_bot = canvas.height - 200;
        const halfRw_bot = 150;
        const C_y = horizY_bot - halfRw_bot; // = canvas.height - 350
        const R_in = 100;
        const R_out = 400;
        // Ramp left-edge y range: C_y - R_out to C_y - R_in
        player.x = player.radius;
        player.y = Math.max(C_y - R_out + player.radius, Math.min(C_y - R_in - player.radius, player.y));
    } else if (currentMapType === 'interchange_up') {
        const horizY = canvas.height - 200;
        const halfRw = 150;
        if (exitDir === 'left' || exitDir === 'right') {
            player.y = Math.max(horizY - halfRw + player.radius, Math.min(horizY + halfRw - player.radius, player.y));
        }
    } else {
        const rwForNewMap = currentMapType === 'roundabout' ? 300 : 600;
        const halfRw = rwForNewMap / 2;
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        if (exitDir === 'left' || exitDir === 'right') {
            player.y = Math.max(cy - halfRw + player.radius, Math.min(cy + halfRw - player.radius, player.y));
        } else {
            player.x = Math.max(cx - halfRw + player.radius, Math.min(cx + halfRw - player.radius, player.x));
        }
    }
}

// Event Listeners
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Initial Render
ctx.fillStyle = '#0f172a';
ctx.fillRect(0, 0, canvas.width, canvas.height);
