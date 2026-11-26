import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { resolveCollisions } from '../utils/Collisions.js';
import { addOutline } from '../utils/Outline.js';

// Voiturette électrique low-poly (caisse + habitacle + 4 roues).
// Conduite arcade : ZQSD (W = accélérer, S = frein/marche arrière,
// A/D = tourner, seulement si la voiture roule). Reste sur le terrain
// (heightAt) et bloquée par les bâtiments.

export class Car {

  constructor(scene, ground, colliders, park) {
    this.scene = scene;
    this.ground = ground; // sol solide (terrain + pontons)
    this.colliders = colliders;
    this.speed = 0;
    this.waterTime = 0;  // temps cumulé dans l'eau
    this.broken = false; // panne (après waterPanneTime secondes dans l'eau)
    this.pitch = 0;      // inclinaison terrain (montée/descente)
    this.roll = 0;       // inclinaison latérale (devers)
    this.group = new THREE.Group();
    this.group.rotation.order = 'YXZ'; // yaw d'abord, puis pitch/roll
    this.createMesh();
    this.group.position.set(park.x, ground.heightAt(park.x, park.z), park.z);
    this.group.rotation.y = park.yaw;
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  createMesh() {
    const v = CONFIG.vehicle;
    // Carrosserie dans un sous-groupe, avec outline toon
    this.hull = new THREE.Group();
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
    this.hull.add(body, cabin);
    addOutline(this.hull, 1.06, CONFIG.props.outlineColor);
    this.group.add(this.hull);

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
    const groundY = this.ground.heightAt(this.pos.x, this.pos.z);

    // --- Panne si la voiture reste trop longtemps dans l'eau ---
    if (groundY < 0) {
      this.waterTime += delta;
      if (this.waterTime > v.waterPanneTime) this.broken = true;
    } else {
      this.waterTime = 0;
    }

    if (!this.broken) {
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
    } else {
      this.speed = 0; // en panne : la voiture ne roule plus
    }

    // --- Limites du monde + collisions bâtiments ---
    const half = this.ground.size / 2 - 2;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
    resolveCollisions(this.pos, v.radius, this.colliders);

    // --- Sur le terrain (dans l'eau elle coule sous le niveau de la mer) ---
    this.pos.y = groundY;

    // --- La caisse suit la pente du terrain (montée/descente + devers) ---
    const yaw = this.group.rotation.y;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const yF = this.ground.heightAt(this.pos.x + fx * 1.6, this.pos.z + fz * 1.6);
    const yB = this.ground.heightAt(this.pos.x - fx * 1.6, this.pos.z - fz * 1.6);
    const yR = this.ground.heightAt(this.pos.x + rx * 0.8, this.pos.z + rz * 0.8);
    const yL = this.ground.heightAt(this.pos.x - rx * 0.8, this.pos.z - rz * 0.8);
    const targetPitch = Math.atan2(yB - yF, 3.2); // < 0 en montée (nez en haut)
    const targetRoll = Math.atan2(yR - yL, 1.6);
    const k = Math.min(1, v.tiltSpeed * delta); // lissage
    this.pitch += (targetPitch - this.pitch) * k;
    this.roll += (targetRoll - this.roll) * k;
    this.group.rotation.x = this.pitch;
    this.group.rotation.z = this.roll;

    // --- Roues qui tournent ---
    for (const w of this.wheels) w.rotation.x += (this.speed * delta) / v.wheelRadius;
  }
}
