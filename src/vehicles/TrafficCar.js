import * as THREE from 'three';

import { CONFIG } from '../config.js';

import { resolveCollisions } from '../utils/Collisions.js';

import { addOutline } from '../utils/Outline.js';

import { mulberry32 } from '../utils/random.js';

import osmData from '../world/data/embiez-osm.js';

// Voitures en circulation sur les grosses routes de l'île : elles suivent la
// polyligne OSM en arc-length (s advance à vitesse constante, demi-tour aux
// extrémités). Style toon (outline noir), caisse colorée, roues qui tournent,
// caisse qui suit la pente du terrain (même logique que la voiturette).

function roadLength(road) {
  let len = 0;
  for (let i = 0; i < road.points.length - 1; i++) {
    const [x0, z0] = road.points[i];
    const [x1, z1] = road.points[i + 1];
    len += Math.hypot(x1 - x0, z1 - z0);
  }
  return len;
}

// Les `count` plus grosses routes de l'île assez longues
export function pickTrafficRoads(count) {
  const t = CONFIG.traffic;
  return osmData.roads
    .filter((r) => t.kinds.includes(r.kind) && r.points.length >= 2 && roadLength(r) >= t.minRoadLength)
    .sort((a, b) => roadLength(b) - roadLength(a))
    .slice(0, count);
}

export class TrafficCar {

  constructor(scene, ground, colliders, road, color, seed = 0) {
    this.scene = scene;
    this.ground = ground;
    this.colliders = colliders;
    this.road = road;
    this.pos = { x: 0, y: 0, z: 0 };
    this.radius = CONFIG.vehicle.radius;
    this.pitch = 0;
    this.roll = 0;

    // Arc-length le long de la route : cum[i] = distance depuis le début
    const pts = road.points;
    this.cum = [0];
    for (let i = 0; i < pts.length - 1; i++) {
      this.cum.push(this.cum[i] + Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]));
    }
    this.total = this.cum[this.cum.length - 1];

    // Départ aléatoire, sens aléatoire
    const rand = mulberry32(seed);
    this.s = rand() * this.total;
    this.dir = rand() < 0.5 ? 1 : -1;
    this.segIndex = 0;

    this.group = this.buildMesh(color);
    scene.add(this.group);
  }

  buildMesh(color) {
    const v = CONFIG.vehicle;
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 0.55, 4.2),
      new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 2.0),
      new THREE.MeshLambertMaterial({ color: v.cabinColor })
    );
    cabin.position.set(0, 1.05, -0.2);
    g.add(body, cabin);
    addOutline(g, 1.06, CONFIG.props.outlineColor);

    // 4 roues
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(v.wheelRadius, v.wheelRadius, 0.3, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
    for (const [wx, wz] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, v.wheelRadius, wz);
      g.add(w);
      this.wheels.push(w);
    }
    g.rotation.order = 'YXZ';

    // 2 phares (SpotLight) allumés la nuit
    this.headlights = [];
    for (const x of [-0.55, 0.55]) {
      const spot = new THREE.SpotLight(0xfff8c0, 0, 40, 0.55, 0.45, 1.4);
      spot.position.set(x, 0.95, 2.1);
      spot.target.position.set(x, 0.2, 12);
      g.add(spot, spot.target);
      this.headlights.push(spot);
    }
    return g;
  }

  setHeadlights(on) {
    const i = on ? CONFIG.dayNight.headlightIntensity : 0;
    for (const s of this.headlights) s.intensity = i;
  }

  update(delta) {
    const t = CONFIG.traffic;
    const v = CONFIG.vehicle;
    const pts = this.road.points;

    // --- Avance en arc-length, demi-tour aux extrémités ---
    this.s += this.dir * t.speed * delta;
    if (this.s >= this.total) { this.s = 2 * this.total - this.s; this.dir = -1; }
    else if (this.s <= 0) { this.s = -this.s; this.dir = 1; }

    // Segment contenant s (on avance/recule depuis le dernier index connu)
    const cum = this.cum;
    while (this.segIndex < cum.length - 2 && cum[this.segIndex + 1] < this.s) this.segIndex++;
    while (this.segIndex > 0 && cum[this.segIndex] > this.s) this.segIndex--;
    const a = pts[this.segIndex];
    const b = pts[Math.min(this.segIndex + 1, pts.length - 1)];
    const segLen = Math.max(0.01, cum[this.segIndex + 1] - cum[this.segIndex]);
    const tt = Math.max(0, Math.min(1, (this.s - cum[this.segIndex]) / segLen));
    this.pos.x = a[0] + (b[0] - a[0]) * tt;
    this.pos.z = a[1] + (b[1] - a[1]) * tt;
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    this.group.rotation.y = yaw;

    // --- Sol + pente (même logique que la voiturette) ---
    this.pos.y = this.ground.heightAt(this.pos.x, this.pos.z);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const yF = this.ground.heightAt(this.pos.x + fx * 1.6, this.pos.z + fz * 1.6);
    const yB = this.ground.heightAt(this.pos.x - fx * 1.6, this.pos.z - fz * 1.6);
    const yR = this.ground.heightAt(this.pos.x + rx * 0.8, this.pos.z + rz * 0.8);
    const yL = this.ground.heightAt(this.pos.x - rx * 0.8, this.pos.z - rz * 0.8);
    const targetPitch = Math.atan2(yB - yF, 3.2);
    const targetRoll = Math.atan2(yR - yL, 1.6);
    const k = Math.min(1, v.tiltSpeed * delta);
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;
    this.group.rotation.x = this.pitch;
    this.group.rotation.z = this.roll;

    // --- Limites du monde + bâtiments/arbres ---
    const half = this.ground.size / 2 - 2;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
    resolveCollisions(this.pos, this.radius, this.colliders);

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);

    // --- Roues qui tournent ---
    for (const w of this.wheels) w.rotation.x += (t.speed * delta) / v.wheelRadius;
  }
}
