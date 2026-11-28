import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { mulberry32 } from '../utils/random.js';
import osmData from './data/embiez-osm.js';

// Chevaux qui se baladent dans un champ (zone verte sans arbres) au milieu
// de l'île, sur un petit circuit en forme de 8 (lemniscate de Bernoulli) avec
// un peu de bruit aléatoire : pattern répétitif mais pas parfaitement régulier.

// point dans un polygone (ray casting)
function pointInPoly(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][1], xj = pts[j][0], zj = pts[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// distance point -> polyligne
function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const abx = bx - ax, abz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / (abx * abx + abz * abz || 1)));
    best = Math.min(best, Math.hypot(x - (ax + abx * t), z - (az + abz * t)));
  }
  return best;
}

// Cherche un champ : terre, plat, hors forêt/arbre/bâtiment/route, à
// fieldMinDist..fieldMaxDist du spawn ("au milieu de l'île"). Renvoie {x, z, r}.
export function findField(ground) {
  const sp = CONFIG.player.spawn;
  const f = CONFIG.animals;
  const bCenters = osmData.buildings.map(b => {
    let cx = 0, cz = 0;
    for (const p of b.points) { cx += p[0]; cz += p[1]; }
    return { x: cx / b.points.length, z: cz / b.points.length };
  });
  let best = null, bestScore = -1;
  for (let x = -700; x <= 700; x += 20) {
    for (let z = -700; z <= 700; z += 20) {
      const d = Math.hypot(x - sp.x, z - sp.z);
      if (d < f.fieldMinDist || d > f.fieldMaxDist) continue;
      const h = ground.heightAt(x, z);
      if (h < 1) continue; // que de la terre
      // pente faible dans un rayon de 20 m
      let mn = h, mx = h;
      for (let a = 0; a < Math.PI * 2; a += 0.6) {
        const hh = ground.heightAt(x + Math.cos(a) * 20, z + Math.sin(a) * 20);
        if (hh > 0.5) { if (hh < mn) mn = hh; if (hh > mx) mx = hh; }
      }
      if (mx - mn > 2.5) continue; // trop en pente
      if (osmData.forests.some(poly => pointInPoly(x, z, poly.points))) continue;
      if (osmData.trees.some(t => Math.hypot(t.x - x, t.z - z) < 15)) continue;
      if (bCenters.some(b => Math.hypot(b.x - x, b.z - z) < 20)) continue;
      if (osmData.roads.some(r => distToPolyline(x, z, r.points) < 12)) continue;
      // score : plat + proche du milieu de l'anneau
      const score = (2.5 - (mx - mn)) * 10 - Math.abs(d - (f.fieldMinDist + f.fieldMaxDist) / 2) / 50;
      if (score > bestScore) { bestScore = score; best = { x, z, r: f.fieldRadius }; }
    }
  }
  return best;
}

export class Horse {

  constructor(scene, ground, field, seed) {
    this.ground = ground;
    this.rand = mulberry32(seed);
    const f = CONFIG.animals;
    // couleurs de robe selon le seed (bai / alezan / noir)
    const coats = [0x8a5a2a, 0xb07a3a, 0x3a2a20];
    const coat = coats[seed % coats.length];
    const dark = 0x241812;

    this.group = new THREE.Group();
    const mat = (c) => new THREE.MeshLambertMaterial({ color: c });

    // corps
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.75, 1.7), mat(coat));
    body.position.y = 1.0;
    this.group.add(body);
    // cou + tête (à l'avant, +z local)
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.7, 0.4), mat(coat));
    neck.position.set(0, 1.55, 0.85);
    neck.rotation.x = -0.5;
    this.group.add(neck);
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.55), mat(coat));
    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.35), mat(dark));
    muzzle.position.set(0, -0.08, 0.4);
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.16), mat(dark));
    mane.position.set(0, 0.12, -0.2);
    this.head.add(skull, muzzle, mane);
    this.head.position.set(0, 1.95, 1.05);
    this.group.add(this.head);
    // queue à l'arrière
    this.tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), mat(dark));
    this.tail.position.set(0, 1.15, -0.9);
    this.tail.rotation.x = 0.4;
    this.group.add(this.tail);
    // 4 pattes (group pivot à la hanche pour l'animation de marche)
    this.legs = [];
    const legPos = [[-0.25, 0.55], [0.25, 0.55], [-0.25, -0.55], [0.25, -0.55]];
    for (const [lx, lz] of legPos) {
      const hip = new THREE.Group();
      hip.position.set(lx, 0.72, lz);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.72, 0.14), mat(coat));
      leg.position.y = -0.36;
      hip.add(leg);
      this.group.add(hip);
      this.legs.push(hip);
    }
    scene.add(this.group);

    // --- Circuit en 8 (lemniscate de Bernoulli) autour du champ + bruit seeded ---
    this.field = field;
    const a = field.r * 0.8;
    const n = 24;
    this.wps = [];
    for (let k = 0; k < n; k++) {
      const t = (k / n) * Math.PI * 2;
      const s2 = Math.sin(t) * Math.sin(t);
      const lx = (a * Math.cos(t)) / (1 + s2);
      const lz = (a * Math.sin(t) * Math.cos(t)) / (1 + s2);
      this.wps.push({
        x: field.x + lx + (this.rand() * 2 - 1) * 1.5, // bruit : pas un 8 parfait
        z: field.z + lz + (this.rand() * 2 - 1) * 1.5,
      });
    }
    this.wpIndex = Math.floor(this.rand() * n);
    this.speed = 0;
    this.walkPhase = this.rand() * 10;
    this.pauseTimer = 0; // le cheval s'arrête parfois (broute)
    this.pauseWait = 5 + this.rand() * 12;
    const p0 = this.wps[this.wpIndex];
    this.group.position.set(p0.x, ground.heightAt(p0.x, p0.z), p0.z);
    this.group.rotation.y = this.rand() * Math.PI * 2;
  }

  reset() {
    const p0 = this.wps[0];
    this.wpIndex = 0;
    this.group.position.set(p0.x, this.ground.heightAt(p0.x, p0.z), p0.z);
  }

  update(delta) {
    const f = CONFIG.animals;
    // pause aléatoire (broute) de temps en temps
    if (this.pauseTimer > 0) {
      this.pauseTimer -= delta;
      this.speed = Math.max(0, this.speed - 6 * delta);
    } else {
      this.pauseWait -= delta;
      if (this.pauseWait <= 0) {
        this.pauseTimer = 2 + this.rand() * 3;
        this.pauseWait = 6 + this.rand() * 14;
      }
      this.speed = Math.min(f.speed, this.speed + 3 * delta);
    }
    // avance vers le waypoint courant
    const wp = this.wps[this.wpIndex];
    const pos = this.group.position;
    const dx = wp.x - pos.x, dz = wp.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1.2) {
      this.wpIndex = (this.wpIndex + 1) % this.wps.length;
    } else if (this.speed > 0.05) {
      pos.x += (dx / dist) * this.speed * delta;
      pos.z += (dz / dist) * this.speed * delta;
      // le cheval tourne vers sa direction de déplacement
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - this.group.rotation.y;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.group.rotation.y += diff * Math.min(1, 6 * delta);
    }
    pos.y = this.ground.heightAt(pos.x, pos.z);
    // animation de marche : pattes en opposition, tête et queue qui bougent
    this.walkPhase += this.speed * delta * 3.2;
    const sw = Math.sin(this.walkPhase) * 0.45 * Math.min(1, this.speed);
    this.legs[0].rotation.x = sw;
    this.legs[3].rotation.x = sw;
    this.legs[1].rotation.x = -sw;
    this.legs[2].rotation.x = -sw;
    this.head.rotation.x = (this.pauseTimer > 0 ? 0.7 : 0) + Math.sin(this.walkPhase * 0.5) * 0.06; // broute quand en pause
    this.tail.rotation.z = Math.sin(this.walkPhase * 0.7) * 0.25;
  }
}
