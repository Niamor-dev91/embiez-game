import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { resolveCollisions } from '../utils/Collisions.js';

// Personnage à pied (3e personne) : un groupe de boîtes low-poly.
// Déplacement au clavier (ZQSD relatif à la caméra), Shift = courir,
// Espace = sauter. Physique arcade maison : gravité + sol du terrain.

export class Player {

  constructor(scene, terrain, colliders = []) {
    this.scene = scene;
    this.terrain = terrain;
    this.colliders = colliders; // boîtes des bâtiments (src/utils/Collisions.js)
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.createMesh();

    const s = CONFIG.player.spawn;
    this.group.position.set(s.x, 0, s.z);
    // On cale le spawn sur le terrain
    this.group.position.y = Math.max(this.terrain.heightAt(s.x, s.z), 0);
    this.scene.add(this.group);
  }

  createMesh() {
    const p = CONFIG.player;
    const mat = (color) => new THREE.MeshLambertMaterial({ color });
    const box = (w, h, d, color, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
      m.position.set(x, y, z);
      return m;
    };

    this.group = new THREE.Group();
    // Jambes (pivotent à la marche)
    this.legL = box(0.18, 0.8, 0.2, p.colors.legs, -0.12, 0.4, 0);
    this.legR = box(0.18, 0.8, 0.2, p.colors.legs, 0.12, 0.4, 0);
    // Bras (pivotent à la marche)
    this.armL = box(0.12, 0.65, 0.15, p.colors.arms, -0.32, 1.15, 0);
    this.armR = box(0.12, 0.65, 0.15, p.colors.arms, 0.32, 1.15, 0);
    // Corps et tête
    this.group.add(box(0.5, 0.7, 0.3, p.colors.body, 0, 1.15, 0));
    this.group.add(box(0.3, 0.3, 0.3, p.colors.head, 0, 1.65, 0));
    this.group.add(this.legL, this.legR, this.armL, this.armR);
  }

  update(delta, cameraYaw) {
    const p = CONFIG.player;
    const pos = this.group.position;

    // --- Direction selon les touches, dans le repère de la caméra ---
    let f = 0;
    let r = 0;
    if (Input.isDown('KeyW')) f += 1;
    if (Input.isDown('KeyS')) f -= 1;
    if (Input.isDown('KeyD')) r += 1;
    if (Input.isDown('KeyA')) r -= 1;
    const moving = f !== 0 || r !== 0;
    const speed =
      Input.isDown('ShiftLeft') || Input.isDown('ShiftRight') ? p.runSpeed : p.walkSpeed;

    if (moving) {
      // avant/droite de la caméra projetés au sol
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      let dx = -sin * f + cos * r;
      let dz = -cos * f - sin * r;
      const len = Math.hypot(dx, dz);
      dx /= len;
      dz /= len;
      pos.x += dx * speed * delta;
      pos.z += dz * speed * delta;

      // Le perso tourne vers sa direction de déplacement
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - this.group.rotation.y;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      this.group.rotation.y += diff * Math.min(1, p.turnSpeed * delta);

      // Animation de marche
      this.walkPhase += speed * delta * 2.2;
    } else {
      this.walkPhase = 0;
    }
    const swing = moving ? 1 : 0;
    this.legL.rotation.x = Math.sin(this.walkPhase) * 0.6 * swing;
    this.legR.rotation.x = -Math.sin(this.walkPhase) * 0.6 * swing;
    this.armL.rotation.x = -Math.sin(this.walkPhase) * 0.5 * swing;
    this.armR.rotation.x = Math.sin(this.walkPhase) * 0.5 * swing;

    // --- Limites du monde ---
    const half = this.terrain.size / 2 - 1;
    pos.x = Math.max(-half, Math.min(half, pos.x));
    pos.z = Math.max(-half, Math.min(half, pos.z));

    // --- Collisions avec les bâtiments ---
    resolveCollisions(pos, p.radius, this.colliders);

    // --- Verticale : saut + gravité + sol du terrain ---
    if (Input.isDown('Space') && this.onGround) this.vy = p.jumpSpeed;
    this.vy -= p.gravity * delta;
    pos.y += this.vy * delta;
    const groundY = this.terrain.heightAt(pos.x, pos.z);
    if (pos.y <= groundY) {
      pos.y = groundY;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}
