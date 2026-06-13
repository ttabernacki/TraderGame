import type { City } from "../game/types";

export const HOME_CITY_ID = "augsburg";

// Production and consumption rates in units/day at season multiplier 1.
//
// Manufactured goods (cloth, weapons, beer) are produced through chains —
// see PRODUCTION_CHAINS in economy.ts — and stall when the input good runs
// out in the city market. `consumes` lists civilian demand only; industrial
// input demand is implied by the chain.
//
// Seasonal goods (grain, wine, wool) concentrate their production in harvest
// months, so the listed rate is an annual average, not a daily constant.

export const CITIES: City[] = [
  {
    id: "augsburg",
    name: "Augsburg",
    lat: 48.37, lon: 10.90,
    region: "Swabia",
    population: 30000,
    produces: { cloth: 1.8, weapons: 1.0, silver: 0.6 },
    consumes: { grain: 0.5, salt: 0.4, wine: 0.9, beer: 0.9, spices: 0.3 },
  },
  {
    id: "nuremberg",
    name: "Nürnberg",
    lat: 49.45, lon: 11.08,
    region: "Franconia",
    population: 28000,
    produces: { weapons: 2.0, cloth: 1.0 },
    consumes: { grain: 0.5, salt: 0.4, wine: 0.7, beer: 0.9, spices: 0.3, silver: 0.3 },
  },
  {
    id: "hamburg",
    name: "Hamburg",
    lat: 53.55, lon: 10.0,
    region: "Saxony",
    population: 20000,
    produces: { salt: 1.6, beer: 1.6, grain: 0.8, wool: 1.0 },
    consumes: { grain: 0.3, cloth: 0.6, wine: 0.7, spices: 0.2, weapons: 0.2, iron: 0.2 },
  },
  {
    id: "lubeck",
    name: "Lübeck",
    lat: 53.87, lon: 10.69,
    region: "Saxony",
    population: 22000,
    produces: { beer: 2.0, salt: 1.6, wool: 0.8 },
    consumes: { grain: 0.4, cloth: 0.7, wine: 0.6, spices: 0.2, weapons: 0.2, iron: 0.2 },
  },
  {
    id: "bremen",
    name: "Bremen",
    lat: 53.08, lon: 8.80,
    region: "Saxony",
    population: 14000,
    produces: { beer: 1.0, grain: 1.2, wool: 1.6 },
    consumes: { salt: 0.3, cloth: 0.5, wine: 0.4, spices: 0.2, iron: 0.2 },
  },
  {
    id: "antwerp",
    name: "Antwerp",
    lat: 51.22, lon: 4.40,
    region: "Brabant",
    population: 50000,
    produces: { spices: 1.6, cloth: 1.4 },
    consumes: { grain: 0.9, salt: 0.6, wine: 1.1, beer: 1.1, weapons: 0.3, silver: 0.6, iron: 0.3 },
  },
  {
    id: "bruges",
    name: "Bruges",
    lat: 51.21, lon: 3.22,
    region: "Flanders",
    population: 35000,
    produces: { cloth: 2.4 },
    consumes: { grain: 0.7, salt: 0.5, wine: 0.8, beer: 0.8, spices: 0.3, iron: 0.2, weapons: 0.2 },
  },
  {
    id: "cologne",
    name: "Köln",
    lat: 50.94, lon: 6.96,
    region: "Rhineland",
    population: 38000,
    produces: { wine: 1.8, iron: 1.8, cloth: 0.8 },
    consumes: { grain: 0.7, salt: 0.5, beer: 0.9, spices: 0.3, silver: 0.4, weapons: 0.3 },
  },
  {
    id: "frankfurt",
    name: "Frankfurt",
    lat: 50.11, lon: 8.68,
    region: "Hesse",
    population: 12000,
    produces: { wine: 1.6, cloth: 0.6 },
    consumes: { grain: 0.3, salt: 0.3, beer: 0.4, spices: 0.2, silver: 0.2, weapons: 0.2 },
  },
  {
    id: "munich",
    name: "München",
    lat: 48.14, lon: 11.58,
    region: "Bavaria",
    population: 14000,
    produces: { beer: 2.2, grain: 1.4 },
    consumes: { salt: 0.3, cloth: 0.5, wine: 0.4, spices: 0.2, weapons: 0.2, iron: 0.2 },
  },
  {
    id: "vienna",
    name: "Wien",
    lat: 48.21, lon: 16.37,
    region: "Austria",
    population: 35000,
    produces: { wine: 1.7, weapons: 0.8, iron: 1.2, spices: 0.6 },
    consumes: { grain: 0.7, salt: 0.5, cloth: 0.9, beer: 0.8, silver: 0.4 },
  },
  {
    id: "prague",
    name: "Prag",
    lat: 50.08, lon: 14.43,
    region: "Bohemia",
    population: 40000,
    produces: { silver: 1.4, iron: 2.2, beer: 1.4, weapons: 0.6 },
    consumes: { grain: 0.7, salt: 0.5, cloth: 0.9, wine: 0.8, spices: 0.3 },
  },
  {
    id: "leipzig",
    name: "Leipzig",
    lat: 51.34, lon: 12.37,
    region: "Saxony",
    population: 10000,
    produces: { grain: 1.6, wool: 1.4, iron: 1.2, cloth: 0.6 },
    consumes: { salt: 0.3, wine: 0.3, beer: 0.4, spices: 0.2, weapons: 0.2 },
  },
  {
    id: "magdeburg",
    name: "Magdeburg",
    lat: 52.13, lon: 11.63,
    region: "Saxony",
    population: 16000,
    produces: { grain: 2.2, wool: 2.0, beer: 0.8 },
    consumes: { salt: 0.4, cloth: 0.5, wine: 0.3, spices: 0.2, weapons: 0.2, iron: 0.2 },
  },
  {
    id: "strasbourg",
    name: "Strassburg",
    lat: 48.58, lon: 7.75,
    region: "Alsace",
    population: 18000,
    produces: { wine: 1.8, grain: 1.2 },
    consumes: { salt: 0.4, cloth: 0.6, beer: 0.5, spices: 0.2, weapons: 0.2, iron: 0.2 },
  },
  {
    id: "basel",
    name: "Basel",
    lat: 47.56, lon: 7.59,
    region: "Swiss Confederacy",
    population: 10000,
    produces: { cloth: 0.8, wine: 0.9 },
    consumes: { grain: 0.4, salt: 0.3, beer: 0.3, spices: 0.2, silver: 0.2 },
  },
  {
    id: "danzig",
    name: "Danzig",
    lat: 54.35, lon: 18.65,
    region: "Royal Prussia",
    population: 30000,
    produces: { grain: 3.0, wool: 2.4, salt: 1.0, beer: 1.0 },
    consumes: { cloth: 0.8, wine: 0.7, spices: 0.3, weapons: 0.3, iron: 0.3 },
  },
  {
    id: "krakow",
    name: "Krakau",
    lat: 50.06, lon: 19.94,
    region: "Lesser Poland",
    population: 18000,
    produces: { salt: 2.2, grain: 1.4, wool: 1.8 },
    consumes: { cloth: 0.7, wine: 0.5, beer: 0.5, spices: 0.2, silver: 0.3, weapons: 0.2 },
  },
];

export const CITY_BY_ID: Record<string, City> = Object.fromEntries(
  CITIES.map((c) => [c.id, c])
);

// Map projection bounding box
export const MAP_BBOX = {
  minLat: 47.0,
  maxLat: 55.4,
  minLon: 2.6,
  maxLon: 20.6,
};

export function cityDistanceKm(a: City, b: City): number {
  // Equirectangular approximation, good enough at this scale.
  const R = 6371;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = dLon * Math.cos((lat1 + lat2) / 2);
  return Math.sqrt(x * x + dLat * dLat) * R;
}
