import * as THREE from 'three';

import { CONFIG } from '../config.js';
import osmData from './data/embiez-osm.js';

// Bâtiments OSM en boîtes low-poly (murs + toit plat coloré), posés sur le
// terrain, plus les rochers (natural=bare_rock) en icosaèdres aplatis.

export class Buildings {

  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.createBuildings();
    this.createRocks();
    this.scene.add(this.group);
  }

  createBuildings() {
    const p = CONFIG.props;
    const roofMat = new THREE.MeshLambertMaterial({ color: p.roofColor });
    let count = 0;
    for (const b of osmData.buildings) {
      const y = this.terrain.heightAt(b.cx, b.cz);
      if (y < 0.2) continue; // emprise dans l'eau (quai) : on ignore
      const colorHex = p.buildingColors[b.kind] ?? p.buildingColors.default;
      const wallMat = new THREE.MeshLambertMaterial({ color: colorHex });
      const geo = new THREE.BoxGeometry(b.w, b.height, b.d);
      // BoxGeometry : groupes [px, nx, py, ny, pz, nz] -> index 2 = le toit
      const mesh = new THREE.Mesh(geo, [wallMat, wallMat, roofMat, wallMat, wallMat, wallMat]);
      mesh.position.set(b.cx, y + b.height / 2, b.cz);
      this.group.add(mesh);
      count++;
    }
    console.log('[Buildings] bâtiments posés :', count, '/', osmData.buildings.length);
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
