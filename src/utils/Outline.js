import * as THREE from 'three';

// Ajoute un outline "toon" noir autour de tous les meshes d'un objet :
// chaque mesh reçoit un clone en MeshBasicMaterial noir, side BackSide,
// légèrement plus gros. (Pour les objets animés, voir Humanoid qui
// synchronise les shells avec les membres.)
export function addOutline(obj, scale = 1.07, color = 0x101018) {
  const shell = new THREE.Group();
  obj.traverse((o) => {
    if (o.isMesh) {
      const m = new THREE.Mesh(
        o.geometry,
        new THREE.MeshBasicMaterial({ color, side: THREE.BackSide })
      );
      m.position.copy(o.position);
      m.rotation.copy(o.rotation);
      m.scale.copy(o.scale).multiplyScalar(scale);
      shell.add(m);
    }
  });
  obj.add(shell);
  return shell;
}
