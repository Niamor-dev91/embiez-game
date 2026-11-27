import { Game } from './Game.js';

// Point d'entrée : crée le jeu et le lance.
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start();
window.__game = game; // debug : inspecter le jeu depuis la console (F12)