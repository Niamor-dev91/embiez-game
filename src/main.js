import { Game } from './Game.js';

// Point d'entrée : crée le jeu et le lance.
const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
game.start();
window.__game = game; // debug : inspecter le jeu depuis la console (F12)
// Bouton musique (bulle haut-parleur) : active / coupe la musique de fond.
// Sur mobile, le tap sur le bouton est un user gesture valide -> play() autorisé.
const btnMusic = document.getElementById('btn-music');
if (btnMusic) {
  const toggle = (e) => { e.preventDefault(); game.sound.toggleMusic(); };
  btnMusic.addEventListener('click', toggle);
  btnMusic.addEventListener('touchend', toggle, { passive: false });
}
