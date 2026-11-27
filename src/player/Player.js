import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { resolveCollisions } from '../utils/Collisions.js';
import { createHumanoid, setWalkAnimation } from '../utils/Humanoid.js';
import { fireHitscan } from '../utils/Combat.js';

// Personnage à pied (3e personne) avec pistolet et points de vie.
// Déplacement au clavier (ZQSD relatif à la caméra), Shift = courir,
// Espace = sauter. Physique arcade maison : gravité + sol du terrain.

export class Player {

  constructor(scene, ground, colliders = []) {
    this.scene = scene;
    this.ground = ground; // sol solide (terrain + pontons), interface heightAt/size
    this.colliders = colliders; // boîtes des bâtiments (src/utils/Collisions.js)
    this.vy = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.hp = CONFIG.combat.playerHp;
    this.alive = true;
    this.createMesh();

    const s = CONFIG.player.spawn;
    this.group.position.set(s.x, 0, s.z);
    // On cale le spawn sur le terrain
    this.group.position.y = Math.max(this.ground.heightAt(s.x, s.z), 0);
    this.scene.add(this.group);
  }

  createMesh() {
    // Mesh humanoïde partagé avec les PNJ (src/utils/Humanoid.js).
    // En FPS le joueur est caché : son arme est le view model Revolver.
    this.humanoid = createHumanoid(null, 0); // variante XIII n°0 (le joueur est caché en FPS de toute façon)
    this.group = this.humanoid.group;
  }

  // Tir hitscan depuis la caméra vers l'avant ; cibles = PNJ + hélicoptère de
  // police s'il est actif. Renvoie la cible touchée (PNJ ou hélico), ou null.
  shoot(npcs, camera, heli = null) {
    const c = CONFIG.combat;
    const origin = camera.position;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const targets = npcs
      .filter((n) => n.hp > 0)
      .map((n) => ({
        npc: n,
        pos: { x: n.group.position.x, y: n.group.position.y + 1.0, z: n.group.position.z },
      }));
    if (heli && heli.hp > 0 && heli.state === 'active') {
      targets.push({
        heli,
        pos: { x: heli.pos.x, y: heli.pos.y, z: heli.pos.z },
        radius: CONFIG.policeHeli.targetRadius,
      });
    }
    const hit = fireHitscan(origin, dir, targets, c.targetRadius, c.playerFireRange);
    if (hit) {
      if (hit.npc) hit.npc.takeDamage(c.damagePerShot, this.group.position);
      else if (hit.heli) hit.heli.takeDamage(c.damagePerShot);
    }
    return hit ? hit.npc || hit.heli : null;
  }

  takeDamage(dmg) {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - dmg);
    if (this.hp === 0) this.alive = false;
  }

  respawn() {
    const s = CONFIG.player.spawn;
    this.hp = CONFIG.combat.playerHp;
    this.alive = true;
    this.vy = 0;
    this.group.rotation.set(0, 0, 0);
    this.group.position.set(s.x, Math.max(this.ground.heightAt(s.x, s.z), 0), s.z);
  }

  update(delta, cameraYaw) {
    if (!this.alive) return;
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
    setWalkAnimation(this.humanoid, this.walkPhase, swing);

    // --- Limites du monde ---
    const half = this.ground.size / 2 - 1;
    pos.x = Math.max(-half, Math.min(half, pos.x));
    pos.z = Math.max(-half, Math.min(half, pos.z));

    // --- Collisions avec les bâtiments ---
    resolveCollisions(pos, p.radius, this.colliders);

    // --- Verticale : saut + gravité + sol du terrain ---
    if (Input.isDown('Space') && this.onGround) this.vy = p.jumpSpeed;
    this.vy -= p.gravity * delta;
    pos.y += this.vy * delta;
    const groundY = this.ground.heightAt(pos.x, pos.z);
    if (pos.y <= groundY) {
      pos.y = groundY;
      this.vy = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}
