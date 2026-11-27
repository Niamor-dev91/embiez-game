import * as THREE from 'three';

import { CONFIG } from '../config.js';
import osmData from './data/embiez-osm.js';

import { mulberry32 } from '../utils/random.js';

// Bâtiments OSM en style Wind Waker (toon) :
// - murs = boîtes orientées (yaw réel du polygone OSM), couleurs vives par type
// - coquille noire derrière chaque boîte = outline (BackSide, un peu plus gros)
// - toit = pyramide à 4 pans rouge vif
// Le tout en InstancedMesh (3 draw calls pour tous les bâtiments).
// + les rochers (natural=bare_rock) en icosaèdres aplatis.

export class Buildings {

  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.colliders = []; // boîtes de collision orientées (yaw) pour joueur/PNJ/véhicules
    this.createBuildings();
    this.createRocks();
    this.scene.add(this.group);
  }

  createBuildings() {
    const p = CONFIG.props;
    const list = osmData.buildings.filter((b) => this.terrain.heightAt(b.cx, b.cz) >= 0.2);
    const n = list.length;
    if (n === 0) return;

    // 3 InstancedMesh : murs, coquilles (outline), toits
    const walls = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      // DoubleSide : on voit aussi les murs de l'INTÉRIEUR (boutique du port)
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      n
    );
    const shells = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: p.outlineColor, side: THREE.BackSide }),
      n
    );
    const roofs = new THREE.InstancedMesh(
      // Pyramide à 4 pans avec thetaStart = PI/4 : les COTÉS de la base sont
      // alignés sur X/Z (comme les murs), donc le scale (w, h, d) + rotation
      // yaw donnent un toit rectangulaire bien aligné sur le bâtiment.
      new THREE.ConeGeometry(1, 1, 4, 1, false, Math.PI / 4),
      // matériau blanc + couleur PAR INSTANCE (comme les murs) : permet de
      // repeindre UN seul toit (ex. la boutique en jaune pastis)
      new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
      n
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    this.list = list; // bâtiments OSM posés (hauteur, kind...) — utilisé par la boutique
    const winMats = []; // matrices des fenêtres (toutes façades)
    const colRoof = new THREE.Color(p.roofColor); // couleur par défaut des toits

    list.forEach((b, i) => {
      const y = this.terrain.heightAt(b.cx, b.cz);
      const roofH = Math.min(b.w, b.d) * p.roofHeightFactor;
      e.set(0, b.yaw, 0);
      q.setFromEuler(e);

      // Base des murs : le point le plus BAS des 4 coins du bâtiment (dans le
      // repère monde, rotation yaw) moins une marge -> sur une pente, les murs
      // descendent jusqu'au sol au lieu de flotter d'un côté.
      const cosY = Math.cos(b.yaw);
      const sinY = Math.sin(b.yaw);
      let minCorner = Infinity;
      for (const [lx, lz] of [[b.w / 2, b.d / 2], [b.w / 2, -b.d / 2], [-b.w / 2, b.d / 2], [-b.w / 2, -b.d / 2]]) {
        const wx = b.cx + lx * cosY + lz * sinY;
        const wz = b.cz - lx * sinY + lz * cosY;
        minCorner = Math.min(minCorner, this.terrain.heightAt(wx, wz));
      }
      const baseY = minCorner - p.foundationMargin; // enfoncé dans le sol
      const wallTop = y + b.height;                  // le haut du mur ne change pas
      const wallH = wallTop - baseY;

      // Murs (couleur vive selon le type)
      v.set(b.cx, baseY + wallH / 2, b.cz);
      s.set(b.w, wallH, b.d);
      m.compose(v, q, s);
      walls.setMatrixAt(i, m);
      col.set(p.buildingColors[b.kind] ?? p.buildingColors.default);
      walls.setColorAt(i, col);

      // Coquille noire = outline toon
      v.set(b.cx, baseY + wallH / 2, b.cz);
      s.set(b.w * p.outlineScale, wallH * 1.04, b.d * p.outlineScale);
      m.compose(v, q, s);
      shells.setMatrixAt(i, m);

      // Toit pyramidal rouge : même rotation que les murs, posé sur le haut
      e.set(0, b.yaw, 0);
      q.setFromEuler(e);
      v.set(b.cx, wallTop + roofH / 2, b.cz);
      s.set(b.w * 0.85, roofH, b.d * 0.85); // léger débord de toit
      m.compose(v, q, s);
      roofs.setMatrixAt(i, m);
      roofs.setColorAt(i, colRoof);

      this.colliders.push({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, yaw: b.yaw });

      // --- Fenêtres sur les 4 façades (repère local du bâtiment) ---
      for (let f = 0; f < 4; f++) {
        const len = f < 2 ? b.w : b.d; // façades avant/arrière = w, côtés = d
        const cols = Math.max(0, Math.floor((len - 2) / 3.2));
        const rows = Math.max(1, Math.floor((wallH - 3.4) / 4));
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const along = cols > 1 ? -len / 2 + 1.6 + c * ((len - 3.2) / (cols - 1)) : 0;
            let lx = 0, lz = 0, ry = 0;
            if (f === 0) { lz = b.d / 2 + 0.04; lx = along; ry = 0; }
            else if (f === 1) { lz = -b.d / 2 - 0.04; lx = -along; ry = Math.PI; }
            else if (f === 2) { lx = b.w / 2 + 0.04; lz = along; ry = Math.PI / 2; }
            else { lx = -b.w / 2 - 0.04; lz = -along; ry = -Math.PI / 2; }
            const cosY = Math.cos(b.yaw);
            const sinY = Math.sin(b.yaw);
            const wx = b.cx + lx * cosY + lz * sinY;
            const wz = b.cz - lx * sinY + lz * cosY;
            // jamais trop bas : au moins 2.3 m au-dessus du sol sous la fenêtre
            // (sinon 3.0 m au-dessus du bas du mur, qui descend jusqu'au sol en pente)
            const wy = Math.max(baseY + 3.0, this.terrain.heightAt(wx, wz) + 2.3) + r * 4;
            if (wy > wallTop - 0.9) continue;
            e.set(0, b.yaw + ry, 0);
            q.setFromEuler(e);
            v.set(wx, wy, wz);
            s.set(1, 1, 1);
            m.compose(v, q, s);
            winMats.push(m.clone());
          }
        }
      }
    });

    // --- Mesh des fenêtres (1 InstancedMesh) : vitres sombres, et 1 sur 5
    // choisies au hasard seront ALLUMÉES (jaune) la nuit ---
    const winColorOff = new THREE.Color(0x33506a); // vitre éteinte (gris/bleu)
    const winColorOn = new THREE.Color(0xffd75a);  // fenêtre allumée
    this.winColorOff = winColorOff;
    this.winColorOn = winColorOn;
    const windows = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.5, 1.8, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), // couleur par instance
      Math.max(1, winMats.length)
    );
    winMats.forEach((mm, i) => {
      windows.setMatrixAt(i, mm);
      windows.setColorAt(i, winColorOff);
    });
    const randW = mulberry32(31);
    this.litWindows = [];
    for (let i = 0; i < winMats.length; i++) if (randW() < 0.2) this.litWindows.push(i); // 1 sur 5
    this.windows = windows;
    this.roofs = roofs; // gardé pour paintRoof (toit de la boutique en jaune)
    this.group.add(walls, shells, roofs, windows);
    console.log('[Buildings] bâtiments posés :', n, '/', osmData.buildings.length, '| fenêtres :', winMats.length, '| allumables :', this.litWindows.length);
  }

  // La plus grande maison (surface w*d) à moins de maxDist de (x, z) :
  // retourne l'index dans this.colliders (-1 si aucune) — pour la boutique.
  biggestNear(x, z, maxDist) {
    let best = -1;
    let bestArea = -1;
    for (let i = 0; i < this.colliders.length; i++) {
      const c = this.colliders[i];
      if (Math.hypot(c.cx - x, c.cz - z) > maxDist) continue;
      const area = c.w * c.d;
      if (area > bestArea) { bestArea = area; best = i; }
    }
    return best;
  }

  // Repeint le toit d'un bâtiment (index = index dans this.colliders)
  paintRoof(i, color) {
    this.roofs.setColorAt(i, new THREE.Color(color));
    if (this.roofs.instanceColor) this.roofs.instanceColor.needsUpdate = true;
  }

  // La nuit : 1 fenêtre sur 5 (celles choisies au hasard) s'allume en jaune
  setWindowsLit(night) {
    const c = night ? this.winColorOn : this.winColorOff;
    for (const i of this.litWindows) this.windows.setColorAt(i, c);
    if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
  }

  createRocks() {
    const p = CONFIG.props;
    const mat = new THREE.MeshLambertMaterial({ color: p.rockColor, flatShading: true });
    for (const r of osmData.rocks) {
      const y = this.terrain.heightAt(r.x, r.z);
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(r.r, 0), mat);
      mesh.position.set(r.x, y + r.r * 0.3, r.z);
      mesh.scale.y = 0.6;
      mesh.rotation.y = (r.x * 13.7) % Math.PI;
      this.group.add(mesh);
    }
  }
}
