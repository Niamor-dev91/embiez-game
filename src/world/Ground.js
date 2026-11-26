// Sol solide du jeu : le terrain (MNT IGN) + les pontons du port, qui
// flottent à 0.35 m au-dessus de l'eau. Le joueur, la voiture et les PNJ
// marchent/roulent DESSUS au lieu de passer à travers.
// Même interface que Terrain (heightAt + size).

export class Ground {

  constructor(terrain, roads) {
    this.terrain = terrain;
    this.roads = roads;
  }

  get size() {
    return this.terrain.size;
  }

  heightAt(x, z) {
    let h = this.terrain.heightAt(x, z);
    const pier = this.roads.pierHeightAt(x, z);
    if (pier !== null && pier > h) h = pier;
    return h;
  }
}
