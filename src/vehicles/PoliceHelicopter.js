import * as THREE from 'three';

import { CONFIG } from '../config.js';

import { addOutline } from '../utils/Outline.js';

// Hélicoptère de police : appelé par Game quand le joueur est "recherché"
// (il a tiré sur un PNJ). Il arrive par les airs, vole en orbite au-dessus du
// joueur et lui tire des rafales. À 0 PV il tombe en vrille et prend feu au sol.

export class PoliceHelicopter {

  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground; // sol (terrain + pontons), interface heightAt/size
    this.isHelicopter = true; // cible reconnue par Game/Player (pas un PNJ)
    this.maxHp = CONFIG.policeHeli.hp;
    this.hp = this.maxHp;
    this.state = 'inactive'; // 'inactive' | 'active' | 'falling' | 'burning'
    this.pos = { x: 0, y: 0, z: 0 };
    this.vy = 0;
    this.yaw = 0;
    this.orbitAngle = 0;
    this.fireTimer = 0;
    this.burnTimer = 0;
    this.redeployTimer = 0;
    this.tracerTimer = 0;
    this.animT = 0;
    this.drift = { x: 0, z: 0 };
    this.sound = null; // Sound du jeu (mis par Game) : rafales de l'hélico
    this.group = this.buildMesh();
    this.group.visible = false;
    scene.add(this.group);
  }

  buildMesh() {
    const h = CONFIG.policeHeli;
    const c = h.colors;
    const g = new THREE.Group();
    g.rotation.order = 'YXZ';

    // Partie statique (avec outline toon) : fuselage, vitres, queue, patins
    const body = new THREE.Group();
    const matBody = new THREE.MeshLambertMaterial({ color: c.body });
    const matDark = new THREE.MeshLambertMaterial({ color: c.dark });
    const matGlass = new THREE.MeshLambertMaterial({ color: c.glass });
    const matStripe = new THREE.MeshLambertMaterial({ color: c.stripe });
    const matSkid = new THREE.MeshLambertMaterial({ color: c.skid });

    const fuselage = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 5.5), matBody);
    body.add(fuselage);
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.15, 1.7), matGlass);
    nose.position.set(0, -0.15, 2.75);
    body.add(nose);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.35, 3.4), matStripe);
    stripe.position.set(0, 0.3, -0.7);
    body.add(stripe);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 3.4), matDark);
    tail.position.set(0, 0.35, -4.2);
    body.add(tail);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.9), matDark);
    fin.position.set(0, 1.0, -5.5);
    body.add(fin);
    // Rotor de queue (statique)
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.25), matDark);
    tailRotor.position.set(0.32, 0.6, -5.7);
    body.add(tailRotor);
    // Patins d'atterrissage
    for (const x of [-0.85, 0.85]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 3.8), matSkid);
      skid.position.set(x, -1.15, 0);
      body.add(skid);
      for (const z of [1.3, -1.3]) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.75, 0.12), matSkid);
        strut.position.set(x, -0.72, z);
        body.add(strut);
      }
    }
    // Gyrophare rouge qui clignote
    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: c.beacon })
    );
    this.beacon.position.set(0, 0.95, 0.9);
    body.add(this.beacon);
    addOutline(body, 1.06, CONFIG.props.outlineColor);
    g.add(body);

    // Rotor principal : 4 pales qui tournent (hors outline)
    this.rotor = new THREE.Group();
    const matRotor = new THREE.MeshLambertMaterial({ color: c.rotor });
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.07, 0.32), matRotor);
      blade.rotation.y = (i * Math.PI) / 2;
      this.rotor.add(blade);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.35, 8), matRotor);
    this.rotor.add(hub);
    this.rotor.position.set(0, 1.05, 0);
    g.add(this.rotor);

    // Projecteur de recherche vers le bas (allumé la nuit)
    this.spot = new THREE.SpotLight(0xfff8e0, 0, 160, 0.5, 0.5, 1.2);
    this.spot.position.set(0, -0.6, 2.6);
    this.spot.target.position.set(0, -40, 10);
    g.add(this.spot, this.spot.target);

    // Trace de tir (ligne jaune, visible ~0.1 s)
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    this.tracer = new THREE.Line(tGeo, new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    g.add(this.tracer);

    // Feu (cônes orange/jaune + lumière + fumée), visible seulement en 'burning'
    this.fire = new THREE.Group();
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(1.3, 3.2, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6a00 })
    );
    flame.position.y = 1.6;
    const flameCore = new THREE.Mesh(
      new THREE.ConeGeometry(0.7, 2, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd23a })
    );
    flameCore.position.y = 1.1;
    this.fireLight = new THREE.PointLight(0xff7a20, 0, 45, 1.5);
    this.fireLight.position.y = 2.2;
    this.fire.add(flame, flameCore, this.fireLight);
    this.smoke = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x222226, transparent: true, opacity: 0.55 })
      );
      this.fire.add(m);
      this.smoke.push(m);
    }
    this.fire.visible = false;
    g.add(this.fire);

    return g;
  }

  // Apparaît dans les airs à l'opposé du joueur et vole vers lui
  callIn(playerPos) {
    const h = CONFIG.policeHeli;
    this.hp = this.maxHp;
    this.state = 'active';
    this.group.visible = true;
    const a = Math.random() * Math.PI * 2;
    const half = this.ground.size / 2 - 60;
    this.pos.x = THREE.MathUtils.clamp(playerPos.x + Math.cos(a) * h.spawnDistance, -half, half);
    this.pos.z = THREE.MathUtils.clamp(playerPos.z + Math.sin(a) * h.spawnDistance, -half, half);
    this.pos.y = Math.max(this.ground.heightAt(this.pos.x, this.pos.z), 0) + h.spawnAltitude;
    this.vy = 0;
    this.orbitAngle = Math.atan2(playerPos.z - this.pos.z, playerPos.x - this.pos.x);
    this.yaw = this.orbitAngle;
    this.fireTimer = h.fireInterval * 1.5; // latence avant la première rafale
    this.drift.x = 0;
    this.drift.z = 0;
    this.group.rotation.set(0, this.yaw, 0);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
  }

  takeDamage(dmg) {
    if (this.state !== 'active') return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'falling';
      this.vy = 0;
      // Vitesse horizontale au moment de l'impact = dérive pendant la chute
      this.drift.x = Math.sin(this.yaw) * 6;
      this.drift.z = Math.cos(this.yaw) * 6;
    }
  }

  // L'hélicoptère quitte la scène (détruit ou recherche levée) ; un nouvel
  // hélicoptère pourra arriver après redeployDelay si le joueur est toujours
  // recherché.
  despawn() {
    this.state = 'inactive';
    this.group.visible = false;
    this.fire.visible = false;
    this.hp = this.maxHp;
    this.redeployTimer = CONFIG.policeHeli.redeployDelay;
    this.group.rotation.set(0, 0, 0);
  }

  setSearchlight(on) {
    this.spot.intensity = on ? CONFIG.policeHeli.searchlightIntensity : 0;
  }

  // Ligne de vue hélico -> joueur : aucun point du terrain ne doit couper le segment
  hasLineOfSight(p) {
    const a = this.pos;
    const b = { x: p.x, y: p.y + 1.2, z: p.z };
    const N = 14;
    for (let i = 1; i < N; i++) {
      const t = i / N;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const z = a.z + (b.z - a.z) * t;
      if (this.ground.heightAt(x, z) > y - 0.5) return false;
    }
    return true;
  }

  // Trace jaune depuis le nez de l'hélico jusqu'au point d'impact
  showTracer(x, y, z) {
    const p = this.tracer.geometry.attributes.position;
    p.setXYZ(0, this.pos.x + Math.sin(this.yaw) * 3, this.pos.y - 0.3, this.pos.z + Math.cos(this.yaw) * 3);
    p.setXYZ(1, x, y, z);
    p.needsUpdate = true;
    this.tracer.visible = true;
    this.tracerTimer = 0.09;
  }

  update(delta, player, wanted) {
    this.animT += delta;
    switch (this.state) {
      case 'inactive':
        // Tant que le joueur est recherché, un nouvel hélicoptère finit par arriver
        if (wanted && player.alive) {
          this.redeployTimer -= delta;
          if (this.redeployTimer <= 0) this.callIn(player.group.position);
        }
        break;
      case 'active':
        this.updateActive(delta, player);
        break;
      case 'falling':
        this.updateFalling(delta);
        break;
      case 'burning':
        this.updateBurning(delta);
        break;
    }
    // Gyrophare qui clignote tant que l'hélico vole
    if (this.state === 'active') {
      this.beacon.material.color.setHex(
        Math.sin(this.animT * 12) > 0 ? CONFIG.policeHeli.colors.beacon : 0x550808
      );
    }
    // La trace de tir s'efface très vite
    if (this.tracerTimer > 0) {
      this.tracerTimer -= delta;
      if (this.tracerTimer <= 0) this.tracer.visible = false;
    }
  }

  updateActive(delta, player) {
    const h = CONFIG.policeHeli;
    const p = player.group.position;
    // Orbite autour du joueur
    this.orbitAngle += h.orbitSpeed * delta;
    const tx = p.x + Math.cos(this.orbitAngle) * h.orbitRadius;
    const tz = p.z + Math.sin(this.orbitAngle) * h.orbitRadius;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(h.speed * delta, d);
    this.pos.x += (dx / d) * step;
    this.pos.z += (dz / d) * step;
    // Hauteur de vol = hoverAltitude au-dessus du sol local
    const groundY = Math.max(this.ground.heightAt(this.pos.x, this.pos.z), 0);
    const targetY = groundY + h.hoverAltitude;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, 2.5 * delta);
    // Cap vers le joueur + inclinaison dans le sens du déplacement
    const targetYaw = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let dy = targetYaw - this.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.yaw += dy * Math.min(1, 4 * delta);
    const hv = step / Math.max(delta, 1e-6); // vitesse horizontale (m/s)
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = THREE.MathUtils.clamp(-hv * 0.015, -0.3, 0.3);
    this.group.rotation.z *= Math.max(0, 1 - 3 * delta);
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    // Rotor principal
    this.rotor.rotation.y += delta * 28;
    // Rafales sur le joueur
    this.fireTimer -= delta;
    if (this.fireTimer <= 0 && player.alive) {
      this.fireTimer = h.fireInterval;
      const dist = Math.hypot(p.x - this.pos.x, p.y + 1.2 - this.pos.y, p.z - this.pos.z);
      if (dist < h.range && this.hasLineOfSight(p)) {
        if (this.sound) this.sound.shoot(1, dist); // rafale de l'hélicoptère
        if (Math.random() < h.hitChance) {
          player.takeDamage(h.damage);
          this.showTracer(p.x, p.y + 1.0, p.z);
        } else {
          // La rafale passe à côté
          const ox = p.x + (Math.random() - 0.5) * 8;
          const oz = p.z + (Math.random() - 0.5) * 8;
          this.showTracer(ox, Math.max(this.ground.heightAt(ox, oz), 0) + 0.3, oz);
        }
      }
    }
  }

  // À 0 PV : chute en vrille jusqu'au sol (ou la surface de l'eau), puis feu
  updateFalling(delta) {
    const h = CONFIG.policeHeli;
    this.vy -= h.fallGravity * delta;
    this.pos.y += this.vy * delta;
    this.pos.x += this.drift.x * delta;
    this.pos.z += this.drift.z * delta;
    this.drift.x *= Math.max(0, 1 - 0.5 * delta);
    this.drift.z *= Math.max(0, 1 - 0.5 * delta);
    this.group.rotation.x += 4.5 * delta;
    this.group.rotation.z += 6 * delta;
    this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    const groundY = this.ground.heightAt(this.pos.x, this.pos.z);
    const floorY = Math.max(groundY, -0.5) + 1.2; // patins à 1.2 m sous le centre
    if (this.pos.y <= floorY) {
      this.pos.y = floorY;
      this.state = 'burning';
      if (this.sound) this.sound.crash(); // BOUM à l'impact au sol
      this.burnTimer = h.burnDuration;
      this.group.rotation.x = 0.2;
      this.group.rotation.z = 0.45;
      this.group.position.set(this.pos.x, this.pos.y, this.pos.z);
      this.fire.visible = true;
      this.fireLight.intensity = 50;
    }
  }

  updateBurning(delta) {
    this.burnTimer -= delta;
    // Flammes qui pulsent
    const s = 1 + Math.sin(this.animT * 18) * 0.25;
    this.fire.scale.set(s, 1 + Math.sin(this.animT * 23) * 0.3, s);
    this.fireLight.intensity = 40 + Math.sin(this.animT * 13) * 12;
    // Fumée noire qui monte en boucle
    for (let i = 0; i < this.smoke.length; i++) {
      const m = this.smoke[i];
      const t = (this.animT * 0.4 + i / this.smoke.length) % 1;
      m.position.set(
        Math.sin(i * 2.1) * (0.4 + t * 1.6),
        1.2 + t * 7,
        Math.cos(i * 1.7) * (0.4 + t * 1.6)
      );
      m.scale.setScalar(0.5 + t * 2.4);
      m.material.opacity = 0.55 * (1 - t);
    }
    if (this.burnTimer <= 0) this.despawn(); // l'épave disparaît
  }
}
