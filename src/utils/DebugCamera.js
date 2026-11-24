import * as THREE from 'three';

import { CONFIG } from '../config.js';

// Caméra libre de debug (temporaire) : ZQSD + souris (pointer lock au clic)
// ou flèches, Espace/Ctrl = monter/descendre, Shift = rapide.
// Pilote la caméra passée au constructeur.

export class DebugCamera {

  constructor(canvas, camera) {
    this.canvas = canvas;
    this.camera = camera;
    this.keys = {};
    this.yaw = 0;   // rotation horizontale
    this.pitch = 0; // rotation verticale
    this.enabled = true; // false quand le mode joueur est actif
    this.attach();
  }

  attach() {
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Clic sur le canvas = capture de la souris (pointer lock)
    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * CONFIG.debugCamera.mouseSensitivity;
      this.pitch -= e.movementY * CONFIG.debugCamera.mouseSensitivity;
      this.clampPitch();
    });
  }

  clampPitch() {
    // On limite le pitch pour ne pas se retourner
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  update(delta) {
    if (!this.enabled) return;
    const d = CONFIG.debugCamera;
    const cam = this.camera;

    // Rotation avec les flèches (alternative à la souris)
    if (this.keys['ArrowLeft']) this.yaw += d.keyTurnSpeed * delta;
    if (this.keys['ArrowRight']) this.yaw -= d.keyTurnSpeed * delta;
    if (this.keys['ArrowUp']) this.pitch += d.keyTurnSpeed * delta;
    if (this.keys['ArrowDown']) this.pitch -= d.keyTurnSpeed * delta;
    this.clampPitch();

    cam.rotation.set(this.pitch, this.yaw, 0);

    // Déplacement ZQSD (event.code = position physique, marche en AZERTY)
    // KeyW = Z, KeyA = Q, KeyS = S, KeyD = D sur un clavier AZERTY
    let forward = 0;
    let right = 0;
    if (this.keys['KeyW']) forward += 1;
    if (this.keys['KeyS']) forward -= 1;
    if (this.keys['KeyD']) right += 1;
    if (this.keys['KeyA']) right -= 1;
    // Monter / descendre : Espace / Ctrl
    let up = 0;
    if (this.keys['Space']) up += 1;
    if (this.keys['ControlLeft']) up -= 1;

    const speed =
      d.moveSpeed *
      (this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? d.fastMultiplier : 1);

    // Direction avant/droite selon l'orientation de la caméra
    const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(cam.rotation);
    const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(cam.rotation);

    cam.position.addScaledVector(forwardVec, forward * speed * delta);
    cam.position.addScaledVector(rightVec, right * speed * delta);
    cam.position.y += up * speed * delta;
  }
}
