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

  // --- Joueur (personnage à pied, 3e personne) ---
  player: {
    radius: 0.35,            // rayon de collision du perso (mètres)
    walkSpeed: 4,            // mètres par seconde
    runSpeed: 8,             // avec Shift
    turnSpeed: 12,           // vitesse de rotation du perso (rad/s)
    gravity: 25,             // mètres par seconde carrée
    jumpSpeed: 9,            // impulsion du saut (m/s)
    spawn: { x: -3, z: -349 }, // quai du port de l'île, à côté des pontons (y calé sur le sol)
    colors: {
      body: 0x3a6fd8,
      head: 0xd8a880,
      legs: 0x2a2a2a,
      arms: 0x3a6fd8,
    },
  },

  // --- Caméra du joueur (3e personne, orbite autour du perso) ---
  playerCamera: {
    distance: 6,             // distance derrière le joueur (mètres)
    height: 1.6,             // hauteur du point visé au-dessus des pieds
    lerpSpeed: 10,           // vitesse du suivi adouci
    mouseSensitivity: 0.0025, // radians par pixel
    keyTurnSpeed: 2.5,       // radians par seconde (flèches)
    minPitch: -0.2,
    maxPitch: 1.2,
  },

  // --- Voiturette électrique ---
  vehicle: {
    bodyColor: 0x3aa0d8,     // carrosserie
    cabinColor: 0x9ad4ee,    // habitacle
    wheelRadius: 0.35,
    radius: 1.3,             // rayon de collision de la voiture
    maxSpeed: 14,            // m/s en avant
    maxReverseSpeed: 5,      // m/s en marche arrière
    acceleration: 8,         // m/s²
    brake: 12,               // frein / marche arrière
    friction: 3,             // ralentissement naturel (m/s²)
    turnSpeed: 2.2,          // rad/s (à pleine vitesse)
    cameraDistance: 8,       // distance de la caméra en mode voiture
    interactDistance: 3,     // distance max pour entrer avec E
    waterPanneTime: 3,        // secondes dans l'eau avant la panne (s)
    npcHitCooldown: 1,       // secondes entre deux pertes de PV (voiture vs PNJ)
  },

  // --- Bateaux du port (voilier, moteur, jetski) ---
  boat: {
    types: ['voilier', 'moteur', 'jetski'],
    maxSpeed: 8,             // m/s en avant
    maxReverseSpeed: 3,      // m/s en marche arrière
    acceleration: 5,
    brake: 8,
    friction: 2,
    turnSpeed: 1.6,          // rad/s
    interactDistance: 3.5,   // distance max pour monter avec E
    cameraDistance: 9,
    radius: { voilier: 2.5, moteur: 1.6, jetski: 1.1 }, // rayons de collision
    colors: {
      coque: 0xe8e8e8,
      voile: 0xf5f5f0,
      coqueMoteur: 0x3aa0d8,
      jetski: 0xd8a03a,
      mat: 0x8a6a4a,
    },
  },

  // --- Combat (pistolet, points de vie) ---
  combat: {
    playerHp: 10,            // points de vie du joueur
    npcHp: 3,                // points de vie d'un PNJ
    policeHp: 5,             // points de vie du PNJ policier
    policeCount: 3,          // nombre de policiers (placés près du village)
    damagePerShot: 1,        // dégâts d'une balle
    playerFireRange: 120,    // portée du tir joueur (m)
    playerFireCooldown: 0.25, // secondes entre deux tirs du joueur
    targetRadius: 0.7,       // rayon de détection d'une cible (m)
    policeSpeed: 4.5,        // vitesse de poursuite du policier (m/s)
    policeStopDistance: 10,  // distance à laquelle il s'arrête pour tirer (m)
    policeRange: 25,         // portée de tir du policier (m)
    policeHitChance: 0.7,    // probabilité de toucher par balle
    policeFireInterval: 1.2, // secondes entre deux tirs du policier
    fleeSpeed: 5,            // vitesse de fuite d'un PNJ touché (m/s)
    fleeDistance: 50,        // distance à partir de laquelle le PNJ se calme (m)
    gunColor: 0x222222,
  },

  // --- PNJ (touristes qui marchent sur les routes OSM) ---
  npc: {
    count: 40,               // nombre de PNJ (chacun sur un chemin différent)
    walkSpeed: 2,            // mètres par seconde
    radius: 0.35,            // rayon de collision
    colors: {
      body: 0xd86a3a,
      head: 0xd8a880,
      legs: 0x3a3a3a,
      arms: 0xd86a3a,
    },
    policeColors: {          // look du policier : bleu foncé
      body: 0x1a2a6a,
      head: 0xd8a880,
      legs: 0x14142a,
      arms: 0x1a2a6a,
    },
  },

  // --- Décor (données OpenStreetMap, voir scripts/build-embiez-osm.mjs) ---
  props: {
    roadWidth: { secondary: 6, residential: 5, unclassified: 5, service: 3.5, pedestrian: 4, footway: 1.8, path: 1.8, steps: 1.8 },
    roadColor: 0x4a4a4a,       // routes goudronnées
    pathColor: 0x9a8f7a,       // petites allées
    pierColor: 0x8a6a4a,       // pontons en bois
    pierWidth: 3,
    buildingColors: { default: 0xd8d0c0, church: 0xf0ede0, hotel: 0xcbb890, retail: 0xb0b0b0 },
    roofColor: 0x8a4a3a,       // toit en tuiles
    rockColor: 0x8a8a8a,
    surfaceColors: { default: 0x777777, pitch: 0x4a7c3a, parking: 0x666666, swimming_pool: 0x3aa0c8, beach: 0xc2b280, marina: 0x666666 },
    treeDensity: 1 / 120,      // pins par m² dans les forêts OSM
    treeMax: 500,              // plafond de pins procéduraux
    trunkColor: 0x6a4a2a,
    pineColor: 0x2d5a2d,       // vert pin
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
