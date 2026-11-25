import { CONFIG } from '../config.js';
import { createHumanoid, setWalkAnimation } from '../utils/Humanoid.js';
import { resolveCollisions, resolveCircleVsCircle } from '../utils/Collisions.js';
import osmData from '../world/data/embiez-osm.js';

// PNJ touriste qui marche le long d'une route de l'île (données OSM),
// fait demi-tour aux extrémités, animé comme le joueur, posé sur le terrain
// et bloqué par les bâtiments.

// Routes "carrossables" sur lesquelles un PNJ peut marcher
const ROAD_KINDS = ['secondary', 'residential', 'unclassified', 'service', 'pedestrian'];

function roadLength(road) {
  let len = 0;
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x0, z0] = road.points[i];
    const [x1, z1] = road.points[i + 1];
    len += Math.hypot(x1 - x0, z1 - z0);
  }
  return len;
}

// Retourne la index-ième plus longue route carrossable (pour répartir les PNJ)
export function pickRoad(index = 0) {
  const roads = osmData.roads
    .filter((r) => ROAD_KINDS.includes(r.kind))
    .sort((a, b) => roadLength(b) - roadLength(a));
  return roads[Math.min(index, roads.length - 1)];
}

export class Npc {

  constructor(scene, terrain, colliders, road) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.road = road ?? pickRoad(0);
    this.segIndex = 0;  // segment courant entre points[segIndex] et points[segIndex+dir]
    this.dir = 1;       // 1 = dans le sens des points, -1 = retour
    this.t = 0;         // position 0..1 sur le segment courant
    this.walkPhase = 0;

    this.humanoid = createHumanoid(CONFIG.npc.colors);
    this.group = this.humanoid.group;
    // Départ au début de la route, pieds sur le terrain
    const [x0, z0] = this.road.points[0];
    this.group.position.set(x0, terrain.heightAt(x0, z0), z0);
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
      const b = pts[this.segIndex + this.dir];
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
    const b = pts[Math.min(this.segIndex + this.dir, pts.length - 1)];
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
