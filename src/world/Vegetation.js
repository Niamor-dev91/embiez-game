import * as THREE from 'three';

import { CONFIG } from '../config.js';
import { mulberry32 } from '../utils/random.js';
import osmData from './data/embiez-osm.js';

// Végétation de l'île : des pins (tronc + deux cônes) plantés dans les
// polygones de forêt OSM (landuse=forest) et sur les arbres individuels OSM.
// Rendu en InstancedMesh (un tronc + deux cônes pour tous les pins).

// Test point-dans-polygone (ray casting)
function pointInPolygon(x, z, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// Aire d'un polygone (formule du shoelace)
function polygonArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  }
  return Math.abs(a / 2);
}

export class Vegetation {

  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.pins = [];
    this.collectPins();
    this.createMeshes();
  }

  // Arbres OSM + pins procéduraux dans les forêts
  collectPins() {
    const p = CONFIG.props;
    for (const pin of osmData.trees) this.pins.push(pin);

    const rand = mulberry32(42);
    let remaining = p.treeMax;
    for (const forest of osmData.forests) {
      const pts = forest.points;
      const area = polygonArea(pts);
      let count = Math.min(Math.round(area * p.treeDensity), remaining);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const [x, z] of pts) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
      let attempts = 0;
      while (count > 0 && attempts < count * 30) {
        attempts++;
        const x = minX + rand() * (maxX - minX);
        const z = minZ + rand() * (maxZ - minZ);
        if (!pointInPolygon(x, z, pts)) continue;
        this.pins.push([x, z]);
        count--;
        remaining--;
      }
    }
    console.log('[Vegetation] pins :', this.pins.length,
      '(forêts OSM :', osmData.forests.length, ', arbres OSM :', osmData.trees.length + ')');
  }

  createMeshes() {
    const p = CONFIG.props;
    const n = this.pins.length;
    if (n === 0) return;

    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.12, 0.18, 1.6, 5),
      new THREE.MeshLambertMaterial({ color: p.trunkColor }),
      n
    );
    const cone1Mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.7, 3.5, 6),
      new THREE.MeshLambertMaterial({ color: p.pineColor, flatShading: true }),
      n
    );
    const cone2Mesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.15, 2.8, 6),
      new THREE.MeshLambertMaterial({ color: p.pineColor, flatShading: true }),
      n
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    const rand = mulberry32(1234);

    for (let i = 0; i < n; i++) {
      const [x, z] = this.pins[i];
      const y = this.terrain.heightAt(x, z);
      if (y < 0.5) continue; // pas de pin dans l'eau
      const scale = 0.8 + rand() * 0.5;
      e.set(0, rand() * Math.PI * 2, 0);
      q.setFromEuler(e);
      s.set(scale, scale, scale);

      v.set(x, y + 0.8 * scale, z);
      m.compose(v, q, s);
      trunkMesh.setMatrixAt(i, m);

      v.set(x, y + (1.2 + 1.75) * scale, z);
      m.compose(v, q, s);
      cone1Mesh.setMatrixAt(i, m);

      v.set(x, y + (1.2 + 3.5 - 0.6 + 1.4) * scale, z);
      m.compose(v, q, s);
      cone2Mesh.setMatrixAt(i, m);
    }

    this.scene.add(trunkMesh, cone1Mesh, cone2Mesh);
  }
}
