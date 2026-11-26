import * as THREE from 'three';

import { CONFIG } from './config.js';
import { Sea } from './world/Sea.js';
import { Terrain } from './world/Terrain.js';
import { Roads } from './world/Roads.js';
import { Buildings } from './world/Buildings.js';
import { Vegetation } from './world/Vegetation.js';
import { Player } from './player/Player.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { Npc, pickRoads, pickPoliceRoads, nearestRoadPoint } from './npc/Npc.js';
import { Car } from './vehicles/Car.js';
import { DebugCamera } from './utils/DebugCamera.js';
import { Input } from './utils/Input.js';
import { resolveCircleVsCircle } from './utils/Collisions.js';

// Classe principale : renderer, scène, caméra, boucle d'animation.

export class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.hud = document.getElementById('hud');
    this.fireCooldown = 0;
    this.lastHud = '';
    this.inCar = false;
    this.eHeld = false; // détection de front montant pour la touche E

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
    // + policiers (pistolet, look bleu) placés sur les chemins les plus
    // proches du centre de l'île (le village)
    const roads = pickRoads(CONFIG.npc.count);
    const policeRoads = pickPoliceRoads(CONFIG.combat.policeCount, roads);
    this.npcs = [];
    for (let i = 0; i < CONFIG.npc.count; i++) {
      this.npcs.push(new Npc(this.scene, this.terrain, this.buildings.colliders, roads[i], i, false));
    }
    for (let i = 0; i < CONFIG.combat.policeCount; i++) {
      this.npcs.push(
        new Npc(this.scene, this.terrain, this.buildings.colliders, policeRoads[i], 100 + i, true)
      );
    }

    // Voiturette électrique garée sur la route la plus proche du spawn
    const s = CONFIG.player.spawn;
    const park = nearestRoadPoint(s.x, s.z);
    this.car = new Car(this.scene, this.terrain, this.buildings.colliders, park);
  }

  // --- Voiturette : entrer / sortir (touche E) ---

  enterCar() {
    this.inCar = true;
    this.player.group.visible = false;
    this.playerCamera.target = this.car.group;
    this.playerCamera.distance = CONFIG.vehicle.cameraDistance;
  }

  exitCar() {
    this.inCar = false;
    this.player.group.visible = true;
    this.playerCamera.target = this.player.group;
    this.playerCamera.distance = CONFIG.playerCamera.distance;
    // Le joueur réapparaît à côté de la voiture, sur le terrain
    const p = this.car.pos;
    const yaw = this.car.group.rotation.y;
    const px = p.x + Math.cos(yaw) * 2.2;
    const pz = p.z - Math.sin(yaw) * 2.2;
    this.player.group.position.set(px, this.terrain.heightAt(px, pz), pz);
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

      // Entrer/sortir de la voiturette (E, front montant)
      const eDown = Input.isDown('KeyE');
      if (eDown && !this.eHeld) {
        if (!this.inCar) {
          const d = Math.hypot(
            this.player.group.position.x - this.car.pos.x,
            this.player.group.position.z - this.car.pos.z
          );
          if (d < CONFIG.vehicle.interactDistance) this.enterCar();
        } else {
          this.exitCar();
        }
      }
      this.eHeld = eDown;

      if (this.inCar) {
        this.car.update(delta);
      } else if (this.player.alive) {
        this.player.update(delta, this.playerCamera.yaw);
        // Le joueur ne traverse pas la voiturette
        resolveCircleVsCircle(
          this.player.group.position,
          CONFIG.player.radius,
          this.car.pos,
          CONFIG.vehicle.radius
        );
      }
      this.playerCamera.update(delta);
    }
    this.updateHud();
  }

  // HUD : points de vie du joueur + infos (en haut à gauche)
  updateHud() {
    let txt;
    if (!this.player.alive) {
      txt = 'KO ! Appuie sur R pour réapparaître';
    } else {
      txt = 'PV : ' + this.player.hp + '/' + CONFIG.combat.playerHp + '   |   clic ou F = tirer';
      if (this.inCar) {
        txt += '   |   ZQSD = conduire, E = sortir';
      } else {
        const d = Math.hypot(
          this.player.group.position.x - this.car.pos.x,
          this.player.group.position.z - this.car.pos.z
        );
        if (d < CONFIG.vehicle.interactDistance) txt += '   |   E : prendre la voiturette';
      }
    }
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
