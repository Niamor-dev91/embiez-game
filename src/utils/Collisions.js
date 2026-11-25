// Collisions simples pour le personnage, les futurs PNJ et véhicules :
// un cercle (position + rayon) contre les boîtes alignées axes des bâtiments.
// Les bâtiments OSM sont des rectangles axis-aligned -> test AABB.

// Construit la liste des colliders depuis les bâtiments posés
export function buildColliders(buildings) {
  return buildings.map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d }));
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
// Deux passes pour bien dégager les coins. Renvoie true si collision.
export function resolveCollisions(pos, radius, colliders) {
  let hit = false;
  for (let pass = 0; pass < 2; pass++) {
    for (const c of colliders) {
      const hw = c.w / 2 + radius;
      const hd = c.d / 2 + radius;
      const dx = pos.x - c.cx;
      const dz = pos.z - c.cz;
      if (Math.abs(dx) >= hw || Math.abs(dz) >= hd) continue;
      hit = true;
      // On pousse sur l'axe de pénétration minimale
      const px = hw - Math.abs(dx);
      const pz = hd - Math.abs(dz);
      if (px < pz) pos.x += dx >= 0 ? px : -px;
      else pos.z += dz >= 0 ? pz : -pz;
    }
  }
  return hit;
}
