import * as THREE from 'three';

import { CONFIG } from '../config.js';

// Mesh humanoïde low-poly partagé (joueur, PNJ), style XIII (comic toon) :
// un groupe de boîtes avec jambes et bras qui pivotent pour la marche,
// une tête avec cheveux et yeux (style comic), et chaque partie a un "shell"
// noir (outline toon) synchronisé.
// variant >= 0 : prend une des CONFIG.npc.variants (0/1 = hommes, 2 = femme
// avec cheveux longs + jupe). Sinon `colors` est utilisé tel quel.

export function createHumanoid(colors, variant = -1) {
  if (variant >= 0) {
    const v = CONFIG.npc.variants[variant % CONFIG.npc.variants.length];
    colors = {
      body: v.top,
      head: v.skin,
      legs: v.legs,
      arms: v.top,
      hair: v.hair,
      skirt: v.skirt,
      woman: v.style === 'woman',
    };
  }
  const woman = !!colors.woman;
  if (colors.hair === undefined) colors.hair = 0x1a1a1a; // défaut : cheveux noirs (ex: policiers)

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
  const legW = woman ? 0.13 : 0.18; // jambes plus fines pour la femme
  const legL = box(legW, 0.8, 0.18, colors.legs, -0.11, 0.4, 0);
  const legR = box(legW, 0.8, 0.18, colors.legs, 0.11, 0.4, 0);
  const armL = box(0.12, 0.65, 0.15, colors.arms, -0.3, 1.15, 0);
  const armR = box(0.12, 0.65, 0.15, colors.arms, 0.3, 1.15, 0);
  const body = box(woman ? 0.42 : 0.5, 0.7, 0.3, colors.body, 0, 1.15, 0);
  const head = box(0.3, 0.3, 0.3, colors.head, 0, 1.65, 0);

  // Cheveux : courts (dessus de la tête) ou longs (femme, DERRIÈRE la tête
  // jusqu'aux épaules — le devant du perso est +Z, là où sont les yeux)
  const hair = woman
    ? box(0.34, 0.44, 0.34, colors.hair, 0, 1.66, -0.06)
    : box(0.32, 0.12, 0.32, colors.hair, 0, 1.84, 0);

  // Yeux (style comic XIII) : deux points noirs sur la face avant (+Z local)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x101018 });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.032, 6, 6), eyeMat);
  eyeL.position.set(-0.07, 1.68, 0.155);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.07;

  // Jupe pour la femme (cône, ne pivote pas)
  let skirt = null;
  if (woman) {
    skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.34, 0.42, 8),
      mat(colors.skirt)
    );
    skirt.position.set(0, 0.82, 0);
  }

  const parts = [legL, legR, armL, armR, body, head, hair];
  if (skirt) parts.push(skirt);

  // Shells (outline) : un clone noir par partie, synchronisé à l'animation
  const shells = parts.map((p) => {
    const s = new THREE.Mesh(p.geometry, shellMat);
    s.position.copy(p.position);
    s.scale.setScalar(1.08);
    group.add(s);
    return s;
  });
  group.add(...parts, eyeL, eyeR);

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
