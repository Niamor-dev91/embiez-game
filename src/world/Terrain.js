import * as THREE from 'three';

import { CONFIG } from '../config.js';
import embiezData from './data/embiez.js';

// Terrain de l'île des Embiez, à partir du RGE ALTI 5 m de l'IGN
// (données générées dans src/world/data/embiez.json par
// scripts/build-embiez-data.mjs). Grille régulière centrée sur l'île :
// origine en LAMB93, x = est, z = -nord (le nord de l'île est vers -Z).

export class Terrain {

  constructor(scene) {
    this.scene = scene;
    this.loadData();
    this.createMesh();
  }

  loadData() {
    const d = embiezData;
    // Décodage base64 -> Float32Array (row 0 = nord, col 0 = ouest)
    const bin = atob(d.heightsB64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    this.heights = new Float32Array(buf.buffer);
    this.cols = d.cols;
    this.rows = d.rows;
    this.cellSize = d.cellSize;
    this.size = d.size;
    this.coastLevel = d.coastLevel;
  }

  // Hauteur du terrain au point monde (x, z), interpolation bilinéaire
  heightAt(x, z) {
    const c = CONFIG.terrain;
    // Coordonnées dans la grille de données
    const col = (x + this.size / 2) / this.cellSize;
    const row = (z + this.size / 2) / this.cellSize;
    if (col < 0 || col > this.cols - 1 || row < 0 || row > this.rows - 1) {
      return -c.waterDepth; // hors des données = fond marin
    }
    const c0 = Math.floor(col);
    const r0 = Math.floor(row);
    const c1 = Math.min(c0 + 1, this.cols - 1);
    const r1 = Math.min(r0 + 1, this.rows - 1);
    const fc = col - c0;
    const fr = row - r0;
    const h00 = this.heights[r0 * this.cols + c0];
    const h10 = this.heights[r0 * this.cols + c1];
    const h01 = this.heights[r1 * this.cols + c0];
    const h11 = this.heights[r1 * this.cols + c1];
    return (
      h00 * (1 - fc) * (1 - fr) +
      h10 * fc * (1 - fr) +
      h01 * (1 - fc) * fr +
      h11 * fc * fr
    );
  }

  // Couleur du sol selon l'altitude
  colorAt(y) {
    const c = CONFIG.terrain;
    if (y < this.coastLevel) return new THREE.Color(c.colors.seabed);
    if (y < c.beachHeight) return new THREE.Color(c.colors.sand);
    if (y < c.rockHeight) return new THREE.Color(c.colors.grass);
    return new THREE.Color(c.colors.rock);
  }

  createMesh() {
    const c = CONFIG.terrain;
    const geometry = new THREE.PlaneGeometry(c.size, c.size, c.segments, c.segments);
    geometry.rotateX(-Math.PI / 2); // à plat

    const positions = geometry.attributes.position;
    const colors = new Float32Array(positions.count * 3);
    const color = new THREE.Color();

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const z = positions.getZ(i);
      const y = this.heightAt(x, z);
      positions.setY(i, y);

      color.copy(this.colorAt(y));
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true, // facettes visibles = look low-poly
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }
}
