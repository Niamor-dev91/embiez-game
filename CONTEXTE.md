# CONTEXTE DU PROJET

## Description
POC d'un jeu "GTA-like" FPS se déroulant sur l'île des Embiez (Var, France).
Style Wind Waker / GTA III : low-poly, couleurs vives, outline noir "toon",
brouillard de distance. Projet solo en vibecoding.

## Stack
- Three.js + Vite, JavaScript ES modules (pas de TypeScript), aucune dépendance ajoutée
- HUD en HTML/CSS simple (index.html), physique arcade maison
- Déploiement auto GitHub Pages (workflow GitHub Actions) :
  https://niamor-dev91.github.io/embiez-game/
- Dev local : `npx vite --port 5173 --strictPort` puis http://localhost:5173/embiez-game/
  (base Vite = `/embiez-game/`, voir vite.config.js)

## Règles de code (IMPORTANT)
- Toujours donner des FICHIERS COMPLETS, jamais d'extraits
- Un fichier = une responsabilité, fichiers courts et lisibles
- Tous les paramètres réglables dans `src/config.js` (objet CONFIG par thème)
- Commentaires en français, noms de variables en anglais
- Pas de nouvelle dépendance sans demande explicite
- `resources/` est gitignoré (données lourdes IGN/OSM)
- Lister clairement les fichiers modifiés ; **commit + push UNIQUEMENT sur demande explicite**
- Annoncer chaque commande shell avant de l'exécuter

## Structure
```
index.html            canvas plein écran + HUD (#hud, #gameover, #compass, #touch-ui)
src/main.js           point d'entrée, expose window.__game (debug console F12)
src/Game.js           classe Game : scène, boucle, HUD, véhicules, missions, boutique
src/config.js         CONFIG : tous les paramètres
src/world/            Terrain, Sea, Roads, Buildings, Vegetation, Ground, Pickups + data/
src/player/           Player, PlayerCamera (FPS + 3e pers véhicule), Revolver (view model)
src/vehicles/         Car (pick-up), Boat (voilier/moteur/jetski), Helicopter (civil),
                      PoliceHelicopter, TrafficCar
src/npc/              Npc (civils + policiers)
src/utils/            Input, TouchControls, Collisions, Combat, Humanoid, Outline,
                      Sound, DebugCamera, random (PRNG seeded)
scripts/              build-embiez-data.mjs (IGN -> embiez.js), build-embiez-osm.mjs (OSM -> embiez-osm.js), geo.js
public/music/         musique de fond + CREDITS.txt (servie telle quelle par Vite)
```

## Repères et conventions
- 1 unité = 1 m ; x = est, z = -nord (donc +z = sud), y = haut ; mer à y = 0
- Spawn : (-3, -349), quai du port
- Clavier : toujours `event.code` (KeyW = Z en AZERTY), jamais `event.key`
- Caméra : F8 bascule FPS joueur / caméra debug libre ; souris en pointer lock
- Debug console : `window.__game` (ex. `__game.tp(x, z)`, `__game.timeOfDay = 0` pour la nuit)

## Fonctionnalités actuelles
- **Terrain réel** de l'île (RGE ALTI 5 m IGN, 2000x2000 m) + décor OSM (routes, 160 bâtiments
  orientés avec fenêtres, 500 pins, 17 pontons solides) ; sol peint façon WW (sable < 3 m)
- **Joueur FPS** : revolver façon XIII (6 balles + stock 30, rechargement auto),
  ZQSD + Shift courir + Espace sauter, **nage** en eau profonde (> 1,55 m : tête à la
  surface, 3 m/s), PNJ style XIII (3 variantes dont 1 femme)
- **200 civils** sur les chemins OSM + **5 policiers** qui poursuivent et tirent si le
  joueur agresse un PNJ ; **2 voitures de trafic** ; collisions voiture/PNJ
- **Voiturette pick-up XIII** (20 m/s, portes vitrées, FPV conducteur à 2,5 m avec volant
  qui tourne, caméra qui revient sur l'axe de la voiture, phares la nuit, panne après 3 s
  dans l'eau) ; **3 bateaux** au port (voilier 10 / moteur 15 / jetski 24 m/s, modèles
  détaillés, joueur visible assis sur le jetski)
- **Hélicoptère civil pilotable** posé en colline (Shift/Space = monter/descendre, plafond
  150 m) ; s'il est quitté en l'air il **tombe au sol** ; **hélicoptère de police** (15 PV,
  tir en orbite si recherché, tombe et brûle à 0 PV, projecteur la nuit)
- **Cycle jour/nuit** 24 min (12 min jour / 12 min nuit, progressif) : soleil et lune
  visibles Est->Ouest, 400 étoiles la nuit, 1 fenêtre sur 5 allumée, phares des voitures
- **12 nuages** blancs dans le ciel qui apparaissent, grossissent, dérivent (0,67 m/s),
  rétrécissent et disparaissent (cycle 75-150 s)
- **Mission "Livraison de pastis"** : entrer dans la voiture lance un chrono de 90 s pour
  rejoindre un PNJ client à 200-500 m sur la même île (cylindre doré) ; succès = +100 €
- **Boutique** (grande maison au toit JAUNE PASTIS, porte dans le mur, plafond beige) :
  PNJ vendeur, E = gilet pare-balles 100 € -> 10 points de bouclier prioritaires sur les PV ;
  si pas assez d'€, le vendeur indique la direction du client de la mission (8 points cardinaux)
- **Pickups** : 10 boîtes de munitions (remplies le stock) + 10 bouteilles de pastis (+PV),
  + 1 de chaque près du spawn
- **Combat** : hitscan, policiers alertés, HUD "RECHERCHÉ", GAME OVER plein écran + R =
  restart complet (monde remis à zéro)
- **Commandes** : clavier + **manette Xbox** (Gamepad API, sticks, LT/LB courir, RT/RB tir)
  + **tactile smartphone** (joystick + boutons virtuels)
- **Son** : 100 % procédural WebAudio (tirs, rotor hélico, crash) dans src/utils/Sound.js,
  moteur de voiture désactivé (`sound.engine = false`) + **musique de fond** : Gymnopédie
  No. 1 de Satie (domaine public, Wikimedia Commons) en boucle, lancée au 1er clic/touche
- **Boussole** en bas à droite (cap caméra, N/E/S/O + degrés)

## Données géo (à regénérer si besoin)
- `resources/rgealti/` (IGN, gitignoré) -> `scripts/build-embiez-data.mjs` -> `src/world/data/embiez.js`
- `resources/export.geojson` (Overpass, gitignoré) -> `scripts/build-embiez-osm.mjs` -> `src/world/data/embiez-osm.js`
- Origine monde = centre de l'île : LAMB93 (926783.6, 6223507.2)

## Pièges & procédures (infos non évidentes dans le code)
- **Requête Overpass** (à coller dans https://overpass-turbo.eu, Run, Export > GeoJSON
  -> `resources/export.geojson`) : `[out:json][timeout:120];(way["highway"](43.055,5.765,43.095,5.800);way["building"](...);way["natural"](...);way["landuse"](...);way["leisure"](...);way["amenity"](...);way["man_made"](...);way["tourism"](...);node["natural"="tree"](...););out geom;`
  — le `out geom;` est indispensable (coords dans chaque way). Le script build-embiez-osm.mjs y renvoie.
- Fichiers en CRLF : les edits multi-lignes échouent parfois -> préférer lignes courtes ou sed par plages
- Tests Node : stubber `navigator` (read-only en Node 26), `window.addEventListener` capturant
  les listeners, `document.createElement('canvas')` avec contexte 2D factice ;
  `game = Object.create(Game.prototype)` + `initRenderer` stubbé + `CONFIG.terrain.paintResolution = 64`
- Son de voiture : moteur procédural volontairement désactivé (`sound.engine = false`, copyright GTA III)
