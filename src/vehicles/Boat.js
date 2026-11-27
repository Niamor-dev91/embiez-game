import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { Input } from '../utils/Input.js';
import { addOutline } from '../utils/Outline.js';
import osmData from '../world/data/embiez-osm.js';

// Bateaux utilisables au port : voilier, bateau à moteur ou jetski (type).
// Conduite sur l'eau (ZQSD comme la voiture) ; le bateau s'ARRÊTE au
// contact de la terre ou d'un ponton (ground.heightAt >= 0 bloque).
// Sur le jetski le joueur est visible, assis sur la selle (voir Game.js).

// Cherche le point d'eau (heightAt < -0.5) le plus proche de (x, z)
function findWaterNear(x, z, ground) {
  for (let r = 5; r <= 100; r += 5) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      const cx = x + Math.sin(a) * r;
      const cz = z + Math.cos(a) * r;
      if (ground.heightAt(cx, cz) < -0.5) return { x: cx, z: cz };
    }
  }
  return null;
}

// Un point d'amarrage par ponton, dans l'eau près du ponton ; les pontons
// les plus proches de `near` (le spawn) d'abord.
export function dockSpots(count, ground, near) {
  const piers = [...osmData.piers].sort((a, b) => {
    const ca = a.points[Math.floor(a.points.length / 2)];
    const cb = b.points[Math.floor(b.points.length / 2)];
    return Math.hypot(ca[0] - near.x, ca[1] - near.z) - Math.hypot(cb[0] - near.x, cb[1] - near.z);
  });
  const spots = [];
  for (let i = 0; i < Math.min(count, piers.length); i++) {
    const pier = piers[i];
    const midI = Math.floor(pier.points.length / 2);
    const mid = pier.points[midI];
    const prev = pier.points[Math.max(0, midI - 1)];
    const yaw = Math.atan2(mid[0] - prev[0], mid[1] - prev[1]);
    const water = findWaterNear(mid[0], mid[1], ground);
    spots.push(water ? { ...water, yaw } : { x: mid[0] + 20, z: mid[1], yaw });
  }
  return spots;
}

export class Boat {

  constructor(scene, ground, dock) {
    this.scene = scene;
    this.ground = ground;
    this.type = dock.type; // 'voilier' | 'moteur' | 'jetski'
    this.speed = 0;
    this.group = new THREE.Group();
    this.createMesh();
    // Flotte sur la mer (un peu au-dessus du niveau 0)
    this.dock = dock; // amarrage de départ (pour reset après un KO)
    this.group.position.set(dock.x, CONFIG.boat.floatHeight, dock.z);
    this.group.rotation.y = dock.yaw;
    scene.add(this.group);
  }

  get pos() {
    return this.group.position;
  }

  get radius() {
    return CONFIG.boat.radius[this.type];
  }

  get interactDistance() {
    return CONFIG.boat.interactDistance[this.type];
  }

  get cameraDistance() {
    return CONFIG.boat.cameraDistance[this.type];
  }

  get label() {
    return { voilier: 'le voilier', moteur: 'le bateau à moteur', jetski: 'le jetski' }[this.type];
  }

  createMesh() {
    const c = CONFIG.boat.colors;
    const mat = (color) => new THREE.MeshLambertMaterial({ color });

    // Coque dans un sous-groupe avec outline toon
    this.hull = new THREE.Group();
    this.group.add(this.hull);

    if (this.type === 'voilier') this.buildSailboat(mat, c);
    else if (this.type === 'moteur') this.buildMotorboat(mat, c);
    else this.buildJetski(mat, c);

    addOutline(this.hull, 1.06, CONFIG.props.outlineColor);
  }

  // Voilier ~8 m de long : coque blanche, étrave relevée, pont en bois,
  // roof de cockpit, grand mât et voile triangulaire
  buildSailboat(mat, c) {
    const coque = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 8.0), mat(c.coque));
    coque.position.y = 0.55;
    const etrave = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 1.6), mat(c.coque));
    etrave.position.set(0, 0.95, 4.4);
    etrave.rotation.x = -0.5;
    const pont = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 7.6), mat(c.pont));
    pont.position.y = 1.12;
    const lisere = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.16, 8.0), mat(c.lisere));
    lisere.position.y = 0.95;
    // roof du cockpit à l'arrière
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 1.6), mat(c.coque));
    roof.position.set(0, 1.5, -2.6);
    const toitRoof = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 1.8), mat(c.pont));
    toitRoof.position.set(0, 1.9, -2.6);
    // mât (7 m de haut)
    const matM = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 7.0, 8), mat(c.mat));
    matM.position.set(0, 4.6, 1.2);
    // voile triangulaire (forme extrudée mince) derrière le mât
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0, 5.6); s.lineTo(3.4, 0); s.closePath();
    const voile = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), mat(c.voile));
    voile.position.set(0.12, 1.4, 1.0);
    // bôme (barre horizontale en bas de la voile)
    const bome = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 6), mat(c.mat));
    bome.rotation.x = Math.PI / 2;
    bome.position.set(1.8, 1.45, 1.0);
    // gouvernail à l'arrière
    const gouvernail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.0, 0.7), mat(c.pont));
    gouvernail.position.set(0, 0.4, -4.1);
    this.hull.add(coque, etrave, pont, lisere, roof, toitRoof, matM, voile, bome, gouvernail);
  }

  // Bateau à moteur ~6 m : coque blanche + liseré bleu, cabine vitrée,
  // pare-brise, 2 sièges et 2 moteurs hors-bord à l'arrière
  buildMotorboat(mat, c) {
    const coque = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 6.0), mat(c.coqueMoteur));
    coque.position.y = 0.5;
    const etrave = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.2), mat(c.coqueMoteur));
    etrave.position.set(0, 0.75, 3.4);
    etrave.rotation.x = -0.45;
    const lisere = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.16, 6.0), mat(c.lisere));
    lisere.position.y = 0.85;
    const pont = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.1, 5.4), mat(c.pont));
    pont.position.y = 1.02;
    // cabine + vitres (avant et côtés)
    const cabine = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.85, 2.4), mat(c.coqueMoteur));
    cabine.position.set(0, 1.5, 0.6);
    const vitreAvant = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.06), mat(c.verre));
    vitreAvant.position.set(0, 1.55, 1.83);
    const vitreG = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 2.0), mat(c.verre));
    vitreG.position.set(-0.86, 1.55, 0.6);
    const vitreD = vitreG.clone();
    vitreD.position.x = 0.86;
    const toit = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 2.6), mat(c.lisere));
    toit.position.set(0, 1.97, 0.6);
    // pare-brise incliné devant la cabine
    const pareBrise = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 0.06), mat(c.verre));
    pareBrise.position.set(0, 1.45, 1.95);
    pareBrise.rotation.x = -0.35;
    // 2 sièges à l'arrière
    const siegeG = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.6), mat(c.selle));
    siegeG.position.set(-0.5, 1.25, -1.6);
    const siegeD = siegeG.clone();
    siegeD.position.x = 0.5;
    // 2 moteurs hors-bord noirs à l'arrière
    const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), mat(c.noir));
    m1.position.set(-0.6, 0.6, -3.1);
    const m2 = m1.clone();
    m2.position.x = 0.6;
    const emb1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.5), mat(c.noir));
    emb1.position.set(-0.6, 1.05, -3.1);
    const emb2 = emb1.clone();
    emb2.position.x = 0.6;
    this.hull.add(coque, etrave, lisere, pont, cabine, vitreAvant, vitreG, vitreD, toit, pareBrise, siegeG, siegeD, m1, m2, emb1, emb2);
  }

  // Jetski ~2,6 m : coque profilée rouge vif, nez relevu, selle noire,
  // guidon avec poignées et petit pare-brise
  buildJetski(mat, c) {
    const coque = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 2.6), mat(c.jetski));
    coque.position.y = 0.22;
    const nez = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.8), mat(c.jetski));
    nez.position.set(0, 0.38, 1.5);
    nez.rotation.x = -0.4;
    // plage arrière (repose-pieds)
    const plage = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.7), mat(c.noir));
    plage.position.set(0, 0.48, -1.0);
    // selle (le joueur s'assoit dessus, voir Game.js)
    const selle = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 1.2), mat(c.selle));
    selle.position.set(0, 0.55, -0.25);
    // colonne + guidon + poignées
    const colonne = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), mat(c.noir));
    colonne.position.set(0, 0.7, 0.75);
    const guidon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.8, 6), mat(c.noir));
    guidon.rotation.z = Math.PI / 2;
    guidon.position.set(0, 0.92, 0.75);
    const pG = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 6), mat(c.selle));
    pG.rotation.z = Math.PI / 2;
    pG.position.set(-0.44, 0.92, 0.75);
    const pD = pG.clone();
    pD.position.x = 0.44;
    // petit pare-brise devant le guidon
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.04), mat(c.verre));
    pb.position.set(0, 0.78, 1.05);
    pb.rotation.x = -0.3;
    this.hull.add(coque, nez, plage, selle, colonne, guidon, pG, pD, pb);
  }

  // Remis à son amarrage de départ (restart après un KO)
  reset() {
    this.speed = 0;
    this.group.position.set(this.dock.x, CONFIG.boat.floatHeight, this.dock.z);
    this.group.rotation.y = this.dock.yaw;
  }

  update(delta, alive = true) {
    const v = CONFIG.boat;
    const maxF = v.maxSpeed[this.type];
    const maxR = v.maxReverseSpeed[this.type];
    const turn = v.turnSpeed[this.type];

    // --- Accélération / frein (comme la voiture) ; joueur KO = plus de conduite ---
    let throttle = 0;
    if (alive && Input.isDown('KeyW')) throttle += 1;
    if (alive && Input.isDown('KeyS')) throttle -= 1;
    if (throttle > 0) this.speed += v.acceleration * delta;
    else if (throttle < 0) this.speed -= v.brake * delta;
    else this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), v.friction * delta);
    this.speed = Math.max(-maxR, Math.min(maxF, this.speed));

    // --- Direction ---
    let steer = 0;
    if (alive && Input.isDown('KeyA')) steer += 1;
    if (alive && Input.isDown('KeyD')) steer -= 1;
    const roll = Math.min(1, Math.abs(this.speed) / 2) * Math.sign(this.speed || 1);
    this.group.rotation.y += steer * turn * delta * roll;

    // --- Déplacement, bloqué au contact de la terre/pontons ---
    const yaw = this.group.rotation.y;
    const nx = this.pos.x + Math.sin(yaw) * this.speed * delta;
    const nz = this.pos.z + Math.cos(yaw) * this.speed * delta;
    if (this.ground.heightAt(nx, nz) < 0) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      this.speed = 0; // la côte bloque le bateau
    }
    this.pos.y = CONFIG.boat.floatHeight; // flotte au-dessus de la mer

    // --- Limites du monde ---
    const half = this.ground.size / 2 - 5;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
  }
}
