import { CONFIG } from '../config.js';

// Son 100 % procédural via WebAudio (aucune dépendance, aucun fichier audio) :
// - shoot()     : coup de feu (burst de bruit + grave qui tombe), one-shot
// - engineOn/ setEngine/ engineOff : moteur de voiture en boucle (pitch = vitesse)
// - heliOn/ setHeli/ heliOff       : rotor d'hélicoptère en boucle (bruit modulé
//   "wop wop" par un LFO carré ~11 Hz + grondement)
// Le AudioContext est débloqué au premier geste utilisateur (autoplay policy).

export class Sound {

  constructor() {
    this.cfg = CONFIG.sound;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    this.enabled = !!AC;
    if (!this.enabled) return; // pas de WebAudio (ex. test Node) : son désactivé
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.cfg.master;
    this.master.connect(this.ctx.destination);
    // Buffer de bruit blanc réutilisable (1 s)
    const len = Math.floor(this.ctx.sampleRate * 1);
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.engine = null; // nœuds du moteur tant qu'il tourne
    this.heli = null;   // nœuds du rotor tant qu'il tourne
    const unlock = () => this.resume();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.initMusic(); // musique de fond (fichier libre de droits)
  }

  // Musique de fond : élément HTMLAudio en boucle, démarrée au premier geste
  // utilisateur (autoplay policy des navigateurs). Fichier servi depuis public/.
  initMusic() {
    if (typeof Audio === 'undefined') return; // ex. test Node
    const base = (import.meta.env && import.meta.env.BASE_URL) || '/'; // base Vite ('/embiez-game/') ; '/' en test Node
    this.music = new Audio(base + this.cfg.musicFile);
    this.music.loop = true;
    this.music.volume = this.cfg.musicVolume;
    let started = false;
    const start = () => { if (started) return; started = true; this.music.play().catch(() => {}); };
    window.addEventListener('pointerdown', start, { once: true });
    window.addEventListener('keydown', start, { once: true });
  }

  resume() {
    if (this.enabled && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // --- Coup de feu one-shot. volume 0..1, distance en m (atténuation) ---
  shoot(volume = 1, distance = 0) {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const v = this.cfg.shootVolume * volume * Math.max(0, 1 - distance / 250);
    if (v <= 0.001) return;
    // Bruit sec filtré
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 0.2);
    // Grave qui tombe (le "boom")
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(v * 0.8, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g2); g2.connect(this.master);
    o.start(t); o.stop(t + 0.16);
  }

  // --- Moteur de voiture : boucle continue, allumée/éteinte ---
  engineOn() {
    if (!this.enabled || this.engine || !this.cfg.engine) return; // moteur désactivé par config
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    // Moteur thermique TRES GRAVE (pas de composante aiguë "électrique") :
    // sawtooth bas (28-63 Hz) + harmonique sine + bruit très filtré (lowpass
    // ~250 Hz), amplitude modulée en douceur par un LFO SINUS = les explosions
    // ("putt-putt" feutré), fréquence = régime (mise à jour dans setEngine)
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 30;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 60;
    const sub = ctx.createGain(); sub.gain.value = 0.6;
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuf; noise.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    const putter = ctx.createOscillator(); putter.type = 'sine'; putter.frequency.value = 7;
    const putterG = ctx.createGain(); putterG.gain.value = this.cfg.engineVolume * 0.5;
    putter.connect(putterG); putterG.connect(g.gain);
    o1.connect(g);
    o2.connect(sub); sub.connect(g);
    noise.connect(lp); lp.connect(ng); ng.connect(g);
    g.connect(this.master);
    o1.start(); o2.start(); noise.start(); putter.start();
    g.gain.linearRampToValueAtTime(this.cfg.engineVolume * 0.8, ctx.currentTime + 0.15);
    this.engine = { g, o1, o2, noise, lp, putter };
  }

  setEngine(rpm) { // rpm 0..1 (|speed| / maxSpeed)
    if (!this.engine) return;
    const f = 28 + rpm * 35; // 28..63 Hz : grave
    this.engine.o1.frequency.value = f;
    this.engine.o2.frequency.value = f * 2;
    this.engine.lp.frequency.value = 220 + rpm * 380;
    this.engine.putter.frequency.value = 6 + rpm * 22; // 6..28 Hz : explosions plus rapides avec le régime
  }

  engineOff() {
    if (!this.engine) return;
    const e = this.engine;
    this.engine = null;
    e.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.2);
    setTimeout(() => { try { e.o1.stop(); e.o2.stop(); e.noise.stop(); e.putter.stop(); } catch (_) { /* déjà stoppé */ } }, 300);
  }

  // --- Crash (hélicoptère qui s'écrase au sol) : grosse explosion ---
  crash() {
    if (!this.enabled) return;
    const t = this.ctx.currentTime;
    const v = this.cfg.crashVolume;
    // Boule de bruit grave qui s'effondre
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = 0.4;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.3);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 1.4);
    // Grave profond
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1.0);
    const g2 = this.ctx.createGain();
    g2.gain.setValueAtTime(v * 0.9, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    o.connect(g2); g2.connect(this.master);
    o.start(t); o.stop(t + 1.2);
    // Explosion secondaire (débris) 0.25 s plus tard
    const t2 = t + 0.25;
    const src2 = this.ctx.createBufferSource();
    src2.buffer = this.noiseBuf;
    src2.playbackRate.value = 0.9;
    const bp2 = this.ctx.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = 600; bp2.Q.value = 0.8;
    const g3 = this.ctx.createGain();
    g3.gain.setValueAtTime(v * 0.5, t2);
    g3.gain.exponentialRampToValueAtTime(0.001, t2 + 0.5);
    src2.connect(bp2); bp2.connect(g3); g3.connect(this.master);
    src2.start(t2); src2.stop(t2 + 0.6);
  }

  // --- Rotor d'hélicoptère : boucle continue, effet pale par LFO carré ---
  heliOn() {
    if (!this.enabled || this.heli) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    const noise = ctx.createBufferSource(); noise.buffer = this.noiseBuf; noise.loop = true;
    noise.playbackRate.value = 1.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const ng = ctx.createGain(); ng.gain.value = 1;
    // LFO carré ~11 Hz sur le gain du bruit = le "wop wop" des pales
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 11;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.5;
    lfo.connect(lfoG); lfoG.connect(ng.gain);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 65;
    const og = ctx.createGain(); og.gain.value = 0.25;
    noise.connect(lp); lp.connect(ng); ng.connect(g);
    o.connect(og); og.connect(g);
    g.connect(this.master);
    noise.start(); lfo.start(); o.start();
    this.heli = { g, noise, o, lfo };
  }

  setHeli(volume) { // 0..1 selon la distance à l'hélico
    if (!this.heli) return;
    this.heli.g.gain.value = this.cfg.heliVolume * Math.max(0, Math.min(1, volume));
  }

  heliOff() {
    if (!this.heli) return;
    const h = this.heli;
    this.heli = null;
    h.g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);
    setTimeout(() => { try { h.noise.stop(); h.o.stop(); h.lfo.stop(); } catch (_) { /* déjà stoppé */ } }, 400);
  }
}
