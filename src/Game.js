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
import { Npc, pickRoads, pickPoliceRoads, pickClientRoad, nearestRoadPoint } from './npc/Npc.js';
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
    this.playerCamera.distance = CONFIG.playerCamera.distance;
    // Le joueur réapparaît à côté du véhicule, sur le sol
    const p = v.pos;
    const yaw = v.group.rotation.y;
    const off = (v.radius || 2) + 1;
    const px = p.x + Math.cos(yaw) * off;
    const pz = p.z - Math.sin(yaw) * off;
    this.player.group.position.set(px, this.ground.heightAt(px, pz), pz);
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
    const roads = pickRoads(CONFIG.npc.count);
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
    for (const f of facades) {
      const push = (lx, lz, alongLen) => {
        const p = toWorld(lx, lz);
        walls.push(f.axis === 'x'
          ? { cx: p.x, cz: p.z, w: alongLen, d: t, yaw: house.yaw }
          : { cx: p.x, cz: p.z, w: t, d: alongLen, yaw: house.yaw });
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
    const b = this.buildings.list[idx];
    const wallTopY = this.ground.heightAt(house.cx, house.cz) + (b.height || 6);
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
    this.shop = { house, door, keeper };
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
      this.notice = 'Pas assez d\'€ ! Gilet : ' + s.price + ' € (tu as ' + this.player.money + ' €)';
      this.noticeTimer = 3.5;
      return;
    }
    this.player.money -= s.price;
    this.player.armor = s.armor;
    this.notice = 'Gilet pare-balles acheté ! 🛡 ' + s.armor + ' (' + this.player.money + ' € restants)';
    this.noticeTimer = 4;
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
    // En véhicule, la position du joueur suit le véhicule : l'hélico et les
    // policiers poursuivent la voiture, pas le point où on est monté
    if (this.vehicle) {
      this.player.group.position.set(this.vehicle.pos.x, this.vehicle.pos.y, this.vehicle.pos.z);
    }
    for (const npc of this.npcs) npc.update(delta, this.player);
    this.client.update(delta, this.player);
    if (this.shop) this.shop.keeper.update(delta, this.player);
    this.heli.update(delta, this.player, this.wanted);
    // Son continu : rotor de l'hélicoptère quand il est actif (atténué avec la distance)
    if (this.heli.state === 'active' && this.player.alive) {
      this.sound.heliOn();
      const hd = Math.hypot(
        this.heli.pos.x - this.player.group.position.x,
        this.heli.pos.z - this.player.group.position.z
      );
      this.sound.setHeli(1 - hd / 220);
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
      this.playerCamera.update(delta);
    }
    // Les voitures de circulation avancent dans TOUS les modes (même debug F8)
    for (const tc of this.traffic) tc.update(delta);
    this.updateHud();
  }

  // HUD : points de vie du joueur + infos (en haut à gauche)
  updateHud() {
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
