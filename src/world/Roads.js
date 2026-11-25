import * as THREE from 'three';

import { CONFIG } from '../config.js';
import osmData from './data/embiez-osm.js';

// Routes, pontons et surfaces au sol (parkings, plages, terrains de sport...) :
// des rubans et polygones plats posés sur le terrain via terrain.heightAt.
// Un seul mesh par catégorie, couleurs par vertex.

export class Roads {

  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.createRoads();
    this.createPiers();
    this.createSurfaces();
  }

  // Ajoute un quad (tronçon de ruban) entre p0 et p1 dans les buffers
  addSegment(positions, colors, indices, p0, p1, width, color, y0, y1) {
    const [x0, z0] = p0;
    const [x1, z1] = p1;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) return;
    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const base = positions.length / 3;
    positions.push(
      x0 + nx, y0, z0 + nz,
      x0 - nx, y0, z0 - nz,
      x1 + nx, y1, z1 + nz,
      x1 - nx, y1, z1 - nz
    );
    for (let k = 0; k < 4; k++) colors.push(color.r, color.g, color.b);
    indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  }

  // Construit un mesh à partir de buffers remplis par addSegment
  buildMesh(positions, colors, indices) {
    if (positions.length === 0) return;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  createRoads() {
    const p = CONFIG.props;
    const positions = [];
    const colors = [];
    const indices = [];
    const roadColor = new THREE.Color(p.roadColor);
    const pathColor = new THREE.Color(p.pathColor);
    for (const road of osmData.roads) {
      const width = p.roadWidth[road.kind] ?? 3;
      // Les petites allées en clair, les routes goudronnées en gris
      const color = ['footway', 'path', 'steps', 'pedestrian'].includes(road.kind) && !road.area
        ? pathColor : roadColor;
      for (let i = 0; i < road.points.length - 1; i++) {
        const p0 = road.points[i];
        const p1 = road.points[i + 1];
        const y0 = this.terrain.heightAt(p0[0], p0[1]) + 0.07;
        const y1 = this.terrain.heightAt(p1[0], p1[1]) + 0.07;
        this.addSegment(positions, colors, indices, p0, p1, width, color, y0, y1);
      }
    }
    this.buildMesh(positions, colors, indices);
  }

  createPiers() {
    // Les pontons flottent au niveau de l'eau
    const p = CONFIG.props;
    const positions = [];
    const colors = [];
    const indices = [];
    const color = new THREE.Color(p.pierColor);
    for (const pier of osmData.piers) {
      for (let i = 0; i < pier.points.length - 1; i++) {
        this.addSegment(positions, colors, indices, pier.points[i], pier.points[i + 1], p.pierWidth, color, 0.35, 0.35);
      }
    }
    this.buildMesh(positions, colors, indices);
  }

  createSurfaces() {
    const p = CONFIG.props;
    const positions = [];
    const colors = [];
    const indices = [];
    for (const surf of osmData.surfaces) {
      const pts = surf.points;
      const { cx, cz } = centroid(pts);
      const color = new THREE.Color(p.surfaceColors[surf.kind] ?? p.surfaceColors.default);
      const base = positions.length / 3;
      const cy = surf.kind === 'beach'
        ? Math.max(this.terrain.heightAt(cx, cz), 0.3) + 0.05
        : this.terrain.heightAt(cx, cz) + 0.05;
      positions.push(cx, cy, cz);
      colors.push(color.r, color.g, color.b);
      for (const [x, z] of pts) {
        const y = surf.kind === 'beach'
          ? Math.max(this.terrain.heightAt(x, z), 0.3) + 0.05
          : this.terrain.heightAt(x, z) + 0.05;
        positions.push(x, y, z);
        colors.push(color.r, color.g, color.b);
      }
      // Fan de triangles depuis le centroïde
      for (let i = 1; i < pts.length - 1; i++) {
        indices.push(base, base + i + 1, base + i);
      }
    }
    this.buildMesh(positions, colors, indices);
  }
}

function centroid(pts) {
  let sx = 0, sz = 0;
  for (const [x, z] of pts) { sx += x; sz += z; }
  return { cx: sx / pts.length, cz: sz / pts.length };
}
