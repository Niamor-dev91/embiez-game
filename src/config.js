// Tous les paramètres réglables du jeu sont ici.

export const CONFIG = {
  // --- Rendu ---
  render: {
    maxPixelRatio: 1,        // limité à 1 pour le rendu rétro pixelisé
    antialias: false,        // pas d'antialiasing volontairement
  },

  // --- Ciel et brouillard ---
  sky: {
    color: 0x87ceeb,         // bleu clair
    fogNear: 40,             // distance où le brouillard commence
    fogFar: 250,             // distance où tout est noyé dans le brouillard
  },

  // --- Caméra ---
  camera: {
    fov: 70,
    near: 0.1,
    far: 500,
    startPosition: { x: 0, y: 6, z: 20 },
  },

  // --- Caméra libre de debug ---
  debugCamera: {
    moveSpeed: 15,           // mètres par seconde
    fastMultiplier: 3,       // multiplicateur avec Shift
    mouseSensitivity: 0.002, // radians par pixel
    keyTurnSpeed: 1.8,       // radians par seconde (flèches)
  },

  // --- Mer ---
  sea: {
    color: 0x1e6fa8,
    size: 2000,              // taille du plan (mètres)
    segments: 40,            // subdivisions (peu = look low-poly)
    waveHeight: 0.25,        // amplitude des vagues
    waveSpeed: 1.2,          // vitesse de l'ondulation
    waveFrequency: 0.15,     // densité des vagues
  },

  // --- Île de test ---
  island: {
    color: 0xc2b280,         // sable
    size: 40,                // plan carré de 40 m
    height: 0.5,             // altitude du plan au-dessus du niveau de la mer
  },

  // --- Cube de test ---
  testCube: {
    color: 0xff0000,
    size: 2,
  },
};