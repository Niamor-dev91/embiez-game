// Collisions simples pour le personnage, les futurs PNJ et véhicules :
// un cercle (position + rayon) contre les boîtes orientées des bâtiments (OBB).

// Construit la liste des colliders depuis les bâtiments posés
export function buildColliders(buildings) {
  return buildings.map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, yaw: b.yaw }));
}

// Pousse le cercle A hors du cercle B (A cède, B a la priorité).
// Utilisé pour les collisions joueur <-> PNJ. Renvoie true si collision.
export function resolveCircleVsCircle(posA, radiusA, posB, radiusB) {
  let dx = posA.x - posB.x;
  let dz = posA.z - posB.z;
  let dist = Math.hypot(dx, dz);
  if (dist < 1e-6) { dx = 1; dz = 0; dist = 1; } // centres confondus
  const minDist = radiusA + radiusB;
  if (dist >= minDist) return false;
  const push = (minDist - dist) / dist;
  posA.x += dx * push;
  posA.z += dz * push;
  return true;
}

// Pousse `pos` ({x, z}) hors des boîtes qui le contiennent.
// Les boîtes peuvent être orientées (c.yaw) : test OBB dans le repère local.
// Deux passes pour bien dégager les coins. Renvoie true si collision.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const yaw = c.yaw || 0;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      // point dans le repère local du bâtiment (rotation -yaw, convention three.js)
      const dxm = pos.x - c.cx;
      const dzm = pos.z - c.cz;
      const lx = dxm * cosY - dzm * sinY;
      const lz = dxm * sinY + dzm * cosY;
      const hw = c.w / 2 + radius;
      const hd = c.d / 2 + radius;
      if (Math.abs(lx) >= hw || Math.abs(lz) >= hd) continue;
      hit = true;
      // On pousse sur l'axe local de pénétration minimale
      const px = hw - Math.abs(lx);
      const pz = hd - Math.abs(lz);
      let pushX = 0;
      let pushZ = 0;
      if (px < pz) pushX = lx >= 0 ? px : -px;
      else pushZ = lz >= 0 ? pz : -pz;
      // retour dans le repère monde (rotation +yaw, convention three.js)
      pos.x += pushX * cosY + pushZ * sinY;
      pos.z += -pushX * sinY + pushZ * cosY;
    }
  }
  return hit;
}
