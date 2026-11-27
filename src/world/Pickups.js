import * as THREE from 'three';

import { CONFIG } from '../config.js';

import osmData from './data/embiez-osm.js';

import { addOutline } from '../utils/Outline.js';

import { mulberry32 } from '../utils/random.js';

// Pickups posés sur la map (style toon, outline noir) :
// - boîtes de munitions (kind 'ammo') : rechargent le revolver à fond
// - bouteilles de pastis (kind 'heal') : rendent des PV au joueur
// Placées le long des routes OSM (seeded), ramassées au contact,
// invisibles pendant respawnTime puis elles réapparaissent.

export class Pickups {

  constructor(scene, ground) {
    this.scene = scene;
    this.ground = ground;
    this.list = [];
    const rand = mulberry32(777);
    this.spawn('ammo', CONFIG.pickups.ammoCount, rand);
    this.spawn('heal', CONFIG.pickups.healCount, rand);
  }

  spawn(kind, count, rand) {
    const p = CONFIG.pickups;
    const roads = osmData.roads.filter((r) => r.points.length >= 2);
    let placed = 0;
    let guard = 0;
    while (placed < count && guard++ < 1000) {
      const road = roads[Math.floor(rand() * roads.length)];
      const i = Math.floor(rand() * (road.points.length - 1));
      const t = rand();
      const [ax, az] = road.points[i];
      const [bx, bz] = road.points[i + 1];
      // point le long de la route, légèrement décalé sur le côté
      const x = ax + (bx - ax) * t + (rand() - 0.5) * 4;
      const z = az + (bz - az) * t + (rand() - 0.5) * 4;
      const y = this.ground.heightAt(x, z);
      if (y < 0.3) continue; // pas dans l'eau
      if (this.list.some((q) => Math.hypot(q.pos.x - x, q.pos.z - z) < 8)) continue; // espacés
      const mesh = kind === 'ammo' ? this.buildAmmoBox() : this.buildBottle();
      mesh.position.set(x, y + 0.2, z);
      mesh.rotation.y = rand() * Math.PI * 2;
      this.scene.add(mesh);
      this.list.push({ kind, mesh, pos: { x, z }, taken: 0 });
      placed++;
    }
    console.log('[Pickups] ' + kind + ' placés :', placed, '/', count);
  }

  // Boîte de munitions kaki + couvercle jaune
  buildAmmoBox() {
    const p = CONFIG.pickups;
    const g = new THREE.Group();
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.24, 0.3),
      new THREE.MeshLambertMaterial({ color: p.ammoColor })
    );
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.06, 0.32),
      new THREE.MeshLambertMaterial({ color: p.ammoTrim })
    );
    lid.position.y = 0.15;
    g.add(box, lid);
    addOutline(g, 1.08, CONFIG.props.outlineColor);
    return g;
  }

  // Bouteille de pastis : verre vert, liquide ambré, bouchon
  buildBottle() {
    const p = CONFIG.pickups;
    const g = new THREE.Group();
    const glassMat = new THREE.MeshLambertMaterial({ color: p.bottleGlass, transparent: true, opacity: 0.85 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.35, 8), glassMat);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.12, 8), glassMat);
    neck.position.y = 0.23;
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8),
      new THREE.MeshLambertMaterial({ color: 0xc8b060 })
    );
    cap.position.y = 0.31;
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.095, 0.22, 8),
      new THREE.MeshLambertMaterial({ color: p.bottleColor })
    );
    liquid.position.y = -0.04;
    g.add(body, neck, cap, liquid);
    addOutline(g, 1.08, CONFIG.props.outlineColor);
    return g;
  }

  // Ramassage au contact + respawn. Renvoie un message HUD ou null.
  update(delta, playerPos, player, revolver) {
    const p = CONFIG.pickups;
    let msg = null;
    for (const it of this.list) {
      if (it.taken > 0) {
        it.taken -= delta;
        if (it.taken <= 0) {
          it.taken = 0;
          it.mesh.visible = true; // réapparition
        }
        continue;
      }
      const d = Math.hypot(playerPos.x - it.pos.x, playerPos.z - it.pos.z);
      if (d >= p.pickupDistance) continue;
      if (it.kind === 'ammo') {
        revolver.ammo = revolver.maxAmmo;
        revolver.reloading = 0;
        msg = 'Munitions ! Revolver rechargé (' + revolver.ammo + '/' + revolver.maxAmmo + ')';
      } else {
        const before = player.hp;
        player.hp = Math.min(CONFIG.combat.playerHp, player.hp + p.healAmount);
        msg = 'Pastis ! +' + (player.hp - before) + ' PV (' + player.hp + '/' + CONFIG.combat.playerHp + ')';
      }
      it.taken = p.respawnTime;
      it.mesh.visible = false;
    }
    return msg;
  }
}
