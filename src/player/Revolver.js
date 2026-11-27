import * as THREE from 'three';

import { CONFIG } from '../config.js';

import { addOutline } from '../utils/Outline.js';

// Revolver du joueur en view model FPS (attaché à la caméra), style XIII :
// low-poly + couleurs vives + outline noir toon. 6 balles, rechargement
// automatique quand le chargeur est vide.

export class Revolver {

  constructor(scene, camera) {
    this.camera = camera;
    this.cfg = CONFIG.weapon.revolver;
    this.ammo = this.cfg.ammo;
    this.maxAmmo = this.cfg.ammo;
    this.reloading = 0; // temps de rechargement restant (s), 0 = prêt
    this.recoil = 0;    // 1 juste après un tir, redescend à 0
    this.group = this.buildMesh();
    camera.add(this.group);
    scene.add(camera); // la caméra doit être dans la scène pour voir le view model
  }

  // Construit le revolver low-poly (le canon pointe vers -Z, comme la caméra)
  buildMesh() {
    const c = this.cfg.colors;
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: c.metal });
    const metalDark = new THREE.MeshLambertMaterial({ color: c.metalDark });
    const wood = new THREE.MeshLambertMaterial({ color: c.wood });

    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      g.add(m);
      return m;
    };

    // Carcasse (boîte centrale)
    add(new THREE.BoxGeometry(0.05, 0.09, 0.22), metal, 0, 0.01, -0.02);
    // Canon long (XIII : canon bien visible) + bouche
    add(new THREE.CylinderGeometry(0.016, 0.016, 0.26, 10), metal, 0, 0.035, -0.24, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 10), metalDark, 0, 0.035, -0.37, Math.PI / 2);
    // Barillet (cylindre épais au milieu)
    this.barillet = add(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 10), metalDark, 0, 0.01, -0.06, Math.PI / 2);
    // Guidon (petite pointe à l'avant du canon)
    add(new THREE.BoxGeometry(0.008, 0.02, 0.01), metalDark, 0, 0.062, -0.34);
    // Chien (petite pièce à l'arrière qui arme)
    add(new THREE.BoxGeometry(0.012, 0.03, 0.02), metalDark, 0, 0.045, 0.11);
    // Crosse en bois (inclinée vers le bas/arrière)
    add(new THREE.BoxGeometry(0.045, 0.13, 0.06), wood, 0, -0.07, 0.1, 0.35);
    // Détente (petite garde)
    add(new THREE.BoxGeometry(0.01, 0.03, 0.04), metalDark, 0, -0.045, 0.01);

    // Outline noir toon sur l'ensemble (style XIII)
    addOutline(g, 1.08, c.outline);

    // Position dans la vue (bas droite de l'écran)
    g.position.set(this.cfg.viewPos.x, this.cfg.viewPos.y, this.cfg.viewPos.z);
    g.rotation.y = -0.06;
    return g;
  }

  // Essaie de tirer : renvoie true si une balle part
  tryShoot() {
    if (this.reloading > 0) return false;
    if (this.ammo <= 0) {
      this.reloading = this.cfg.reloadTime; // chargeur vide -> rechargement auto
      return false;
    }
    this.ammo--;
    this.recoil = 1;
    if (this.ammo === 0) this.reloading = this.cfg.reloadTime;
    return true;
  }

  get isReloading() {
    return this.reloading > 0;
  }

  update(delta) {
    // Recul du tir (ressort)
    this.recoil = Math.max(0, this.recoil - delta * 5);
    const r = this.recoil * this.recoil;
    this.group.position.z = this.cfg.viewPos.z + r * this.cfg.kick;
    this.group.rotation.x = r * 0.14;

    // Rechargement : l'arme plonge et le barillet tourne
    if (this.reloading > 0) {
      this.reloading -= delta;
      const t = 1 - Math.max(0, this.reloading) / this.cfg.reloadTime; // 0 -> 1
      this.group.rotation.x += Math.sin(t * Math.PI) * 0.55;
      if (this.barillet) this.barillet.rotation.x += delta * 14;
      if (this.reloading <= 0) {
        this.reloading = 0;
        this.ammo = this.maxAmmo;
      }
    }
  }
}
