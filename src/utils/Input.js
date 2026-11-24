// Gestion centralisée du clavier.
// On track les codes physiques (event.code) et jamais event.key,
// pour que ça marche quel que soit le layout (AZERTY/QWERTY) :
// KeyW = Z, KeyA = Q, KeyS = S, KeyD = D sur un clavier AZERTY.

const keys = {};

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

export const Input = {
  isDown(code) {
    return keys[code] === true;
  },
};
