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
import { Npc, pickRoads, pickPoliceRoads, pickClientRoad, nearestRoadPoint, findSmallIsland } from './npc/Npc.js';
import { Car } from './vehicles/Car.js';
import { TrafficCar, pickTrafficRoads } from './vehicles/TrafficCar.js';
import { Boat, dockSpots } from './vehicles/Boat.js';

import { PoliceHelicopter } from './vehicles/PoliceHelicopter.js';

import { Helicopter, findHilltop } from './vehicles/Helicopter.js';
import { DebugCamera } from './utils/DebugCamera.js';
import { Input, pollGamepad } from './utils/Input.js';
import { resolveCircleVsCircle } from './utils/Collisions.js';

import { addOutline } from './utils/Outline.js';
import { Pickups } from './world/Pickups.js';
import { TouchControls } from './utils/TouchControls.js';
import { mulberry32 } from './utils/random.js';

import { Sound } from './utils/Sound.js';

// Classe principale : renderer, scène, caméra, boucle d'animation.

export class Game {

  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.hud = document.getElementById('hud');
    this.gameOverEl = document.getElementById('gameover'); // overlay "GAME OVER" au KO
    this.compassNeedle = document.getElementById('compass-needle'); // boussole bas droite
    this.compassCap = document.getElementById('compass-cap');
    this.sound = new Sound(); // sons procéduraux (WebAudio)
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
    this.initClouds(); // petits nuages animés dans le ciel
  }

  // --- Nuages : petits groupes de sphères aplaties blanches qui apparaissent,
  // grossissent, dérivent avec le vent, rétrécissent puis disparaissent ---
  initClouds() {
    const rand = mulberry32(1234);
    const c = CONFIG.sky.clouds;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 });
    this.clouds = [];
    for (let i = 0; i < c.count; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(rand() * 3); // 3 à 5 "boules" par nuage
      for (let b = 0; b < n; b++) {
        const r = 8 + rand() * 10;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
        puff.position.set((b - (n - 1) / 2) * r * 0.9, rand() * 4, (rand() - 0.5) * r * 0.8);
        puff.scale.y = 0.55; // aplati en galette
        g.add(puff);
      }
      g.position.set(
        (rand() * 2 - 1) * c.spread,
        c.minAltitude + rand() * (c.maxAltitude - c.minAltitude),
        (rand() * 2 - 1) * c.spread
      );
      this.scene.add(g);
      this.clouds.push({
        group: g,
        rand,
        t: 0,
        delay: c.maxDelay * rand(), // attente avant l'apparition
        period: c.minPeriod + rand() * (c.maxPeriod - c.minPeriod), // durée du cycle
        maxScale: 0.7 + rand() * 0.7,
      });
    }
  }

  updateClouds(delta) {
    const c = CONFIG.sky.clouds;
    for (const cl of this.clouds) {
      cl.t += delta;
      let s = 0; // échelle courante (0 = disparu)
      if (cl.t > cl.delay) {
        const u = (cl.t - cl.delay) / cl.period; // 0..1 dans le cycle
        if (u >= 1) {
          // disparu : on le téléporte ailleurs et on relance un cycle après un délai
          cl.t = 0;
          cl.delay = c.maxDelay * cl.rand();
          cl.group.position.set(
            (cl.rand() * 2 - 1) * c.spread,
            c.minAltitude + cl.rand() * (c.maxAltitude - c.minAltitude),
            (cl.rand() * 2 - 1) * c.spread
          );
        } else if (u < 0.25) s = u / 0.25;      // grossit
        else if (u > 0.75) s = (1 - u) / 0.25;  // rétrécit
        else s = 1;                             // taille maxi
      }
      const sc = s * cl.maxScale;
      cl.group.visible = sc > 0.02;
      cl.group.scale.set(sc, sc, sc);
      cl.group.position.x += c.windSpeed * delta; // dérive lente
      if (cl.group.position.x > c.spread + 200) cl.group.position.x = -c.spread - 200; // reboucle
    }
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
    this.colliders = colliders; // réutilisé au restart (recréation des PNJ)

    // Boutique du port : grande maison avec une porte + PNJ vendeur
    this.setupShop();
    this.setupHouse(); // maison achetable (icône verte) + PNJ voisin près du spawn
    this.player = new Player(this.scene, this.ground, colliders);
    this.player.group.visible = false; // FPS : le perso est caché, l'arme = view model revolver
    this.playerCamera = new PlayerCamera(this.canvas, this.camera, this.player, this.ground);
    this.revolver = new Revolver(this.scene, this.camera); // view model attaché à la caméra
    this.debugCamera = new DebugCamera(this.canvas, this.camera);

    // PNJ : répartis sur des chemins différents de l'île, départ aléatoire
    // + policiers (pistolet, look bleu) placés sur les chemins les plus
    // proches du centre de l'île (le village)
    const roads = pickRoads(CONFIG.npc.count, CONFIG.npc.roadMinSpacing);
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
    for (const n of this.npcs) n.sound = this.sound; // coups de feu des policiers

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

    // Hélicoptère civil pilotable, posé en haut d'une colline (ni trop proche
    // ni trop loin du spawn)
    const hill = findHilltop(this.ground, s.x, s.z, CONFIG.heli.parkMinDistance, CONFIG.heli.parkMaxDistance);
    this.heliVehicle = new Helicopter(this.scene, this.ground, colliders, hill);
    console.log('[Heli] hélicoptère posé à (' + hill.x.toFixed(0) + ', ' + hill.z.toFixed(0) + ') | altitude '
      + this.ground.heightAt(hill.x, hill.z).toFixed(1) + ' m | dist spawn '
      + Math.hypot(hill.x - s.x, hill.z - s.z).toFixed(0) + ' m');

    // PNJ client de la mission "Livraison de pastis" : attend immobile sur la
    // route la plus éloignée du spawn (de l'autre côté de l'île)
    this.spawnClient();
    // Cylindre lumineux translucide autour du client (visible pendant la mission)
    const mi = CONFIG.mission;
    this.clientMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(mi.markerRadius, mi.markerRadius, mi.markerHeight, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: mi.markerColor, transparent: true, opacity: mi.markerOpacity,
        side: THREE.DoubleSide, depthWrite: false, fog: false, // visible de loin
      })
    );
    this.clientMarker.visible = false;
    this.scene.add(this.clientMarker);
    this.mission = { active: false, timeLeft: 0, done: false };
    // Mission hélicoptère : PNJ client sur une petite île + cylindre turquoise
    this.spawnClientHeli();
    const mh = CONFIG.missionHeli;
    this.clientMarkerHeli = new THREE.Mesh(
      new THREE.CylinderGeometry(mh.markerRadius, mh.markerRadius, mh.markerHeight, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: mh.markerColor, transparent: true, opacity: mh.markerOpacity,
        side: THREE.DoubleSide, depthWrite: false, fog: false,
      })
    );
    this.clientMarkerHeli.visible = false;
    this.scene.add(this.clientMarkerHeli);
    this.missionHeli = { active: false, timeLeft: 0, done: false };

    // Hélicoptère de police : inactif au départ, appelé quand le joueur est
    // recherché (il a tiré sur un PNJ)
    this.wanted = false;
    this.heli = new PoliceHelicopter(this.scene, this.ground);
    this.heli.sound = this.sound; // rafales de l'hélicoptère
  }

  // (Re)crée le PNJ client de la mission, sur la route la plus loin du spawn
  spawnClient() {
    if (this.client) this.scene.remove(this.client.group);
    const s = CONFIG.player.spawn;
    this.client = new Npc(this.scene, this.ground, this.colliders, pickClientRoad(s.x, s.z, this.ground), 779, false);
    this.client.state = 'wait'; // il attend sa livraison : immobile
    // Un NOUVEAU PNJ client est défini : la mission peut se relancer
    // (re-entrer dans la voiture la redéclenche vers ce nouveau client)
    if (this.mission) this.mission.done = false;
  }

  // --- Véhicules (voiturette + bateaux) : entrer / sortir avec E ---

  get vehicles() {
    return [this.car, this.heliVehicle, ...this.boats];
  }

  vehicleLabel(v) {
    return v === this.car ? 'la voiturette' : v.label;
  }

  vehicleInteractDistance(v) {
    return v.interactDistance
      || (v === this.car ? CONFIG.vehicle.interactDistance : CONFIG.boat.interactDistance);
  }

  enterVehicle(v) {
    this.vehicle = v;
    // Prendre la voiturette déclenche la mission "Livraison de pastis"
    // (une seule fois par partie : mission.done)
    if (v === this.car && !this.mission.active && !this.mission.done) this.startMission();
    if (v === this.heliVehicle && !this.missionHeli.active && !this.missionHeli.done) this.startMissionHeli(); // prendre l'hélico lance la mission île
    this.playerCamera.target = v.group;
    // En voiture : vue FPV au poste de conduite (cabine cachée) ; hélico/bateaux : 3e personne
    this.playerCamera.driverView = v === this.car || v.driverView === true;
    if (v.setCabinVisible) v.setCabinVisible(false);
    this.playerCamera.distance = v.cameraDistance
      || (v === this.car ? CONFIG.vehicle.cameraDistance : CONFIG.boat.cameraDistance);
  }

  exitVehicle() {
    const v = this.vehicle;
    this.vehicle = null;
    this.playerCamera.target = this.player.group; // retour en FPS
    this.playerCamera.driverView = false;
    if (v.setCabinVisible) v.setCabinVisible(true);
    if (v === this.heliVehicle && v.startFall) v.startFall(); // lâché en l'air : chute libre
    this.playerCamera.distance = CONFIG.playerCamera.distance;
    // Le joueur réapparaît à côté du véhicule, sur le sol
    const p = v.pos;
    const yaw = v.group.rotation.y;
    const off = (v.radius || 2) + 1;
    const px = p.x + Math.cos(yaw) * off;
    const pz = p.z - Math.sin(yaw) * off;
    this.player.group.position.set(px, this.ground.heightAt(px, pz), pz);
    this.player.group.visible = false; // retour en FPS : le perso est caché
    this.player.group.scale.y = 1;
  }

  // --- Restart complet après un KO (touche R) : le monde est remis à zéro ---
  restart() {
    if (this.vehicle) this.exitVehicle();
    this.player.respawn();   // retour au spawn, PV max
    this.revolver.reset();   // chargeur plein + stock de balles max
    this.wanted = false;     // recherche levée
    this.heli.despawn();
    // PNJ recréés aux positions initiales (mêmes seeds -> mêmes chemins)
    for (const n of this.npcs) this.scene.remove(n.group);
    const roads = pickRoads(CONFIG.npc.count, CONFIG.npc.roadMinSpacing);
    const policeRoads = pickPoliceRoads(CONFIG.combat.policeCount, roads);
    this.npcs = [];
    for (let i = 0; i < CONFIG.npc.count; i++) {
      this.npcs.push(new Npc(this.scene, this.ground, this.colliders, roads[i], i, false));
    }
    for (let i = 0; i < CONFIG.combat.policeCount; i++) {
      this.npcs.push(new Npc(this.scene, this.ground, this.colliders, policeRoads[i], 100 + i, true));
    }
    for (const n of this.npcs) n.sound = this.sound;
    // Pickups, voiturette, bateaux et PNJ client remis en place
    this.pickups.reset();
    this.car.reset();
    this.heliVehicle.reset();
    for (const b of this.boats) b.reset();
    this.spawnClient();
    this.mission = { active: false, timeLeft: 0, done: false };
    this.spawnClientHeli();
    // Maison reverrouillée (porte fermée) après un restart
    if (this.house) {
      this.house.owned = false;
      if (this.colliders.indexOf(this.house.doorLock) < 0) this.colliders.push(this.house.doorLock);
    }
    this.missionHeli = { active: false, timeLeft: 0, done: false };
    this.clientMarkerHeli.visible = false;
    this.clientMarker.visible = false;
    this.timeOfDay = 0.3; // retour au matin
    this.notice = '';
    this.noticeTimer = 0;
  }

  // --- Boutique du port : la plus grande maison près du spawn reçoit une
  // porte (trou dans le mur : 4 colliders de murs au lieu de la boîte pleine)
  // et un PNJ vendeur à l'intérieur ---
  setupShop() {
    const s = CONFIG.shop;
    const sp = CONFIG.player.spawn;
    const idx = this.buildings.biggestNear(sp.x, sp.z, s.houseMaxDistance);
    if (idx < 0) { this.shop = null; return; }
    const house = this.buildings.colliders[idx];
    this.buildings.paintRoof(idx, s.roofColor); // toit jaune pastis : repérable de loin
    const colliders = this.colliders;
    colliders.splice(colliders.indexOf(house), 1); // la boîte pleine part
    const cosY = Math.cos(house.yaw);
    const sinY = Math.sin(house.yaw);
    const toWorld = (lx, lz) => ({
      x: house.cx + lx * cosY + lz * sinY,
      z: house.cz - lx * sinY + lz * cosY,
    });
    const w = house.w, d = house.d, t = s.wallThickness, dw = s.doorWidth;
    // Façades locales : normale locale, longueur, axe le long du mur
    const facades = [
      { n: [0, 1], len: w, axis: 'x' },
      { n: [0, -1], len: w, axis: 'x' },
      { n: [1, 0], len: d, axis: 'z' },
      { n: [-1, 0], len: d, axis: 'z' },
    ];
    // La porte va sur la façade la plus proche du spawn
    let doorFace = facades[0];
    let bd = Infinity;
    for (const f of facades) {
      const mid = f.axis === 'x' ? toWorld(0, f.n[1] * d / 2) : toWorld(f.n[0] * w / 2, 0);
      const dist = Math.hypot(mid.x - sp.x, mid.z - sp.z);
      if (dist < bd) { bd = dist; doorFace = f; }
    }
    // 4 murs ; la façade de la porte est coupée en deux autour du trou central
    const walls = [];
    const bOSM = this.buildings.list[idx];
    const wallTopY = this.ground.heightAt(house.cx, house.cz) + (bOSM.height || 6);
    for (const f of facades) {
      const push = (lx, lz, alongLen) => {
        const p = toWorld(lx, lz);
        walls.push(f.axis === 'x'
          ? { cx: p.x, cz: p.z, w: alongLen, d: t, yaw: house.yaw, maxY: wallTopY }
          : { cx: p.x, cz: p.z, w: t, d: alongLen, yaw: house.yaw, maxY: wallTopY });
      };
      if (f === doorFace) {
        // Trou décalé de doorOffset (0.5 m) le long du mur : la porte ne tombe
        // pas sur une fenêtre (les fenêtres sont centrées sur la façade)
        const off = s.doorOffset;
        const segL = f.len / 2 + off - dw / 2; // morceau avant le trou
        const segR = f.len / 2 - off - dw / 2; // morceau après le trou
        if (segL > 0.01) {
          const cL = (-f.len / 2 + off - dw / 2) / 2;
          if (f.axis === 'x') push(cL, f.n[1] * d / 2, segL);
          else push(f.n[0] * w / 2, cL, segL);
        }
        if (segR > 0.01) {
          const cR = (off + dw / 2 + f.len / 2) / 2;
          if (f.axis === 'x') push(cR, f.n[1] * d / 2, segR);
          else push(f.n[0] * w / 2, cR, segR);
        }
      } else if (f.axis === 'x') push(0, f.n[1] * d / 2, f.len);
      else push(f.n[0] * w / 2, 0, f.len);
    }
    colliders.push(...walls);

    // Porte visuelle en bois, entrouverte, dans le trou de la façade
    const dl = doorFace.axis === 'x'
      ? [s.doorOffset, doorFace.n[1] * (d / 2 + 0.08)]
      : [doorFace.n[0] * (w / 2 + 0.08), s.doorOffset];
    const dp = toWorld(dl[0], dl[1]);
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(s.doorWidth, s.doorHeight, 0.12),
      new THREE.MeshLambertMaterial({ color: s.doorColor })
    );
    door.position.set(dp.x, this.ground.heightAt(dp.x, dp.z) + s.doorHeight / 2, dp.z);
    // Dans l'AXE du mur (à peine entreouverte), décalée de doorOffset
    door.rotation.y = house.yaw + (doorFace.axis === 'z' ? Math.PI / 2 : 0) + 0.12; // entrouverte
    addOutline(door, 1.06, CONFIG.props.outlineColor);
    this.scene.add(door);

    // Intérieur de la boutique : plafond beige sous le toit (au-dessus du
    // joueur, pour ne pas voir le toit jaune de dessous). Sol = terrain tel quel.
    // (bOSM et wallTopY déjà calculés plus haut pour les murs)
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.4, 0.12, d - 0.4),
      new THREE.MeshLambertMaterial({ color: s.interiorCeilColor })
    );
    ceil.position.set(house.cx, wallTopY - 0.06, house.cz);
    ceil.rotation.y = house.yaw;
    this.scene.add(ceil);

    // PNJ vendeur à l'intérieur (immobile, look vert)
    const keeper = new Npc(this.scene, this.ground, colliders, null, 555, false, s.keeperColors);
    keeper.group.position.set(house.cx, this.ground.heightAt(house.cx, house.cz), house.cz);
    keeper.state = 'wait';
    this.shop = { house, door, keeper, idx };
    console.log('[Shop] boutique : maison ' + w.toFixed(1) + 'x' + d.toFixed(1) + ' m à '
      + Math.hypot(house.cx - sp.x, house.cz - sp.z).toFixed(0) + ' m du spawn, '
      + walls.length + ' murs + porte, vendeur posé');
  }

  // Achat au vendeur (E à moins de shop.interactDistance) : gilet pare-balles
  buyArmor() {
    const s = CONFIG.shop;
    if (this.player.armor >= s.armor) {
      this.notice = 'Gilet pare-balles déjà au max (🛡 ' + s.armor + ')';
      this.noticeTimer = 3;
      return;
    }
    if (this.player.money < s.price) {
      // Le vendeur oriente le joueur vers la mission pastis : direction de la
      // dame (client) par rapport au spawn, en 8 points cardinaux.
      // Repère : +x = est, +z = sud (z = -nord)
      const c = this.client.group.position;
      const sp = CONFIG.player.spawn;
      let a = Math.atan2(c.z - sp.z, c.x - sp.x); // 0 = est, croissant vers le sud
      if (a < 0) a += Math.PI * 2;
      const dirs = ['est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest', 'nord', 'nord-est'];
      const dir = dirs[Math.round(a / (Math.PI / 4)) % 8];
      this.notice = 'Pas assez d\'€ ! (' + this.player.money + ' € / ' + s.price + ' €) — la dame qui veut le pastis est au ' + dir + ' ! 🍾';
      this.noticeTimer = 5;
      return;
    }
    this.player.money -= s.price;
    this.player.armor = s.armor;
    this.notice = 'Gilet pare-balles acheté ! 🛡 ' + s.armor + ' (' + this.player.money + ' € restants)';
    this.noticeTimer = 4;
  }

  // --- Maison achetable près du spawn ---
  // Petite maison (hors boutique) avec une icône "maison verte" devant :
  // E près de l'icône = acheter (10 000 €) -> la porte s'ouvre, on peut rentrer.
  // Un PNJ voisin immobile (E pour parler) donne un indice sur l'hélicoptère.
  setupHouse() {
    const h = CONFIG.house;
    const sp = CONFIG.player.spawn;
    const shopIdx = this.shop ? this.shop.idx : -1;
    const idx = this.buildings.smallNear(sp.x, sp.z, h.minDistance, h.maxDistance, shopIdx, h.maxArea);
    if (idx < 0) { this.house = null; console.log('[House] aucune petite maison près du spawn'); return; }
    const house = this.buildings.colliders[idx];
    const w = house.w, d = house.d;
    const cosY = Math.cos(house.yaw), sinY = Math.sin(house.yaw);
    const toWorld = (lx, lz) => ({
      x: house.cx + lx * cosY + lz * sinY,
      z: house.cz - lx * sinY + lz * cosY,
    });
    // Façade de la porte = la plus proche du spawn (comme la boutique)
    const facades = [
      { n: [0, 1], len: w, axis: 'x' },
      { n: [0, -1], len: w, axis: 'x' },
      { n: [1, 0], len: d, axis: 'z' },
      { n: [-1, 0], len: d, axis: 'z' },
    ];
    let doorFace = facades[0], bd = Infinity;
    for (const f of facades) {
      const mid = f.axis === 'x' ? toWorld(0, f.n[1] * d / 2) : toWorld(f.n[0] * w / 2, 0);
      const dist = Math.hypot(mid.x - sp.x, mid.z - sp.z);
      if (dist < bd) { bd = dist; doorFace = f; }
    }
    // Trou dans le mur (comme la boutique), mais PORTE VERROUILLÉE tant que la
    // maison n'est pas achetée : un collider "porte" bouche le trou
    const colliders = this.colliders;
    colliders.splice(colliders.indexOf(house), 1);
    const t = h.wallThickness, dw = h.doorWidth, off = h.doorOffset;
    const bOSM = this.buildings.list[idx];
    const wallTopY = this.ground.heightAt(house.cx, house.cz) + (bOSM.height || 6);
    for (const f of facades) {
      const push = (lx, lz, alongLen) => {
        const p = toWorld(lx, lz);
        colliders.push(f.axis === 'x'
          ? { cx: p.x, cz: p.z, w: alongLen, d: t, yaw: house.yaw, maxY: wallTopY }
          : { cx: p.x, cz: p.z, w: t, d: alongLen, yaw: house.yaw, maxY: wallTopY });
      };
      if (f === doorFace) {
        const segL = f.len / 2 + off - dw / 2;
        const segR = f.len / 2 - off - dw / 2;
        if (segL > 0.01) {
          const cL = (-f.len / 2 + off - dw / 2) / 2;
          if (f.axis === 'x') push(cL, f.n[1] * d / 2, segL); else push(f.n[0] * w / 2, cL, segL);
        }
        if (segR > 0.01) {
          const cR = (off + dw / 2 + f.len / 2) / 2;
          if (f.axis === 'x') push(cR, f.n[1] * d / 2, segR); else push(f.n[0] * w / 2, cR, segR);
        }
      } else if (f.axis === 'x') push(0, f.n[1] * d / 2, f.len);
      else push(f.n[0] * w / 2, 0, f.len);
    }
    // Collider "porte fermée" dans le trou (retiré à l'achat -> on peut rentrer)
    const dl = doorFace.axis === 'x' ? [off, doorFace.n[1] * d / 2] : [doorFace.n[0] * w / 2, off];
    const dpw = toWorld(dl[0], dl[1]);
    const doorLock = { cx: dpw.x, cz: dpw.z, w: dw, d: t, yaw: house.yaw, maxY: wallTopY };
    if (doorFace.axis === 'z') { doorLock.w = t; doorLock.d = dw; }
    colliders.push(doorLock);
    // Porte visuelle (fermée) dans le trou
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(dw, h.doorHeight, 0.12),
      new THREE.MeshLambertMaterial({ color: h.doorColor })
    );
    door.position.set(dpw.x, this.ground.heightAt(dpw.x, dpw.z) + h.doorHeight / 2, dpw.z);
    door.rotation.y = house.yaw + (doorFace.axis === 'z' ? Math.PI / 2 : 0);
    addOutline(door, 1.06, CONFIG.props.outlineColor);
    this.scene.add(door);
    // Icône "maison verte" devant la façade (poteau + mini maison verte)
    const icon = new THREE.Group();
    const matIcon = new THREE.MeshLambertMaterial({ color: h.iconColor });
    const matPole = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, h.iconHeight, 6), matPole);
    pole.position.y = h.iconHeight / 2;
    const iBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.45), matIcon);
    iBody.position.y = h.iconHeight + 0.2;
    const iRoof = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.32, 4), matIcon);
    iRoof.position.y = h.iconHeight + 0.56;
    iRoof.rotation.y = Math.PI / 4;
    icon.add(pole, iBody, iRoof);
    const out = doorFace.axis === 'x'
      ? toWorld(dl[0], dl[1] + doorFace.n[1] * 1.6)
      : toWorld(dl[0] + doorFace.n[0] * 1.6, dl[1]);
    icon.position.set(out.x, this.ground.heightAt(out.x, out.z), out.z);
    addOutline(icon, 1.08, CONFIG.props.outlineColor);
    this.scene.add(icon);
    // Plafond beige à l'intérieur (comme la boutique)
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(w - 0.4, 0.12, d - 0.4),
      new THREE.MeshLambertMaterial({ color: h.ceilColor })
    );
    ceil.position.set(house.cx, wallTopY - 0.06, house.cz);
    ceil.rotation.y = house.yaw;
    this.scene.add(ceil);
    // PNJ voisin immobile, à npcDistance de la maison, côté spawn
    const nd = Math.hypot(sp.x - house.cx, sp.z - house.cz) || 1;
    const nx = house.cx + (sp.x - house.cx) / nd * h.npcDistance;
    const nz = house.cz + (sp.z - house.cz) / nd * h.npcDistance;
    const neighbor = new Npc(this.scene, this.ground, this.colliders, null, 781, false);
    neighbor.group.position.set(nx, this.ground.heightAt(nx, nz), nz);
    neighbor.state = 'wait';
    neighbor.sound = this.sound;
    this.house = { idx, house, doorFace, doorLock, door, icon, neighbor, owned: false };
    console.log('[House] maison achetable à (' + house.cx.toFixed(0) + ', ' + house.cz.toFixed(0) + ') | '
      + Math.hypot(house.cx - sp.x, house.cz - sp.z).toFixed(0) + ' m du spawn | prix ' + h.price + ' €');
  }

  // Achat de la maison (E près de l'icône) : la porte s'ouvre (collider retiré)
  buyHouse() {
    const h = CONFIG.house;
    const hs = this.house;
    if (!hs) return;
    if (hs.owned) {
      this.notice = 'Maison déjà à toi ! 🏠';
      this.noticeTimer = 3;
      return;
    }
    if (this.player.money < h.price) {
      this.notice = 'Pas assez d\'€ ! Maison : ' + h.price + ' € (tu as ' + this.player.money + ' €)';
      this.noticeTimer = 4;
      return;
    }
    this.player.money -= h.price;
    hs.owned = true;
    const i = this.colliders.indexOf(hs.doorLock);
    if (i >= 0) this.colliders.splice(i, 1); // la porte s'ouvre : on peut rentrer
    hs.door.rotation.y += 1.2; // la porte visuelle s'ouvre
    this.notice = 'Maison achetée ! 🏠 ' + h.price + ' € — tu peux y entrer.';
    this.noticeTimer = 5;
  }

  // --- Mission "Livraison de pastis" ---
  // Déclenchée en prenant la voiturette : amener la voiture à moins de
  // mission.deliverDistance du PNJ client (de l'autre côté de l'île) en
  // moins de mission.duration secondes.
  startMission() {
    this.mission.active = true;
    this.mission.done = true; // la mission ne se relance pas à la prochaine entrée
    this.mission.timeLeft = CONFIG.mission.duration;
    this.clientMarker.visible = true;
    this.notice = 'MISSION : livre le pastis au cylindre doré, de l\'autre côté de l\'île !';
    this.noticeTimer = 5;
  }

  updateMission(delta) {
    if (!this.mission.active) return;
    this.mission.timeLeft -= delta;
    const c = this.client.group.position;
    // Le cylindre lumineux suit le client
    this.clientMarker.position.set(
      c.x,
      this.ground.heightAt(c.x, c.z) + CONFIG.mission.markerHeight / 2,
      c.z
    );
    const d = Math.hypot(this.car.pos.x - c.x, this.car.pos.z - c.z);
    if (d < CONFIG.mission.deliverDistance) {
      this.mission.active = false;
      this.clientMarker.visible = false;
      this.player.money += CONFIG.mission.reward; // la mission rapporte 100 €
      this.notice = 'Livraison réussie ! 🍾 +' + CONFIG.mission.reward + ' €';
      this.noticeTimer = 6;
    } else if (this.mission.timeLeft <= 0) {
      this.mission.active = false;
      this.clientMarker.visible = false;
      this.notice = 'Mission échouée : temps écoulé !';
      this.noticeTimer = 6;
    }
  }

  // --- Mission hélicoptère : livraison de pastis sur une petite île ---
  // (Re)crée le PNJ client sur une petite île à 400-1000 m de l'hélicoptère
  spawnClientHeli() {
    if (this.clientHeli) this.scene.remove(this.clientHeli.group);
    const h = this.heliVehicle.pos;
    const m = CONFIG.missionHeli;
    const spot = findSmallIsland(this.ground, h.x, h.z, m.islandMinDistance, m.islandMaxDistance, m.islandMaxSize)
      || { x: h.x + m.islandMinDistance, z: h.z };
    this.clientHeli = new Npc(this.scene, this.ground, this.colliders, null, 780, false);
    this.clientHeli.group.position.set(spot.x, this.ground.heightAt(spot.x, spot.z), spot.z);
    this.clientHeli.state = 'wait'; // il attend sa livraison : immobile
    if (this.buildings && this.buildings.removeRockNear) this.buildings.removeRockNear(spot.x, spot.z, m.clearRadius); // enlève le rocher sur la zone du client
    if (this.missionHeli) this.missionHeli.done = false;
    console.log('[MissionHeli] client sur petite île à (' + spot.x.toFixed(0) + ', ' + spot.z.toFixed(0) + ') | '
      + Math.hypot(spot.x - h.x, spot.z - h.z).toFixed(0) + ' m de l\'hélico');
  }

  // Déclenchée en prenant l'hélicoptère : amener l'hélico à moins de
  // missionHeli.deliverDistance (3D) du client en moins de missionHeli.duration s
  startMissionHeli() {
    this.missionHeli.active = true;
    this.missionHeli.done = true; // une seule fois par PNJ client
    this.missionHeli.timeLeft = CONFIG.missionHeli.duration;
    this.clientMarkerHeli.visible = true;
    this.notice = 'MISSION : livre le pastis en hélico au cylindre turquoise sur la petite île ! 1 min !';
    this.noticeTimer = 5;
  }

  updateMissionHeli(delta) {
    if (!this.missionHeli.active) return;
    this.missionHeli.timeLeft -= delta;
    const c = this.clientHeli.group.position;
    // Le cylindre lumineux suit le client
    this.clientMarkerHeli.position.set(
      c.x,
      this.ground.heightAt(c.x, c.z) + CONFIG.missionHeli.markerHeight / 2,
      c.z
    );
    const p = this.heliVehicle.pos;
    const d = Math.hypot(p.x - c.x, p.y - (c.y + 1), p.z - c.z); // distance 3D hélico <-> client
    if (d < CONFIG.missionHeli.deliverDistance) {
      this.missionHeli.active = false;
      this.clientMarkerHeli.visible = false;
      this.player.money += CONFIG.missionHeli.reward; // +10 000 $
      this.notice = 'Livraison réussie ! 🍾 +' + CONFIG.missionHeli.reward + ' $';
      this.noticeTimer = 6;
    } else if (this.missionHeli.timeLeft <= 0) {
      this.missionHeli.active = false;
      this.clientMarkerHeli.visible = false;
      this.notice = 'Mission échouée : temps écoulé !';
      this.noticeTimer = 6;
    }
  }

  // --- Téléportation de test (console F12 : __game.tp(x, z) / __game.tpHeli()) ---
  tp(x, z) {
    if (this.vehicle) this.exitVehicle();
    this.player.vy = 0;
    this.player.group.position.set(x, Math.max(this.ground.heightAt(x, z), 0), z);
  }

  tpHeli() { // pop à côté de l'hélicoptère civil (test)
    const h = this.heliVehicle.pos;
    this.tp(h.x + 4, h.z);
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
    this.updateClouds(delta); // cycle de vie des nuages
    this.sea.update(delta);
    if (this.vehicle) {
      this.player.group.position.set(this.vehicle.pos.x, this.vehicle.pos.y, this.vehicle.pos.z);
      // Sur le jetski on voit le joueur assis sur la selle ; ailleurs il reste caché (FPS)
      const onJetski = this.vehicle.type === 'jetski';
      this.player.group.visible = onJetski;
      if (onJetski) {
        const vyaw = this.vehicle.group.rotation.y;
        this.player.group.position.x += Math.sin(vyaw) * -0.25; // assis derrière le guidon
        this.player.group.position.z += Math.cos(vyaw) * -0.25;
        this.player.group.position.y += 0.62;                  // hauteur de la selle
        this.player.group.rotation.y = vyaw;
        this.player.group.scale.y = 0.72;                      // posture assise
      } else {
        this.player.group.scale.y = 1;
      }
    }
    for (const npc of this.npcs) npc.update(delta, this.player);
    this.client.update(delta, this.player);
    if (this.shop) this.shop.keeper.update(delta, this.player);
    this.heli.update(delta, this.player, this.wanted);
    // Son continu : rotor d'hélicoptère (même son que la police). Piloté par le
    // joueur = plein volume ; hélicoptère de police actif = volume selon la distance.
    let heliVol = 0;
    if (this.vehicle === this.heliVehicle && this.player.alive) {
      heliVol = 1; // on est à bord de l'hélicoptère civil
    } else if (this.heli.state === 'active' && this.player.alive) {
      const hd = Math.hypot(
        this.heli.pos.x - this.player.group.position.x,
        this.heli.pos.z - this.player.group.position.z
      );
      heliVol = Math.max(0, 1 - hd / 220);
    }
    if (heliVol > 0) {
      this.sound.heliOn();
      this.sound.setHeli(heliVol);
    } else {
      this.sound.heliOff();
    }
    if (this.mode === 'debug') {
      this.debugCamera.update(delta);
    } else {
      // Tir du joueur (clic souris ou F) avec cooldown ; toucher un PNJ
      // alerte les policiers
      this.fireCooldown -= delta;
      if (this.player.alive && !this.vehicle && (Input.mouseDown || Input.isDown('KeyF')) && this.fireCooldown <= 0) {
        if (this.revolver.tryShoot()) { // consomme une balle (6 max), rechargement auto si vide
          this.sound.shoot(); // coup de feu du joueur
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
      // R au KO : repartir du début (monde remis à zéro)
      if (!this.player.alive && Input.isDown('KeyR')) this.restart();

      // Entrer/sortir d'un véhicule (E, front montant) : le plus proche
      const eDown = Input.isDown('KeyE');
      if (eDown && !this.eHeld) {
        if (!this.vehicle) {
          // Priorité à la boutique : E près du vendeur = acheter le gilet
          const kp = this.shop ? this.shop.keeper.group.position : null;
          const pd = kp ? Math.hypot(
            this.player.group.position.x - kp.x,
            this.player.group.position.z - kp.z
          ) : Infinity;
          if (pd < CONFIG.shop.interactDistance) {
            this.buyArmor();
          } else {
            // Maison achetable : E près de l'icône = acheter ; près du voisin = parler
            let handled = false;
            if (this.house) {
              const ip = this.house.icon.position;
              const idd = Math.hypot(this.player.group.position.x - ip.x, this.player.group.position.z - ip.z);
              const np = this.house.neighbor.group.position;
              const ndd = Math.hypot(this.player.group.position.x - np.x, this.player.group.position.z - np.z);
              if (idd < CONFIG.house.interactDistance) { this.buyHouse(); handled = true; }
              else if (ndd < CONFIG.house.interactDistance) {
                this.notice = CONFIG.house.neighborText;
                this.noticeTimer = 6;
                handled = true;
              }
            }
            if (!handled) {
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
            }
          }
        } else {
          this.exitVehicle();
        }
      }
      this.eHeld = eDown;

      if (this.vehicle) {
        this.vehicle.update(delta, this.player.alive); // joueur KO = on ne conduit plus
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
        // Le joueur pousse le vendeur de la boutique (et inversement)
        if (this.shop) {
          resolveCircleVsCircle(
            this.player.group.position,
            CONFIG.player.radius,
            this.shop.keeper.group.position,
            CONFIG.npc.radius
          );
        }
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
      // Hélicoptère lâché en l'air : il tombe au sol tout seul
      if (!this.vehicle && this.heliVehicle.falling) this.heliVehicle.updateFall(delta);
      // Voitures en circulation : le joueur, les PNJ et la voiturette garée
      // les font dévier (elles cèdent) ; bloquées par bâtiments/arbres
      for (const tc of this.traffic) {
        if (this.player.alive && !this.vehicle) {
          resolveCircleVsCircle(tc.pos, tc.radius, this.player.group.position, CONFIG.player.radius);
        }
        for (const npc of this.npcs) {
          if (npc.hp <= 0) continue;
          const d = Math.hypot(npc.group.position.x - tc.pos.x, npc.group.position.z - tc.pos.z);
          if (d < tc.radius + CONFIG.npc.radius) {
            // Collision voiture de trafic <-> PNJ : le PNJ perd 1 PV (cooldown)
            if (npc.carHitCooldown <= 0) {
              npc.takeDamage(CONFIG.combat.damagePerShot, tc.pos);
              npc.carHitCooldown = CONFIG.vehicle.npcHitCooldown;
            }
            // les deux se repoussent (la voiture cède, le PNJ aussi)
            resolveCircleVsCircle(tc.pos, tc.radius, npc.group.position, CONFIG.npc.radius);
            resolveCircleVsCircle(npc.group.position, CONFIG.npc.radius, tc.pos, tc.radius);
          }
        }
        if (!this.vehicle) resolveCircleVsCircle(tc.pos, tc.radius, this.car.pos, CONFIG.vehicle.radius);
      }
      // Son continu : moteur de la voiture quand on conduit (pitch = vitesse)
      // (désactivé par défaut : sound.engine = false)
      if (CONFIG.sound.engine && this.vehicle === this.car && this.player.alive && !this.car.broken) {
        this.sound.engineOn();
        this.sound.setEngine(Math.abs(this.car.speed) / CONFIG.vehicle.maxSpeed);
      } else {
        this.sound.engineOff();
      }

      // Mission "Livraison de pastis" : timer + succès si la voiture est assez proche du client
      this.updateMission(delta);
      this.updateMissionHeli(delta);
      this.playerCamera.update(delta);
    }
    // Les voitures de circulation avancent dans TOUS les modes (même debug F8)
    for (const tc of this.traffic) tc.update(delta);
    this.updateHud();
  }

  // Boussole en bas à droite : cap de la caméra active (0° = Nord, 90° = Est).
  // Repère monde : x = est, z = -nord ; yaw caméra 0 regarde -Z = Nord.
  updateCompass() {
    if (!this.compassNeedle) return;
    const yaw = this.mode === 'debug' ? this.debugCamera.yaw : this.playerCamera.yaw;
    const cap = (((-yaw) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); // 0..2π, 0 = Nord
    const deg = (cap * 180) / Math.PI;
    this.compassNeedle.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)';
    if (this.compassCap) {
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
      this.compassCap.textContent = dirs[Math.round(deg / 45) % 8] + ' ' + Math.round(deg) + '°';
    }
  }

  // HUD : points de vie du joueur + infos (en haut à gauche)
  updateHud() {
    this.updateCompass(); // la boussole tourne même si le texte HUD ne change pas
    let txt;
    if (this.touch && this.touch.setRespawnVisible) this.touch.setRespawnVisible(!this.player.alive);
    if (this.gameOverEl) this.gameOverEl.style.display = this.player.alive ? 'none' : 'flex'; // overlay GAME OVER
    if (!this.player.alive) {
      txt = this.touch && this.touch.active
        ? 'KO ! Touche le bouton R pour réapparaître'
        : 'KO ! Appuie sur R pour réapparaître';
    } else {
      const ammoTxt = this.revolver.isReloading
        ? 'RECHARGEMENT…'
        : 'Revolver : ' + this.revolver.ammo + '/' + this.revolver.maxAmmo
          + ' | stock ' + this.revolver.reserve + '/' + this.revolver.maxReserve
          + (this.revolver.ammo === 0 && this.revolver.reserve === 0 ? ' VIDE !' : '');
      txt = 'PV : ' + this.player.hp + '/' + CONFIG.combat.playerHp
        + (this.player.armor > 0 ? ' 🛡' + this.player.armor : '')
        + '   |   💰 ' + this.player.money + ' €   |   ' + ammoTxt + '   |   clic ou F = tirer';
      if (this.wanted) txt += '   |   ⚠ RECHERCHÉ';
      if (this.heli.state === 'active') txt += '   |   hélico ' + this.heli.hp + '/' + this.heli.maxHp + ' PV';
      if (this.mission.active) txt += '   |   🍾 MISSION pastis : ' + Math.ceil(this.mission.timeLeft) + ' s';
      if (this.missionHeli && this.missionHeli.active) txt += '   |   🚁 MISSION pastis (île) : ' + Math.ceil(this.missionHeli.timeLeft) + ' s';
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
        if (this.shop) {
          const kp = this.shop.keeper.group.position;
          const pd = Math.hypot(this.player.group.position.x - kp.x, this.player.group.position.z - kp.z);
          if (pd < CONFIG.shop.interactDistance) {
            txt += '   |   E : gilet pare-balles 🛡' + CONFIG.shop.armor + ' (' + CONFIG.shop.price + ' €)';
          }
        }
        if (this.house) {
          const ip = this.house.icon.position;
          const idd = Math.hypot(this.player.group.position.x - ip.x, this.player.group.position.z - ip.z);
          if (idd < CONFIG.house.interactDistance && !this.house.owned) {
            txt += '   |   E : acheter la maison 🏠 (' + CONFIG.house.price + ' €)';
          }
          const np = this.house.neighbor.group.position;
          const ndd = Math.hypot(this.player.group.position.x - np.x, this.player.group.position.z - np.z);
          if (ndd < CONFIG.house.interactDistance) {
            txt += '   |   E : parler au voisin 🗣';
          }
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
    pollGamepad(); // manette (ex. Xbox) relue à chaque frame
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
