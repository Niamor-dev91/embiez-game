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
- Personnage à pied (3e personne)
- 1 voiturette électrique
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
- Caméra de debug libre (temporaire) : ZQSD + souris (pointer lock au clic)
  ou flèches, Espace/Ctrl = monter/descendre, Shift = rapide
- FOV 70, near 0.1, far 5000, rotation order 'YXZ'
- Position de départ : (0, 300, 900) — vue d'ensemble sur l'île
- La caméra de debug est extraite dans src/utils/DebugCamera.js
  (Game.js lui passe la caméra et appelle debugCamera.update(delta))

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
- src/world/data/embiez.js : données du terrain (généré, 208 Ko, commité)
- scripts/build-embiez-data.mjs : régénère src/world/data/embiez.js depuis
  les dalles ASC de resources/rgealti/ (resources/ est gitignoré)
- src/utils/DebugCamera.js : caméra libre de debug (ZQSD + souris/flèches)
- Dossiers prévus mais pas encore créés : player/, vehicles/, npc/

### Règle de configuration
- Tout paramètre réglable va dans CONFIG (src/config.js), regroupé par
  thème (render, sky, camera, sea, etc.)