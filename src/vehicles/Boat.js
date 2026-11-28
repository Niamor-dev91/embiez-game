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

// Texture de pont en teck (lattes + calfatage noir) générée en canvas
function teckTexture(baseHex) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 256;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + baseHex.toString(16).padStart(6, '0');
  ctx.fillRect(0, 0, 256, 256);
  // 8 lattes dans le sens de la longueur, alternance de teintes chaudes
  const lat = 256 / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(120, 85, 45, 0.35)' : 'rgba(220, 180, 130, 0.18)';
    ctx.fillRect(0, i * lat, 256, lat);
    ctx.fillStyle = 'rgba(30, 20, 10, 0.85)'; // calfatage
    ctx.fillRect(0, i * lat, 256, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Texture de coque : blanc au-dessus, liseré bleu sous le liston,
// antifouling bleu nuit sous la flottaison (axe u = tour de la section)
function hullTexture(c) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  ctx.fillStyle = hex(c.coque);
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = hex(c.antifouling); // bas de coque (u autour de 0.5)
  ctx.fillRect(256 * 0.32, 0, 256 * 0.36, 128);
  ctx.fillStyle = hex(c.lisere); // liseré le long du pont (bords u)
  ctx.fillRect(0, 0, 256 * 0.05, 128);
  ctx.fillRect(256 * 0.95, 0, 256 * 0.05, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Construit une surface "loftée" : sections = liste de listes de Vector3
// (même longueur), reliées en quads ; uvAt(i, j) donne l'UV de chaque sommet
function loftGeometry(sections, uvAt) {
  const pos = [], uvs = [], idx = [];
  const K = sections[0].length;
  for (const row of sections) for (const p of row) pos.push(p.x, p.y, p.z);
  for (let i = 0; i < sections.length; i++)
    for (let j = 0; j < K; j++) uvs.push(...uvAt(i, j));
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < K - 1; j++) {
      const a = i * K + j, b = a + 1, c2 = a + K, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Cylindre fin tendu entre deux points (hauban, rail de furling...)
function stayBetween(a, b, r, material) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 6), material);
  cyl.position.copy(a).addScaledVector(dir, 0.5);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return cyl;
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

  // Voilier ~8,4 m : monocoque de plaisance récent — coque blanche galbée
  // (loft de sections), liseré bleu + antifouling bleu nuit, pont teck latté,
  // roof avec hublots, cockpit teck avec barre à roue, mât alu, grande voile
  // blanche, génois sur enrouleur, garde-corps et pavillon tricolore
  buildSailboat(mat, c) {
    const halfL = 4.2; // demi-longueur de coque
    // t : 0 à l'arrière (transom), 1 à la proue
    const t = (z) => (z + halfL) / (2 * halfL);
    // demi-largeur : max ~1,25 m aux 2/3 avant, transom 1,15 m, 0 à la proue
    const halfW = (z) => {
      const u = t(z);
      if (u >= 0.85) return 1.25 * Math.cos(((u - 0.85) / 0.15) * Math.PI / 2);
      return 1.15 + 0.1 * Math.sin(u * Math.PI);
    };
    // ligne de pont qui remonte vers la proue (sheer)
    const yDeck = (z) => 1.02 + 0.25 * Math.pow(t(z), 2.2);
    const depth = (z) => 0.8 + 0.35 * (1 - t(z)); // creux de coque (assez profond pour que le bas baigne)

    // Matériaux texturés (générés en canvas, style toon conservé)
    const teckTex = teckTexture(c.pont);
    teckTex.repeat.set(1, 3);
    const teckMat = new THREE.MeshLambertMaterial({ map: teckTex, side: THREE.DoubleSide });
    const coqueMat = new THREE.MeshLambertMaterial({ map: hullTexture(c), side: THREE.DoubleSide });
    const alu = mat(c.alu);

    // --- Coque : sections en U (demi-ellipse) loftées de l'arrière à la proue
    const N = 18, K = 13;
    const hullSections = [];
    for (let i = 0; i < N; i++) {
      const z = -halfL + (2 * halfL * i) / (N - 1);
      const w = halfW(z), d = depth(z), y0 = yDeck(z);
      const row = [];
      for (let j = 0; j < K; j++) {
        const a = (j / (K - 1)) * Math.PI; // 0 = bordé tribord, PI = bordé bâbord
        row.push(new THREE.Vector3(w * Math.cos(a), y0 - d * Math.sin(a), z));
      }
      hullSections.push(row);
    }
    const coque = new THREE.Mesh(loftGeometry(hullSections, (i, j) => [j / (K - 1), i / (N - 1)]), coqueMat);

    // Transom arrière (face plate reprenant la section arrière)
    const zs = -halfL + 0.02;
    const wT = halfW(zs), yT = yDeck(zs), dT = depth(zs);
    const shape = new THREE.Shape();
    for (let j = 0; j < K; j++) {
      const a = (j / (K - 1)) * Math.PI;
      const x = wT * Math.cos(a), y = yT - dT * Math.sin(a);
      if (j === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    const transom = new THREE.Mesh(new THREE.ShapeGeometry(shape), coqueMat);
    transom.position.z = zs;
    transom.rotation.y = Math.PI;

    // --- Pont teck légèrement bombé (cambrure)
    const M = 9;
    const deckSections = [];
    for (let i = 0; i < N; i++) {
      const z = -halfL + (2 * halfL * i) / (N - 1);
      const w = halfW(z) * 0.995, y0 = yDeck(z);
      const row = [];
      for (let j = 0; j < M; j++) {
        const xr = (j / (M - 1)) * 2 - 1;
        row.push(new THREE.Vector3(xr * w, y0 + 0.06 * (1 - xr * xr), z));
      }
      deckSections.push(row);
    }
    const pont = new THREE.Mesh(loftGeometry(deckSections, (i, j) => [j / (M - 1), (i / (N - 1)) * 3]), teckMat);

    // --- Roof (rouf) blanc, hublots latéraux, pare-brise incliné, atterrage
    const yR = yDeck(0.6);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.8), mat(c.coque));
    roof.position.set(0, yR + 0.28, 0.6);
    for (const sgn of [-1, 1]) for (let k = -1; k <= 1; k++) {
      const hub = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.45), mat(c.verre));
      hub.position.set(sgn * 0.86, yR + 0.35, 0.6 + k * 0.8);
      this.hull.add(hub);
    }
    const pareBrise = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.04), mat(c.verre));
    pareBrise.position.set(0, yR + 0.55, 2.02);
    pareBrise.rotation.x = -0.35;
    const atterr = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.05), mat(c.noir));
    atterr.position.set(0, yR + 0.28, 0.6 - 1.42);
    // 2 mains courantes teck sur le toit du roof
    for (const sgn of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), teckMat);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(sgn * 0.55, yR + 0.61, 0.6);
      this.hull.add(rail);
    }

    // --- Cockpit : 2 bancs teck, barre à roue sur pied
    const yC = yDeck(-2.6);
    for (const sgn of [-1, 1]) {
      const banc = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.18, 2.0), teckMat);
      banc.position.set(sgn * 0.5, yC + 0.13, -2.6);
      this.hull.add(banc);
    }
    const pied = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.75, 8), alu);
    pied.position.set(0, yC + 0.37, -3.3);
    const roue = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), alu);
    roue.position.set(0, yC + 0.82, -3.3);

    // --- Gréement : mât alu, bôme, grande voile blanche à bordure incurvée
    const zMat = 0.9;
    const matM = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 9.5, 8), alu);
    matM.position.set(0, yDeck(zMat) + 4.7, zMat);
    const bome = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), alu);
    bome.rotation.x = Math.PI / 2;
    bome.position.set(0, 1.9, zMat - 1.6);
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(0, 7.0);
    s.quadraticCurveTo(2.1, 3.4, 3.0, 0); // bord de chute incurvé
    s.closePath();
    const voileGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
    voileGeo.rotateY(Math.PI / 2); // voile dans le plan vertical avant-arrière
    const voile = new THREE.Mesh(voileGeo, mat(c.voile));
    voile.position.set(0.03, 1.9, zMat);
    // génois enroulé sur l'étai (cylindre blanc du mât à la proue)
    const tetMat = new THREE.Vector3(0, yDeck(zMat) + 9.4, zMat);
    const tetProue = new THREE.Vector3(0, 1.35, halfL - 0.1);
    const geno = stayBetween(tetMat, tetProue, 0.1, mat(c.voile));
    // haubans + pataras
    const haubanG = stayBetween(tetMat, new THREE.Vector3(-halfW(0.5) * 0.95, yDeck(0.5), 0.5), 0.02, alu);
    const haubanD = stayBetween(tetMat, new THREE.Vector3(halfW(0.5) * 0.95, yDeck(0.5), 0.5), 0.02, alu);
    const pataras = stayBetween(tetMat, new THREE.Vector3(0, yDeck(-4.0), -4.0), 0.02, alu);

    // --- Garde-corps : 5 chandeliers + filin par bord
    for (const sgn of [-1, 1]) {
      let prev = null;
      for (let z = 2.8; z >= -3.6; z -= 1.3) {
        const x = sgn * (halfW(z) * 0.97 - 0.03);
        const base = new THREE.Vector3(x, yDeck(z) + 0.05, z);
        const top = new THREE.Vector3(x, yDeck(z) + 0.65, z);
        const chan = stayBetween(base, top, 0.018, alu);
        this.hull.add(chan);
        if (prev) this.hull.add(stayBetween(prev, top, 0.015, alu));
        prev = top;
      }
    }

    // Pavillon tricolore à la poupe (bandes verticales, bleu côté mât)
    const drapeauColors = [0x0055a4, 0xf5f2ea, 0xef4135];
    drapeauColors.forEach((col, i) => {
      const bande = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.38, 0.02), mat(col));
      bande.position.set(0.02 - i * 0.18, 2.24, -3.95);
      this.hull.add(bande);
    });

    this.hull.add(coque, transom, pont, roof, pareBrise, atterr, pied, roue, matM, bome, voile, geno, haubanG, haubanD, pataras);
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
