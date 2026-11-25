import * as THREE from 'three';

import { CONFIG } from './config.js';
import { Sea } from './world/Sea.js';
import { Terrain } from './world/Terrain.js';
import { Roads } from './world/Roads.js';
import { Buildings } from './world/Buildings.js';
import { Vegetation } from './world/Vegetation.js';
import { Player } from './player/Player.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { Npc, pickRoads } from './npc/Npc.js';
import { DebugCamera } from './utils/DebugCamera.js';
import { Input } from './utils/Input.js';

// Classe principale : renderer, scène, caméra, boucle d'animation.

export class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.hud = document.getElementById('hud');
    this.fireCooldown = 0;
    this.lastHud = '';

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initWorld();

    // Mode 'player' (3e personne) par défaut, F8 = bascule caméra de debug
    this.mode = 'player';
    this.debugCamera.enabled = false;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F8') {
        this.mode = this.mode === 'player' ? 'debug' : 'player';
        this.playerCamera.enabled = this.mode === 'player';
        this.debugCamera.enabled = this.mode === 'debug';
      }
    });

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
    this.roads = new Roads(this.scene, this.terrain);
    this.buildings = new Buildings(this.scene, this.terrain);
    this.vegetation = new Vegetation(this.scene, this.terrain);
    this.player = new Player(this.scene, this.terrain, this.buildings.colliders);
    this.playerCamera = new PlayerCamera(this.canvas, this.camera, this.player, this.terrain);
    this.debugCamera = new DebugCamera(this.canvas, this.camera);

    // PNJ : répartis sur des chemins différents de l'île, départ aléatoire
    // + policiers (avec pistolet)
    const roads = pickRoads(CONFIG.npc.count + CONFIG.combat.policeCount);
    this.npcs = [];
    for (let i = 0; i < CONFIG.npc.count; i++) {
      this.npcs.push(new Npc(this.scene, this.terrain, this.buildings.colliders, roads[i], i, false));
    }
    for (let i = 0; i < CONFIG.combat.policeCount; i++) {
      this.npcs.push(
        new Npc(this.scene, this.terrain, this.buildings.colliders, roads[CONFIG.npc.count + i], 100 + i, true)
      );
    }
  }

  // --- Mises à jour ---

  update(delta) {
    this.sea.update(delta);
    for (const npc of this.npcs) npc.update(delta, this.player);
    if (this.mode === 'debug') {
      this.debugCamera.update(delta);
    } else {
      // Tir du joueur (clic souris ou F) avec cooldown ; toucher un PNJ
      // alerte les policiers
      this.fireCooldown -= delta;
      if (this.player.alive && (Input.mouseDown || Input.isDown('KeyF')) && this.fireCooldown <= 0) {
        this.fireCooldown = CONFIG.combat.playerFireCooldown;
        const target = this.player.shoot(this.npcs, this.camera);
        if (target) {
          for (const n of this.npcs) if (n.isPolice) n.alerted = true;
        }
      }
      // Respawn après un KO
      if (!this.player.alive && Input.isDown('KeyR')) this.player.respawn();
      if (this.player.alive) {
        this.player.update(delta, this.playerCamera.yaw);
        this.playerCamera.update(delta);
      }
    }
    this.updateHud();
  }

  // HUD : points de vie du joueur (en haut à gauche)
  updateHud() {
    const txt = this.player.alive
      ? 'PV : ' + this.player.hp + '/' + CONFIG.combat.playerHp + '   |   clic ou F = tirer'
      : 'KO ! Appuie sur R pour réapparaître';
    if (txt !== this.lastHud) {
      this.hud.textContent = txt;
      this.lastHud = txt;
    }
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
