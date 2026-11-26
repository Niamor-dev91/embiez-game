import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { resolveCollisions } from '../utils/Collisions.js';

// Voiturette électrique low-poly (caisse + habitacle + 4 roues).
// Conduite arcade : ZQSD (W = accélérer, S = frein/marche arrière,
// A/D = tourner, seulement si la voiture roule). Reste sur le terrain
// (heightAt) et bloquée par les bâtiments.

export class Car {

  constructor(scene, terrain, colliders, park) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders;
    this.speed = 0;
    this.group = new THREE.Group();
    this.createMesh();
    this.group.position.set(park.x, terrain.heightAt(park.x, park.z), park.z);
    this.group.rotation.y = park.yaw;
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  createMesh() {
    const v = CONFIG.vehicle;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.5, 3),
      new THREE.MeshLambertMaterial({ color: v.bodyColor })
    );
    body.position.y = 0.6;
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.55, 1.4),
      new THREE.MeshLambertMaterial({ color: v.cabinColor })
    );
    cabin.position.set(0, 1.1, -0.2);
    this.group.add(body, cabin);

    // 4 roues (cylindres couchés)
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(v.wheelRadius, v.wheelRadius, 0.3, 8);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    for (const [x, z] of [[-0.8, 1.1], [0.8, 1.1], [-0.8, -1.1], [0.8, -1.1]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, v.wheelRadius, z);
      this.group.add(w);
      this.wheels.push(w);
    }
  }

  update(delta) {
    const v = CONFIG.vehicle;

    // --- Accélération / frein ---
    let throttle = 0;
    if (Input.isDown('KeyW')) throttle += 1;
    if (Input.isDown('KeyS')) throttle -= 1;
    if (throttle > 0) this.speed += v.acceleration * delta;
    else if (throttle < 0) this.speed -= v.brake * delta;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), v.friction * delta);
    this.speed = Math.max(-v.maxReverseSpeed, Math.min(v.maxSpeed, this.speed));

    // --- Direction : on ne tourne que si la voiture roule ---
    let steer = 0;
    if (Input.isDown('KeyA')) steer += 1;
    if (Input.isDown('KeyD')) steer -= 1;
    const roll = Math.min(1, Math.abs(this.speed) / 3) * Math.sign(this.speed || 1);
    this.group.rotation.y += steer * v.turnSpeed * delta * roll;

    // --- Déplacement ---
    const yaw = this.group.rotation.y;
    this.pos.x += Math.sin(yaw) * this.speed * delta;
    this.pos.z += Math.cos(yaw) * this.speed * delta;

    // --- Limites du monde + collisions bâtiments ---
    const half = this.terrain.size / 2 - 2;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
    resolveCollisions(this.pos, v.radius, this.colliders);

    // --- Sur le terrain ---
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);

    // --- Roues qui tournent ---
    for (const w of this.wheels) w.rotation.x += (this.speed * delta) / v.wheelRadius;
  }
}
