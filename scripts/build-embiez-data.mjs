// Script de génération des données du terrain de l'île des Embiez.
//
// Lit les dalles RGE ALTI 5 m (format ASC, LAMB93/IGN69) extraites dans
// resources/rgealti/, assemble une fenêtre centrée sur l'île, ajoute une
// bathymétrie douce au-delà du trait de côte, puis écrit le résultat dans
// src/world/data/embiez.json (grille de hauteurs, encodée en base64).
//
// Usage : node scripts/build-embiez-data.mjs

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const RGEALTI_DIR = join(root, 'resources', 'rgealti');
const OUT_FILE = join(root, 'src', 'world', 'data', 'embiez.js');

// Centre de l'île des Embiez (donné en WGS84, converti en LAMB93 ci-dessous)
const ISLE_LAT = 43.074889101689216;
const ISLE_LON = 5.782911398742724;

// Fenêtre extraite autour du centre de l'île (mètres)
const WINDOW_SIZE = 2000;

// Sous-échantillonnage final : la grille de sortie fait WINDOW_SIZE/2 à 10 m
const OUT_CELL = 10;

// Bathymétrie procédurale au-delà du trait de côte (le RGE ALTI = terre seule)
const SHORE_PASSES = 12;   // nombre de passes de dilatation depuis la côte
const SHORE_DROP = 0.5;    // perte d'altitude par passe (m) -> pente ~1:10
const WATER_DEPTH = 6;     // profondeur max des fonds marins (m)

// Seuil du trait de côte dans le MNT IGN69 (niveau moyen de la mer ~ 0).
// Le RGE ALTI met 0.00 sur la mer : on considère que tout ce qui est
// sous LAND_LEVEL est de l'eau, le reste est de la terre.
const LAND_LEVEL = 0.5;
const COAST_LEVEL = 0.0; // seuil d'affichage terre/mer dans le jeu

// --- Conversion WGS84 -> LAMB93 (formules officielles IGN, ellipsoïde GRS80) ---

function lamb93(latDeg, lonDeg) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);
  const lon0 = 3 * Math.PI / 180;
  const lat0 = 46.5 * Math.PI / 180;
  const lat1 = 44 * Math.PI / 180;
  const lat2 = 49 * Math.PI / 180;
  const X0 = 700000;
  const Y0 = 6600000;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const t = (p) =>
    Math.tan(Math.PI / 4 - p / 2) /
    Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
  const n = Math.log(m(lat1) / m(lat2)) / Math.log(t(lat1) / t(lat2));
  const F = m(lat1) / (n * Math.pow(t(lat1), n));
  const rho0 = a * F * Math.pow(t(lat0), n);
  const p = latDeg * Math.PI / 180;
  const l = lonDeg * Math.PI / 180;
  const rho = a * F * Math.pow(t(p), n);
  const th = n * (l - lon0);
  return { x: X0 + rho * Math.sin(th), y: Y0 + rho0 - rho * Math.cos(th) };
}

// --- Lecture d'une dalle ASC ---

function readAsc(file) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split('\n');
  const header = {};
  let i = 0;
  while (i < lines.length) {
    const parts = lines[i].trim().split(/\s+/);
    if (/^[a-zA-Z]/.test(parts[0])) {
      header[parts[0].toLowerCase()] = parseFloat(parts[1]);
      i++;
    } else break;
  }
  const ncols = header['ncols'];
  const nrows = header['nrows'];
  const cell = header['cellsize'];
  const nodata = header['nodata_value'];
  const xll = header['xllcorner'] ?? header['xllcenter'];
  const yll = header['yllcorner'] ?? header['yllcenter'];
  const values = new Float32Array(ncols * nrows);
  // Les lignes de données commencent à la ligne i ; la première = rangée nord
  const tokens = lines.slice(i).join(' ').trim().split(/\s+/);
  for (let k = 0; k < ncols * nrows; k++) {
    const v = parseFloat(tokens[k]);
    values[k] = v === nodata ? NaN : v;
  }
  return { ncols, nrows, cell, xll, yll, values };
}

// --- Assemblage de la fenêtre centrée sur l'île ---

const center = lamb93(ISLE_LAT, ISLE_LON);
const xMin = center.x - WINDOW_SIZE / 2;
const xMax = center.x + WINDOW_SIZE / 2;
const yMin = center.y - WINDOW_SIZE / 2;
const yMax = center.y + WINDOW_SIZE / 2;

const SRC_CELL = 5;
const cols = Math.round(WINDOW_SIZE / SRC_CELL); // 400
const rows = cols;
// Grille fenêtre : row 0 = nord (Y max), col 0 = ouest (X min)
const grid = new Float32Array(cols * rows).fill(NaN);
const isLand = new Uint8Array(cols * rows); // 1 = cellule d'origine terre (non NODATA)

for (const file of readdirSync(RGEALTI_DIR)) {
  if (!file.endsWith('.asc')) continue;
  const tile = readAsc(join(RGEALTI_DIR, file));
  for (let r = 0; r < tile.nrows; r++) {
    const Y = tile.yll + (tile.nrows - 1 - r) * tile.cell; // centre du pixel, Y du nord au sud
    if (Y < yMin || Y > yMax) continue;
    const grow = rows - 1 - Math.round((Y - yMin) / SRC_CELL); // row dans la fenêtre (0 = nord)
    for (let c = 0; c < tile.ncols; c++) {
      const X = tile.xll + c * tile.cell;
      if (X < xMin || X > xMax) continue;
      const gcol = Math.round((X - xMin) / SRC_CELL);
      const idx = grow * cols + gcol;
      const v = tile.values[r * tile.ncols + c];
      if (!Number.isNaN(v) && v > LAND_LEVEL) {
        grid[idx] = v;
        isLand[idx] = 1;
      }
    }
  }
}

// --- Bathymétrie : on propage la côte vers le large, altitude décroissante ---

let frontier = [];
for (let i = 0; i < cols * rows; i++) if (!Number.isNaN(grid[i])) frontier.push(i);

for (let pass = 0; pass < SHORE_PASSES; pass++) {
  const next = [];
  for (const idx of frontier) {
    const c = idx % cols;
    const r = (idx - c) / cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nidx = nr * cols + nc;
      if (Number.isNaN(grid[nidx])) {
        grid[nidx] = grid[idx] - SHORE_DROP;
        next.push(nidx);
      }
    }
  }
  frontier = next;
  if (frontier.length === 0) break;
}
// Tout ce qui reste en NODATA (loin de toute côte) = fond plat
for (let i = 0; i < cols * rows; i++) {
  if (Number.isNaN(grid[i])) grid[i] = -WATER_DEPTH;
}
// Clamp de la profondeur
for (let i = 0; i < cols * rows; i++) {
  if (grid[i] < -WATER_DEPTH) grid[i] = -WATER_DEPTH;
}

// --- Lissage léger (moyenne 3x3) sur la terre uniquement ---

const smoothed = Float32Array.from(grid);
for (let r = 1; r < rows - 1; r++) {
  for (let c = 1; c < cols - 1; c++) {
    const idx = r * cols + c;
    if (!isLand[idx]) continue;
    let sum = 0;
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const v = grid[idx + dr * cols + dc];
        if (isLand[idx + dr * cols + dc]) { sum += v; n++; }
      }
    }
    if (n > 0) smoothed[idx] = sum / n;
  }
}

// --- Sous-échantillonnage 2x2 -> grille de sortie à OUT_CELL mètres ---

const outCols = cols / 2;
const outRows = rows / 2;
const out = new Float32Array(outCols * outRows);
for (let r = 0; r < outRows; r++) {
  for (let c = 0; c < outCols; c++) {
    const a = smoothed[(2 * r) * cols + 2 * c];
    const b = smoothed[(2 * r) * cols + 2 * c + 1];
    const cc = smoothed[(2 * r + 1) * cols + 2 * c];
    const d = smoothed[(2 * r + 1) * cols + 2 * c + 1];
    out[r * outCols + c] = (a + b + cc + d) / 4;
  }
}

// --- Stats de vérification ---

let min = Infinity, max = -Infinity, land = 0;
let sumX = 0, sumY = 0, minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let r = 0; r < outRows; r++) {
  for (let c = 0; c < outCols; c++) {
    const v = out[r * outCols + c];
    if (v < min) min = v;
    if (v > max) max = v;
    if (v >= COAST_LEVEL) {
      land++;
      const X = xMin + c * OUT_CELL;
      const Y = yMax - r * OUT_CELL;
      sumX += X; sumY += Y;
      if (X < minX) minX = X; if (X > maxX) maxX = X;
      if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
    }
  }
}
console.log('Origine LAMB93 de la fenêtre : X', center.x.toFixed(1), 'Y', center.y.toFixed(1));
console.log('Altitude min/max :', min.toFixed(2), '/', max.toFixed(2), 'm');
console.log('Cellules terre (>= ' + COAST_LEVEL + ' m) :', land, '/', outCols * outRows,
  '(' + (100 * land / (outCols * outRows)).toFixed(1) + ' %)');
console.log('BBox terre : X', minX.toFixed(0), '..', maxX.toFixed(0), ' Y', minY.toFixed(0), '..', maxY.toFixed(0));
console.log('Centroïde terre : X', (sumX / land).toFixed(1), 'Y', (sumY / land).toFixed(1),
  '(centre île : X', center.x.toFixed(1), 'Y', center.y.toFixed(1) + ')');

// --- Carte ASCII de la fenêtre (pour vérifier la forme de l'île) ---
// Chaque caractère = 2x4 cellules de sortie ; le nord est en haut.
console.log('\nCarte (N en haut, 1 car = 20 m x 40 m) :');
const CH_W = 2, CH_H = 4;
for (let br = 0; br < outRows / CH_H; br++) {
  let line = '';
  for (let bc = 0; bc < outCols / CH_W; bc++) {
    let sum = 0, n = 0;
    for (let dr = 0; dr < CH_H; dr++) {
      for (let dc = 0; dc < CH_W; dc++) {
        sum += out[(br * CH_H + dr) * outCols + (bc * CH_W + dc)];
        n++;
      }
    }
    const h = sum / n;
    line += h < COAST_LEVEL ? ' ' : h < 1.5 ? '.' : h < 8 ? ',' : h < 20 ? ':' : h < 35 ? 'o' : '#';
  }
  console.log(line);
}

// --- Écriture du JSON ---

const heightsB64 = Buffer.from(out.buffer, out.byteOffset, out.byteLength).toString('base64');
mkdirSync(dirname(OUT_FILE), { recursive: true });
// On écrit un .js (export default) plutôt qu'un .json pour éviter les
// attributs d'import JSON, compatibles partout (Vite + Node)
writeFileSync(OUT_FILE, '// Généré par scripts/build-embiez-data.mjs — ne pas éditer.\nexport default ' + JSON.stringify({
  origin: { x: center.x, y: center.y, lat: ISLE_LAT, lon: ISLE_LON },
  size: WINDOW_SIZE,
  cellSize: OUT_CELL,
  cols: outCols,
  rows: outRows,
  coastLevel: COAST_LEVEL,
  heightsB64,
}) + ';\n');
console.log('Écrit :', OUT_FILE, '(' + (heightsB64.length / 1024).toFixed(0), 'Ko base64 )');
