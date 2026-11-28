// Tous les paramètres réglables du jeu sont ici.

export const CONFIG = {

  // --- Son (WebAudio procédural, aucune dépendance — src/utils/Sound.js) ---
  sound: {
    master: 0.5,        // volume général
    shootVolume: 0.6,   // volume d'un coup de feu
    engine: false,      // son du moteur de voiture DÉSACTIVÉ (procédural peu convaincant ; pas d'asset GTA III embarquable, copyright)
    engineVolume: 0.18, // volume du moteur si réactivé (grave, en boucle quand on conduit)
    heliVolume: 0.5,    // volume du rotor d'hélicoptère (atténué avec la distance)
    crashVolume: 0.9,   // volume du crash de l'hélicoptère à l'impact
    musicFile: 'music/gymnopedie1.ogg', // musique de fond (libre de droits, voir public/music/CREDITS.txt)
    musicVolume: 0.3,   // volume de la musique de fond
  },

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
    clouds: {
      count: 12,        // nombre de nuages dans le ciel
      minAltitude: 130, // altitude min d'un nuage (m)
      maxAltitude: 220, // altitude max (m)
      spread: 700,      // demi-largeur de la zone de spawn autour du centre (m)
      minPeriod: 75,           // durée min du cycle (s, 3x plus lent)
      maxPeriod: 150,          // durée max du cycle (s, 3x plus lent)
      maxDelay: 90,            // attente max avant (re)apparition (s)
      windSpeed: 0.67,         // dérive lente vers l'est (m/s, 3x plus lent)
    },
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
    swimSpeed: 3,            // vitesse en nage (m/s)
    swimDepth: 1.55,         // profondeur min pour nager : tête à la surface (yeux à 1,62 m)
    spawn: { x: -3, z: -349 }, // quai du port de l'île, à côté des pontons (y calé sur le sol)
  },

  // --- Caméra du joueur (3e personne, orbite autour du perso) ---
  playerCamera: {
    distance: 6,             // distance derrière le véhicule (mètres, mode 3e pers. véhicule)
    height: 1.6,             // hauteur du point visé au-dessus des pieds (véhicule)
    eyeHeight: 1.62,         // hauteur des yeux du joueur en FPS (mètres)
    lerpSpeed: 10,           // vitesse du suivi adouci (véhicule)
    mouseSensitivity: 0.0025, // radians par pixel
    keyTurnSpeed: 2.5,       // radians par seconde (flèches)
    padSensitivity: 500,     // manette : "px/s" à fond de stick droit (caméra, pour tourner vite)
    minPitch: -1.45,         // FPS : on peut regarder en haut/bas
    maxPitch: 1.45,
    vehicleYawFollowDelay: 1.5, // en véhicule : s après le dernier mouvement de vue avant de re-suivre l'axe du véhicule
    vehicleYawLerp: 8,          // vitesse de rattrapage de l'axe du véhicule (1/s)
  },
  weapon: {
    revolver: {
      ammo: 6,               // balles dans le chargeur (revolver façon XIII)
      maxReserve: 30,        // stock de balles max du joueur (réserve)
      reloadTime: 1.8,       // rechargement automatique quand le chargeur est vide (s)
      cooldown: 0.5,         // secondes entre deux tirs
      kick: 0.09,            // recul du view model au tir (m)
      colors: {
        metal: 0x3a3f46,     // carcasse / canon
        metalDark: 0x23262b,  // barillet / chien
        wood: 0x7a5230,      // crosse
        outline: 0x101018,   // contour noir toon (style XIII)
      },
      viewPos: { x: 0.28, y: -0.26, z: -0.55 }, // position du view model dans la caméra
    },
  },

  // --- Voiturette électrique ---
  // --- voitures en circulation (trafic) ---
  traffic: {
    count: 2,                // nombre de voitures en circulation
    speed: 9,                // vitesse (m/s)
    minRoadLength: 100,      // seules les grosses routes de l'île (m)
    kinds: ['primary', 'secondary', 'unclassified', 'residential', 'service'],
    colors: [0xd84a2a, 0x2a6ad8], // rouge vif, bleu vif (style toon)
  },

  vehicle: {
    bodyColor: 0xf0c020,     // carrosserie jaune vif (pick-up façon XIII)
    cabinColor: 0x5a8fd0,    // vitres bleu soutenu
    chromeColor: 0xcccccc,   // calandre / pare-chocs
    headlightColor: 0xfff8c0, // phares
    driverEye: 2.5,          // hauteur des yeux du conducteur en FPV (m) — 1 m plus haut que le siège
    driverForward: 0.35,     // décalage vers l'avant du poste de conduite (m)
    wheelRadius: 0.35,
    radius: 1.3,             // rayon de collision de la voiture
    maxSpeed: 20,            // m/s en avant
    maxReverseSpeed: 6,      // m/s en marche arrière
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

  // --- Hélicoptère civil pilotable (posé en haut d'une colline) ---
  heli: {
    parkMinDistance: 300,  // posé sur la colline la plus haute entre 300 et 700 m du spawn
    parkMaxDistance: 700,
    maxSpeed: 25,          // m/s en avant
    maxReverseSpeed: 6,
    acceleration: 10,
    brake: 8,
    friction: 2,
    turnSpeed: 1.6,        // rad/s (A/D)
    climbSpeed: 8,         // m/s vertical max (Shift = monter, Space = descendre)
    climbAccel: 14,
    climbFriction: 6,      // retour au vol stationnaire sans input
    maxAltitude: 150,      // plafond de vol (m)
    fallGravity: 12,       // gravité de la chute quand on sort de l'hélico en l'air (m/s²)
    radius: 3,             // rayon de collision
    cameraDistance: 12,    // caméra 3e personne
    interactDistance: 4,   // E pour monter à bord
    colors: { body: 0xe8e8e8, dark: 0x8a2a2a, glass: 0x9fc8e8, stripe: 0xd84a2a, rotor: 0x222228, skid: 0x333338 },
  },

  // --- Bateaux du port (voilier, moteur, jetski) ---
  boat: {
    types: ['voilier', 'moteur', 'jetski'],

    maxSpeed: { voilier: 10, moteur: 15, jetski: 24 },       // m/s en avant (jetski > moteur > voilier)
    maxReverseSpeed: { voilier: 2.5, moteur: 4, jetski: 6 }, // m/s en marche arrière
    acceleration: 6,
    brake: 10,
    friction: 2.5,
    turnSpeed: { voilier: 1.0, moteur: 1.7, jetski: 2.6 },    // rad/s (jetski très maniable)
    interactDistance: { voilier: 5, moteur: 4.5, jetski: 3 }, // distance max pour monter avec E
    cameraDistance: { voilier: 15, moteur: 12, jetski: 7 },  // caméra 3e personne
    floatHeight: 0.35,       // hauteur de flottaison (le bateau ne coule pas)
    radius: { voilier: 4.2, moteur: 3.2, jetski: 1.3 }, // rayons de collision
    colors: {
      coque: 0xf5f2ea,       // coque du voilier (blanc cassé)
      pont: 0xb08a5e,        // pont en bois
      coqueMoteur: 0xf2f4f6, // coque du bateau à moteur (blanc)
      lisere: 0x1f6fb8,      // liseré bleu
      verre: 0x9fc8e8,       // vitres (bleu gris)
      jetski: 0xe83a2a,      // coque du jetski (rouge vif)
      selle: 0x26262c,       // selle / sièges (noir)
      noir: 0x1c1c22,
      voile: 0xfff8e0,
      mat: 0x8a6a4a,         // mât en bois
    },
  },

  // --- Combat (pistolet, points de vie) ---
  combat: {
    playerHp: 10,            // points de vie du joueur
    npcHp: 3,                // points de vie d'un PNJ
    policeHp: 5,             // points de vie du PNJ policier
    policeCount: 5,          // nombre de policiers (placés près du village)
    damagePerShot: 1,        // dégâts d'une balle
    playerFireRange: 120,    // portée du tir joueur (m)
    playerFireCooldown: 0.5, // secondes entre deux tirs du revolver (voir weapon.revolver.cooldown)
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

  // --- Hélicoptère de police (arrive quand le joueur est recherché) ---
  policeHeli: {
    hp: 15,                 // points de vie de l'hélicoptère
    spawnDistance: 260,     // distance d'apparition par rapport au joueur (m)
    spawnAltitude: 70,      // altitude de départ au-dessus du sol (m)
    hoverAltitude: 28,      // hauteur de vol au-dessus du sol (m)
    speed: 22,              // vitesse horizontale vers le joueur (m/s)
    orbitRadius: 7,         // rayon de l'orbite autour du joueur (m)
    orbitSpeed: 0.45,       // vitesse angulaire de l'orbite (rad/s)
    fireInterval: 1.0,      // secondes entre deux rafales
    range: 160,             // portée de tir (m)
    hitChance: 0.35,        // probabilité de toucher le joueur par rafale
    damage: 1,              // dégâts d'une rafale sur le joueur
    targetRadius: 2.6,      // rayon de la cible pour le tir du joueur (m)
    fallGravity: 12,        // gravité pendant la chute (m/s²)
    burnDuration: 20,       // durée du feu au sol avant disparition (s)
    redeployDelay: 45,      // délai avant un nouvel hélicoptère si toujours recherché (s)
    searchlightIntensity: 400, // projecteur de recherche la nuit (candela)
    colors: {
      body: 0x2a4a8a,       // fuselage bleu police
      dark: 0x1a2a4a,       // queue / dérive
      glass: 0x9fc8e8,      // vitres
      stripe: 0xffffff,     // bande blanche
      rotor: 0x222228,      // pales du rotor
      skid: 0x333338,       // patins
      beacon: 0xff2a2a,     // gyrophare
    },
  },

  // --- Mission "Livraison de pastis" (déclenchée en prenant la voiturette) ---
  mission: {
    duration: 90,          // temps pour livrer le pastis (secondes) : 1 min 30
    reward: 100,           // euros gagnés si la mission est réussie (player.money)
    deliverDistance: 10,   // la voiture doit être à moins de ça du client (m)
    markerColor: 0xffc040, // cylindre lumineux translucide autour du client
    markerRadius: 10,      // rayon du cylindre (= deliverDistance, visible de loin)
    markerHeight: 9,       // hauteur du cylindre (m)
    markerOpacity: 0.3,
    clientMinDistance: 200, // le client est placé entre 200 et 500 m du spawn...
    clientMaxDistance: 500, // ...sur la même masse terrestre (pas d'eau entre les deux)
  },
  missionHeli: {
    duration: 60,          // 1 minute pour livrer le pastis en hélicoptère
    reward: 10000,         // $ gagnés si la mission est réussie (player.money)
    deliverDistance: 12,   // distance 3D max hélico <-> client (m)
    islandMinDistance: 400, // le PNJ client attend sur une petite île entre 400 et 1000 m de l'hélico
    islandMaxDistance: 1000,
    islandMaxSize: 120,    // "petite" île : largeur max (m)
    clearRadius: 6,        // rayon autour du client île où on enlève un rocher (m)
    markerColor: 0x40e0d0, // cylindre TURQUOISE (différent du doré de la mission voiture)
    markerRadius: 12,
    markerHeight: 12,
    markerOpacity: 0.3,
  },

  // --- Boutique du port (grande maison avec porte + PNJ vendeur) ---
  shop: {
    houseMaxDistance: 150, // la boutique = la plus grande maison à moins de ça du spawn (m)
    doorWidth: 1.2,        // largeur de l'ouverture (m) — la voiture (rayon 1.3 m) ne passe pas
    doorHeight: 2.2,
    wallThickness: 0.35,   // épaisseur des murs de la boutique (collision)
    doorColor: 0x6a4a2a,   // porte en bois marron, DANS l'axe du mur
    doorOffset: -1.3,      // décalage de la porte le long du mur : 1,30 m vers la DROITE vu de l'extérieur (niveau fenêtre)
    interiorCeilColor: 0xf2e3c2,  // plafond beige à l'intérieur (sous le toit, au-dessus du joueur)
    roofColor: 0xffd23a,   // toit JAUNE PASTIS de la boutique (repérable de loin)
    price: 100,            // prix du gilet pare-balles (€)
    armor: 10,             // points de bouclier donnés par le gilet (prioritaires sur les PV)
    interactDistance: 2.5, // distance max au vendeur pour acheter avec E (m)
    keeperColors: { body: 0x2a8a5a, head: 0xd8a880, legs: 0x2a2a2a, arms: 0x2a8a5a }, // look vendeur (vert)
  },

  // --- PNJ (touristes qui marchent sur les routes OSM) ---
  npc: {
    count: 200,              // nombre de PNJ (chacun sur un chemin OSM ; ~20 meshes/PNJ, max raisonnable avant instancing)
    roadMinSpacing: 30,      // espacement min entre les chemins des PNJ (m) : plus petit = plus de trajets différents, moins de croisements
    walkSpeed: 2,            // mètres par seconde
    radius: 0.35,            // rayon de collision
    // 3 variations de civils (style XIII : couleurs vives + outline noir),
    // la n°2 est une femme (cheveux longs + jupe)
    variants: [
      { style: 'man',   hair: 0x1a1a1a, skin: 0xd8a880, top: 0xe8a03a, legs: 0x3a3a3a },
      { style: 'man',   hair: 0xc8a040, skin: 0xe0b090, top: 0x3a9a5a, legs: 0x4a3a2a },
      { style: 'woman', hair: 0x5a3a1a, skin: 0xd8a880, top: 0xd84a8a, legs: 0xd8c8b8, skirt: 0x8a2a5a },
    ],
    policeColors: {          // look du policier : bleu foncé
      body: 0x1a2a6a,
      head: 0xd8a880,
      legs: 0x14142a,
      arms: 0x1a2a6a,
    },
  },

  // --- Cycle jour/nuit : 12 min de soleil + 12 min de lune ---
  dayNight: {
    dayMinutes: 12,
    nightMinutes: 12,
    dayStartHour: 8,         // le soleil se lève à 8h (horizon Est)
    sunArcPower: 0.63,       // arc Est->Ouest tel qu'à 12h le soleil est au zénith, à 20h à l'Ouest
    skyDay: 0x55b8ff,        // ciel jour (bleu vif, actuel)
    skyNight: 0x0a1230,      // ciel nuit
    seaNight: 0x0a2a4a,      // mer la nuit
    sunDay: 0xfff2d8,        // soleil (chaud)
    sunNight: 0x8899ff,      // lune (froid)
    sunDayIntensity: 1.0,
    sunNightIntensity: 0.35,
    ambientDay: 0.8,
    ambientNight: 0.25,
    headlightIntensity: 120, // phares de voiture (SpotLight, candela)
  },

  // --- Pickups (munitions + pastis) ---
  pickups: {
    ammoCount: 10,           // boîtes de munitions sur la map (rechargent le revolver)
    healCount: 10,           // bouteilles de pastis sur la map (soignent le joueur)
    pickupDistance: 1.4,     // distance de ramassage (m)
    respawnTime: 30,         // réapparition après ramassage (s)
    healAmount: 3,           // PV rendus par une bouteille de pastis
    ammoBoxAmount: 12,       // balles ajoutées au stock par une boîte de munitions
    ammoColor: 0x5a6a3a,     // boîte de munitions kaki
    ammoTrim: 0xd8c832,      // couvercle jaune
    bottleGlass: 0x4a8a5a,   // verre vert de la bouteille
    bottleColor: 0xd8a83a,   // liquide ambré (pastis)
    // pickups fixes placés près du spawn (dx/dz en mètres) pour tester facilement
    nearSpawn: [
      { kind: 'ammo', dx: 4, dz: 3 },
      { kind: 'heal', dx: -4, dz: -4 }, // de l'autre côté du spawn, loin de la voiturette garée
    ],
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
    trunkColliderSize: 0.5,  // boîte de collision carrée autour de chaque tronc de pin (m)
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
