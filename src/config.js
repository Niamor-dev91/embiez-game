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
    fogNear: 200,            // distance où le brouillard commence
    fogFar: 2500,            // distance où tout est noyé dans le brouillard
  },

  // --- Caméra ---
  camera: {
    fov: 70,
    near: 0.1,
    far: 5000,
    startPosition: { x: 0, y: 300, z: 900 }, // vue d'ensemble sur l'île
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
    size: 4000,              // taille du plan (mètres) — doit dépasser le terrain
    segments: 40,            // subdivisions (peu = look low-poly)
    waveHeight: 0.25,        // amplitude des vagues
    waveSpeed: 1.2,          // vitesse de l'ondulation
    waveFrequency: 0.15,     // densité des vagues
  },

  // --- Terrain (île des Embiez, données RGE ALTI 5 m IGN) ---
  // Les données (src/world/data/embiez.json) sont générées par
  // scripts/build-embiez-data.mjs à partir des dalles ASC de resources/rgealti/
  terrain: {
    size: 2000,              // plan carré centré sur l'île (mètres)
    segments: 200,           // subdivisions du mesh (résolution 10 m)
    beachHeight: 1.5,        // altitude max considérée comme plage (mètres)
    rockHeight: 15,          // altitude à partir de laquelle c'est de la roche
    waterDepth: 6,           // profondeur des fonds marins hors données (mètres)
    colors: {
      sand: 0xc2b280,        // plage
      grass: 0x5d8a4a,       // végétation basse
      rock: 0x8a8a8a,        // hauteurs
      seabed: 0x3a6a8a,      // fonds marins
    },
  },
};
