// ---------- basic setup ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0d10);
scene.fog = new THREE.Fog(0x0c0d10, 25, 70);

const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera); // camera must be in the scene graph for its child (the weapon model) to render

// Valorant's FOV slider (90-103) is a *horizontal* FOV measured at a 4:3 base, then widescreen
// gets extra horizontal FOV added on top while vertical FOV stays fixed ("Hor+" scaling) - which
// is exactly what three.js's PerspectiveCamera already does with a fixed vertical fov + aspect.
// So converting Valorant's horizontal/4:3 number into the equivalent constant vertical fov once
// reproduces the same view at any aspect ratio without any extra scaling code.
function valorantFovToVerticalFov(hFovDeg) {
  const hFovRad = hFovDeg * (Math.PI / 180);
  const vFovRad = 2 * Math.atan(Math.tan(hFovRad / 2) / (4 / 3));
  return vFovRad * (180 / Math.PI);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- lighting ----------
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
scene.add(sun);

// ---------- arena ----------
const ARENA_HALF = 20;
const WALL_HEIGHT = 8;

function gridTexture(color1, color2, size) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color2;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(size, size);
  return tex;
}

// Warm sandstone palette + market-style crates, evoking a generic Valorant-ish training
// yard aesthetic. This is an original layout, not a recreation of any real map's callouts.
const floorMat = new THREE.MeshStandardMaterial({
  map: gridTexture('#2b2420', '#4a3c2c', ARENA_HALF * 2),
  roughness: 0.95,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2), floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const ceiling = floor.clone();
ceiling.position.y = WALL_HEIGHT;
ceiling.rotation.x = Math.PI / 2;
scene.add(ceiling);

const wallMat = new THREE.MeshStandardMaterial({
  map: gridTexture('#3d2f22', '#5c4630', ARENA_HALF),
  roughness: 0.9,
});
function makeWall(w, h, x, y, z, rotY) {
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  wall.position.set(x, y, z);
  wall.rotation.y = rotY;
  scene.add(wall);
}
makeWall(ARENA_HALF * 2, WALL_HEIGHT, 0, WALL_HEIGHT / 2, -ARENA_HALF, 0);
makeWall(ARENA_HALF * 2, WALL_HEIGHT, 0, WALL_HEIGHT / 2, ARENA_HALF, Math.PI);
makeWall(ARENA_HALF * 2, WALL_HEIGHT, -ARENA_HALF, WALL_HEIGHT / 2, 0, Math.PI / 2);
makeWall(ARENA_HALF * 2, WALL_HEIGHT, ARENA_HALF, WALL_HEIGHT / 2, 0, -Math.PI / 2);

// gold accent trim strip along each wall base, common decorative touch in that style
const trimMat = new THREE.MeshStandardMaterial({ color: 0xc9924e, emissive: 0xc9924e, emissiveIntensity: 0.2, roughness: 0.6 });
function makeTrim(w, x, z, rotY) {
  const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, 0.12), trimMat);
  trim.position.set(x, 0.15, z);
  trim.rotation.y = rotY;
  scene.add(trim);
}
makeTrim(ARENA_HALF * 2, 0, -ARENA_HALF + 0.1, 0);
makeTrim(ARENA_HALF * 2, 0, ARENA_HALF - 0.1, 0);
makeTrim(ARENA_HALF * 2, -ARENA_HALF + 0.1, 0, Math.PI / 2);
makeTrim(ARENA_HALF * 2, ARENA_HALF - 0.1, 0, Math.PI / 2);

// wooden crates scattered as cover/visual interest, plus two simple market-stall structures.
// Each solid box also registers an axis-aligned footprint in collisionBoxes so the player
// walks into it instead of through it, and can jump on top of it - see resolveHorizontalCollision
// and groundHeightAt below (small crate rotation is ignored for collision, close enough at this scale).
const crateMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 0.85 });
const stallRoofMat = new THREE.MeshStandardMaterial({ color: 0x4a3320, roughness: 0.8 });
const collisionBoxes = [];

function addCollisionBox(x, z, halfW, halfD, topY) {
  collisionBoxes.push({ minX: x - halfW, maxX: x + halfW, minZ: z - halfD, maxZ: z + halfD, topY });
}

function makeCrate(x, z, size) {
  const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), crateMat);
  crate.position.set(x, size / 2, z);
  crate.rotation.y = Math.random() * 0.5 - 0.25;
  scene.add(crate);
  addCollisionBox(x, z, size / 2, size / 2, size);
}
[
  [-11, -8, 1.6], [-11, -4.5, 1.1], [11, -8, 1.4], [8, 6, 1.8],
  [-6, 10, 1.2], [6, -12, 1.5], [-13, 4, 1.3], [13, 10, 1.1],
].forEach(([x, z, size]) => makeCrate(x, z, size));

function makeStall(x, z) {
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.2), crateMat);
  base.position.set(x, 0.8, z);
  scene.add(base);
  addCollisionBox(x, z, 1.2, 0.6, 1.6);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 1.6), stallRoofMat);
  roof.position.set(x, 1.7, z);
  scene.add(roof);
  addCollisionBox(x, z, 1.4, 0.8, 1.775);
}
makeStall(-14, -14);
makeStall(14, 14);

// ---------- player ----------
// Eye height bumped up to match a Valorant-scale character (~1.9m tall agent, eyes a bit below
// the top of the head) instead of the shorter placeholder height this started with - see the
// matching buildHumanoid() scale-up below so target heads land at a consistent headshot line.
const player = {
  pos: new THREE.Vector3(0, 1.8, 12),
  yaw: 0,
  pitch: 0,
  eyeHeight: 1.8,
  speed: 5.4, // matches Valorant's actual rifle/sidearm run speed (5.4 m/sec, per the official wiki)
  vel: new THREE.Vector3(), // horizontal velocity - see applyGroundFriction/accelerate below
  footY: 0, // height of the ground/box surface currently stood on
  vy: 0, // vertical velocity, for jump/gravity
  grounded: true,
};
const MOVE_MARGIN = 1.2;
const PLAYER_RADIUS = 0.4;
const GRAVITY = -20;
const JUMP_SPEED = 7;

// Source/Valorant-style ground movement: friction bleeds off velocity every tick you're
// grounded, and accelerate() ramps velocity toward the wish direction. Together these give
// "braking" (release keys and slide to a stop over a few frames instead of stopping dead) and
// counter-strafing (tap the *opposite* key and your velocity gets cancelled almost instantly,
// since accelerate() then has to close a much bigger gap: wishSpeed - (-currentSpeed)).
const GROUND_ACCEL = 10;
const GROUND_FRICTION = 10; // was 6 - tightened for a snappier stop, closer to Valorant's feel (no official value exists to match exactly)
const STOP_SPEED = 1; // m/s - below this, friction drags speed straight to 0 instead of asymptoting toward it forever
// Valorant doesn't spread your shots at all once your actual speed drops under a walking-speed
// threshold, even if a move key is still held - "deadzone" tech is counter-strafing just enough
// to duck under this speed and get an accurate shot off without waiting for a full stop.
const MOVE_DEADZONE_SPEED = 1.5; // m/s

function applyGroundFriction(vel, dt) {
  const speed = Math.hypot(vel.x, vel.z);
  if (speed < 0.0001) { vel.x = 0; vel.z = 0; return; }
  const control = Math.max(speed, STOP_SPEED);
  const newSpeed = Math.max(0, speed - control * GROUND_FRICTION * dt);
  const scale = newSpeed / speed;
  vel.x *= scale;
  vel.z *= scale;
}

function accelerate(vel, wishDir, wishSpeed, accel, dt) {
  const currentSpeed = vel.x * wishDir.x + vel.z * wishDir.z;
  const addSpeed = wishSpeed - currentSpeed;
  if (addSpeed <= 0) return;
  const accelSpeed = Math.min(accel * dt * wishSpeed, addSpeed);
  vel.x += accelSpeed * wishDir.x;
  vel.z += accelSpeed * wishDir.z;
}
const keys = {};

// ---------- rebindable key bindings ----------
// Movement/jump/crouch are remappable from the settings panel; weapon slots (1/2/3) and ESC
// aren't exposed there, same as most games keep those fixed.
const DEFAULT_KEYBINDS = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  crouch: 'ControlLeft', // matches Valorant's default crouch bind
};
const KEYBIND_LABELS = { forward: '앞으로', back: '뒤로', left: '왼쪽', right: '오른쪽', jump: '점프', crouch: '앉기' };
const KEYBIND_STORAGE_KEY = 'aimrange-keybinds';
let keyBinds = { ...DEFAULT_KEYBINDS };
try {
  const savedBinds = JSON.parse(localStorage.getItem(KEYBIND_STORAGE_KEY));
  if (savedBinds && typeof savedBinds === 'object') keyBinds = { ...DEFAULT_KEYBINDS, ...savedBinds };
} catch { /* corrupt/missing storage - fall back to defaults */ }

// While actually playing (pointer locked), the bound movement keys/1-3 need to reach the game,
// not the browser - Space would otherwise scroll the page. Only suppressed during pointer lock
// so typing into the settings inputs (DPI, sensitivity, etc.) is unaffected. Rebuilt whenever a
// binding changes, since it has to track whatever codes are currently assigned.
const GAME_KEYS = new Set();
function refreshGameKeys() {
  GAME_KEYS.clear();
  Object.values(keyBinds).forEach((code) => GAME_KEYS.add(code));
  ['Digit1', 'Digit2', 'Digit3'].forEach((code) => GAME_KEYS.add(code));
}
refreshGameKeys();

document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (document.pointerLockElement === canvas && GAME_KEYS.has(e.code)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

// Highest collision box top under (x,z), or 0 (bare floor) if none - this is what the player
// stands on and what a jump has to clear.
function groundHeightAt(x, z) {
  let h = 0;
  for (const b of collisionBoxes) {
    if (x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ && b.topY > h) h = b.topY;
  }
  return h;
}

// Pushes (x,z) out of any box that's taller than the player's current feet height - a box at
// or below foot height doesn't block, which is what lets the player walk up onto (and across)
// a crate once they've jumped up to its top instead of being stuck at its edge forever.
function resolveHorizontalCollision(x, z, footY) {
  for (const b of collisionBoxes) {
    if (b.topY <= footY + 0.05) continue;
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = PLAYER_RADIUS - dist;
      x += (dx / dist) * push;
      z += (dz / dist) * push;
    }
  }
  return { x, z };
}

// Valorant's yaw constant: in-game degrees rotated per raw mouse count = sensitivity * 0.07.
// DPI doesn't factor into that ratio (both Valorant and this page read the same raw OS mouse
// counts for a given physical mouse), so matching "degrees per count" reproduces the same feel.
const VALORANT_YAW = 0.07;
let radPerCount = 0.5 * VALORANT_YAW * (Math.PI / 180);

// "Moving" now means actual speed past the deadzone, not just a key being held - holding two
// opposite keys (or braking to a near-stop) reports false the moment velocity decays enough,
// which is what lets counter-strafing/deadzone shots land accurately below.
function isPlayerMoving() {
  if (gameMode === 'tracking') return false; // player is anchored in place for tracking drills
  return player.vel.x * player.vel.x + player.vel.z * player.vel.z > MOVE_DEADZONE_SPEED * MOVE_DEADZONE_SPEED;
}

// Chrome occasionally reports a spurious huge movementX/Y right when pointer lock engages
// (or after an alt-tab/focus hiccup), which snaps the view instead of turning it smoothly.
// Skip the very first event after a fresh lock, and drop any single event whose delta is
// implausibly large for real mouse motion.
let skipNextMouseMove = false;
const MAX_MOVEMENT_PER_EVENT = 200;

document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas) return;
  if (skipNextMouseMove) {
    skipNextMouseMove = false;
    return;
  }
  if (Math.abs(e.movementX) > MAX_MOVEMENT_PER_EVENT || Math.abs(e.movementY) > MAX_MOVEMENT_PER_EVENT) {
    return;
  }
  player.yaw -= e.movementX * radPerCount;
  player.pitch -= e.movementY * radPerCount;
  const limit = Math.PI / 2 - 0.02;
  player.pitch = Math.max(-limit, Math.min(limit, player.pitch));
});

// Crouch (default Ctrl, rebindable via keyBinds.crouch). CROUCH_EYE_MULT/CROUCH_SPEED_MULT are
// tuned approximations - unlike the run speed/damage numbers elsewhere in this file, no official
// Valorant value for these was found. CROUCH_SPREAD_MULT (0.85) IS an official wiki number
// (Vandal/Phantom's crouch spread multiplier), applied here to both weapons for simplicity.
let crouchBlend = 0; // 0 = standing, 1 = fully crouched, eased each frame for a smooth camera drop
const CROUCH_BLEND_RATE = 10;
const CROUCH_EYE_MULT = 0.65;
const CROUCH_SPEED_MULT = 0.5;
const CROUCH_SPREAD_MULT = 0.85;

function updatePlayer(dt) {
  const crouching = gameMode !== 'tracking' && !!keys[keyBinds.crouch];
  crouchBlend += ((crouching ? 1 : 0) - crouchBlend) * Math.min(1, CROUCH_BLEND_RATE * dt);

  // Tracking mode keeps the player anchored in place, like Aim Lab's strafe-track drills -
  // it's meant to isolate pure mouse tracking, so WASD is ignored (and velocity cleared) while
  // it's active.
  if (gameMode === 'tracking') {
    player.vel.set(0, 0, 0);
  } else {
    const forward = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    const right = new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const wishDir = new THREE.Vector3();
    if (keys[keyBinds.forward]) wishDir.add(forward);
    if (keys[keyBinds.back]) wishDir.sub(forward);
    if (keys[keyBinds.right]) wishDir.add(right);
    if (keys[keyBinds.left]) wishDir.sub(right);
    if (wishDir.lengthSq() > 0) wishDir.normalize();

    // Friction only runs on the ground (mid-air you keep your momentum, same as Source/Valorant
    // air control), so releasing keys or counter-strafing only brakes you while grounded.
    if (player.grounded) applyGroundFriction(player.vel, dt);
    if (wishDir.lengthSq() > 0) {
      const weapon = WEAPONS[currentWeaponKey];
      let maxSpeed = isAiming && weapon.ads ? player.speed * weapon.ads.moveSpeedMult : player.speed;
      if (crouching) maxSpeed *= CROUCH_SPEED_MULT;
      accelerate(player.vel, wishDir, maxSpeed, GROUND_ACCEL, dt);
      // accelerate() only adds speed along the CURRENT wishDir, so turning the mouse while
      // airborne (no friction to bleed it back off) keeps making that projection look "under
      // wishSpeed" from a new angle each frame - classic Quake/Source strafe-jump exploit,
      // letting horizontal speed climb without bound. Clamp it back to maxSpeed every frame.
      const speedNow = Math.hypot(player.vel.x, player.vel.z);
      if (speedNow > maxSpeed) {
        const scale = maxSpeed / speedNow;
        player.vel.x *= scale;
        player.vel.z *= scale;
      }
    }
  }

  const bound = ARENA_HALF - MOVE_MARGIN;
  let nx = Math.max(-bound, Math.min(bound, player.pos.x + player.vel.x * dt));
  let nz = Math.max(-bound, Math.min(bound, player.pos.z + player.vel.z * dt));
  const resolved = resolveHorizontalCollision(nx, nz, player.footY);
  player.pos.x = resolved.x;
  player.pos.z = resolved.z;

  // Vertical: jump impulse (blocked in tracking mode along with WASD), then gravity, then
  // land the instant feet reach whatever surface (floor or a box top) is below.
  if (gameMode !== 'tracking' && keys[keyBinds.jump] && player.grounded) {
    player.vy = JUMP_SPEED;
    player.grounded = false;
  }
  player.vy += GRAVITY * dt;
  player.footY += player.vy * dt;
  const ground = groundHeightAt(player.pos.x, player.pos.z);
  if (player.footY <= ground) {
    player.footY = ground;
    player.vy = 0;
    player.grounded = true;
  } else {
    player.grounded = false;
  }

  const eyeHeight = THREE.MathUtils.lerp(player.eyeHeight, player.eyeHeight * CROUCH_EYE_MULT, crouchBlend);
  camera.position.set(player.pos.x, player.footY + eyeHeight, player.pos.z);
  camera.rotation.set(player.pitch, player.yaw, 0);
}

// ---------- weapon viewmodels ----------
// Generic low-poly silhouettes (no licensed Riot artwork), held bottom-right like a first-person
// viewmodel. Each is parented to the camera so it moves/rotates with the view for free.
const gunDark = new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.55, metalness: 0.3 });
const gunDarker = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.6, metalness: 0.2 });
const gunAccentRed = new THREE.MeshStandardMaterial({ color: 0xff4655, emissive: 0xff4655, emissiveIntensity: 0.4, roughness: 0.4 });
const gunAccentGrey = new THREE.MeshStandardMaterial({ color: 0x565b66, emissive: 0x565b66, emissiveIntensity: 0.25, roughness: 0.4 });

function addMuzzle(gun, pos) {
  const muzzleTip = new THREE.Object3D();
  muzzleTip.position.copy(pos);
  gun.add(muzzleTip);
  gun.userData.muzzleTip = muzzleTip;
}

// Sheriff: compact semi-auto pistol silhouette.
function buildSheriff() {
  const gun = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.34), gunDark);
  slide.position.set(0, 0.02, -0.06);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.2), gunDarker);
  frame.position.set(0, -0.03, 0.06);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.1, 8), gunDarker);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.28);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), gunDark);
  grip.position.set(0, -0.13, 0.15);
  grip.rotation.x = -0.32;
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.05), gunDarker);
  mag.position.set(0, -0.2, 0.14);
  gun.add(slide, frame, barrel, grip, mag);
  addMuzzle(gun, new THREE.Vector3(0, 0.02, -0.36));
  return gun;
}

// Vandal: long rifle body, full stock, visible bright tracer (matches the real game's tell).
function buildVandal() {
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), gunDark);
  body.position.set(0, 0, -0.1);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.42, 8), gunDarker);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.015, -0.62);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.28, 0.09), gunDarker);
  mag.position.set(0, -0.22, 0.02);
  mag.rotation.x = 0.15;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), gunDarker);
  grip.position.set(0, -0.16, 0.18);
  grip.rotation.x = -0.35;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.22), gunDark);
  stock.position.set(0, -0.01, 0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), gunDarker);
  sight.position.set(0, 0.085, -0.08);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.1), gunAccentRed);
  stripe.position.set(0, 0.03, 0.08);
  gun.add(body, barrel, mag, grip, stock, sight, stripe);
  addMuzzle(gun, new THREE.Vector3(0, 0.015, -0.85));
  return gun;
}

// Phantom: same rifle family but with an integrated suppressor and no visible tracer.
function buildPhantom() {
  const gun = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.62), gunDark);
  body.position.set(0, 0, -0.1);
  const suppressor = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10), gunDarker);
  suppressor.rotation.x = Math.PI / 2;
  suppressor.position.set(0, 0.015, -0.68);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.08), gunDarker);
  mag.position.set(0, -0.23, 0.03);
  mag.rotation.x = 0.22;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), gunDarker);
  grip.position.set(0, -0.16, 0.18);
  grip.rotation.x = -0.35;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, 0.22), gunDark);
  stock.position.set(0, -0.01, 0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), gunDarker);
  sight.position.set(0, 0.085, -0.08);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.1), gunAccentGrey);
  stripe.position.set(0, 0.03, 0.08);
  gun.add(body, suppressor, mag, grip, stock, sight, stripe);
  addMuzzle(gun, new THREE.Vector3(0, 0.015, -0.95));
  return gun;
}

// Approximate Valorant-style damage tables: [close, mid, far] per range bracket (meters),
// assuming a 150 HP target (100 base + 50 heavy-shield armor). Real per-patch numbers vary
// slightly; these are representative, not pulled from a live data file.
const TARGET_MAX_HP = 150;
// Damage/range/fire-rate numbers below are pulled from the official Valorant wiki's per-weapon
// pages, not estimated. Where the wiki lists no falloff bracket past its last range (Vandal has
// none at all; Sheriff/Phantom stop at 50m), the last entry here just repeats that final value
// instead of guessing a further drop-off.
// `ads` (aim-down-sights) is only present on the two rifles - the Sheriff (and pistols in
// general) has no ADS mode in Valorant. Zoom/move-speed/fire-rate multipliers are the official
// wiki's numbers for both rifles (1.25x zoom, 76% move speed, 90% fire rate while aiming).
const WEAPONS = {
  sheriff: {
    name: '셰리프', auto: false, fireInterval: 0.25, tracer: true, build: buildSheriff,
    ranges: [30, 50], bodyDmg: [55, 50, 50], headDmg: [159, 145, 145],
    recoil: null, // semi-auto pistol: no escalating spray pattern
  },
  vandal: {
    name: '밴달', auto: true, fireInterval: 1 / 9.75, tracer: true, build: buildVandal,
    ranges: [30, 50], bodyDmg: [40, 40, 40], headDmg: [160, 160, 160], // no falloff at all - Vandal one-taps headshots at any range
    recoil: { climbShots: 8, maxVertical: 5.5, maxHorizontal: 2.6, swayFreq: 0.9 },
    ads: { zoom: 1.25, moveSpeedMult: 0.76, fireRateMult: 0.9 },
  },
  phantom: {
    name: '팬텀', auto: true, fireInterval: 1 / 11, tracer: false, build: buildPhantom,
    ranges: [20, 50], bodyDmg: [39, 35, 35], headDmg: [156, 140, 140], // falls off sooner than Vandal
    recoil: { climbShots: 10, maxVertical: 4, maxHorizontal: 1.8, swayFreq: 1.1 }, // tighter than Vandal
    ads: { zoom: 1.25, moveSpeedMult: 0.76, fireRateMult: 0.9 },
  },
};

// Generic procedural spray pattern (not a real per-patch data dump): matches Valorant's actual
// feel where the first couple of bullets stay essentially on target, the middle of the burst
// climbs hard, and it eases into a plateau near the end - NOT a fast climb right from bullet 2.
// An S-curve (smoothstep) gives that slow-start/fast-middle/slow-end shape; the previous
// ease-out curve (1-(1-t)^2) climbed fastest at the very start, which is why it felt like the
// spread kicked in far too early. The camera/crosshair never moves on its own - only where the
// bullet actually lands - so, like the real game, you compensate with the mouse.
function recoilOffset(weapon, n) {
  if (!weapon.recoil) return { yaw: 0, pitch: 0 };
  const { climbShots, maxVertical, maxHorizontal, swayFreq } = weapon.recoil;
  const t = Math.min(n / climbShots, 1);
  const climb = t * t * (3 - 2 * t); // smoothstep: slow start, fast middle, plateau at the end
  const verticalDeg = maxVertical * climb;
  const horizontalDeg = maxHorizontal * climb * Math.sin(n * swayFreq);
  return {
    pitch: verticalDeg * (Math.PI / 180), // positive pitch = bullets climb upward
    yaw: horizontalDeg * (Math.PI / 180),
  };
}

function damageFor(weapon, isHead, distance) {
  const table = isHead ? weapon.headDmg : weapon.bodyDmg;
  const [near, mid] = weapon.ranges;
  if (distance <= near) return table[0];
  if (distance <= mid) return table[1];
  return table[2];
}

const GUN_BASE_POS = new THREE.Vector3(0.26, -0.24, -0.5);
const GUN_BASE_ROT = new THREE.Euler(0.03, -0.18, 0.05);
// Raised-and-centered ADS pose the gun eases toward while aiming (right-click), on rifles only.
const GUN_ADS_POS = new THREE.Vector3(0, -0.15, -0.32);

Object.entries(WEAPONS).forEach(([key, weapon]) => {
  const group = weapon.build();
  group.position.copy(GUN_BASE_POS);
  group.rotation.copy(GUN_BASE_ROT);
  group.visible = false;
  camera.add(group);
  weapon.group = group;
});

let currentWeaponKey = 'vandal';
WEAPONS[currentWeaponKey].group.visible = true;

const weaponHudEl = document.getElementById('weapon-hud');
function selectWeapon(key) {
  if (!WEAPONS[key]) return;
  WEAPONS[currentWeaponKey].group.visible = false;
  currentWeaponKey = key;
  WEAPONS[currentWeaponKey].group.visible = true;
  gunKick = 0;
  burstIndex = 0;
  if (!WEAPONS[currentWeaponKey].ads) isAiming = false; // Sheriff has no ADS - drop aim on switch
  weaponHudEl.textContent = WEAPONS[currentWeaponKey].name.toUpperCase();
}

document.addEventListener('keydown', (e) => {
  if (state !== 'running') return;
  if (e.code === 'Digit1') selectWeapon('sheriff');
  if (e.code === 'Digit2') selectWeapon('vandal');
  if (e.code === 'Digit3') selectWeapon('phantom');
});

let gunKick = 0;
let bobPhase = 0;

// Right-click aim-down-sights, rifles only (see WEAPONS[key].ads) - isAiming is the raw held
// state, aimBlend eases toward it each frame so the zoom/pose transition isn't an instant snap.
let isAiming = false;
let aimBlend = 0;
const AIM_BLEND_RATE = 12;

// Narrows camera.fov from baseFov toward baseFov/zoom as aimBlend eases in, so the FOV setting
// (updateFovFromInput) and ADS zoom (per-weapon, see WEAPONS) compose instead of one overwriting
// the other.
function updateCameraZoom() {
  const weapon = WEAPONS[currentWeaponKey];
  const zoom = weapon.ads ? 1 + (weapon.ads.zoom - 1) * aimBlend : 1;
  camera.fov = baseFov / zoom;
  camera.updateProjectionMatrix();
}

function updateWeaponView(dt) {
  const weapon = WEAPONS[currentWeaponKey];
  const gunGroup = weapon.group;
  const aimTarget = isAiming && weapon.ads ? 1 : 0;
  aimBlend += (aimTarget - aimBlend) * Math.min(1, AIM_BLEND_RATE * dt);
  updateCameraZoom();

  const moving = isPlayerMoving();
  bobPhase += dt * (moving ? 9 : 2.2);
  const bobAmt = (moving ? 0.014 : 0.004) * (1 - aimBlend * 0.7); // steadier while aiming
  const bobX = Math.sin(bobPhase) * bobAmt;
  const bobY = Math.abs(Math.cos(bobPhase)) * bobAmt * 0.8;

  gunKick *= Math.pow(1e-7, dt); // exponential decay back to 0 - snappier than before so the kick from a Sheriff's shot (0.25s between shots) has actually cleared by the next one

  const posX = THREE.MathUtils.lerp(GUN_BASE_POS.x, GUN_ADS_POS.x, aimBlend) + bobX;
  const posY = THREE.MathUtils.lerp(GUN_BASE_POS.y, GUN_ADS_POS.y, aimBlend) + bobY + gunKick * 0.05;
  const posZ = THREE.MathUtils.lerp(GUN_BASE_POS.z, GUN_ADS_POS.z, aimBlend) + gunKick * 0.1;
  gunGroup.position.set(posX, posY, posZ);
  gunGroup.rotation.set(
    GUN_BASE_ROT.x - gunKick * 0.3,
    THREE.MathUtils.lerp(GUN_BASE_ROT.y, 0, aimBlend),
    THREE.MathUtils.lerp(GUN_BASE_ROT.z, 0, aimBlend)
  );
}

// ---------- muzzle flash + bullet tracer ----------
function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,230,150,0.9)');
  g.addColorStop(1, 'rgba(255,180,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const flashTexture = glowTexture();

const fadingFx = [];
function addFadingFx(mesh, life) {
  mesh.userData._born = performance.now();
  mesh.userData._life = life;
  scene.add(mesh);
  fadingFx.push(mesh);
}
function updateFadingFx(now, dt) {
  for (let i = fadingFx.length - 1; i >= 0; i--) {
    const m = fadingFx[i];
    const age = now - m.userData._born;
    if (age >= m.userData._life) {
      scene.remove(m);
      fadingFx.splice(i, 1);
      continue;
    }
    if (m.userData._vel) {
      m.position.addScaledVector(m.userData._vel, dt);
      m.userData._vel.y -= 4 * dt; // slight droop, like a spark falling
    }
    m.material.opacity = 1 - age / m.userData._life;
  }
}

// Small burst of colored spark sprites on a hit - separate from the tracer/muzzle flash,
// gives impact feedback at the point the bullet actually landed.
function spawnImpactSpark(pos, isHead) {
  const color = isHead ? 0xff4655 : 0xffd97a;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const mat = new THREE.SpriteMaterial({ map: flashTexture, color, transparent: true, opacity: 1, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(0.05 + Math.random() * 0.05);
    sprite.position.copy(pos);
    const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1 + 0.3, Math.random() * 2 - 1).normalize();
    sprite.userData._vel = dir.multiplyScalar(1.5 + Math.random() * 2);
    addFadingFx(sprite, 220 + Math.random() * 120);
  }
}

function spawnTracer(start, end) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(dir.length(), 0.01);
  dir.normalize();
  const geo = new THREE.CylinderGeometry(0.007, 0.007, length, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.95, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(start).addScaledVector(dir, length / 2);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  addFadingFx(mesh, 90);
}

function spawnMuzzleFlash(pos) {
  const mat = new THREE.SpriteMaterial({ map: flashTexture, transparent: true, opacity: 1, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.setScalar(0.35);
  sprite.position.copy(pos);
  addFadingFx(sprite, 60);

  // Reused single light (not a fresh one per shot) so rapid auto-fire doesn't pile up point
  // lights - each shot just snaps the intensity back to max and lets it decay in the loop.
  muzzleLight.position.copy(pos);
  muzzleLight.intensity = 3.5;
}
const muzzleLight = new THREE.PointLight(0xffb347, 0, 4, 2);
scene.add(muzzleLight);

// ---------- targets (human-sized dummies, ~1.9m tall like a Valorant agent, head near the
// player's own 1.8m eye height so head-level flicks feel like aiming at another player) ----------
const TARGET_BOUND = ARENA_HALF - 3;
let movingRatio = 0.5;

// Tracking mode's roaming box: centered 12m in front of the tracking anchor point the player
// is snapped to when that mode starts (see TRACK_ANCHOR) - the target wanders left-right AND
// forward/back within this box instead of a single straight line.
const TRACK_LANE = { xHalfWidth: 8, zMin: -6, zMax: 6 };
const TRACK_SPEED_MIN = 1.5;
const TRACK_SPEED_MAX = 4.5;
function randomLaneSpeed() { return TRACK_SPEED_MIN + Math.random() * (TRACK_SPEED_MAX - TRACK_SPEED_MIN); }
const TRACK_ANCHOR = { x: 0, z: 12, yaw: 0 };

function buildHumanoid(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.5 });

  const legGeo = new THREE.CylinderGeometry(0.098, 0.12, 0.92, 8);
  const legL = new THREE.Mesh(legGeo, mat);
  legL.position.set(-0.14, 0.46, 0);
  const legR = new THREE.Mesh(legGeo, mat);
  legR.position.set(0.14, 0.46, 0);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.65, 8), mat);
  torso.position.set(0, 1.25, 0);

  const armGeo = new THREE.CylinderGeometry(0.065, 0.076, 0.67, 8);
  const armL = new THREE.Mesh(armGeo, mat);
  armL.position.set(-0.35, 1.2, 0);
  const armR = new THREE.Mesh(armGeo, mat);
  armR.position.set(0.35, 1.2, 0);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), mat);
  head.position.set(0, 1.74, 0);
  head.userData.part = 'head';

  [legL, legR, torso, armL, armR].forEach((m) => { m.userData.part = 'body'; });

  group.add(legL, legR, torso, armL, armR, head);
  group.userData.material = mat;
  group.userData.baseEmissive = 0.25;
  return group;
}

// Keeps targets out of the crates/stalls the same way resolveHorizontalCollision keeps the
// player out of them - pushes the target's (circular) footprint out of any overlapping box, and
// mirrors its velocity off the box's normal so a moving/tracking target bounces away instead of
// getting stuck pushing into a wall it can't enter.
const TARGET_RADIUS = 0.4;
function resolveTargetBoxCollision(t) {
  for (const b of collisionBoxes) {
    const x = t.mesh.position.x;
    const z = t.mesh.position.z;
    const closestX = Math.max(b.minX, Math.min(x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(z, b.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq >= TARGET_RADIUS * TARGET_RADIUS) continue;
    let nx, nz;
    if (distSq > 1e-6) {
      const dist = Math.sqrt(distSq);
      nx = dx / dist;
      nz = dz / dist;
      const push = TARGET_RADIUS - dist;
      t.mesh.position.x += nx * push;
      t.mesh.position.z += nz * push;
    } else {
      // Center landed exactly inside the box (e.g. spawn point) - push out the nearest side.
      const distToMinX = x - b.minX;
      const distToMaxX = b.maxX - x;
      const distToMinZ = z - b.minZ;
      const distToMaxZ = b.maxZ - z;
      const min = Math.min(distToMinX, distToMaxX, distToMinZ, distToMaxZ);
      if (min === distToMinX) { nx = -1; nz = 0; t.mesh.position.x = b.minX - TARGET_RADIUS; }
      else if (min === distToMaxX) { nx = 1; nz = 0; t.mesh.position.x = b.maxX + TARGET_RADIUS; }
      else if (min === distToMinZ) { nx = 0; nz = -1; t.mesh.position.z = b.minZ - TARGET_RADIUS; }
      else { nx = 0; nz = 1; t.mesh.position.z = b.maxZ + TARGET_RADIUS; }
    }
    if (t.vel) {
      const dot = t.vel.x * nx + t.vel.z * nz;
      if (dot < 0) {
        t.vel.x -= 2 * dot * nx;
        t.vel.z -= 2 * dot * nz;
      }
    }
  }
}

class TargetManager {
  constructor() {
    this.targets = [];
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  clear() {
    this.targets.forEach((t) => this.group.remove(t.mesh));
    this.targets = [];
  }

  spawnOne() {
    if (gameMode === 'flick') return this.spawnFlick();
    if (gameMode === 'tracking') return this.spawnTracking();
    return this.spawnGridshot();
  }

  spawnGridshot() {
    const isMoving = Math.random() < movingRatio;
    const color = isMoving ? 0xffb400 : 0x4da8ff;
    const humanoid = buildHumanoid(color);

    const x = (Math.random() * 2 - 1) * TARGET_BOUND;
    const z = (Math.random() * 2 - 1) * TARGET_BOUND;
    humanoid.position.set(x, 0, z);
    humanoid.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(humanoid);

    const data = {
      mesh: humanoid,
      isMoving,
      hp: TARGET_MAX_HP,
      spawnTime: performance.now(),
      lifetime: isMoving ? 7000 + Math.random() * 4000 : 3500 + Math.random() * 2500,
    };

    if (isMoving) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 2;
      data.vel = new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed);
    }

    resolveTargetBoxCollision(data);
    humanoid.traverse((obj) => { if (obj.isMesh) obj.userData.targetData = data; });

    this.targets.push(data);
    return data;
  }

  // Flick mode: single target flashed at a random angle away from where the player is
  // currently looking, forcing an actual flick of the mouse instead of a target that was
  // already near the crosshair.
  spawnFlick() {
    const humanoid = buildHumanoid(0x4da8ff);
    const angleOffset = (25 + Math.random() * 45) * (Math.PI / 180) * (Math.random() < 0.5 ? -1 : 1);
    const dirYaw = player.yaw + angleOffset;
    const dist = 6 + Math.random() * 10;
    let x = player.pos.x + -Math.sin(dirYaw) * dist;
    let z = player.pos.z + -Math.cos(dirYaw) * dist;
    x = Math.max(-TARGET_BOUND, Math.min(TARGET_BOUND, x));
    z = Math.max(-TARGET_BOUND, Math.min(TARGET_BOUND, z));
    humanoid.position.set(x, 0, z);
    humanoid.rotation.y = Math.random() * Math.PI * 2;
    this.group.add(humanoid);

    const data = {
      mesh: humanoid,
      isMoving: false,
      hp: TARGET_MAX_HP,
      spawnTime: performance.now(),
      lifetime: 1100 + Math.random() * 500,
    };
    resolveTargetBoxCollision(data);
    humanoid.traverse((obj) => { if (obj.isMesh) obj.userData.targetData = data; });
    this.targets.push(data);
    return data;
  }

  // Tracking mode: an Aim Lab-style tracking target - it wanders freely (left-right AND
  // forward-back) inside a box in front of the (stationary) player, picking a new random
  // direction periodically and bouncing at the box edges. It has no HP and never dies/respawns
  // from being hit - the whole point is holding the crosshair on a continuously moving target,
  // not clicking it away like gridshot/flick.
  spawnTracking() {
    const humanoid = buildHumanoid(0xffb400);
    const x = (Math.random() * 2 - 1) * TRACK_LANE.xHalfWidth;
    const z = TRACK_LANE.zMin + Math.random() * (TRACK_LANE.zMax - TRACK_LANE.zMin);
    humanoid.position.set(x, 0, z);
    this.group.add(humanoid);

    const angle = Math.random() * Math.PI * 2;
    const data = {
      mesh: humanoid,
      behavior: 'lane',
      spawnTime: performance.now(),
      lifetime: Infinity,
      vel: new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      laneSpeed: randomLaneSpeed(),
      laneTargetSpeed: randomLaneSpeed(),
      speedChangeTimer: 0.4 + Math.random() * 0.8,
      turnTimer: 1.2 + Math.random() * 1.8,
    };
    resolveTargetBoxCollision(data);
    humanoid.traverse((obj) => { if (obj.isMesh) obj.userData.targetData = data; });
    this.targets.push(data);
    return data;
  }

  respawn(data) {
    this.group.remove(data.mesh);
    const idx = this.targets.indexOf(data);
    if (idx !== -1) this.targets.splice(idx, 1);
    this.spawnOne();
  }

  ensureCount(count) {
    while (this.targets.length < count) this.spawnOne();
    while (this.targets.length > count) {
      const t = this.targets.pop();
      this.group.remove(t.mesh);
    }
  }

  update(dt, now) {
    for (const t of [...this.targets]) {
      if (t.behavior === 'lane') {
        // Speed drifts continuously toward a periodically-reroled target instead of only
        // jumping at direction changes, so the pace keeps shifting throughout a pass.
        t.speedChangeTimer -= dt;
        if (t.speedChangeTimer <= 0) {
          t.laneTargetSpeed = randomLaneSpeed();
          t.speedChangeTimer = 0.4 + Math.random() * 0.8;
        }
        t.laneSpeed += (t.laneTargetSpeed - t.laneSpeed) * Math.min(1, dt * 3);

        // Direction turns to a fresh random heading periodically (not just a 180 flip), so it
        // wanders the box in both X (left-right) and Z (forward-back) instead of one straight line.
        t.turnTimer -= dt;
        if (t.turnTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          t.vel.set(Math.cos(angle), 0, Math.sin(angle));
          t.turnTimer = 1.2 + Math.random() * 1.8;
        }

        t.mesh.position.x += t.vel.x * t.laneSpeed * dt;
        t.mesh.position.z += t.vel.z * t.laneSpeed * dt;
        if (t.mesh.position.x > TRACK_LANE.xHalfWidth || t.mesh.position.x < -TRACK_LANE.xHalfWidth) {
          t.mesh.position.x = Math.max(-TRACK_LANE.xHalfWidth, Math.min(TRACK_LANE.xHalfWidth, t.mesh.position.x));
          t.vel.x *= -1;
        }
        if (t.mesh.position.z > TRACK_LANE.zMax || t.mesh.position.z < TRACK_LANE.zMin) {
          t.mesh.position.z = Math.max(TRACK_LANE.zMin, Math.min(TRACK_LANE.zMax, t.mesh.position.z));
          t.vel.z *= -1;
        }
        resolveTargetBoxCollision(t);
        t.mesh.rotation.y = Math.atan2(t.vel.x, t.vel.z);
        continue;
      }
      if (t.isMoving) {
        t.mesh.position.x += t.vel.x * dt;
        t.mesh.position.z += t.vel.z * dt;
        if (t.mesh.position.x > TARGET_BOUND || t.mesh.position.x < -TARGET_BOUND) {
          t.vel.x *= -1;
          t.mesh.position.x = Math.max(-TARGET_BOUND, Math.min(TARGET_BOUND, t.mesh.position.x));
        }
        if (t.mesh.position.z > TARGET_BOUND || t.mesh.position.z < -TARGET_BOUND) {
          t.vel.z *= -1;
          t.mesh.position.z = Math.max(-TARGET_BOUND, Math.min(TARGET_BOUND, t.mesh.position.z));
        }
        resolveTargetBoxCollision(t);
        t.mesh.rotation.y = Math.atan2(t.vel.x, t.vel.z);
      }
      if (now - t.spawnTime > t.lifetime) {
        this.respawn(t);
      }
    }
  }

  meshes() {
    const list = [];
    for (const t of this.targets) {
      t.mesh.traverse((obj) => { if (obj.isMesh) list.push(obj); });
    }
    return list;
  }
}

const targetManager = new TargetManager();

// ---------- shooting ----------
const raycaster = new THREE.Raycaster();
let shotsFired = 0;
let hits = 0;
let kills = 0;
let headshots = 0;
let reactionTimes = [];
let trackScoreSum = 0; // tracking mode only: weighted on-target ticks (head counts double)

// Moving-while-shooting inaccuracy, like Valorant's run-and-gun bloom: standing still (or
// slow enough to be under MOVE_DEADZONE_SPEED, via braking/counter-strafing) is pinpoint,
// actually moving above that speed throws the shot off inside a random cone. Being airborne
// (jumping or just falling off a crate) is punished much harder than running. Degrees match
// Valorant's official "Running"/"Airborne" spread-penalty values (+6°/+10°) - there's no
// separate walk state here, movement is binary past the deadzone, so the running number applies.
const MOVE_SPREAD_DEG = 6;
const AIR_SPREAD_DEG = 10;

let audioCtx = null;
let masterGain = null;

// Every sound source connects to this instead of audioCtx.destination directly, so the
// volume slider/mute button can scale everything at once without touching each sound.
const VOLUME_STORAGE_KEY = 'aimrange-volume';
const MUTE_STORAGE_KEY = 'aimrange-muted';
let masterVolume = 70;
let isMuted = false;
{
  const savedVolume = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY));
  if (!Number.isNaN(savedVolume)) masterVolume = Math.min(100, Math.max(0, savedVolume));
  isMuted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
}
function applyMasterVolume() {
  if (masterGain) masterGain.gain.value = isMuted ? 0 : masterVolume / 100;
}

function playBeep(freq) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
  osc.connect(gain).connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + 0.08);
}

// Soft-clip curve shared by every gunshot's crack layer - pushes the noise transient into
// mild saturation for a harsher, more "real" snap instead of a clean filtered hiss.
function makeDistortionCurve(amount) {
  const n = 4096;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount);
  }
  return curve;
}
const gunshotDistortionCurve = makeDistortionCurve(8);

function makeNoiseBuffer(duration) {
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

// Synthesized gunshot built from four layered noise/oscillator sources - no external audio
// asset needed. Real gunshots read as a sharp transient crack, a midrange bang, a felt sub
// thump, and a lingering low-frequency tail as the report bounces around; layering those
// separately (instead of one filtered noise burst) is what makes it read as a "real" shot
// rather than a beep. Shaped per weapon: pistol = shorter/sharper, phantom's suppressor
// mutes the crack and kills the tail almost entirely, vandal is the loudest/fullest.
function playGunshot(weaponKey) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const isPistol = weaponKey === 'sheriff';
  const isSuppressed = weaponKey === 'phantom';

  // 1) Crack: very short, distorted, front-loaded transient - the percussive "snap".
  const crackDur = isSuppressed ? 0.02 : 0.035;
  const crackBuf = makeNoiseBuffer(crackDur);
  const crackData = crackBuf.getChannelData(0);
  for (let i = 0; i < crackData.length; i++) {
    crackData[i] *= Math.pow(1 - i / crackData.length, 0.5);
  }
  const crack = audioCtx.createBufferSource();
  crack.buffer = crackBuf;
  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = isSuppressed ? 'bandpass' : 'highpass';
  crackFilter.frequency.value = isSuppressed ? 2200 : (isPistol ? 1800 : 1400);
  if (isSuppressed) crackFilter.Q.value = 0.9;
  const crackShaper = audioCtx.createWaveShaper();
  crackShaper.curve = gunshotDistortionCurve;
  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(isSuppressed ? 0.35 : 0.8, now);
  crackGain.gain.exponentialRampToValueAtTime(0.001, now + crackDur);
  crack.connect(crackFilter).connect(crackShaper).connect(crackGain).connect(masterGain);
  crack.start(now);
  crack.stop(now + crackDur + 0.01);

  // 2) Body: midrange "bang" filling the gap between the crack and the sub thump.
  const bodyDur = isPistol ? 0.09 : 0.13;
  const body = audioCtx.createBufferSource();
  body.buffer = makeNoiseBuffer(bodyDur);
  const bodyFilter = audioCtx.createBiquadFilter();
  bodyFilter.type = 'bandpass';
  bodyFilter.frequency.value = isSuppressed ? 900 : (isPistol ? 1100 : 750);
  bodyFilter.Q.value = isSuppressed ? 1.2 : 0.6;
  const bodyGain = audioCtx.createGain();
  bodyGain.gain.setValueAtTime(isSuppressed ? 0.28 : 0.55, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + bodyDur);
  body.connect(bodyFilter).connect(bodyGain).connect(masterGain);
  body.start(now);
  body.stop(now + bodyDur + 0.01);

  // 3) Sub thump: the low punch you feel more than hear.
  const thump = audioCtx.createOscillator();
  thump.type = 'triangle';
  thump.frequency.setValueAtTime(isPistol ? 170 : 130, now);
  thump.frequency.exponentialRampToValueAtTime(isPistol ? 55 : 38, now + 0.09);
  const thumpGain = audioCtx.createGain();
  thumpGain.gain.setValueAtTime(isSuppressed ? 0.22 : 0.6, now);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  thump.connect(thumpGain).connect(masterGain);
  thump.start(now);
  thump.stop(now + 0.12);

  // 4) Tail: lingering low rumble as the report trails off - a suppressor kills most of
  // this, so the phantom skips it entirely.
  if (!isSuppressed) {
    const tailDur = isPistol ? 0.18 : 0.32;
    const tail = audioCtx.createBufferSource();
    tail.buffer = makeNoiseBuffer(tailDur);
    const tailFilter = audioCtx.createBiquadFilter();
    tailFilter.type = 'lowpass';
    tailFilter.frequency.value = 220;
    const tailGain = audioCtx.createGain();
    tailGain.gain.setValueAtTime(0.001, now);
    tailGain.gain.linearRampToValueAtTime(isPistol ? 0.12 : 0.22, now + 0.02);
    tailGain.gain.exponentialRampToValueAtTime(0.001, now + tailDur);
    tail.connect(tailFilter).connect(tailGain).connect(masterGain);
    tail.start(now);
    tail.stop(now + tailDur + 0.01);
  }
}

// Two-tone ascending "kill confirm" ping, distinct from the plain hit beep.
function playKillConfirm() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  [1200, 1800].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = now + i * 0.07;
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
    osc.connect(gain).connect(masterGain);
    osc.start(t0);
    osc.stop(t0 + 0.16);
  });
}

// Recoil burst tracking: consecutive shots (auto weapons) climb the spray pattern; a pause
// longer than RECOIL_RESET_GAP, a weapon switch, or releasing the trigger resets it.
let burstIndex = 0;
let lastFireTime = -Infinity;
const RECOIL_RESET_GAP = 0.35;

function getAimDirection() {
  return new THREE.Vector3(
    -Math.cos(player.pitch) * Math.sin(player.yaw),
    Math.sin(player.pitch),
    -Math.cos(player.pitch) * Math.cos(player.yaw)
  );
}

function computeShotDirection() {
  let yaw = player.yaw;
  let pitch = player.pitch;

  const recoil = recoilOffset(WEAPONS[currentWeaponKey], burstIndex);
  yaw += recoil.yaw;
  pitch += recoil.pitch;

  // Jumping/falling is far less accurate than just moving on the ground, matching Valorant's
  // harsh airborne accuracy penalty - it takes priority over (doesn't stack with) run spread.
  let spreadDeg = !player.grounded ? AIR_SPREAD_DEG : isPlayerMoving() ? MOVE_SPREAD_DEG : 0;
  if (keys[keyBinds.crouch]) spreadDeg *= CROUCH_SPREAD_MULT;
  if (spreadDeg > 0) {
    const maxRad = spreadDeg * (Math.PI / 180);
    const r = Math.sqrt(Math.random()) * maxRad;
    const theta = Math.random() * Math.PI * 2;
    yaw += Math.cos(theta) * r;
    pitch += Math.sin(theta) * r;
  }
  return new THREE.Vector3(
    -Math.cos(pitch) * Math.sin(yaw),
    Math.sin(pitch),
    -Math.cos(pitch) * Math.cos(yaw)
  );
}

function flashDamage(data) {
  const mat = data.mesh.userData.material;
  if (!mat) return;
  mat.emissiveIntensity = 1.1;
  clearTimeout(data._flashTimeout);
  data._flashTimeout = setTimeout(() => { mat.emissiveIntensity = data.mesh.userData.baseEmissive; }, 90);
}

function shoot() {
  shotsFired++;
  playGunshot(currentWeaponKey);
  gunKick = 1;
  const weapon = WEAPONS[currentWeaponKey];

  const nowSec = performance.now() / 1000;
  if (nowSec - lastFireTime > RECOIL_RESET_GAP) burstIndex = 0;
  lastFireTime = nowSec;

  const dir = computeShotDirection();
  burstIndex++;
  raycaster.set(camera.position, dir);
  const intersects = raycaster.intersectObjects(targetManager.meshes());

  const muzzleWorld = new THREE.Vector3();
  weapon.group.userData.muzzleTip.getWorldPosition(muzzleWorld);

  let tracerEnd;
  if (intersects.length > 0) {
    const mesh = intersects[0].object;
    const data = mesh.userData.targetData;
    const isHead = mesh.userData.part === 'head';
    tracerEnd = intersects[0].point;
    hits++;
    if (isHead) headshots++;

    const distance = camera.position.distanceTo(tracerEnd);
    const dmg = damageFor(weapon, isHead, distance);
    data.hp -= dmg;
    spawnImpactSpark(tracerEnd, isHead);
    if (data.hp <= 0.001) {
      kills++;
      reactionTimes.push(performance.now() - data.spawnTime);
      targetManager.respawn(data);
      playKillConfirm();
      showHitmarker(isHead);
    } else {
      flashDamage(data);
      playBeep(isHead ? 1500 : 900);
      showHitmarker(isHead);
    }
  } else {
    tracerEnd = camera.position.clone().addScaledVector(dir, 60);
  }
  if (weapon.tracer) spawnTracer(muzzleWorld, tracerEnd);
  spawnMuzzleFlash(muzzleWorld);
  updateHudStats();
}

const hitmarkerEl = document.getElementById('hitmarker');
const headshotTextEl = document.getElementById('headshot-text');
let hitmarkerTimeout = null;
let headshotTextTimeout = null;
function showHitmarker(isHead) {
  hitmarkerEl.classList.remove('show');
  hitmarkerEl.classList.toggle('headshot', !!isHead);
  void hitmarkerEl.offsetWidth;
  hitmarkerEl.classList.add('show');
  clearTimeout(hitmarkerTimeout);
  hitmarkerTimeout = setTimeout(() => hitmarkerEl.classList.remove('show'), 200);

  if (isHead) {
    headshotTextEl.classList.remove('show');
    void headshotTextEl.offsetWidth;
    headshotTextEl.classList.add('show');
    clearTimeout(headshotTextTimeout);
    headshotTextTimeout = setTimeout(() => headshotTextEl.classList.remove('show'), 500);
  }
}

// ---------- tracking mode ----------
// A continuous "laser" beam shown only while actively tracking, colored by whether the
// crosshair currently sits on the target - reused/repositioned every frame rather than
// spawned fresh, since it needs to exist for the whole time the trigger is held.
const trackBeamMat = new THREE.MeshBasicMaterial({ color: 0x7fffbf, transparent: true, opacity: 0.55, depthWrite: false });
const trackBeamMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1, 6), trackBeamMat);
trackBeamMesh.visible = false;
scene.add(trackBeamMesh);

function updateTrackBeam(start, end, onTarget) {
  const dir = new THREE.Vector3().subVectors(end, start);
  const length = Math.max(dir.length(), 0.01);
  dir.normalize();
  trackBeamMesh.visible = true;
  trackBeamMesh.position.copy(start).addScaledVector(dir, length / 2);
  trackBeamMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  trackBeamMesh.scale.set(1, length, 1);
  trackBeamMat.color.set(onTarget ? 0x7fffbf : 0xff6b6b);
  trackBeamMat.opacity = onTarget ? 0.6 : 0.22;
}
function hideTrackBeam() { trackBeamMesh.visible = false; }

// Continuous low hum instead of a gunshot per tick (which would sound like machine-gun
// spam at the tracking tick rate) - one persistent oscillator whose gain is ramped toward
// a louder level while on-target and a quieter one while held but missing.
let trackOsc = null;
let trackGain = null;
function ensureTrackAudio() {
  if (trackOsc || !audioCtx) return;
  trackOsc = audioCtx.createOscillator();
  trackOsc.type = 'sawtooth';
  trackOsc.frequency.value = 85;
  const trackFilter = audioCtx.createBiquadFilter();
  trackFilter.type = 'lowpass';
  trackFilter.frequency.value = 450;
  trackGain = audioCtx.createGain();
  trackGain.gain.value = 0;
  trackOsc.connect(trackFilter).connect(trackGain).connect(masterGain);
  trackOsc.start();
}
function updateTrackAudio(onTarget) {
  ensureTrackAudio();
  if (!trackGain) return;
  trackGain.gain.linearRampToValueAtTime(onTarget ? 0.1 : 0.03, audioCtx.currentTime + 0.05);
}
function silenceTrackAudio() {
  if (trackGain) trackGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.08);
  hideTrackBeam();
}

// Tracking has no kill/HP concept - the lane target never goes away, and the drill is purely
// "what fraction of the time was the crosshair actually on it". Ticks at a fixed rate so that
// fraction reuses the same hits/shotsFired/headshots accounting as the click-based modes
// (accuracy %, HUD, results all fall out for free) instead of a separate stat path.
const TRACK_TICK = 0.05;
let trackAccumulator = 0;

function updateTracking(dt) {
  const weapon = WEAPONS[currentWeaponKey];
  const dir = getAimDirection();
  raycaster.set(camera.position, dir);
  const intersects = raycaster.intersectObjects(targetManager.meshes());
  const onTarget = intersects.length > 0;

  const muzzleWorld = new THREE.Vector3();
  weapon.group.userData.muzzleTip.getWorldPosition(muzzleWorld);
  const beamEnd = onTarget ? intersects[0].point : camera.position.clone().addScaledVector(dir, 40);
  updateTrackBeam(muzzleWorld, beamEnd, onTarget);
  updateTrackAudio(onTarget);

  trackAccumulator += dt;
  while (trackAccumulator >= TRACK_TICK) {
    trackAccumulator -= TRACK_TICK;
    shotsFired++;
    if (onTarget) {
      hits++;
      const mesh = intersects[0].object;
      const data = mesh.userData.targetData;
      const isHead = mesh.userData.part === 'head';
      if (isHead) headshots++;
      trackScoreSum += isHead ? 1 : 0.5; // headshots are harder to hold, so they're worth more
      flashDamage(data); // cosmetic flash only - no HP, target keeps sliding either way
    }
  }
  updateHudStats();
}

let triggerHeld = false;
let lastShotTime = -Infinity;

function tryShoot() {
  const now = performance.now() / 1000;
  const weapon = WEAPONS[currentWeaponKey];
  const interval = isAiming && weapon.ads ? weapon.fireInterval / weapon.ads.fireRateMult : weapon.fireInterval;
  if (now - lastShotTime < interval) return;
  lastShotTime = now;
  shoot();
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // right-click drives ADS, not a browser menu

canvas.addEventListener('mousedown', (e) => {
  if (document.pointerLockElement !== canvas || state !== 'running') return;
  if (e.button === 0) {
    triggerHeld = true;
    if (gameMode !== 'tracking') tryShoot();
  } else if (e.button === 2) {
    isAiming = !isAiming; // toggle, not hold - click once to aim, click again to drop it
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (e.button === 0) {
    triggerHeld = false;
    burstIndex = 0;
    if (gameMode === 'tracking') silenceTrackAudio();
  }
});
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas) {
    triggerHeld = false;
    burstIndex = 0;
    isAiming = false;
    aimBlend = 0; // snap the zoom back instantly - no eased animate() ticks while paused to do it
    updateCameraZoom();
    silenceTrackAudio();
  }
});

// ---------- HUD ----------
const hudEl = document.getElementById('hud');
const hudTimeEl = document.getElementById('hud-time');
const hudScoreEl = document.getElementById('hud-score');
const hudHsEl = document.getElementById('hud-hs');
const hudAccEl = document.getElementById('hud-acc');
const hudAccLabelEl = document.getElementById('hud-acc-label');
const crosshairEl = document.getElementById('crosshair');

function updateHudStats() {
  hudScoreEl.textContent = kills;
  hudHsEl.textContent = `(${headshots} HS)`;
  if (gameMode === 'tracking') {
    const score = shotsFired === 0 ? 100 : Math.round((trackScoreSum / shotsFired) * 100);
    hudAccEl.textContent = score + '/100';
    hudAccLabelEl.textContent = 'SCORE';
  } else {
    const acc = shotsFired === 0 ? 100 : Math.round((hits / shotsFired) * 100);
    hudAccEl.textContent = acc + '%';
    hudAccLabelEl.textContent = 'ACC';
  }
}

function updateHudTime() {
  if (duration === 0) {
    hudTimeEl.textContent = formatTime(elapsed);
  } else {
    hudTimeEl.textContent = formatTime(Math.max(0, duration - elapsed));
  }
}

function formatTime(sec) {
  return Math.ceil(sec).toString();
}

// ---------- overlays / state machine ----------
const overlayEl = document.getElementById('overlay');
const resultsEl = document.getElementById('results');
const startBtn = document.getElementById('btn-start');
const restartBtn = document.getElementById('btn-restart');

const optMode = document.getElementById('opt-mode');
const modeInfoEl = document.getElementById('mode-info');
const optDuration = document.getElementById('opt-duration');
const optTargets = document.getElementById('opt-targets');
const optDpi = document.getElementById('opt-dpi');
const optValSens = document.getElementById('opt-valsens');
const optMovingRatio = document.getElementById('opt-movingratio');
const optWeapon = document.getElementById('opt-weapon');
const optCrosshair = document.getElementById('opt-crosshair');
const sensInfoEl = document.getElementById('sens-info');

const MODE_INFO = {
  gridshot: '표적을 처치하며 반응속도와 정확도를 훈련합니다.',
  tracking: '고정된 위치에서 좌우·앞뒤로 자유롭게 움직이는 표적을 좌클릭을 누른 채 마우스로 계속 따라가세요. 표적은 사라지지 않고, 조준을 맞추고 있던 시간 비율로 정확도가 매겨집니다.',
  flick: '표적이 화면 밖 무작위 각도에 짧게 나타납니다. 빠르게 반응해서 플릭으로 명중시키세요.',
};
function applyModeUI() {
  const mode = optMode.value;
  modeInfoEl.textContent = MODE_INFO[mode] || '';
  optMovingRatio.disabled = mode !== 'gridshot';
  optTargets.disabled = mode === 'flick' || mode === 'tracking';
}
optMode.addEventListener('change', applyModeUI);
applyModeUI();

function desiredTargetCount() {
  if (optMode.value === 'flick' || optMode.value === 'tracking') return 1;
  return parseInt(optTargets.value, 10);
}

function applyCrosshairStyle() {
  crosshairEl.classList.remove('style-dot', 'style-cross', 'style-both');
  crosshairEl.classList.add(`style-${optCrosshair.value}`);
}
optCrosshair.addEventListener('change', applyCrosshairStyle);
applyCrosshairStyle();

const optVolume = document.getElementById('opt-volume');
const volumeValueEl = document.getElementById('volume-value');
const muteBtn = document.getElementById('btn-mute');
function refreshVolumeUI() {
  optVolume.value = masterVolume;
  volumeValueEl.textContent = `${Math.round(masterVolume)}%`;
  muteBtn.textContent = isMuted || masterVolume === 0 ? '🔇' : '🔊';
  muteBtn.classList.toggle('muted', isMuted);
}
optVolume.addEventListener('input', () => {
  masterVolume = parseFloat(optVolume.value);
  if (masterVolume > 0 && isMuted) isMuted = false;
  localStorage.setItem(VOLUME_STORAGE_KEY, String(masterVolume));
  localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
  applyMasterVolume();
  refreshVolumeUI();
});
muteBtn.addEventListener('click', () => {
  isMuted = !isMuted;
  localStorage.setItem(MUTE_STORAGE_KEY, String(isMuted));
  applyMasterVolume();
  refreshVolumeUI();
});
refreshVolumeUI();

// ---------- key binding UI ----------
function keyCodeLabel(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const special = {
    Space: 'Space', ControlLeft: 'Ctrl', ControlRight: 'RCtrl',
    ShiftLeft: 'Shift', ShiftRight: 'RShift', AltLeft: 'Alt', AltRight: 'RAlt',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`',
  };
  return special[code] || code;
}

const keybindListEl = document.getElementById('keybind-list');
const keybindResetBtn = document.getElementById('btn-keybind-reset');
let rebindingAction = null;

function renderKeybindRows() {
  keybindListEl.innerHTML = '';
  Object.keys(DEFAULT_KEYBINDS).forEach((action) => {
    const row = document.createElement('div');
    row.className = 'row keybind-row';
    const label = document.createElement('label');
    label.textContent = KEYBIND_LABELS[action];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'keybind-btn';
    if (rebindingAction === action) {
      btn.textContent = '키를 누르세요...';
      btn.classList.add('listening');
    } else {
      btn.textContent = keyCodeLabel(keyBinds[action]);
    }
    btn.addEventListener('click', () => {
      if (rebindingAction) return; // one rebind at a time
      rebindingAction = action;
      renderKeybindRows();
    });
    row.appendChild(label);
    row.appendChild(btn);
    keybindListEl.appendChild(row);
  });
}
renderKeybindRows();

keybindResetBtn.addEventListener('click', () => {
  if (rebindingAction) return;
  keyBinds = { ...DEFAULT_KEYBINDS };
  localStorage.setItem(KEYBIND_STORAGE_KEY, JSON.stringify(keyBinds));
  refreshGameKeys();
  renderKeybindRows();
});

// Capture phase + stopPropagation so a key pressed while rebinding never reaches the gameplay
// keydown handler (which would otherwise record it in `keys` or trigger a weapon switch).
document.addEventListener('keydown', (e) => {
  if (!rebindingAction) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.code !== 'Escape') {
    keyBinds[rebindingAction] = e.code;
    localStorage.setItem(KEYBIND_STORAGE_KEY, JSON.stringify(keyBinds));
    refreshGameKeys();
  }
  rebindingAction = null;
  renderKeybindRows();
}, true);

let state = 'idle'; // idle | running | paused | ended
let gameMode = 'gridshot'; // gridshot | tracking | flick
let duration = 60;
let elapsed = 0;
let lastTime = performance.now();

function updateSensFromInputs() {
  const dpi = parseFloat(optDpi.value) || 800;
  const valSens = parseFloat(optValSens.value) || 0.5;
  const degPerCount = valSens * VALORANT_YAW;
  radPerCount = degPerCount * (Math.PI / 180);
  const cm360 = (360 / degPerCount / dpi) * 2.54;
  sensInfoEl.innerHTML = `cm/360: <strong>${cm360.toFixed(1)}cm</strong> · 발로란트와 동일한 마우스 회전값으로 맞춰줍니다`;
}
optDpi.addEventListener('input', updateSensFromInputs);
optValSens.addEventListener('input', updateSensFromInputs);
updateSensFromInputs();

const optFov = document.getElementById('opt-fov');
let baseFov = 90; // the non-ADS vertical fov derived from the FOV setting - updateCameraZoom()
                   // narrows camera.fov from this while aiming, it never overwrites this value.
function updateFovFromInput() {
  const hFov = Math.min(103, Math.max(90, parseFloat(optFov.value) || 103));
  baseFov = valorantFovToVerticalFov(hFov);
  updateCameraZoom();
}
optFov.addEventListener('input', updateFovFromInput);
updateFovFromInput();

let lastGameMode = null;
function readSettings() {
  gameMode = optMode.value;
  // Targets from a previous mode carry fields (hp, behavior) the new mode's logic doesn't
  // know about - e.g. a tracking lane target has no hp, so gridshot's shoot() would decrement
  // undefined forever and it would never die. Clearing on an actual mode change (not on every
  // pause/resume) avoids that without wiping progress when the mode hasn't changed.
  if (gameMode !== lastGameMode) {
    targetManager.clear();
    lastGameMode = gameMode;
  }
  duration = parseInt(optDuration.value, 10);
  movingRatio = parseFloat(optMovingRatio.value);
  updateSensFromInputs();
  updateFovFromInput();
  selectWeapon(optWeapon.value);
  if (gameMode === 'tracking') {
    // Snap to a fixed vantage point facing the lane, so tracking always starts the same way.
    player.pos.set(TRACK_ANCHOR.x, player.eyeHeight, TRACK_ANCHOR.z);
    player.yaw = TRACK_ANCHOR.yaw;
    player.pitch = 0;
    player.footY = 0;
    player.vy = 0;
    player.grounded = true;
  }
  targetManager.ensureCount(desiredTargetCount());
}

function resetRound() {
  shotsFired = 0;
  hits = 0;
  kills = 0;
  headshots = 0;
  reactionTimes = [];
  trackScoreSum = 0;
  elapsed = 0;
  targetManager.clear();
  updateHudStats();
}

function startLock() {
  readSettings();
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.connect(audioCtx.destination);
    applyMasterVolume();
  }
  canvas.requestPointerLock();
}

startBtn.addEventListener('click', () => {
  // Resuming from pause with a different mode selected should start the round over
  // (fresh timer/stats), not carry over the elapsed time from the previous mode.
  const modeChangedWhilePaused = state === 'paused' && optMode.value !== gameMode;
  if (state === 'idle' || state === 'ended' || modeChangedWhilePaused) {
    resetRound();
  }
  startLock();
});
restartBtn.addEventListener('click', () => {
  resultsEl.classList.add('hidden');
  overlayEl.classList.remove('hidden');
  state = 'idle';
});

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) {
    state = 'running';
    skipNextMouseMove = true;
    overlayEl.classList.add('hidden');
    hudEl.classList.remove('hidden');
    weaponHudEl.classList.remove('hidden');
    weaponHudEl.textContent = WEAPONS[currentWeaponKey].name.toUpperCase();
    lastTime = performance.now();
    targetManager.ensureCount(desiredTargetCount());
  } else if (state === 'running') {
    state = 'paused';
    overlayEl.classList.remove('hidden');
    startBtn.textContent = '계속하기 (마우스 잠금)';
  }
});

// A single 0-100 score so rounds are comparable across modes and settings (round length,
// target count etc. all vary, so a raw kill count wouldn't be a fair basis for comparison).
// Tracking has no kills/reaction time of its own - its score is the weighted on-target ratio
// (trackScoreSum, where a headshot tick counts double a body tick, since holding on the head
// is harder). Gridshot/flick instead blend accuracy, headshot rate, and reaction speed, since
// those three together are what "good aim" means in a click mode.
function computeFinalScore(acc, avgRt) {
  if (gameMode === 'tracking') {
    return shotsFired === 0 ? 0 : Math.round((trackScoreSum / shotsFired) * 100);
  }
  const hsRatio = hits === 0 ? 0 : Math.round((headshots / hits) * 100);
  const reactionScore = reactionTimes.length
    ? Math.max(0, Math.min(100, 100 - (avgRt - 200) / 8))
    : 0;
  return Math.round(acc * 0.5 + hsRatio * 0.3 + reactionScore * 0.2);
}

function endRound() {
  state = 'ended';
  document.exitPointerLock();
  silenceTrackAudio();
  hudEl.classList.add('hidden');
  weaponHudEl.classList.add('hidden');
  const acc = shotsFired === 0 ? 0 : Math.round((hits / shotsFired) * 100);
  const avgRt = reactionTimes.length
    ? Math.round(reactionTimes.reduce((a, b) => a + b, 0) / reactionTimes.length)
    : 0;
  document.getElementById('res-hits').textContent = kills;
  document.getElementById('res-hs').textContent = headshots;
  document.getElementById('res-shots').textContent = shotsFired;
  document.getElementById('res-acc').textContent = acc + '%';
  document.getElementById('res-avgrt').textContent = avgRt + 'ms';
  document.getElementById('res-score').textContent = computeFinalScore(acc, avgRt);
  resultsEl.classList.remove('hidden');
  startBtn.textContent = '클릭해서 시작 (마우스 잠금)';
}

// ---------- main loop ----------
function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  if (state === 'running') {
    updatePlayer(dt);
    targetManager.update(dt, now);
    updateWeaponView(dt);
    if (gameMode === 'tracking') {
      if (triggerHeld) updateTracking(dt); else hideTrackBeam();
    } else if (triggerHeld && WEAPONS[currentWeaponKey].auto) {
      tryShoot();
    }
    crosshairEl.classList.toggle('spread', isPlayerMoving() || !player.grounded);
    elapsed += dt;
    updateHudTime();
    if (duration > 0 && elapsed >= duration) endRound();
  }
  updateFadingFx(now, dt);
  muzzleLight.intensity *= Math.pow(0.001, dt);

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
