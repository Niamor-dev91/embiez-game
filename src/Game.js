import * as THREE from 'three';

import { CONFIG } from './config.js';
import { Sea } from './world/Sea.js';
import { Terrain } from './world/Terrain.js';

// Classe principale : renderer, scène, caméra, boucle d'animation.

export class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();

    // État de la caméra de debug
    this.keys = {};
    this.yaw = 0;   // rotation horizontale
    this.pitch = 0; // rotation verticale

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initWorld();
    this.initDebugControls();

    window.addEventListener('resize', () => this.onResize());
  }

  // --- Initialisation ---

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: CONFIG.render.antialias,
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, CONFIG.render.maxPixelRatio)
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  initScene() {
    this.scene = new THREE.Scene();
    // Ciel : couleur unie + brouillard de même couleur (style GTA III)
    this.scene.background = new THREE.Color(CONFIG.sky.color);
    this.scene.fog = new THREE.Fog(
      CONFIG.sky.color,
      CONFIG.sky.fogNear,
      CONFIG.sky.fogFar
    );

    // Lumières simples
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(50, 100, 30);
    this.scene.add(ambient, sun);
  }

  initCamera() {
    const c = CONFIG.camera;
    this.camera = new THREE.PerspectiveCamera(
      c.fov,
      window.innerWidth / window.innerHeight,
      c.near,
      c.far
    );
    this.camera.position.set(
      c.startPosition.x,
      c.startPosition.y,
      c.startPosition.z
    );
    // Ordre YXZ : yaw d'abord, puis pitch (comportement FPS classique)
    this.camera.rotation.order = 'YXZ';
  }

  initWorld() {
    this.sea = new Sea(this.scene);
    this.terrain = new Terrain(this.scene);
  }

  // --- Contrôles de la caméra de debug ---

  initDebugControls() {
    window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // Clic sur le canvas = capture de la souris (pointer lock)
    this.canvas.addEventListener('click', () => {
      this.canvas.requestPointerLock();
    });

    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.yaw -= e.movementX * CONFIG.debugCamera.mouseSensitivity;
      this.pitch -= e.movementY * CONFIG.debugCamera.mouseSensitivity;
      // On limite le pitch pour ne pas se retourner
      const limit = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
    });
  }

  updateDebugCamera(delta) {
    const d = CONFIG.debugCamera;

    // Rotation avec les flèches (alternative à la souris)
    if (this.keys['ArrowLeft']) this.yaw += d.keyTurnSpeed * delta;
    if (this.keys['ArrowRight']) this.yaw -= d.keyTurnSpeed * delta;
    if (this.keys['ArrowUp']) this.pitch += d.keyTurnSpeed * delta;
    if (this.keys['ArrowDown']) this.pitch -= d.keyTurnSpeed * delta;
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

    this.camera.rotation.set(this.pitch, this.yaw, 0);

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
    const forwardVec = new THREE.Vector3(0, 0, -1).applyEuler(this.camera.rotation);
    const rightVec = new THREE.Vector3(1, 0, 0).applyEuler(this.camera.rotation);

    this.camera.position.addScaledVector(forwardVec, forward * speed * delta);
    this.camera.position.addScaledVector(rightVec, right * speed * delta);
    this.camera.position.y += up * speed * delta;
  }

  // --- Mises à jour ---

  update(delta) {
    this.sea.update(delta);
    this.updateDebugCamera(delta);
  }

  // --- Boucle principale ---

  start() {
    this.clock.start();
    this.loop();
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    // On plafonne le delta pour éviter les gros sauts (onglet en arrière-plan)
    const delta = Math.min(this.clock.getDelta(), 0.1);
    this.update(delta);
    this.renderer.render(this.scene, this.camera);
  }

  // --- Redimensionnement ---

  onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
