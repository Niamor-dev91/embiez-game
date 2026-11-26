import * as THREE from 'three';

import { CONFIG } from '../config.js';
import osmData from './data/embiez-osm.js';

// Routes, pontons et surfaces au sol (parkings, plages, terrains de sport...) :
// - ROUTES : peintes directement dans la texture du terrain (terrain.paintStroke)
//   -> plus de ruban 3D au-dessus du sol, collées au sol par construction
// - PONTONS et SURFACES : objets 3D plats posés sur le terrain via heightAt

export class Roads {

  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.piers = osmData.piers; // polylignes des pontons (solides, voir pierHeightAt)
    this.createRoads();
    this.createPiers();
    this.createSurfaces();
  }

  // Hauteur d'un ponton au point (x, z), ou null si le point n'est pas dessus
  pierHeightAt(x, z) {
    const w = CONFIG.props.pierWidth / 2 + 0.3; // demi-largeur + marge
    for (const pier of this.piers) {
      const pts = pier.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i];
        const [bx, bz] = pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const L2 = dx * dx + dz * dz;
        let t = L2 > 0 ? ((x - ax) * dx + (z - az) * dz) / L2 : 0;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t * dx;
        const pz = az + t * dz;
        if (Math.hypot(x - px, z - pz) < w) return 0.35; // pontons à 0.35 m
      }
    }
    return null;
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
    for (const road of osmData.roads) {
      const width = p.roadWidth[road.kind] ?? 3;
      // Les petites allées en clair, les routes goudronnées en gris
      const colorHex = ['footway', 'path', 'steps', 'pedestrian'].includes(road.kind) && !road.area
        ? p.pathColor : p.roadColor;
      this.terrain.paintStroke(road.points, width, colorHex);
    }
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
      // marina ignorée : le bassin du port est couvert par le plan mer (bleu
      // uni partout) — un mesh par-dessus créait un port plus foncé (Lambert)
      // + une fine bande bleue au bord là où le plan mer ondule au-dessus.
      if (surf.kind === 'marina') continue;
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
