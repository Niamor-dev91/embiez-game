// Script de génération des données de DÉCOR de l'île des Embiez (étape 4).
//
// Lit un export GeoJSON d'OpenStreetMap (resources/export.geojson — voir la
// requête Overpass dans CONTEXTE.md, export "GeoJSON" sur overpass-turbo) et
// écrit src/world/data/embiez-osm.js en coordonnées locales du jeu
// (origine = centre de l'île, x = est, z = -nord, 1 unité = 1 mètre) :
// routes, bâtiments, forêts, arbres, pontons, surfaces, rochers.
//
// Usage : node scripts/build-embiez-osm.mjs [chemin-export.geojson]

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { isleOrigin, latLonToLocal } from './geo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IN_FILE = process.argv[2] || join(root, 'resources', 'export.geojson');
const OUT_FILE = join(root, 'src', 'world', 'data', 'embiez-osm.js');

// Même fenêtre que le terrain (voir build-embiez-data.mjs)
const WINDOW = 2000;
const HALF = WINDOW / 2;

const origin = isleOrigin();

const data = JSON.parse(readFileSync(IN_FILE, 'utf8'));

// --- Helpers de conversion GeoJSON ([lon, lat]) -> local [x, z] ---

function toLocal(lon, lat) {
  const p = latLonToLocal(lat, lon, origin);
  return [p.x, p.z];
}
function inWindow(pt) {
  return Math.abs(pt[0]) <= HALF && Math.abs(pt[1]) <= HALF;
}
function linesOf(geometry) {
  if (geometry.type === 'LineString') return [geometry.coordinates];
  if (geometry.type === 'MultiLineString') return geometry.coordinates;
  return [];
}
function ringsOf(geometry) {
  if (geometry.type === 'Polygon') return geometry.coordinates;
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat();
  return [];
}
function centroidAndSize(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sx = 0, sz = 0;
  for (const [x, z] of pts) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    sx += x; sz += z;
  }
  return {
    cx: sx / pts.length, cz: sz / pts.length,
    w: Math.max(maxX - minX, 2), d: Math.max(maxZ - minZ, 2),
  };
}
function buildingHeight(tags) {
  if (tags.height) return parseFloat(tags.height);
  if (tags['building:levels']) return parseFloat(tags['building:levels']) * 3 + 2;
  const kind = tags.building;
  if (kind === 'church') return 12;
  if (kind === 'hotel') return 10;
  if (kind === 'retail' || kind === 'roof') return 8;
  return 6; // maison par défaut
}

// --- Classification des features ---

const roads = [];
const buildings = [];
const forests = [];
const trees = [];
const piers = [];
const surfaces = [];
const rocks = [];
let skipped = 0;

for (const f of data.features) {
  const tags = f.properties || {};
  const g = f.geometry;
  if (!g) continue;

  // Le trait de côte et l'eau viennent déjà du RGE ALTI
  if (tags.natural === 'coastline' || tags.natural === 'water') { skipped++; continue; }

  if (tags.highway) {
    for (const line of linesOf(g)) {
      const pts = line.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length >= 2) roads.push({ kind: tags.highway, area: tags.area === 'yes', points: pts });
    }
  } else if (tags.building) {
    for (const ring of ringsOf(g)) {
      const pts = ring.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length < 3) continue;
      // Orientation réelle du bâtiment : angle du plus long côté du ring.
      // On projette ensuite les points sur ces axes pour avoir w/d droits.
      let bestLen = 0;
      let a = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const dx = pts[i + 1][0] - pts[i][0];
        const dz = pts[i + 1][1] - pts[i][1];
        const L = Math.hypot(dx, dz);
        if (L > bestLen) { bestLen = L; a = Math.atan2(dz, dx); }
      }
      const yaw = -a; // prêt pour rotation.y de three.js
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      let sx = 0, sz = 0;
      for (const [x, z] of pts) {
        const u = x * cosA + z * sinA;
        const v = -x * sinA + z * cosA;
        if (u < minU) minU = u; if (u > maxU) maxU = u;
        if (v < minV) minV = v; if (v > maxV) maxV = v;
        sx += x; sz += z;
      }
      buildings.push({
        kind: tags.building === 'yes' ? 'house' : tags.building,
        height: buildingHeight(tags),
        points: pts,
        cx: sx / pts.length, cz: sz / pts.length,
        w: Math.max(maxU - minU, 2), d: Math.max(maxV - minV, 2),
        yaw,
      });
    }
  } else if (tags.landuse === 'forest' || tags.natural === 'wood') {
    for (const ring of ringsOf(g)) {
      const pts = ring.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length >= 3) forests.push({ points: pts });
    }
  } else if (tags.natural === 'tree' && g.type === 'Point') {
    const p = toLocal(g.coordinates[0], g.coordinates[1]);
    if (inWindow(p)) trees.push(p);
  } else if (tags.man_made === 'pier') {
    for (const line of linesOf(g)) {
      const pts = line.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length >= 2) piers.push({ points: pts });
    }
  } else if (tags.natural === 'bare_rock' || tags.natural === 'rock') {
    for (const ring of ringsOf(g)) {
      const pts = ring.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length < 1) continue;
      const { cx, cz, w, d } = centroidAndSize(pts);
      rocks.push({ x: cx, z: cz, r: Math.min(Math.max(Math.max(w, d) / 2, 1), 6) });
    }
  } else if (tags.leisure || tags.amenity || tags.natural === 'beach') {
    for (const ring of ringsOf(g)) {
      const pts = ring.map(([lon, lat]) => toLocal(lon, lat)).filter(inWindow);
      if (pts.length >= 3) {
        surfaces.push({ kind: tags.natural === 'beach' ? 'beach' : (tags.leisure || tags.amenity), points: pts });
      }
    }
  }
}

console.log('Features lues :', data.features.length, '| ignorées (côte/eau) :', skipped);
console.log('routes :', roads.length, '| bâtiments :', buildings.length, '| forêts :', forests.length,
  '| arbres OSM :', trees.length, '| pontons :', piers.length, '| surfaces :', surfaces.length, '| rochers :', rocks.length);

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE,
  '// Généré par scripts/build-embiez-osm.mjs — ne pas éditer.\nexport default ' +
  JSON.stringify({ origin: { x: origin.x, y: origin.y }, size: WINDOW, roads, buildings, forests, trees, piers, surfaces, rocks }) +
  ';\n');
console.log('Écrit :', OUT_FILE);
