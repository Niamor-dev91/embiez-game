// Conversions géographiques partagées par les scripts de génération.
// Repère local du jeu : origine = centre de l'île des Embiez,
// x = est (LAMB93 X), z = -nord (LAMB93 Y), 1 unité = 1 mètre.

export const ISLE = { lat: 43.074889101689216, lon: 5.782911398742724 };

// WGS84 -> LAMB93 (formules officielles IGN, ellipsoïde GRS80)
export function lamb93(latDeg, lonDeg) {
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);
  const lon0 = 3 * Math.PI / 180;
  const lat0 = 46.5 * Math.PI / 180;
  const lat1 = 44 * Math.PI / 180;
  const lat2 = 49 * Math.PI / 180;
  const X0 = 700000;
  const Y0 = 6600000;
  const m = (p) => Math.cos(p) / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const t = (p) =>
    Math.tan(Math.PI / 4 - p / 2) /
    Math.pow((1 - e * Math.sin(p)) / (1 + e * Math.sin(p)), e / 2);
  const n = Math.log(m(lat1) / m(lat2)) / Math.log(t(lat1) / t(lat2));
  const F = m(lat1) / (n * Math.pow(t(lat1), n));
  const rho0 = a * F * Math.pow(t(lat0), n);
  const p = latDeg * Math.PI / 180;
  const l = lonDeg * Math.PI / 180;
  const rho = a * F * Math.pow(t(p), n);
  const th = n * (l - lon0);
  return { x: X0 + rho * Math.sin(th), y: Y0 + rho0 - rho * Math.cos(th) };
}

// Origine du monde en LAMB93 (centre de l'île)
export function isleOrigin() {
  return lamb93(ISLE.lat, ISLE.lon);
}

// WGS84 -> coordonnées locales du jeu (x = est, z = -nord)
export function latLonToLocal(lat, lon, origin) {
  const p = lamb93(lat, lon);
  return { x: p.x - origin.x, z: -(p.y - origin.y) };
}
