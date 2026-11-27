// Gestion centralisée des entrées : clavier + souris + manette (Gamepad API,
// ex. Xbox 360/One) — on track les codes physiques (event.code), jamais
// event.key, pour que ça marche quel que soit le layout (AZERTY/QWERTY) :
// KeyW = Z, KeyA = Q, KeyS = S, KeyD = D sur un clavier AZERTY.
//
// Manette (mapping standard W3C "Xbox"), relue chaque frame par pollGamepad() :
//   stick gauche = ZQSD (déplacement à pied / conduite)
//   stick droit  = caméra (Input.lookX / lookY, consommé par PlayerCamera)
//   A (0) = saut (Space), B (1) = courir (Shift), X (2) = E (interagir),
//   View/Back (8) = R (respawn), RT (7) ou RB (5) = tir (clic souris)

const keys = {};
let mouseDown = false;
let pad = null; // première manette connectée, relue à chaque frame

// À appeler à chaque frame (Game.loop) : lit les manettes connectées
export function pollGamepad() {
  pad = null;
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
  for (const g of navigator.getGamepads()) {
    if (g && g.connected) { pad = g; break; }
  }
}

const PAD_DEADZONE = 0.18; // zone morte des sticks

export const Input = {
  isDown(code) {
    if (keys[code] === true) return true;
    if (pad) {
      const b = pad.buttons;
      const ax = pad.axes;
      switch (code) {
        case 'KeyW': return ax[1] < -PAD_DEADZONE;
        case 'KeyS': return ax[1] > PAD_DEADZONE;
        case 'KeyA': return ax[0] < -PAD_DEADZONE;
        case 'KeyD': return ax[0] > PAD_DEADZONE;
        case 'Space': return !!(b[0] && b[0].pressed);     // A = saut
        case 'ShiftLeft':
        case 'ShiftRight': return !!(b[1] && b[1].pressed); // B = courir
        case 'KeyE': return !!(b[2] && b[2].pressed);       // X = interagir
        case 'KeyR': return !!(b[8] && b[8].pressed);       // View = respawn
        case 'KeyF': return !!(b[5] && b[5].pressed);       // RB = tirer
      }
    }
    return false;
  },
  get mouseDown() {
    if (mouseDown) return true;
    if (pad) {
      return !!((pad.buttons[7] && pad.buttons[7].pressed)  // RT = tir
        || (pad.buttons[5] && pad.buttons[5].pressed));     // RB = tir
    }
    return false;
  },
  // Stick droit (caméra), -1..1 avec zone morte
  get lookX() {
    if (!pad) return 0;
    return Math.abs(pad.axes[2]) > PAD_DEADZONE ? pad.axes[2] : 0;
  },
  get lookY() {
    if (!pad) return 0;
    return Math.abs(pad.axes[3]) > PAD_DEADZONE ? pad.axes[3] : 0;
  },
};

window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('mousedown', () => { mouseDown = true; });
window.addEventListener('mouseup', () => { mouseDown = false; });
