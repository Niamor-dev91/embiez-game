import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { resolveCollisions } from '../utils/Collisions.js';
import { addOutline } from '../utils/Outline.js';

// Pick-up low-poly façon XIII (1re mission) : capot long + calandre + phares,
// cabine vitrée, benne ouverte, pare-chocs, 4 grosses roues.
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

  // Pick-up façon XIII (1re mission) : capot long, calandre chromée, phares,
  // cabine vitrée, benne arrière ouverte, pare-chocs, grosses roues.
  // L'avant de la voiture est +Z. Le tout dans un sous-groupe avec outline toon.
  createMesh() {
    const v = CONFIG.vehicle;
    this.hull = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: v.bodyColor });
    const glassMat = new THREE.MeshLambertMaterial({ color: v.cabinColor });
    const chromeMat = new THREE.MeshLambertMaterial({ color: v.chromeColor });
    const box = (w, h, d, mat, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      this.hull.add(m);
      return m;
    };

    // Châssis
    box(1.8, 0.35, 4.2, bodyMat, 0, 0.55, 0);
    // Capot long à l'avant
    box(1.7, 0.45, 1.6, bodyMat, 0, 0.95, 1.3);
    // Calandre chromée + 2 phares
    box(1.2, 0.5, 0.1, chromeMat, 0, 0.9, 2.06);
    const lightGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8);
    lightGeo.rotateX(Math.PI / 2);
    const lightMat = new THREE.MeshLambertMaterial({ color: v.headlightColor });
    this.headlights = [];
    for (const x of [-0.55, 0.55]) {
      const l = new THREE.Mesh(lightGeo, lightMat);
      l.position.set(x, 0.95, 2.1);
      this.hull.add(l);
      // Spot réel : éclaire la route devant la voiture (allumé la nuit)
      const spot = new THREE.SpotLight(v.headlightColor, 0, 45, 0.55, 0.45, 1.4);
      spot.position.set(x, 0.95, 2.1);
      spot.target.position.set(x, 0.2, 14);
      this.group.add(spot, spot.target);
      this.headlights.push(spot);
    }
    // Pare-chocs avant / arrière
    box(1.9, 0.15, 0.15, chromeMat, 0, 0.42, 2.18);
    box(1.9, 0.15, 0.15, chromeMat, 0, 0.42, -2.18);
    // Cabine vitrée + toit + 2 portes (cachés en vue conducteur FPV).
    // Chaque porte : moitié BASSE carrosserie, moitié HAUTE vitrée (bleue).
    this.cabinTop = new THREE.Group();
    const cabin = box(1.7, 0.7, 1.3, glassMat, 0, 1.2, -0.2);
    const roof = box(1.7, 0.08, 1.35, bodyMat, 0, 1.6, -0.2);
    for (const x of [-0.88, 0.88]) {
      this.cabinTop.add(box(0.06, 0.35, 1.2, bodyMat, x, 1.02, -0.2)); // bas : carrosserie
      this.cabinTop.add(box(0.06, 0.35, 1.2, glassMat, x, 1.38, -0.2)); // haut : vitre bleue
    }
    this.cabinTop.add(cabin, roof);
    // groupe séparé (avec son propre outline) pour pouvoir tout cacher en FPV
    this.group.add(this.cabinTop);
    addOutline(this.cabinTop, 1.06, CONFIG.props.outlineColor);
    // Benne arrière ouverte : fond + 4 bordures
    box(1.7, 0.1, 1.2, bodyMat, 0, 0.75, -1.5);
    box(1.7, 0.35, 0.08, bodyMat, 0, 0.95, -0.95);
    box(1.7, 0.35, 0.08, bodyMat, 0, 0.95, -2.05);
    box(0.08, 0.35, 1.2, bodyMat, -0.85, 0.95, -1.5);
    box(0.08, 0.35, 1.2, bodyMat, 0.85, 0.95, -1.5);

    addOutline(this.hull, 1.06, CONFIG.props.outlineColor);
    this.group.add(this.hull);

    // 4 grosses roues (cylindres couchés)
    this.wheels = [];
    const wheelGeo = new THREE.CylinderGeometry(v.wheelRadius, v.wheelRadius, 0.35, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
    for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, v.wheelRadius, z);
      this.group.add(w);
      this.wheels.push(w);
    }
  }

  // En vue conducteur FPV, on cache toit + cabine + portes (on voit par le pare-brise)
  setCabinVisible(visible) {
    if (this.cabinTop) this.cabinTop.visible = visible;
  }

  // Phares allumés (nuit) / éteints (jour)
  setHeadlights(on) {
    const i = on ? CONFIG.dayNight.headlightIntensity : 0;
    for (const s of this.headlights) s.intensity = i;
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
