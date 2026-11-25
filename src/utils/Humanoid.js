import * as THREE from 'three';

// Mesh humanoïde low-poly partagé (joueur, PNJ) : un groupe de boîtes
// avec jambes et bras qui pivotent pour l'animation de marche.

export function createHumanoid(colors) {
  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const box = (w, h, d, color, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x, y, z);
    return m;
  };
  const group = new THREE.Group();
  const legL = box(0.18, 0.8, 0.2, colors.legs, -0.12, 0.4, 0);
  const legR = box(0.18, 0.8, 0.2, colors.legs, 0.12, 0.4, 0);
  const armL = box(0.12, 0.65, 0.15, colors.arms, -0.32, 1.15, 0);
  const armR = box(0.12, 0.65, 0.15, colors.arms, 0.32, 1.15, 0);
  group.add(box(0.5, 0.7, 0.3, colors.body, 0, 1.15, 0));
  group.add(box(0.3, 0.3, 0.3, colors.head, 0, 1.65, 0));
  group.add(legL, legR, armL, armR);
  return { group, legL, legR, armL, armR };
}

// Animation de marche : swing = 1 quand on bouge, 0 à l'arrêt
export function setWalkAnimation(h, phase, swing) {
  h.legL.rotation.x = Math.sin(phase) * 0.6 * swing;
  h.legR.rotation.x = -Math.sin(phase) * 0.6 * swing;
  h.armL.rotation.x = -Math.sin(phase) * 0.5 * swing;
  h.armR.rotation.x = Math.sin(phase) * 0.5 * swing;
}
