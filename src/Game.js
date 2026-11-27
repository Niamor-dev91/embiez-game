import * as THREE from 'three';

import { CONFIG } from './config.js';
import { Sea } from './world/Sea.js';
import { Terrain } from './world/Terrain.js';
import { Roads } from './world/Roads.js';
import { Ground } from './world/Ground.js';
import { Buildings } from './world/Buildings.js';
import { Vegetation } from './world/Vegetation.js';
import { Player } from './player/Player.js';
import { PlayerCamera } from './player/PlayerCamera.js';
import { Revolver } from './player/Revolver.js';
import { Npc, pickRoads, pickPoliceRoads, nearestRoadPoint } from './npc/Npc.js';
import { Car } from './vehicles/Car.js';
import { TrafficCar, pickTrafficRoads } from './vehicles/TrafficCar.js';
import { Boat, dockSpots } from './vehicles/Boat.js';

import { PoliceHelicopter } from './vehicles/PoliceHelicopter.js';
import { DebugCamera } from './utils/DebugCamera.js';
import { Input } from './utils/Input.js';
import { resolveCircleVsCircle } from './utils/Collisions.js';
import { Pickups } from './world/Pickups.js';
import { TouchControls } from './utils/TouchControls.js';
import { mulberry32 } from './utils/random.js';

// Classe principale : renderer, scène, caméra, boucle d'animation.

export class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.hud = document.getElementById('hud');
    this.fireCooldown = 0;
    this.lastHud = '';
    this.vehicle = null; // véhicule actif (car ou boat), null = à pied
    this.eHeld = false;  // détection de front montant pour la touche E
    this.notice = '';    // message temporaire (pickup ramassé...)
    this.noticeTimer = 0;
    this.timeOfDay = 0.3; // 0..1, 0.25 = midi ; on démarre en journée
    this.isNight = false;

    this.initRenderer();
    this.initScene();
    this.initCamera();
    this.initWorld();

    // Contrôles tactiles (joystick + boutons) si écran tactile ; le glisser
    // sur le canvas fait tourner la caméra via playerCamera.look()
    this.touch = new TouchControls();
    if (this.touch.active) {
      this.touch.onLook = (dx, dy) => this.playerCamera.look(dx, dy);
    }

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

    // Lumières simples (réfs gardées pour le cycle jour/nuit)
    this.ambient = new THREE.AmbientLight(0xffffff, 0.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.0);
    this.sun.position.set(50, 100, 30);
    this.scene.add(this.ambient, this.sun);

    // Corps célestes visibles : soleil (jour) et lune (nuit) font un parcours
    // Est -> Ouest dans le ciel (x = est, le sud est +Z) ; étoiles la nuit.
    const R = 800;
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(40, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffdd44, fog: false })
    );
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(26, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xd8e4ff, fog: false })
    );
    this.sunMesh.position.set(R, 0, 0.35 * R);
    this.moonMesh.position.set(-R, 0, 0.35 * R);
    this.scene.add(this.sunMesh, this.moonMesh);

    // Étoiles : points aléatoires sur la voûte céleste, visibles la nuit
    const rand = mulberry32(99);
    const starPos = [];
    for (let i = 0; i < 400; i++) {
      // direction aléatoire sur l'hémisphère supérieur
      const u = rand() * 2 - 1;
      const ph = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      starPos.push(Math.cos(ph) * r * 900, Math.abs(u) * 900, Math.sin(ph) * r * 900);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 2.2, sizeAttenuation: false,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    }));
    this.scene.add(this.stars);
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
    // Sol solide : terrain + pontons du port (le perso marche DESSUS)
    this.ground = new Ground(this.terrain, this.roads);

    // Pickups : boîtes de munitions + bouteilles de pastis sur la map
    this.pickups = new Pickups(this.scene, this.ground);
    // Colliders solides : bâtiments + troncs des pins
    const colliders = [...this.buildings.colliders, ...this.vegetation.colliders];
    this.player = new Player(this.scene, this.ground, colliders);
    this.player.group.visible = false; // FPS : le perso est caché, l'arme = view model revolver
    this.playerCamera = new PlayerCamera(this.canvas, this.camera, this.player, this.ground);
    this.revolver = new Revolver(this.scene, this.camera); // view model attaché à la caméra
    this.debugCamera = new DebugCamera(this.canvas, this.camera);

    // PNJ : répartis sur des chemins différents de l'île, départ aléatoire
    // + policiers (pistolet, look bleu) placés sur les chemins les plus
    // proches du centre de l'île (le village)
    const roads = pickRoads(CONFIG.npc.count);
    const policeRoads = pickPoliceRoads(CONFIG.combat.policeCount, roads);
    this.npcs = [];
    for (let i = 0; i < CONFIG.npc.count; i++) {
      this.npcs.push(new Npc(this.scene, this.ground, colliders, roads[i], i, false));
    }
    for (let i = 0; i < CONFIG.combat.policeCount; i++) {
      this.npcs.push(
        new Npc(this.scene, this.ground, colliders, policeRoads[i], 100 + i, true)
      );
    }

    // Voiturette électrique garée sur la route la plus proche du spawn,
    // décalée de 6 m le long de la route pour ne pas être sur le joueur
    const s = CONFIG.player.spawn;
    const park = nearestRoadPoint(s.x, s.z);
    park.x += Math.sin(park.yaw) * 6;
    park.z += Math.cos(park.yaw) * 6;
    this.car = new Car(this.scene, this.ground, colliders, park);

    // 2 voitures en circulation sur les plus grosses routes de l'île
    this.traffic = pickTrafficRoads(CONFIG.traffic.count).map((r, i) =>
      new TrafficCar(this.scene, this.ground, colliders, r, CONFIG.traffic.colors[i % CONFIG.traffic.colors.length], 500 + i)
    );

    // Bateaux amarrés aux pontons du port (voilier, moteur, jetski)
    const spots = dockSpots(CONFIG.boat.types.length, this.ground, s);
    this.boats = CONFIG.boat.types.map((t, i) =>
      new Boat(this.scene, this.ground, { ...spots[i], type: t })
    );

    // Hélicoptère de police : inactif au départ, appelé quand le joueur est
    // recherché (il a tiré sur un PNJ)
    this.wanted = false;
    this.heli = new PoliceHelicopter(this.scene, this.ground);
  }

  // --- Véhicules (voiturette + bateaux) : entrer / sortir avec E ---

  get vehicles() {
    return [this.car, ...this.boats];
  }

  vehicleLabel(v) {
    return v === this.car ? 'la voiturette' : v.label;
  }

  vehicleInteractDistance(v) {
    return v === this.car ? CONFIG.vehicle.interactDistance : CONFIG.boat.interactDistance;
  }

  enterVehicle(v) {
    this.vehicle = v;
    this.playerCamera.target = v.group;
    // En voiture : vue FPV au poste de conduite (cabine cachée)
    this.playerCamera.driverView = v === this.car;
    if (v === this.car) v.setCabinVisible(false);
    this.playerCamera.distance = v === this.car ? CONFIG.vehicle.cameraDistance : CONFIG.boat.cameraDistance;
  }

  exitVehicle() {
    const v = this.vehicle;
    this.vehicle = null;
    this.playerCamera.target = this.player.group; // retour en FPS
    this.playerCamera.driverView = false;
    if (v === this.car) v.setCabinVisible(true);
    this.playerCamera.distance = CONFIG.playerCamera.distance;
    // Le joueur réapparaît à côté du véhicule, sur le sol
    const p = v.pos;
    const yaw = v.group.rotation.y;
    const off = (v.radius || 2) + 1;
    const px = p.x + Math.cos(yaw) * off;
    const pz = p.z - Math.sin(yaw) * off;
    this.player.group.position.set(px, this.ground.heightAt(px, pz), pz);
  }

  // --- Cycle jour/nuit : 12 min de soleil puis 12 min de lune ---
  updateDayNight(delta) {
    const d = CONFIG.dayNight;
    const cycle = (d.dayMinutes + d.nightMinutes) * 60; // 24 min
    this.timeOfDay = (this.timeOfDay + delta / cycle) % 1;
    // Le jour va de dayStartHour (8h, lever à l'Est) à +12h (20h, coucher à l'Ouest)
    const dayStart = CONFIG.dayNight.dayStartHour / 24;
    const a = ((((this.timeOfDay - dayStart) % 1) + 1) % 1) * Math.PI * 2; // 0 au lever, π au coucher
    const sunH = Math.sin(a); // > 0 le jour (8h..20h), < 0 la nuit
    // facteur jour 0..1, PROGRESSIF au lever/coucher (smoothstep)
    const tf = Math.max(0, Math.min(1, (sunH + 0.2) / 0.5));
    const dayF = tf * tf * (3 - 2 * tf);
    this.isNight = sunH < 0;

    // Ciel + brouillard
    const sky = new THREE.Color(d.skyNight).lerp(new THREE.Color(d.skyDay), dayF);
    this.scene.background = sky;
    this.scene.fog.color.copy(sky);
    // Mer
    this.sea.mesh.material.color.set(d.seaNight).lerp(new THREE.Color(CONFIG.sea.color), dayF);
    // Soleil VISIBLE le jour : parcours Est (+X) -> Ouest (-X) via le sud (+Z).
    // Arc tel que : 8h = horizon Est, 12h = zénith, 20h = horizon Ouest.
    const R = 800;
    const p = CONFIG.dayNight.sunArcPower;
    const u = Math.max(0, Math.min(1, a / Math.PI)); // 0 au lever, 1 au coucher
    const thDay = Math.PI * Math.pow(u, p);
    this.sunMesh.position.set(Math.cos(thDay) * R, Math.sin(thDay) * R, 0.35 * R);
    this.sunMesh.visible = sunH > -0.05;
    // Lune VISIBLE la nuit : même parcours Est -> Ouest (nuit de 20h à 8h)
    const v = Math.max(0, Math.min(1, (a - Math.PI) / Math.PI));
    const thNight = Math.PI * Math.pow(v, p);
    this.moonMesh.position.set(Math.cos(thNight) * R, Math.sin(thNight) * R, 0.35 * R);
    this.moonMesh.visible = sunH < 0.05;
    // Étoiles la nuit (opacité progressive)
    const starO = Math.max(0, Math.min(1, -sunH / 0.25));
    this.stars.material.opacity = starO;
    this.stars.visible = starO > 0.02;

    // Lumière directionnelle : suit le soleil le jour, la lune la nuit (progressif)
    if (sunH >= 0) {
      this.sun.position.copy(this.sunMesh.position).multiplyScalar(0.2);
      this.sun.color.set(d.sunDay);
      this.sun.intensity = d.sunDayIntensity * (0.15 + 0.85 * dayF);
    } else {
      this.sun.position.copy(this.moonMesh.position).multiplyScalar(0.2);
      this.sun.color.set(d.sunNight);
      this.sun.intensity = d.sunNightIntensity * (1 - dayF);
    }
    this.ambient.intensity = d.ambientNight + (d.ambientDay - d.ambientNight) * dayF;
    // Phares des voitures allumés la nuit + 1 fenêtre sur 5 allumée dans les bâtiments
    if (this.car.setHeadlights) this.car.setHeadlights(this.isNight);
    for (const tc of this.traffic) if (tc.setHeadlights) tc.setHeadlights(this.isNight);
    if (this.heli.setSearchlight) this.heli.setSearchlight(this.isNight && this.heli.state === 'active');
    this.buildings.setWindowsLit(this.isNight);
  }

  // --- Mises à jour ---

  update(delta) {
    this.updateDayNight(delta);
    this.sea.update(delta);
    for (const npc of this.npcs) npc.update(delta, this.player);
    this.heli.update(delta, this.player, this.wanted);
    if (this.mode === 'debug') {
      this.debugCamera.update(delta);
    } else {
      // Tir du joueur (clic souris ou F) avec cooldown ; toucher un PNJ
      // alerte les policiers
      this.fireCooldown -= delta;
      if (this.player.alive && !this.vehicle && (Input.mouseDown || Input.isDown('KeyF')) && this.fireCooldown <= 0) {
        if (this.revolver.tryShoot()) { // consomme une balle (6 max), rechargement auto si vide
          this.fireCooldown = CONFIG.weapon.revolver.cooldown;
          const target = this.player.shoot(this.npcs, this.camera, this.heli);
          if (target && !target.isHelicopter) {
            // Toucher un PNJ alerte les policiers ET rend le joueur recherché
            // -> l'hélicoptère de police intervient
            for (const n of this.npcs) if (n.isPolice) n.alerted = true;
            this.wanted = true;
          }
        }
      }
      this.revolver.group.visible = !this.vehicle;
      this.revolver.update(delta);

      // Ramassage des pickups (munitions / pastis) au contact
      const msg = this.pickups.update(delta, this.player.group.position, this.player, this.revolver);
      if (msg) {
        this.notice = msg;
        this.noticeTimer = 2.5;
      }
      if (this.noticeTimer > 0) this.noticeTimer -= delta;
      // Respawn après un KO
      if (!this.player.alive && Input.isDown('KeyR')) {
        this.player.respawn();
        this.wanted = false; // la recherche est levée au respawn
        this.heli.despawn();
      }

      // Entrer/sortir d'un véhicule (E, front montant) : le plus proche
      const eDown = Input.isDown('KeyE');
      if (eDown && !this.eHeld) {
        if (!this.vehicle) {
          let best = null;
          let bd = Infinity;
          for (const v of this.vehicles) {
            const d = Math.hypot(
              this.player.group.position.x - v.pos.x,
              this.player.group.position.z - v.pos.z
            );
            if (d < bd) { bd = d; best = v; }
          }
          if (best && bd < this.vehicleInteractDistance(best)) this.enterVehicle(best);
        } else {
          this.exitVehicle();
        }
      }
      this.eHeld = eDown;

      if (this.vehicle) {
        this.vehicle.update(delta);
        // En voiture : collisions avec les PNJ (-1 PV, cooldown, on les écarte)
        if (this.vehicle === this.car) {
          for (const npc of this.npcs) {
            if (npc.hp <= 0) continue;
            const d = Math.hypot(
              npc.group.position.x - this.car.pos.x,
              npc.group.position.z - this.car.pos.z
            );
            if (d < CONFIG.vehicle.radius + CONFIG.npc.radius) {
              if (npc.carHitCooldown <= 0) {
                npc.takeDamage(CONFIG.combat.damagePerShot, this.car.pos);
                npc.carHitCooldown = CONFIG.vehicle.npcHitCooldown;
              }
              resolveCircleVsCircle(
                npc.group.position,
                CONFIG.npc.radius,
                this.car.pos,
                CONFIG.vehicle.radius
              );
            }
          }
        }
      } else if (this.player.alive) {
        this.player.update(delta, this.playerCamera.yaw);
        // Le joueur ne traverse aucun véhicule
        for (const v of this.vehicles) {
          resolveCircleVsCircle(
            this.player.group.position,
            CONFIG.player.radius,
            v.pos,
            v.radius || CONFIG.vehicle.radius
          );
        }
      }
      // Voitures en circulation : le joueur, les PNJ et la voiturette garée
      // les font dévier (elles cèdent) ; bloquées par bâtiments/arbres
      for (const tc of this.traffic) {
        if (this.player.alive && !this.vehicle) {
          resolveCircleVsCircle(tc.pos, tc.radius, this.player.group.position, CONFIG.player.radius);
        }
        for (const npc of this.npcs) {
          if (npc.hp > 0) resolveCircleVsCircle(tc.pos, tc.radius, npc.group.position, CONFIG.npc.radius);
        }
        if (!this.vehicle) resolveCircleVsCircle(tc.pos, tc.radius, this.car.pos, CONFIG.vehicle.radius);
      }
      this.playerCamera.update(delta);
    }
    // Les voitures de circulation avancent dans TOUS les modes (même debug F8)
    for (const tc of this.traffic) tc.update(delta);
    this.updateHud();
  }

  // HUD : points de vie du joueur + infos (en haut à gauche)
  updateHud() {
    let txt;
    if (!this.player.alive) {
      txt = 'KO ! Appuie sur R pour réapparaître';
    } else {
      const ammoTxt = this.revolver.isReloading
        ? 'RECHARGEMENT…'
        : 'Revolver : ' + this.revolver.ammo + '/' + this.revolver.maxAmmo
          + ' | stock ' + this.revolver.reserve + '/' + this.revolver.maxReserve
          + (this.revolver.ammo === 0 && this.revolver.reserve === 0 ? ' VIDE !' : '');
      txt = 'PV : ' + this.player.hp + '/' + CONFIG.combat.playerHp + '   |   ' + ammoTxt + '   |   clic ou F = tirer';
      if (this.wanted) txt += '   |   ⚠ RECHERCHÉ';
      if (this.heli.state === 'active') txt += '   |   hélico ' + this.heli.hp + '/' + this.heli.maxHp + ' PV';
      if (this.vehicle) {
        const pan = this.vehicle === this.car && this.car.broken
          ? "   |   PANNE ! (trop longtemps dans l'eau)"
          : '';
        txt += '   |   ZQSD = conduire ' + this.vehicleLabel(this.vehicle) + ', E = sortir' + pan;
      } else {
        // Véhicule le plus proche, s'il est assez près
        let best = null;
        let bd = Infinity;
        for (const v of this.vehicles) {
          const d = Math.hypot(
            this.player.group.position.x - v.pos.x,
            this.player.group.position.z - v.pos.z
          );
          if (d < bd) { bd = d; best = v; }
        }
        if (best && bd < this.vehicleInteractDistance(best)) {
          txt += '   |   E : prendre ' + this.vehicleLabel(best);
        }
      }
    }
    if (this.noticeTimer > 0 && this.player.alive) txt += '   |   ' + this.notice;
    // indicateur jour/nuit + heure
    const heure = Math.floor(this.timeOfDay * 24);
    txt += '   |   ' + (this.isNight ? '☾' : '☀') + ' ' + heure + 'h';
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
