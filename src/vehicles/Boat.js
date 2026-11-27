import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { addOutline } from '../utils/Outline.js';
import osmData from '../world/data/embiez-osm.js';

// Bateau utilisable au port : voilier, bateau à moteur ou jetski (type).
// Conduite sur l'eau (ZQSD comme la voiture) ; le bateau s'ARRÊTE au
// contact de la terre ou d'un ponton (ground.heightAt >= 0 bloque).

// Cherche le point d'eau (heightAt < -0.5) le plus proche de (x, z)
function findWaterNear(x, z, ground) {
  for (let r = 5; r <= 100; r += 5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const cx = x + Math.sin(a) * r;
      const cz = z + Math.cos(a) * r;
      if (ground.heightAt(cx, cz) < -0.5) return { x: cx, z: cz };
    }
  }
  return null;
}

// Un point d'amarrage par ponton, dans l'eau près du ponton ; les pontons
// les plus proches de `near` (le spawn) d'abord.
export function dockSpots(count, ground, near) {
  const piers = [...osmData.piers].sort((a, b) => {
    const ca = a.points[Math.floor(a.points.length / 2)];
    const cb = b.points[Math.floor(b.points.length / 2)];
    return Math.hypot(ca[0] - near.x, ca[1] - near.z) - Math.hypot(cb[0] - near.x, cb[1] - near.z);
  });
  const spots = [];
  for (let i = 0; i < Math.min(count, piers.length); i++) {
    const pier = piers[i];
    const midI = Math.floor(pier.points.length / 2);
    const mid = pier.points[midI];
    const prev = pier.points[Math.max(0, midI - 1)];
    const yaw = Math.atan2(mid[0] - prev[0], mid[1] - prev[1]);
    const water = findWaterNear(mid[0], mid[1], ground);
    spots.push(water ? { ...water, yaw } : { x: mid[0] + 20, z: mid[1], yaw });
  }
  return spots;
}

export class Boat {

  constructor(scene, ground, dock) {
    this.scene = scene;
    this.ground = ground;
    this.type = dock.type; // 'voilier' | 'moteur' | 'jetski'
    this.speed = 0;
    this.group = new THREE.Group();
    this.createMesh();
    // Flotte sur la mer (un peu au-dessus du niveau 0)
    this.group.position.set(dock.x, CONFIG.boat.floatHeight, dock.z);
    this.group.rotation.y = dock.yaw;
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  get radius() {
    return CONFIG.boat.radius[this.type];
  }

  get label() {
    return { voilier: 'le voilier', moteur: 'le bateau à moteur', jetski: 'le jetski' }[this.type];
  }

  createMesh() {
    const c = CONFIG.boat.colors;
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const t = this.type;

    // Coque dans un sous-groupe avec outline toon
    this.hull = new THREE.Group();
    this.group.add(this.hull);

    if (t === 'voilier') {
      // coque allongée + mât + voile (cône aplati)
      const coque = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 4.2), mat(c.coque));
      coque.position.y = 0.25;
      const mat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), mat(c.mat));
      mat2.position.set(0, 1.8, 0.3);
      const voile = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 4), mat(c.voile));
      voile.scale.x = 0.18;
      voile.position.set(0.15, 2.0, 0.3);
      voile.rotation.z = 0.15;
      this.hull.add(coque, mat2, voile);
    } else if (t === 'moteur') {
      const coque = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 3.2), mat(c.coqueMoteur));
      coque.position.y = 0.25;
      const cabine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 1.4), mat(c.coque));
      cabine.position.set(0, 0.8, -0.3);
      this.hull.add(coque, cabine);
    } else {
      // jetski : coque basse + guidon
      const coque = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 2.2), mat(c.jetski));
      coque.position.y = 0.18;
      const guidon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.08), mat(0x222222));
      guidon.position.set(0, 0.55, 0.6);
      const mat2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.35, 6), mat(0x222222));
      mat2.position.set(0, 0.4, 0.6);
      this.hull.add(coque, guidon, mat2);
    }
    addOutline(this.hull, 1.08, CONFIG.props.outlineColor);
  }

  update(delta, alive = true) {
    const v = CONFIG.boat;

    // --- Accélération / frein (comme la voiture) ; joueur KO = plus de conduite ---
    let throttle = 0;
    if (alive && Input.isDown('KeyW')) throttle += 1;
    if (alive && Input.isDown('KeyS')) throttle -= 1;
    if (throttle > 0) this.speed += v.acceleration * delta;
    else if (throttle < 0) this.speed -= v.brake * delta;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), v.friction * delta);
    this.speed = Math.max(-v.maxReverseSpeed, Math.min(v.maxSpeed, this.speed));

    // --- Direction ---
    let steer = 0;
    if (alive && Input.isDown('KeyA')) steer += 1;
    if (alive && Input.isDown('KeyD')) steer -= 1;
    const roll = Math.min(1, Math.abs(this.speed) / 2) * Math.sign(this.speed || 1);
    this.group.rotation.y += steer * v.turnSpeed * delta * roll;

    // --- Déplacement, bloqué au contact de la terre/pontons ---
    const yaw = this.group.rotation.y;
    const nx = this.pos.x + Math.sin(yaw) * this.speed * delta;
    const nz = this.pos.z + Math.cos(yaw) * this.speed * delta;
    if (this.ground.heightAt(nx, nz) < 0) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      this.speed = 0; // la côte bloque le bateau
    }
    this.pos.y = CONFIG.boat.floatHeight; // flotte au-dessus de la mer

    // --- Limites du monde ---
    const half = this.ground.size / 2 - 5;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
  }
}
