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
- [ ] Étape 1 : scène de base (ciel, mer, caméra)