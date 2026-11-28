import { CONFIG } from '../config.js';
import { createHumanoid, setWalkAnimation, addGun } from '../utils/Humanoid.js';
import { resolveCollisions, resolveCircleVsCircle } from '../utils/Collisions.js';
import { mulberry32 } from '../utils/random.js';
import osmData from '../world/data/embiez-osm.js';

// PNJ de l'île : marche le long d'un chemin OSM, fait demi-tour aux extrémités.
// Avec points de vie : touché -> il fuit le joueur (sauf le policier, qui
// poursuit et tire). Mort -> allongé au sol.
// Le PNJ policier (isPolice) a un pistolet et attaque le joueur quand il est
// alerté (le joueur a tiré sur un PNJ).

// Chemins sur lesquels un PNJ peut marcher (routes + sentiers)
const PATH_KINDS = ['secondary', 'residential', 'unclassified', 'service', 'pedestrian', 'footway', 'path', 'steps'];

// Index de segment voisin valide (évite points[-1] et points[length])
function clampSeg(i, length) {
  return Math.max(0, Math.min(i, length - 1));
}

function roadLength(road) {
  let len = 0;
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x0, z0] = road.points[i];
    const [x1, z1] = road.points[i + 1];
    len += Math.hypot(x1 - x0, z1 - z0);
  }
  return len;
}

function centroidOf(pts) {
  let sx = 0, sz = 0;
  for (const [x, z] of pts) { sx += x; sz += z; }
  return [sx / pts.length, sz / pts.length];
}

// Sélectionne `count` chemins répartis sur l'île (longueur min 50 m, espacés
// d'au moins minSpacing mètres entre leurs centres), les plus longs d'abord.
export function pickRoads(count, minSpacing = 30, minLength = 50) {
  const eligible = osmData.roads
    .filter((r) => PATH_KINDS.includes(r.kind) && roadLength(r) >= minLength)
    .sort((a, b) => roadLength(b) - roadLength(a));
  const chosen = [];
  const centers = [];
  for (const r of eligible) {
    if (chosen.length >= count) break;
    const [cx, cz] = centroidOf(r.points);
    if (centers.every(([ox, oz]) => Math.hypot(cx - ox, cz - oz) >= minSpacing)) {
      chosen.push(r);
      centers.push([cx, cz]);
    }
  }
  // Si pas assez de chemins espacés : répartir le surplus EN CYCLE sur les
  // chemins existants (plusieurs PNJ par chemin, positions de départ aléatoires)
  for (let i = 0; chosen.length < count && eligible.length > 0; i++) {
    chosen.push(eligible[i % eligible.length]);
  }
  return chosen;
}

// Point de route le plus proche de (x, z), avec l'orientation du segment :
// sert à garer la voiturette près du spawn.
export function nearestRoadPoint(x, z) {
  let best = null;
  let bd = Infinity;
  let byaw = 0;
  for (const r of osmData.roads) {
    if (!PATH_KINDS.includes(r.kind)) continue;
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, az] = r.points[i];
      const [bx, bz] = r.points[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const L2 = dx * dx + dz * dz;
      let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const pz = az + t * dz;
      const d = Math.hypot(x - px, z - pz);
      if (d < bd) {
        bd = d;
        best = { x: px, z: pz };
        byaw = Math.atan2(dx, dz);
      }
    }
  }
  return { x: best.x, z: best.z, yaw: byaw };
}

// Chemins les plus proches du centre de l'île (le village), hors `taken` :
// pour placer les policiers là où il y a du monde.
export function pickPoliceRoads(count, taken) {
  const takenSet = new Set(taken);
  const eligible = osmData.roads
    .filter((r) => PATH_KINDS.includes(r.kind) && roadLength(r) >= 50)
    .map((r) => ({ r, d: Math.hypot(...centroidOf(r.points)) }))
    .sort((a, b) => a.d - b.d);
  // D'abord les routes NON prises par les civils, puis on complète avec les
  // plus proches du centre même si déjà prises (les policiers croisent les civils)
  const chosen = [];
  for (const o of eligible) {
    if (chosen.length >= count) break;
    if (!takenSet.has(o.r)) chosen.push(o.r);
  }
  for (const o of eligible) {
    if (chosen.length >= count) break;
    if (!chosen.includes(o.r)) chosen.push(o.r);
  }
  return chosen;
}

// Route pour le PNJ client de la mission "Livraison de pastis" : assez loin du
// spawn (mission.clientMinDistance..clientMaxDistance) mais sur la MÊME masse
// terrestre — le segment spawn -> centre ne doit traverser aucune eau (sinon
// la voiture tomberait en panne dans l'eau avant d'arriver).
export function pickClientRoad(x, z, ground) {
  const m = CONFIG.mission;
  let best = null;
  let bd = -1;
  for (const r of osmData.roads) {
    if (!PATH_KINDS.includes(r.kind) || roadLength(r) < 50) continue;
    const [cx, cz] = centroidOf(r.points);
    const d = Math.hypot(cx - x, cz - z);
    if (d < m.clientMinDistance || d > m.clientMaxDistance) continue;
    let water = false;
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      if (ground.heightAt(x + (cx - x) * t, z + (cz - z) * t) < 0) { water = true; break; }
    }
    if (water) continue;
    if (d > bd) { bd = d; best = r; }
  }
  return best || pickRoads(1)[0];
}

export class Npc {

  constructor(scene, ground, colliders, road, seed = 0, isPolice = false, customColors = null) {
    this.scene = scene;
    this.ground = ground; // sol solide (terrain + pontons)
    this.colliders = colliders;
    this.road = road ?? pickRoads(1)[0];
    this.isPolice = isPolice;
    this.hp = isPolice ? CONFIG.combat.policeHp : CONFIG.combat.npcHp;
    this.state = 'walk'; // 'walk' | 'flee' | 'dead'
    this.alerted = false; // policier : attaque le joueur
    this.fireTimer = CONFIG.combat.policeFireInterval;
    this.carHitCooldown = 0; // anti-dégâts répétés quand la voiture reste dessus
    this.sound = null;       // Sound du jeu (mis par Game) : coups de feu du policier
    this.segIndex = 0;
    this.dir = 1;
    this.t = 0;
    this.walkPhase = 0;

    // Départ à une position aléatoire le long du chemin (reproductible)
    const rand = mulberry32(seed * 7919 + 13);
    const total = roadLength(this.road);
    const startDist = rand() * total;
    let acc = 0;
    for (let i = 0; i < this.road.points.length - 1; i++) {
      const [x0, z0] = this.road.points[i];
      const [x1, z1] = this.road.points[i + 1];
      const segLen = Math.hypot(x1 - x0, z1 - z0);
      if (acc + segLen >= startDist) {
        this.segIndex = i;
        this.t = segLen > 0 ? (startDist - acc) / segLen : 0;
        break;
      }
      acc += segLen;
    }
    this.dir = rand() < 0.5 ? 1 : -1;
    if (this.dir === -1 && this.segIndex === 0) this.segIndex = 1; // éviter points[-1]

    // Policier = look bleu foncé distinct ; civil = une des 3 variations
    // (seed % 3, la n°2 est une femme) façon XIII
    this.humanoid = isPolice
      ? createHumanoid(CONFIG.npc.policeColors)
      : createHumanoid(customColors, customColors ? -1 : seed % CONFIG.npc.variants.length);
    this.group = this.humanoid.group;
    if (isPolice) addGun(this.humanoid, CONFIG.combat.gunColor); // pistolet visible
    const a = this.road.points[this.segIndex];
    const b = this.road.points[clampSeg(this.segIndex + this.dir, this.road.points.length)];
    const x = a[0] + (b[0] - a[0]) * this.t;
    const z = a[1] + (b[1] - a[1]) * this.t;
    this.group.position.set(x, ground.heightAt(x, z), z);
    scene.add(this.group);
  }

  takeDamage(dmg, fromPos) {
    if (this.hp <= 0) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }
    // Touché : le PNJ normal fuit, le policier riposte
    if (this.isPolice) this.alerted = true;
    else this.state = 'flee';
  }

  die() {
    this.state = 'dead';
    setWalkAnimation(this.humanoid, this.walkPhase, 0);
    // Allongé au sol
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = this.ground.heightAt(this.group.position.x, this.group.position.z) + 0.2;
  }

  // player = le joueur ({ group, radius, alive, takeDamage }) ou null
  update(delta, player) {
    if (this.state === 'dead') return;
    if (this.state === 'wait') {
      // PNJ client d'une mission : il attend, immobile, juste calé sur le sol
      this.group.position.y = this.ground.heightAt(this.group.position.x, this.group.position.z);
      return;
    }
    const p = CONFIG.npc;
    const c = CONFIG.combat;
    const pos = this.group.position;
    this.carHitCooldown = Math.max(0, this.carHitCooldown - delta);

    if (this.state === 'flee' && player) {
      // --- Fuite : s'éloigne du joueur ---
      const dx = pos.x - player.group.position.x;
      const dz = pos.z - player.group.position.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d < c.fleeDistance) {
        pos.x += (dx / d) * c.fleeSpeed * delta;
        pos.z += (dz / d) * c.fleeSpeed * delta;
        this.group.rotation.y = Math.atan2(dx, dz);
        this.walkPhase += c.fleeSpeed * delta * 2.2;
        setWalkAnimation(this.humanoid, this.walkPhase, 1);
      } else {
        this.state = 'walk'; // assez loin : il se calme et reprend sa route
      }
    } else if (this.isPolice && this.alerted && player && player.alive) {
      // --- Policier : poursuit le joueur et tire ---
      const dx = player.group.position.x - pos.x;
      const dz = player.group.position.z - pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.group.rotation.y = Math.atan2(dx, dz);
      if (d > c.policeStopDistance) {
        pos.x += (dx / d) * c.policeSpeed * delta;
        pos.z += (dz / d) * c.policeSpeed * delta;
        this.walkPhase += c.policeSpeed * delta * 2.2;
        setWalkAnimation(this.humanoid, this.walkPhase, 1);
      } else {
        setWalkAnimation(this.humanoid, this.walkPhase, 0);
        this.fireTimer -= delta;
        if (this.fireTimer <= 0) {
          this.fireTimer = c.policeFireInterval;
          if (d < c.policeRange) {
            if (this.sound) this.sound.shoot(0.6, d); // coup de feu du policier
            if (Math.random() < c.policeHitChance) {
              player.takeDamage(c.damagePerShot);
            }
          }
        }
      }
    } else {
      // --- Marche le long du chemin ---
      const pts = this.road.points;
      let remaining = p.walkSpeed * delta;
      let guard = 1000;
      while (remaining > 0 && guard-- > 0 && pts.length >= 2) {
        const a = pts[this.segIndex];
        const b = pts[clampSeg(this.segIndex + this.dir, pts.length)];
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (segLen < 0.01) { this.advanceSegment(pts); continue; }
        const distToEnd = (1 - this.t) * segLen;
        if (remaining < distToEnd) {
          this.t += remaining / segLen;
          remaining = 0;
        } else {
          remaining -= distToEnd;
          this.advanceSegment(pts);
        }
      }
      const a = pts[this.segIndex];
      const b = pts[clampSeg(this.segIndex + this.dir, pts.length)];
      pos.x = a[0] + (b[0] - a[0]) * this.t;
      pos.z = a[1] + (b[1] - a[1]) * this.t;
      this.group.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
      this.walkPhase += p.walkSpeed * delta * 2.2;
      setWalkAnimation(this.humanoid, this.walkPhase, 1);
    }

    // --- Collisions : le joueur pousse le PNJ, puis les bâtiments ---
    if (player) {
      resolveCircleVsCircle(pos, p.radius, player.group.position, CONFIG.player.radius);
    }
    resolveCollisions(pos, p.radius, this.colliders);

    // --- Pieds sur le terrain ---
    pos.y = this.ground.heightAt(pos.x, pos.z);
  }

  // Passe au segment suivant ; demi-tour aux extrémités du chemin
  advanceSegment(pts) {
    this.segIndex += this.dir;
    this.t = 0;
    if (this.segIndex >= pts.length - 1) {
      this.segIndex = pts.length - 2;
      this.dir = -1;
    } else if (this.segIndex < 0) {
      this.segIndex = 0;
      this.dir = 1;
    }
  }
}

// Cherche une PETITE île (composante de terre isolée, hors celle de `fromX/fromZ`)
// dont le centre est entre minDist et maxDist de (fromX, fromZ) et de taille
// max maxSize. Renvoie { x, z } (centre de l'île) ou null.
export function findSmallIsland(ground, fromX, fromZ, minDist, maxDist, maxSize) {
  const STEP = 8, H = ground.size / 2, N = Math.floor((2 * H) / STEP) + 1;
  const land = new Uint8Array(N * N);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (ground.heightAt(-H + i * STEP, -H + j * STEP) > 0.5) land[i * N + j] = 1;
  }
  const comp = new Int32Array(N * N).fill(-1);
  const gi = (x) => Math.round((x + H) / STEP);
  // composante de référence = celle contenant (fromX, fromZ) : on la marque
  let refId = -1;
  if (land[gi(fromX) * N + gi(fromZ)]) {
    refId = 999999;
    const q = [gi(fromX) * N + gi(fromZ)];
    comp[q[0]] = refId;
    while (q.length) {
      const c = q.pop(); const ci = Math.floor(c / N), cj = c % N;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (land[ni * N + nj] && comp[ni * N + nj] === -1) { comp[ni * N + nj] = refId; q.push(ni * N + nj); }
      }
    }
  }
  // autres composantes
  let best = null, bestScore = -1;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (!land[i * N + j] || comp[i * N + j] !== -1) continue;
    const id = 1000 + i * N + j;
    const q = [i * N + j]; comp[q[0]] = id;
    let n = 0, minI = i, maxI = i, minJ = j, maxJ = j, si = 0, sj = 0;
    while (q.length) {
      const c = q.pop(); const ci = Math.floor(c / N), cj = c % N;
      n++; si += ci; sj += cj;
      if (ci < minI) minI = ci; if (ci > maxI) maxI = ci;
      if (cj < minJ) minJ = cj; if (cj > maxJ) maxJ = cj;
      for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= N || nj >= N) continue;
        if (land[ni * N + nj] && comp[ni * N + nj] === -1) { comp[ni * N + nj] = id; q.push(ni * N + nj); }
      }
    }
    const cx = -H + (si / n) * STEP, cz = -H + (sj / n) * STEP;
    const w = (maxI - minI) * STEP, d = (maxJ - minJ) * STEP;
    const dist = Math.hypot(cx - fromX, cz - fromZ);
    if (dist < minDist || dist > maxDist) continue;
    if (Math.max(w, d) > maxSize) continue;
    const score = Math.min(w, d) * 1000 + dist; // préférer les vraies îles (grosses)
    if (score > bestScore) { bestScore = score; best = { x: cx, z: cz }; }
  }
  return best;
}
