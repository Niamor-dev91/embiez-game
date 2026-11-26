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
    this.createPaintCanvas();
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

  // Couleur du sol selon l'altitude : sable dès le bord de mer (y compris
  // sous l'eau, caché par la mer opaque -> jamais de bleu visible sur terre),
  // herbe, puis végétation haute en altitude (jamais de gris hors routes).
  // Les changements de zone se font en DÉGRADÉ sur colorBlendWidth (8 m)
  // centré sur chaque seuil -> pas de cassure entre deux zones du sol.
  colorAt(y) {
    const c = CONFIG.terrain;
    const sand = new THREE.Color(c.colors.sand);
    const grass = new THREE.Color(c.colors.grass);
    const rock = new THREE.Color(c.colors.rock);
    const w = c.colorBlendWidth / 2;
    if (y < c.beachHeight - w) return sand;
    if (y < c.beachHeight + w) return sand.clone().lerp(grass, (y - (c.beachHeight - w)) / (2 * w));
    if (y < c.rockHeight - w) return grass;
    if (y < c.rockHeight + w) return grass.clone().lerp(rock, (y - (c.rockHeight - w)) / (2 * w));
    return rock;
  }

  // --- Texture du sol : le FOND recopie exactement l'ancien rendu
  // (vertexColors interpolés bilinéairement sur la grille du mesh), puis on
  // peint par-dessus UNIQUEMENT les routes (paintStroke, appelé par Roads). ---
  createPaintCanvas() {
    const c = CONFIG.terrain;
    const res = c.paintResolution;
    this.paintCanvas = document.createElement('canvas');
    this.paintCanvas.width = res;
    this.paintCanvas.height = res;
    const ctx = this.paintCanvas.getContext('2d');

    // Couleurs aux nœuds de la grille du mesh (comme les anciens vertexColors)
    const cell = this.size / c.segments;
    const n = c.segments + 1;
    const nodes = [];
    for (let r = 0; r < n; r++) {
      nodes.push([]);
      for (let col = 0; col < n; col++) {
        nodes[r].push(this.colorAt(this.heightAt(-this.size / 2 + col * cell, -this.size / 2 + r * cell)));
      }
    }

    // Fond peint pixel par pixel avec la MÊME interpolation bilinéaire
    const img = ctx.createImageData(res, res);
    const d = img.data;
    for (let py = 0; py < res; py++) {
      for (let px = 0; px < res; px++) {
        const [x, z] = this.paintToWorld(px, py);
        const col = (x + this.size / 2) / cell;
        const row = (z + this.size / 2) / cell;
        const c0 = Math.max(0, Math.min(c.segments - 1, Math.floor(col)));
        const r0 = Math.max(0, Math.min(c.segments - 1, Math.floor(row)));
        const fc = Math.max(0, Math.min(1, col - c0));
        const fr = Math.max(0, Math.min(1, row - r0));
        const c00 = nodes[r0][c0], c10 = nodes[r0][c0 + 1];
        const c01 = nodes[r0 + 1][c0], c11 = nodes[r0 + 1][c0 + 1];
        const k = (py * res + px) * 4;
        d[k]     = (c00.r * (1 - fc) * (1 - fr) + c10.r * fc * (1 - fr) + c01.r * (1 - fc) * fr + c11.r * fc * fr) * 255;
        d[k + 1] = (c00.g * (1 - fc) * (1 - fr) + c10.g * fc * (1 - fr) + c01.g * (1 - fc) * fr + c11.g * fc * fr) * 255;
        d[k + 2] = (c00.b * (1 - fc) * (1 - fr) + c10.b * fc * (1 - fr) + c01.b * (1 - fc) * fr + c11.b * fc * fr) * 255;
        d[k + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    this.paintTexture = new THREE.CanvasTexture(this.paintCanvas);
    // NoColorSpace (défaut) : la texture est utilisée telle quelle, comme les
    // anciens vertexColors -> mêmes couleurs à l'affichage qu'avant.
    this.paintTexture.anisotropy = 4;
  }

  // Monde -> pixel dans le canvas de peinture
  worldToPaint(x, z) {
    const res = this.paintCanvas.width;
    return [
      ((x + this.size / 2) / this.size) * res,
      res - ((z + this.size / 2) / this.size) * res, // flipY de la texture
    ];
  }

  // Pixel -> monde (inverse de worldToPaint)
  paintToWorld(px, py) {
    const res = this.paintCanvas.width;
    return [
      (px / res) * this.size - this.size / 2,
      (1 - py / res) * this.size - this.size / 2,
    ];
  }

  // Peint une route dans la texture du sol (lineJoin/lineCap round :
  // les virages sont bouchés automatiquement, aucun ruban 3D au-dessus).
  // Deux passes : un halo semi-transparent (bord adouci, moins pixelisé)
  // puis le trait plein.
  paintStroke(points, widthM, colorHex) {
    const ctx = this.paintCanvas.getContext('2d');
    const res = this.paintCanvas.width;
    const color = '#' + new THREE.Color(colorHex).getHexString();
    const w = Math.max(1, (widthM / this.size) * res);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const trace = () => {
      ctx.beginPath();
      points.forEach(([x, z], i) => {
        const [px, py] = this.worldToPaint(x, z);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    };
    // halo adouci autour du trait
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = w + 2.5;
    trace();
    // trait plein
    ctx.globalAlpha = 1;
    ctx.lineWidth = w;
    trace();
    ctx.globalAlpha = 1;
    this.paintTexture.needsUpdate = true;
  }

  createMesh() {
    const c = CONFIG.terrain;
    const geometry = new THREE.PlaneGeometry(c.size, c.size, c.segments, c.segments);
    geometry.rotateX(-Math.PI / 2); // à plat

    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, this.heightAt(positions.getX(i), positions.getZ(i)));
    }
    geometry.computeVertexNormals();

    const material = new THREE.MeshLambertMaterial({
      map: this.paintTexture, // fond = ancien rendu vertexColors + routes peintes
      flatShading: true,     // facettes visibles = look low-poly
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }
}
