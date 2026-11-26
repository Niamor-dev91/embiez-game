import * as THREE from 'three';

import { CONFIG } from '../config.js';
import osmData from './data/embiez-osm.js';

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
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
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
      new THREE.MeshLambertMaterial({ color: p.roofColor }),
      n
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();

    list.forEach((b, i) => {
      const y = this.terrain.heightAt(b.cx, b.cz);
      const roofH = Math.min(b.w, b.d) * p.roofHeightFactor;
      e.set(0, b.yaw, 0);
      q.setFromEuler(e);

      // Murs (couleur vive selon le type)
      v.set(b.cx, y + b.height / 2, b.cz);
      s.set(b.w, b.height, b.d);
      m.compose(v, q, s);
      walls.setMatrixAt(i, m);
      col.set(p.buildingColors[b.kind] ?? p.buildingColors.default);
      walls.setColorAt(i, col);

      // Coquille noire = outline toon
      v.set(b.cx, y + b.height / 2, b.cz);
      s.set(b.w * p.outlineScale, b.height * 1.04, b.d * p.outlineScale);
      m.compose(v, q, s);
      shells.setMatrixAt(i, m);

      // Toit pyramidal rouge : même rotation que les murs
      e.set(0, b.yaw, 0);
      q.setFromEuler(e);
      v.set(b.cx, y + b.height + roofH / 2, b.cz);
      s.set(b.w * 0.85, roofH, b.d * 0.85); // léger débord de toit
      m.compose(v, q, s);
      roofs.setMatrixAt(i, m);

      this.colliders.push({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, yaw: b.yaw });
    });

    this.group.add(walls, shells, roofs);
    console.log('[Buildings] bâtiments posés :', n, '/', osmData.buildings.length);
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
