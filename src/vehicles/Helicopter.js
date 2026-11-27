import * as THREE from 'three';

import { CONFIG } from '../config.js';

import { Input } from '../utils/Input.js';

import { resolveCollisions } from '../utils/Collisions.js';

import { buildHeliMesh } from './PoliceHelicopter.js';

// Hélicoptère CIVIL pilotable par le joueur (même mesh que l'hélicoptère de
// police, sans gyrophare). Posé en haut d'une colline (findHilltop).
// Conduite : W/S = avant/arrière, A/D = tourner, Shift = monter, Espace = descendre.
// Vol stationnaire (vy -> 0 sans input), ne traverse pas le sol, plafond maxAltitude.

// Point le plus HAUT dans la couronne [minDist, maxDist] autour de (x, z) :
// pour poser l'hélicoptère en haut d'une colline, ni trop près ni trop loin.
export function findHilltop(ground, x, z, minDist, maxDist) {
  let best = null;
  let bestY = -Infinity;
  for (let r = minDist; r <= maxDist; r += 20) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const y = ground.heightAt(px, pz);
      if (y > bestY) { bestY = y; best = { x: px, z: pz }; }
    }
  }
  if (!best) best = { x: x + minDist, z };
  return best;
}

export class Helicopter {

  constructor(scene, ground, colliders, spot) {
    this.scene = scene;
    this.ground = ground;
    this.colliders = colliders;
    this.spot = spot; // {x, z} en haut de la colline
    this.speed = 0;   // vitesse horizontale (m/s)
    this.vy = 0;      // vitesse verticale (m/s)
    const built = buildHeliMesh(CONFIG.heli.colors);
    this.group = built.group;
    this.rotor = built.rotor;
    this.reset();
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  get radius() {
    return CONFIG.heli.radius;
  }

  get label() {
    return 'l\'hélicoptère';
  }

  get cameraDistance() {
    return CONFIG.heli.cameraDistance;
  }

  get interactDistance() {
    return CONFIG.heli.interactDistance;
  }

  // Remis sur sa colline (démarrage + restart)
  reset() {
    this.speed = 0;
    this.falling = false; // chute en cours si on quitte l'hélico en l'air
    this.vy = 0;
    this.group.position.set(
      this.spot.x,
      this.ground.heightAt(this.spot.x, this.spot.z) + 1.2, // patins au sol
      this.spot.z
    );
    this.group.rotation.set(0, 0, 0);
  }

  update(delta, alive = true) {
    const h = CONFIG.heli;
    if (alive) {
      // --- Avant / arrière ---
      let throttle = 0;
      if (Input.isDown('KeyW')) throttle += 1;
      if (Input.isDown('KeyS')) throttle -= 1;
      if (throttle > 0) this.speed += h.acceleration * delta;
      else if (throttle < 0) this.speed -= h.brake * delta;
      else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), h.friction * delta);
      this.speed = Math.max(-h.maxReverseSpeed, Math.min(h.maxSpeed, this.speed));
      // --- Direction ---
      let steer = 0;
      if (Input.isDown('KeyA')) steer += 1;
      if (Input.isDown('KeyD')) steer -= 1;
      this.group.rotation.y += steer * h.turnSpeed * delta;
      // --- Montée / descente (vol stationnaire sinon) ---
      let climb = 0;
      if (Input.isDown('ShiftLeft') || Input.isDown('ShiftRight')) climb += 1; // monter
      if (Input.isDown('Space')) climb -= 1; // descendre
      this.vy += climb * h.climbAccel * delta;
      this.vy -= Math.sign(this.vy) * Math.min(Math.abs(this.vy), h.climbFriction * delta);
      this.vy = Math.max(-h.climbSpeed, Math.min(h.climbSpeed, this.vy));
    } else {
      this.speed = 0; // joueur KO : l'hélico s'immobilise
      this.vy = 0;
    }

    // --- Déplacement 3D ---
    const yaw = this.group.rotation.y;
    this.pos.x += Math.sin(yaw) * this.speed * delta;
    this.pos.z += Math.cos(yaw) * this.speed * delta;
    this.pos.y += this.vy * delta;

    // --- Sol (patins à 1.2 m sous le centre), mer, plafond, limites ---
    const groundY = this.ground.heightAt(this.pos.x, this.pos.z);
    const minY = Math.max(groundY, 0) + 1.2;
    if (this.pos.y < minY) { this.pos.y = minY; this.vy = Math.max(0, this.vy); }
    if (this.pos.y > h.maxAltitude) { this.pos.y = h.maxAltitude; this.vy = Math.min(0, this.vy); }
    const half = this.ground.size / 2 - 10;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
    resolveCollisions(this.pos, h.radius, this.colliders); // bâtiments (vol bas)

    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    // Légère inclinaison vers l'avant quand il avance
    this.group.rotation.x = THREE.MathUtils.clamp(-this.speed * 0.008, -0.22, 0.22);
    // Rotor principal
    this.rotor.rotation.y += delta * 28;
  }

  // Quitté en l'air : l'hélico part en chute libre jusqu'au sol
  startFall() {
    const minY = Math.max(this.ground.heightAt(this.pos.x, this.pos.z), 0) + 1.2;
    if (this.pos.y > minY + 0.5) {
      this.falling = true;
      this.speed = 0;
      this.vy = Math.min(this.vy, 0);
    }
  }

  updateFall(delta) {
    const h = CONFIG.heli;
    this.vy -= h.fallGravity * delta;
    this.pos.y += this.vy * delta;
    const minY = Math.max(this.ground.heightAt(this.pos.x, this.pos.z), 0) + 1.2;
    if (this.pos.y <= minY) {
      this.pos.y = minY;
      this.vy = 0;
      this.falling = false;
      this.group.rotation.x = 0.08; // posé, un peu penché
    }
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rotor.rotation.y += delta * Math.max(2, 28 + this.vy); // rotor qui ralentit
  }
}
