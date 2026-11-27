// Contrôles tactiles (smartphone) : activés uniquement sur écran tactile.
// - joystick virtuel à gauche -> injecte des faux keydown/keyup (ZQSD) dans Input
// - boutons à droite : TIR (mousedown), SAUT (Space), COURIR (Shift), E (véhicule)
// - glisser le doigt sur le canvas (hors boutons) -> onLook(dx, dy) pour la caméra
// Aucun changement dans Input : on lui envoie de vrais événements synthétiques.

const JOY_RADIUS = 44; // déplacement max du knob (px)
const DEAD = 0.22;     // zone morte du joystick

export class TouchControls {

  constructor() {
    // Tactile uniquement si le pointeur principal est "coarse" (doigt) :
    // évite de montrer l'UI sur un PC avec écran tactile (pointer: fine)
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.active = coarse && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    this.onLook = null; // callback (dx, dy) -> caméra
    if (!this.active) return;

    document.body.classList.add('touch');
    this.joy = document.getElementById('joystick');
    this.knob = document.getElementById('joystick-knob');
    this.joyTouch = null;
    this.joyKeys = [];
    this.lookTouch = null;
    this.lookLast = { x: 0, y: 0 };

    this.buildJoystick();
    this.buildButton('btn-fire', null, () => window.dispatchEvent(new MouseEvent('mousedown')), () => window.dispatchEvent(new MouseEvent('mouseup')));
    this.buildButton('btn-jump', 'Space');
    this.buildButton('btn-run', 'ShiftLeft');
    this.buildButton('btn-use', 'KeyE');

    // Glisser sur le canvas (pas sur un bouton) = regarder autour
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch) {
          e.preventDefault();
          if (this.onLook) this.onLook(t.clientX - this.lookLast.x, t.clientY - this.lookLast.y);
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: false });
    window.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        // si le toucher ne commence pas sur un contrôle UI -> c'est la caméra
        if (t.target === document.getElementById('game-canvas') && this.lookTouch === null) {
          this.lookTouch = t.identifier;
          this.lookLast = { x: t.clientX, y: t.clientY };
        }
      }
    }, { passive: true });
    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.lookTouch) this.lookTouch = null;
      }
    });
  }

  press(code) {
    window.dispatchEvent(new KeyboardEvent('keydown', { code }));
  }

  release(code) {
    window.dispatchEvent(new KeyboardEvent('keyup', { code }));
  }

  // Un bouton rond : keyCode optionnel (clavier) + callbacks tactiles (ex: tir)
  buildButton(id, code, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    const down = (e) => {
      e.preventDefault();
      if (code) this.press(code);
      if (onDown) onDown();
      el.style.background = 'rgba(255,255,255,0.45)';
    };
    const up = (e) => {
      e.preventDefault();
      if (code) this.release(code);
      if (onUp) onUp();
      el.style.background = '';
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
    el.addEventListener('mousedown', down); // test au clic souris aussi
    el.addEventListener('mouseup', up);
  }

  buildJoystick() {
    const joy = this.joy;
    const knob = this.knob;
    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const applyDir = (dx, dy) => {
      // direction -> touches ZQSD (f = avant, r = droite)
      const f = -dy / JOY_RADIUS;
      const r = dx / JOY_RADIUS;
      const want = [];
      if (f > DEAD) want.push('KeyW');
      if (f < -DEAD) want.push('KeyS');
      if (r > DEAD) want.push('KeyD');
      if (r < -DEAD) want.push('KeyA');
      for (const k of this.joyKeys) if (!want.includes(k)) this.release(k);
      for (const k of want) if (!this.joyKeys.includes(k)) this.press(k);
      this.joyKeys = want;
    };
    const reset = () => {
      for (const k of this.joyKeys) this.release(k);
      this.joyKeys = [];
      setKnob(0, 0);
    };

    joy.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      this.joyTouch = t.identifier;
      const rect = joy.getBoundingClientRect();
      this.joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== this.joyTouch) continue;
        e.preventDefault();
        let dx = t.clientX - this.joyCenter.x;
        let dy = t.clientY - this.joyCenter.y;
        const len = Math.hypot(dx, dy);
        if (len > JOY_RADIUS) { dx = (dx / len) * JOY_RADIUS; dy = (dy / len) * JOY_RADIUS; }
        setKnob(dx, dy);
        applyDir(dx, dy);
      }
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyTouch) { this.joyTouch = null; reset(); }
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }
}
