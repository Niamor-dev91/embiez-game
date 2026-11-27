# CONTEXTE DU PROJET

## Description
POC d'un jeu "GTA-like" minimaliste se déroulant sur l'île des Embiez
(Six-Fours-les-Plages, France). Graphismes style GTA III (low-poly,
textures basse résolution, filtrage nearest, brouillard de distance).
Projet solo, développé en vibecoding.

## Stack
- Three.js + Vite, JavaScript ES modules (pas de TypeScript)
- Pas de framework UI, HUD en HTML/CSS simple
- Physique arcade maison (pas de moteur physique pour l'instant)

## Contenu prévu
- [x] Personnage à pied (3e personne)
- [x] Décor réel de l'île (routes, bâtiments, arbres, port) — données OpenStreetMap
- [x] 1 voiturette électrique
- 1 voilier, 1 bateau à moteur, 1 jetski
- Quelques touristes PNJ
- Pas de missions pour l'instant

## Règles de code (IMPORTANT)
- Toujours me donner des FICHIERS COMPLETS, jamais d'extraits
- Un fichier = une responsabilité, fichiers courts et lisibles
- Tous les paramètres réglables (vitesses, gravité...) dans src/config.js
- Commentaires en français, noms de variables en anglais
- Code simple et lisible, pas de sur-ingénierie
- Ne pas ajouter de dépendances sans me demander
- Si tu modifies plusieurs fichiers, liste-les clairement

## Structure
src/main.js, src/Game.js, src/config.js,
src/world/, src/player/, src/vehicles/, src/npc/, src/utils/

## État d'avancement
- [x] Étape 1 : scène Three.js de base (mer, ciel, caméra libre, cube de test)
- [x] Étape 2 : terrain RÉEL de l'île des Embiez (données RGE ALTI 5 m IGN, voir section Données géo)
- [x] Étape 3 : personnage à pied en 3e personne (déplacement, saut, caméra orbitale)
- [x] Étape 4 : décor réel de l'île depuis OpenStreetMap (211 routes, 164 bâtiments, 17 pontons, 3 forêts, 11 rochers, 26 surfaces)
- [x] Étape 5 : voiturette électrique (E pour entrer/sortir, conduite arcade ZQSD)
- [x] Étape 6 : voilier, bateau à moteur, jetski au port (montables avec E, s'arrêtent à la côte)
- [~] Étape 7 : PNJ touristes (1 PNJ qui marche sur une route OSM pour l'instant)

## Décisions techniques prises

### Conventions générales
- Échelle : 1 unité Three.js = 1 mètre
- Axes : Y = haut, X = droite, Z = avant (la caméra regarde vers -Z par défaut)
- Niveau de la mer : y = 0
- Clavier : toujours `event.code` (KeyW/KeyA/KeyS/KeyD = ZQSD en AZERTY),
  jamais `event.key`, pour que ça marche quel que soit le layout
- Delta time plafonné à 0.1 s dans la boucle de jeu

### Rendu (style rétro GTA III)
- Pas d'antialiasing, pixel ratio max = 1
- Ciel = couleur unie 0x87ceeb, pas de skybox
- Brouillard linéaire (THREE.Fog) de même couleur que le ciel,
  de 200 m à 2500 m (le terrain fait 2000 m de large, il faut voir l'île en entier)
- Matériaux : MeshLambertMaterial (pas de PBR), flatShading sur la mer
- Éclairage : AmbientLight (0.8) + DirectionalLight (1.0), sans ombres

### Mer
- Plan de 4000 x 4000 m centré sur (0, 0, 0), 40 x 40 segments
  (doit dépasser le terrain de 2000 m)
- Ondulation animée côté CPU (somme de 2 sinus), amplitude 0.25 m
- Couleur 0x1e6fa8
- Attention : si on augmente les segments, surveiller les perfs

### Sol solide (Ground)
- src/world/Ground.js : heightAt(x, z) = max(terrain MNT, pontons) —
  même interface que Terrain (heightAt + size), passé à Player, Car, Npc
  et PlayerCamera à la place du terrain
- Les 17 pontons OSM (man_made=pier) sont solides : Roads.pierHeightAt
  renvoie 0.35 m si le point est sur un segment de ponton (demi-largeur
  pierWidth/2 + 0.3 m) -> on marche / roule DESSUS au lieu de tomber dans l'eau

### Style Wind Waker (toon) — en cours, d'abord les bâtiments
- Bâtiments : murs = boîtes ORIENTÉES (yaw réel du polygone OSM, calculé dans
  build-embiez-osm.mjs via le plus long côté ; 149/164 orientés) -> correction
  du problème d'axe autour du port ; couleurs vives par type (crème/blanc...)
- Outline "toon" : coquille noire (MeshBasicMaterial BackSide) 6 % plus grosse
  derrière chaque boîte (props.outlineColor/outlineScale)
- Toit = pyramide à 4 pans rouge vif (ConeGeometry 4 pans, props.roofColor)
- Tout en InstancedMesh : 3 draw calls pour les 160 bâtiments
- Sur les pentes, les murs descendent jusqu'au sol : base = min(heightAt des
  4 coins du bâtiment) - props.foundationMargin (0.6 m), le haut du mur et
  le toit restent à la même hauteur
- Collisions : OBB orientées (resolveCollisions gère c.yaw, test dans le
  repère local puis retour monde, convention three.js : local = R(-yaw)·monde,
  retour monde = R(+yaw)·local — signe opposé à l'avant, les colliders
  suivaient l'ancien axe axis-aligned)
- Étendu ensuite à tout le jeu (toon) :
  - Mer = MeshBasicMaterial couleur unie vive (sea.color 0x2fa8e8) -> plus
    grise à l'abri du port ; plus de computeVertexNormals (inutile en basic)
  - Ciel/brouillard bleu vif 0x55b8ff
  - Outline noir sur persos (shells synchronisés avec l'animation de marche,
    Humanoid.links), voiture et bateaux (addOutline dans src/utils/Outline.js)
  - Couleurs vives : joueur vert 0x3aa03a, PNJ orange, voiture jaune,
    bateaux blanc/bleu/orange
  - Bateaux flottent à boat.floatHeight = 0.35 m (ne coulent plus)

### Données géographiques (île des Embiez)
- Source : RGE ALTI 5 m de l'IGN, D083 (Var), livraison 2022-12-05, format ASC,
  projection LAMB93, altitudes IGN69. Archive 7z dans resources/ (gitignoré,
  570 Mo) ; seules les 9 dalles 5x5 km autour de l'île ont été extraites dans
  resources/rgealti/
- Centre de l'île : lat 43.074889101689216, lon 5.782911398742724
  -> LAMB93 X 926783.6, Y 6223507.2 (origine du monde du jeu)
- scripts/build-embiez-data.mjs assemble une fenêtre de 2000 x 2000 m centrée
  sur l'île, ajoute une bathymétrie procédurale (dilatation depuis le trait de
  côte, pente ~1:10, profondeur max 6 m), lisse la terre, sous-échantillonne à
  10 m (200 x 200) et écrit src/world/data/embiez.js (Float32Array en base64,
  208 Ko) — relancer ce script si on change resources/rgealti/

### Données OSM (décor de l'île, étape 4)
- Source : OpenStreetMap (données ouvertes) — PAS Google Maps (pas d'accès légal).
  La sandbox ne peut pas joindre overpass-api.de : l'export est téléchargé à la
  main et déposé dans resources/osm/ (gitignoré)
- Bbox de l'île + port + pointe du Brusc : lat 43.055..43.095, lon 5.765..5.800.
  Requête Overpass complète à coller dans https://overpass-turbo.eu (elle
  remplace tout le contenu, ne PAS laisser le {{bbox}} par défaut), puis
  Run, puis Export > GeoJSON, sauvegarder sous resources/export.geojson :
      [out:json][timeout:120];
      (
        way["highway"](43.055,5.765,43.095,5.800);
        way["building"](43.055,5.765,43.095,5.800);
        way["natural"](43.055,5.765,43.095,5.800);
        way["landuse"](43.055,5.765,43.095,5.800);
        way["leisure"](43.055,5.765,43.095,5.800);
        way["amenity"](43.055,5.765,43.095,5.800);
        way["man_made"](43.055,5.765,43.095,5.800);
        way["tourism"](43.055,5.765,43.095,5.800);
        node["natural"="tree"](43.055,5.765,43.095,5.800);
      );
      out geom;
  ("out geom;" est indispensable : il met les coordonnées dans chaque way)
- scripts/build-embiez-osm.mjs lit resources/export.geojson (GeoJSON) et
  écrit src/world/data/embiez-osm.js en coordonnées locales (origine =
  centre de l'île, x = est, z = -nord, voir scripts/geo.js) : routes,
  bâtiments (avec hauteur depuis tags height/building:levels), forêts,
  arbres, pontons, surfaces (pitch/parking/pool/beach), rochers
- Le décor est instancié en low-poly, posé sur le terrain via heightAt :
  - src/world/Terrain.js : texture du sol peinte (terrain.paintResolution =
    4096, ~0.5 m/px, NoColorSpace comme les anciens vertexColors) : le FOND
    recopie l'ancien rendu (interpolation bilinéaire des couleurs WW sur la
    grille du mesh : sable 0xecd9a0 sous beachHeight = 3 m — donc aussi sous
    l'eau, jamais de bleu visible sur terre ; herbe 0x7cc24f ; vert soutenu
    0x4e9e3e au-dessus de rockHeight, jamais de gris hors routes ; les
    changements de zone se font en DÉGRADÉ sur terrain.colorBlendWidth = 8 m
    centré sur chaque seuil), puis SEULES
    les routes sont peintes par-dessus
    (paintStroke en 2 passes : halo alpha 0.45 + trait plein, lineJoin/lineCap
    round -> bords adoucis, virages bouchés, aucun ruban 3D au-dessus du sol)
  - src/world/Roads.js : routes = peinture (createRoads) ; pontons = rubans
    bois mesh à y = 0.35 ; surfaces =
    polygones plats mesh colorés, SAUF marina (ignorée : le port est couvert
    par le plan mer bleu uni — un mesh marina créait un port plus foncé et
    une fine bande bleue au bord)
  - src/world/Buildings.js : bâtiments = boîte + toit (matériau array,
    groupe +Y = toit), rochers = icosaèdres aplatis
  - src/world/Vegetation.js : pins (tronc + 2 cônes en InstancedMesh)
    plantés dans les polygones landuse=forest (densité treeDensity,
    plafond treeMax, random seeded) + arbres OSM natural=tree

### Terrain (île des Embiez)
- Un seul mesh PlaneGeometry (2000 x 2000 m, 200 x 200 segments), hauteur lue
  dans la grille de données par interpolation bilinéaire (heightAt dans
  src/world/Terrain.js)
- Repère : x = est (LAMB93), z = -nord, origine = centre de l'île,
  1 unité = 1 mètre. Pas de rotation : les vraies coordonnées sont déjà orientées
- Le RGE ALTI met 0.00 sur la mer : seuil terre = 0.5 m dans le script,
  coastLevel = 0.0 pour l'affichage
- Couleurs par vertex selon l'altitude : fonds marins < coastLevel,
  sable < beachHeight (1.5 m), herbe < rockHeight (15 m), puis roche ;
  MeshLambertMaterial vertexColors + flatShading
- La mer (plan à y = 0) coupe le terrain : fonds marins à -6 m au-delà du rivage

### Caméra
- Deux caméras, bascule avec F8 : mode 'player' (défaut) ou 'debug'
- Caméra joueur (src/player/PlayerCamera.js) : FPS à pied (caméra aux yeux,
  playerCamera.eyeHeight, yaw/pitch souris pointer lock ou flèches, pitch
  libre [-1.45, 1.45]) ; 3e personne en véhicule (orbite, lerp, ne traverse
  pas le sol). En FPS le mesh du joueur est caché (visible = false).
  Game passe le yaw au joueur pour un déplacement relatif à la caméra
- Caméra de debug libre (src/utils/DebugCamera.js) : ZQSD + souris
  (pointer lock au clic) ou flèches, Espace/Ctrl = monter/descendre,
  Shift = rapide ; a un flag `enabled` pour coexister avec la caméra joueur
- FOV 70, near 0.1, far 5000, rotation order 'YXZ'
- Position de départ : (0, 300, 900) — vue d'ensemble sur l'île

### PNJ
- src/npc/Npc.js : PNJ qui marche le long d'un chemin OSM (routes + sentiers :
  pickRoads(count) choisit `count` chemins répartis sur l'île (longueur min
  50 m, espacés d'au moins 100 m), départ à une position aléatoire du chemin
  (seeded), demi-tour
  aux extrémités, posé sur le terrain (heightAt), bloqué par les bâtiments
- src/utils/random.js : PRNG seeded (mulberry32), partagé végétation/PNJ
- Mesh humanoïde partagé avec le joueur : src/utils/Humanoid.js
  (createHumanoid + setWalkAnimation), style XIII comic toon : outline noir,
  3 variations de civils (npc.variants : 2 hommes + 1 femme avec cheveux
  longs, jupe et taille fine) + yeux noirs ; chaque civil prend
  variant = seed % 3, les policiers gardent leur look bleu foncé
- Game instancie CONFIG.npc.count PNJ (40 par défaut), chacun sur un chemin
  différent avec un départ aléatoire ; update dans les deux modes
  (player/debug), avec le joueur passé en paramètre : le PNJ est repoussé
  si le joueur le percute

### Voiturette électrique (étape 5)
- src/vehicles/Car.js : caisse + habitacle + 4 roues (qui tournent),
  conduite arcade (W accélère, S frein/marche arrière, A/D tourne seulement
  si ça roule), sol via heightAt, collisions bâtiments, limites du monde
- Garée via nearestRoadPoint(spawn) = point de route OSM le plus proche
- Touche E (front montant) pour entrer/sortir si proche (< interactDistance) ;
  en voiture le joueur est caché et PlayerCamera.target = la voiture
  (distance vehicle.cameraDistance) ; en sortant le joueur réapparaît à côté
- Le joueur à pied ne traverse pas la voiture (resolveCircleVsCircle)
- Collisions voiture <-> PNJ (dans Game) : -1 PV au PNJ avec cooldown
  (vehicle.npcHitCooldown = 1 s), le PNJ est écarté et fuit/meurt normalement
- Panne : si la voiture reste plus de vehicle.waterPanneTime (3 s) dans l'eau
  (heightAt < 0), elle est en panne (broken) : speed = 0, HUD « PANNE ! »
- HUD : « E : prendre la voiturette » près de la voiture, « ZQSD = conduire » dedans
- La caisse suit la pente du terrain : pitch/roll calculés depuis heightAt
  échantillonné devant/derrière (±1.6 m) et droite/gauche (±0.8 m), lissés avec
  vehicle.tiltSpeed, rotation.order 'YXZ' (montée = nez en haut, rotation.x < 0)

### Bateaux du port (étape 6)
- src/vehicles/Boat.js : Boat(type = voilier|moteur|jetski), mesh low-poly
  par type, amarrage via dockSpots (un bateau par ponton OSM, côté eau)
- Conduite sur l'eau ZQSD ; le bateau s'ARRÊTE au contact de la terre ou
  d'un ponton : si ground.heightAt(nouvelle pos) >= 0, le déplacement est
  annulé et speed = 0
- Game gère un véhicule générique (this.vehicle = car ou boat) : E monte
  dans le véhicule le plus proche, caméra 3e personne dessus ; à pied le
  joueur ne traverse aucun véhicule

### Combat (pistolet, points de vie)
- src/utils/Combat.js : fireHitscan (droite origine+direction vs cibles,
  rayon targetRadius, portée) — le tir joueur part de la CAMÉRA vers le viseur
- Joueur : 10 PV (combat.playerHp), REVOLVER 6 balles façon XIII en view model
  FPS (src/player/Revolver.js, attaché à la caméra : carcasse/canon/barillet/
  crosse bois + outline noir toon, recul au tir, rechargement auto de 6
  balles en weapon.revolver.reloadTime quand le chargeur est vide), tir au
  clic souris ou F (cooldown weapon.revolver.cooldown), à pied uniquement ;
  HUD affiche 'Revolver : X/6' ou 'RECHARGEMENT…'
- PNJ : 3 PV ; touché -> state 'flee' (fuit le joueur à fleeSpeed, se calme
  à fleeDistance) ; à 0 PV -> allongé au sol (state 'dead')
- PNJ policier (combat.policeCount = 5, look bleu foncé npc.policeColors,
  placés via pickPoliceRoads sur les chemins les plus proches du centre =
  le village) : 5 PV, pistolet visible ; alerté
  quand le joueur tire sur un PNJ -> poursuit le joueur jusqu'à
  policeStopDistance puis tire (policeRange, policeHitChance,
  policeFireInterval) -> joueur -1 PV
- Mort du joueur : HUD 'KO ! R pour réapparaître', respawn au spawn avec PV max
- Pickups (src/world/Pickups.js) : pickups.ammoCount = 10 boîtes de munitions
  (rechargent le revolver à fond) + pickups.healCount = 10 bouteilles de pastis
  (+pickups.healAmount PV), posées le long des routes OSM (seeded, sur terre,
  espacées), ramassées au contact (< pickupDistance), réapparition après
  respawnTime (30 s) ; message temporaire dans le HUD (Game.notice)
- HUD : #hud affiche les PV + munitions + notices (index.html), viseur #crosshair au centre

### Collisions
- src/utils/Collisions.js : cercle (position + rayon) contre les OBB des
  bâtiments (buildColliders depuis Buildings.colliders, yaw conservé ;
  resolveCollisions pousse sur l'axe local de pénétration minimale,
  2 passes, rotation monde<->local selon le yaw réel du bâtiment)
- Le joueur a un rayon (player.radius = 0.35 m) ; le module est réutilisable
  tel quel pour les futurs PNJ et véhicules
- resolveCircleVsCircle(A, rA, B, rB) : pousse A hors de B (A cède) —
  utilisé pour la collision joueur <-> PNJ (le PNJ est repoussé)
- Le sol reste géré par terrain.heightAt (pas de collision verticale
  avec les bâtiments)

### Joueur (3e personne)
- src/player/Player.js : groupe de boîtes low-poly (jambes/bras animés
  à la marche), ZQSD relatif caméra, Shift = courir, Espace = sauter
- Physique arcade maison : gravité, saut, sol = terrain.heightAt(x, z),
  limites du monde = bords du terrain ; le spawn est calé sur le terrain
- Clavier centralisé dans src/utils/Input.js (event.code uniquement)

### Placeholders remplacés (étape 2)
- L'île de test (plan 40 x 40 m) et le cube rouge sont supprimés,
  remplacés par le vrai terrain de l'île (src/world/Terrain.js + données IGN)

### Fichiers existants
- index.html : canvas #game-canvas plein écran + div #hud (pointer-events: none)
- src/main.js : point d'entrée, instancie Game et le lance
- src/Game.js : renderer, scène, caméra, boucle d'animation, resize
  (délègue le monde à world/ et la caméra de debug à utils/)
- src/config.js : objet CONFIG exporté (render, sky, camera, debugCamera,
  sea, terrain)
- src/world/Sea.js : mer animée (plan ondulé CPU, somme de 2 sinus)
- src/world/Terrain.js : terrain réel de l'île (grille de hauteurs IGN,
  interpolation bilinéaire, couleurs par vertex)
- src/world/Roads.js : routes, pontons, surfaces au sol (rubans/plats)
- src/world/Ground.js : sol solide = terrain + pontons (heightAt + size)
- src/world/Buildings.js : bâtiments OSM orientés, style toon (InstancedMesh :
  murs colorés + outline noir + toit pyramidal rouge) et rochers
- src/world/Vegetation.js : pins en InstancedMesh dans les forêts OSM
- src/world/data/embiez.js : données du terrain (généré, commité)
- src/world/data/embiez-osm.js : données du décor OSM (généré, commité)
- scripts/geo.js : conversion WGS84 -> LAMB93 -> repère local (partagée)
- scripts/build-embiez-data.mjs : régénère embiez.js depuis les dalles ASC
  de resources/rgealti/ (à re-télécharger si besoin ; resources/ gitignoré)
- scripts/build-embiez-osm.mjs : régénère embiez-osm.js depuis
  resources/export.geojson
- src/utils/DebugCamera.js : caméra libre de debug (ZQSD + souris/flèches)
- src/utils/Input.js : clavier centralisé (event.code)
- src/utils/Collisions.js : collisions cercle vs AABB (bâtiments) + cercle vs cercle
- src/utils/Combat.js : tir hitscan (fireHitscan)
- src/vehicles/Car.js : voiturette électrique (conduite arcade)
- src/vehicles/Boat.js : voilier/moteur/jetski amarrés aux pontons
- src/player/PlayerCamera.js : cible switchable (joueur <-> voiture)
- src/utils/Humanoid.js : mesh humanoïde + outline synchronisé + pistolet
- src/utils/Outline.js : addOutline (coquille noire BackSide) pour objets statiques
- src/player/Player.js : personnage à pied (physique arcade)
- src/player/PlayerCamera.js : caméra 3e personne (orbite + lerp)
- Spawn au quai du port de l'île : player.spawn = (-3, -349), sol ~2 m,
  voiturette garée à 6 m, voilier/moteur/jetski amarrés à 26/49/84 m
- src/npc/Npc.js : PNJ qui marche sur un chemin OSM (40 PNJ répartis +
  policiers près du village via pickPoliceRoads)
- src/utils/random.js : PRNG seeded partagé (végétation, PNJ)
- src/utils/Humanoid.js : mesh humanoïde low-poly partagé (joueur + PNJ)
- Dossier prévu mais pas encore créé : (aucun — vehicles/ existe) ; reste : bateaux (voilier, moteur, jetski) au port

### Règle de configuration
- Tout paramètre réglable va dans CONFIG (src/config.js), regroupé par
  thème (render, sky, camera, sea, etc.)