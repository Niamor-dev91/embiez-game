// Tous les paramètres réglables du jeu sont ici.

export const CONFIG = {

  // --- Rendu ---
  render: {
    maxPixelRatio: 1,        // limité à 1 pour le rendu rétro pixelisé
    antialias: false,        // pas d'antialiasing volontairement
  },

  // --- Ciel et brouillard ---
  sky: {
    color: 0x55b8ff,         // bleu vif (style Wind Waker)
    fogNear: 300,            // distance où le brouillard commence
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
    color: 0x2fa8e8,         // bleu vif uni (matériau basic, plus de gris au port)
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
      body: 0x3aa03a,        // vert vif (style Link)
      head: 0xd8a880,
      legs: 0x2a2a2a,
      arms: 0x3aa03a,
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
    bodyColor: 0xf0c020,     // carrosserie jaune vif
    cabinColor: 0xfff0a0,    // habitacle
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
    tiltSpeed: 10,           // vitesse de lissage de l'inclinaison sur le terrain
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
    floatHeight: 0.35,       // hauteur de flottaison (le bateau ne coule pas)
    radius: { voilier: 2.5, moteur: 1.6, jetski: 1.1 }, // rayons de collision
    colors: {
      coque: 0xffffff,
      voile: 0xfff8e0,
      coqueMoteur: 0x2fa8e8,
      jetski: 0xf08020,
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
      body: 0xe8a03a,        // orange vif
      head: 0xd8a880,
      legs: 0x3a3a3a,
      arms: 0xe8a03a,
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
    buildingColors: { default: 0xfff2d8, church: 0xffffff, hotel: 0xffd9a0, retail: 0xcfe8ff }, // murs crème vif (style Wind Waker)
    roofColor: 0xd84a2a,       // toit rouge vif
    roofHeightFactor: 0.5,     // hauteur du toit = min(w, d) * ce facteur
    outlineColor: 0x101018,    // contour noir "toon"
    outlineScale: 1.06,        // la coquille noire dépasse de 6 %
    foundationMargin: 0.6,     // les murs des bâtiments s'enfoncent de 0.6 m sous le point le plus bas (pentes)
    rockColor: 0x8a8a8a,
    surfaceColors: { default: 0x777777, pitch: 0x4a7c3a, parking: 0x666666, swimming_pool: 0x3aa0c8, beach: 0xc2b280, marina: 0x2fa8e8 /* bassin du port en bleu mer, pas gris */ },
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
    paintResolution: 4096,   // texture du sol (fond recopié + routes peintes) : 1 px ~ 0.5 m
    beachHeight: 3,          // altitude max considérée comme plage (mètres) : sable dès le bord de mer
    rockHeight: 100,         // au-dessus du max de l'île (57 m) : jamais de zone vert foncé, herbe partout
    colorBlendWidth: 8,      // largeur du dégradé entre deux zones de couleur du sol (m)
    waterDepth: 6,           // profondeur des fonds marins hors données (mètres)
    colors: {
      sand: 0xecd9a0,        // plage (sable clair, façon Wind Waker) — aussi sous l'eau (caché par la mer opaque)
      grass: 0x7cc24f,       // herbe vert clair vif
      rock: 0x4e9e3e,        // hauteurs = vert soutenu (PAS de gris hors routes)
      seabed: 0x4fb0d8,      // fonds marins (sous la mer opaque, donc jamais visible)
    },
  },
};
