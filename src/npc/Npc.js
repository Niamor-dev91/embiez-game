import { CONFIG } from '../config.js';
import { createHumanoid, setWalkAnimation } from '../utils/Humanoid.js';
import { resolveCollisions, resolveCircleVsCircle } from '../utils/Collisions.js';
import { mulberry32 } from '../utils/random.js';
import osmData from '../world/data/embiez-osm.js';

// PNJ touriste qui marche le long d'un chemin de l'île (données OSM),
// fait demi-tour aux extrémités, animé comme le joueur, posé sur le terrain
// et bloqué par les bâtiments.

// Chemins sur lesquels un PNJ peut marcher (routes + sentiers)
const PATH_KINDS = ['secondary', 'residential', 'unclassified', 'service', 'pedestrian', 'footway', 'path', 'steps'];

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

// Index de segment voisin valide (évite points[-1] et points[length])
function clampSeg(i, length) {
  return Math.max(0, Math.min(i, length - 1));
}

// Sélectionne `count` chemins répartis sur l'île : assez longs, sur la terre,
// les plus longs d'abord, en gardant au moins minSpacing mètres entre leurs
// centres.
export function pickRoads(count, minSpacing = 100, minLength = 50) {
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
  // Si pas assez de chemins espacés, compléter avec les suivants
  for (const r of eligible) {
    if (chosen.length >= count) break;
    if (!chosen.includes(r)) chosen.push(r);
  }
  return chosen;
}

export class Npc {

  constructor(scene, terrain, colliders, road, seed = 0) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.road = road ?? pickRoads(1)[0];
    this.segIndex = 0;  // segment courant entre points[segIndex] et points[segIndex+dir]
    this.dir = 1;       // 1 = dans le sens des points, -1 = retour
    this.t = 0;         // position 0..1 sur le segment courant
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

    this.humanoid = createHumanoid(CONFIG.npc.colors);
    this.group = this.humanoid.group;
    const a = this.road.points[this.segIndex];
    const b = this.road.points[clampSeg(this.segIndex + this.dir, this.road.points.length)];
    const x = a[0] + (b[0] - a[0]) * this.t;
    const z = a[1] + (b[1] - a[1]) * this.t;
    this.group.position.set(x, terrain.heightAt(x, z), z);
    scene.add(this.group);
  }

  // player = le joueur ({ group, radius }) ou null : le PNJ est repoussé
  // s'il entre en collision avec lui
  update(delta, player) {
    const p = CONFIG.npc;
    const pts = this.road.points;
    if (pts.length < 2) return;
    const pos = this.group.position;

    // --- Avancer le long de la route ---
    let remaining = p.walkSpeed * delta;
    let guard = 1000; // sécurité anti-boucle infinie
    while (remaining > 0 && guard-- > 0) {
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

    // --- Position sur le segment courant ---
    const a = pts[this.segIndex];
    const b = pts[clampSeg(this.segIndex + this.dir, pts.length)];
    const x = a[0] + (b[0] - a[0]) * this.t;
    const z = a[1] + (b[1] - a[1]) * this.t;
    pos.x = x;
    pos.z = z;

    // --- Collisions : le joueur pousse le PNJ, puis les bâtiments ---
    if (player) {
      resolveCircleVsCircle(pos, p.radius, player.group.position, CONFIG.player.radius);
    }
    resolveCollisions(pos, p.radius, this.colliders);

    // --- Pieds sur le terrain (après les collisions horizontales) ---
    pos.y = this.terrain.heightAt(pos.x, pos.z);

    // --- Orientation et animation de marche ---
    this.group.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    this.walkPhase += p.walkSpeed * delta * 2.2;
    setWalkAnimation(this.humanoid, this.walkPhase, 1);
  }

  // Passe au segment suivant ; demi-tour aux extrémités de la route
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
