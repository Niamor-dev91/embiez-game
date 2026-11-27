// Combat hitscan : un tir est une droite (origine + direction), on cherche
// la cible dont le centre est le plus proche de cette droite (dans un rayon).

// origin/dir : {x,y,z} ; targets : [{ pos: {x,y,z}, ... }] ; renvoie la cible
// la plus proche touchée, ou null.
export function fireHitscan(origin, dir, targets, radius = 0.7, range = 100) {
  let best = null;
  let bestT = Infinity;
  for (const t of targets) {
    const ox = t.pos.x - origin.x;
    const oy = t.pos.y - origin.y;
    const oz = t.pos.z - origin.z;
    const tProj = ox * dir.x + oy * dir.y + oz * dir.z; // projection sur la droite
    if (tProj < 0 || tProj > range) continue;
    const px = origin.x + dir.x * tProj;
    const py = origin.y + dir.y * tProj;
    const pz = origin.z + dir.z * tProj;
    const d = Math.hypot(t.pos.x - px, t.pos.y - py, t.pos.z - pz);
    const r = t.radius ?? radius; // une cible peut définir son propre rayon
    if (d < r && tProj < bestT) {
      best = t;
      bestT = tProj;
    }
  }
  return best;
}
