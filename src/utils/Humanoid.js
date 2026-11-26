import * as THREE from 'three';

import { CONFIG } from '../config.js';

// Mesh humanoïde low-poly partagé (joueur, PNJ) : un groupe de boîtes
// avec jambes et bras qui pivotent pour l'animation de marche.
// Chaque partie a aussi un "shell" noir (outline toon) synchronisé.

export function createHumanoid(colors) {
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const box = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  const shellMat = new THREE.MeshBasicMaterial({
    color: CONFIG.props.outlineColor,
    side: THREE.BackSide,
  });

  const group = new THREE.Group();
  const legL = box(0.18, 0.8, 0.2, colors.legs, -0.12, 0.4, 0);
  const legR = box(0.18, 0.8, 0.2, colors.legs, 0.12, 0.4, 0);
  const armL = box(0.12, 0.65, 0.15, colors.arms, -0.32, 1.15, 0);
  const armR = box(0.12, 0.65, 0.15, colors.arms, 0.32, 1.15, 0);
  const body = box(0.5, 0.7, 0.3, colors.body, 0, 1.15, 0);
  const head = box(0.3, 0.3, 0.3, colors.head, 0, 1.65, 0);
  const parts = [legL, legR, armL, armR, body, head];

  // Shells (outline) : un clone noir par partie, synchronisé à l'animation
  const shells = parts.map((p) => {
    const s = new THREE.Mesh(p.geometry, shellMat);
    s.position.copy(p.position);
    s.scale.setScalar(1.08);
    group.add(s);
    return s;
  });
  group.add(...parts);

  return { group, legL, legR, armL, armR, links: parts.map((p, i) => [p, shells[i]]) };
}

// Animation de marche : swing = 1 quand on bouge, 0 à l'arrêt.
// Synchronise aussi les shells (outline) avec les membres.
export function setWalkAnimation(h, phase, swing) {
  h.legL.rotation.x = Math.sin(phase) * 0.6 * swing;
  h.legR.rotation.x = -Math.sin(phase) * 0.6 * swing;
  h.armL.rotation.x = -Math.sin(phase) * 0.5 * swing;
  h.armR.rotation.x = Math.sin(phase) * 0.5 * swing;
  for (const [part, shell] of h.links) shell.rotation.copy(part.rotation);
}

// Pistolet low-poly à la main droite
export function addGun(h, color = 0x222222) {
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.12, 0.4),
    new THREE.MeshLambertMaterial({ color })
  );
  gun.position.set(0.32, 0.85, 0.15);
  h.group.add(gun);
  return gun;
}
