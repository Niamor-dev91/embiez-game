import * as THREE from 'three';

import { CONFIG } from '../config.js';

// Mer animée : grand plan ondulé côté CPU (somme de deux sinus).

export class Sea {

  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.createMesh();
  }

  createMesh() {
    const s = CONFIG.sea;
    const geometry = new THREE.PlaneGeometry(s.size, s.size, s.segments, s.segments);
    geometry.rotateX(-Math.PI / 2); // à plat

    // On garde les positions d'origine pour animer les vagues
    this.basePositions = geometry.attributes.position.array.slice();

    // MeshBasicMaterial : couleur unie vive sans éclairage (style toon),
    // la mer ne paraît plus grise à l'abri du port
    const material = new THREE.MeshBasicMaterial({ color: s.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.mesh);
  }

  update(delta) {
    this.time += delta;
    const s = CONFIG.sea;
    const positions = this.mesh.geometry.attributes.position;
    const base = this.basePositions;

    // Ondulation simple : somme de deux sinus
    for (let i = 0; i < positions.count; i++) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      const wave =
        Math.sin(x * s.waveFrequency + this.time * s.waveSpeed) +
        Math.sin(z * s.waveFrequency * 1.3 + this.time * s.waveSpeed * 0.8);
      positions.setY(i, (wave * 0.5) * s.waveHeight);
    }
    positions.needsUpdate = true;
    // Pas de computeVertexNormals : matériau basic (couleur unie)
  }
}
