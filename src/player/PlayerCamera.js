import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';

// Caméra du joueur :
// - à pied = FPS : la caméra est aux yeux du joueur (eyeHeight), rotation
//   yaw/pitch à la souris (pointer lock) ou aux flèches
// - en véhicule = 3e personne : orbite derrière la cible, suivi adouci (lerp),
//   sans jamais traverser le sol.

export class PlayerCamera {

  constructor(canvas, camera, player, ground) {
    this.canvas = canvas;
    this.camera = camera;
    this.player = player;
    this.ground = ground; // sol solide (terrain + pontons)
    this.target = player.group; // cible suivie : joueur, ou voiturette (Game switch)
    this.yaw = 0;
    this.pitch = 0.35;
    this.enabled = true;
    this.attach();
  }

  attach() {
    // Clic sur le canvas = capture de la souris (pointer lock)
    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * CONFIG.playerCamera.mouseSensitivity;
      this.pitch -= e.movementY * CONFIG.playerCamera.mouseSensitivity;
      this.clampPitch();
    });
  }

  clampPitch() {
    const c = CONFIG.playerCamera;
    this.pitch = Math.max(c.minPitch, Math.min(c.maxPitch, this.pitch));
  }

  update(delta) {
    if (!this.enabled) return;
    const c = CONFIG.playerCamera;

    // Rotation au clavier (flèches)
    if (Input.isDown('ArrowLeft')) this.yaw += c.keyTurnSpeed * delta;
    if (Input.isDown('ArrowRight')) this.yaw -= c.keyTurnSpeed * delta;
    if (Input.isDown('ArrowUp')) this.pitch += c.keyTurnSpeed * delta;
    if (Input.isDown('ArrowDown')) this.pitch -= c.keyTurnSpeed * delta;
    this.clampPitch();

    if (this.target === this.player.group) {
      // --- FPS : caméra aux yeux du joueur ---
      const p = this.player.group.position;
      this.camera.position.set(p.x, p.y + c.eyeHeight, p.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0); // ordre YXZ (initCamera)
      return;
    }

    // --- 3e personne (véhicule) : position souhaitée derrière la cible ---
    const target = this.target.position;
    const cp = Math.cos(this.pitch);
    const desired = new THREE.Vector3(
      target.x + Math.sin(this.yaw) * cp * c.distance,
      target.y + c.height + Math.sin(this.pitch) * c.distance,
      target.z + Math.cos(this.yaw) * cp * c.distance
    );
    // Suivi adouci
    this.camera.position.lerp(desired, 1 - Math.exp(-c.lerpSpeed * delta));
    // La caméra ne traverse pas le sol
    const groundY = this.ground.heightAt(this.camera.position.x, this.camera.position.z);
    if (this.camera.position.y < groundY + 0.3) this.camera.position.y = groundY + 0.3;
    this.camera.lookAt(target.x, target.y + c.height, target.z);
  }
}
