// Hand-traced lat/lon polylines approximating the HRE ~1500 and major rivers.
// These are stylised for atmosphere, not cartographically precise.

export const HRE_OUTLINE: [number, number][] = [
  [54.85, 8.30], // North Frisia / Schleswig
  [54.40, 9.50],
  [54.05, 11.50],
  [54.30, 13.80],
  [54.40, 16.00],
  [53.80, 17.20],
  [52.80, 17.50],
  [51.70, 16.60],
  [50.30, 16.00],
  [49.50, 16.80],
  [48.80, 17.20],
  [47.80, 16.80],
  [46.80, 15.00],
  [46.30, 13.40],
  [46.20, 11.00],
  [46.50, 9.30],
  [46.40, 7.20],
  [47.50, 6.30],
  [48.20, 5.40],
  [49.30, 4.60],
  [50.50, 4.20],
  [51.30, 2.80],
  [51.60, 3.10],
  [52.30, 4.40],
  [53.20, 5.50],
  [53.70, 6.80],
  [53.95, 8.10],
  [54.85, 8.30],
];

export const RHINE: [number, number][] = [
  [46.70, 8.40], // Alps source area
  [47.55, 7.60], // Basel
  [48.10, 7.50],
  [48.58, 7.75], // Strasbourg
  [49.00, 8.20],
  [50.00, 8.30], // Mainz area
  [50.94, 6.96], // Cologne
  [51.50, 5.90],
  [51.90, 4.10], // North Sea delta
];

export const DANUBE: [number, number][] = [
  [48.00, 8.50], // headwaters
  [48.40, 10.00], // Ulm
  [48.95, 12.10], // Regensburg
  [48.50, 13.45], // Passau
  [48.21, 16.37], // Vienna
  [48.20, 17.10],
  [47.80, 18.40], // Komárom
];

export const ELBE: [number, number][] = [
  [50.10, 15.20], // Bohemian source
  [50.08, 14.43], // Prague (Vltava really, but stylised)
  [51.00, 13.70], // Dresden
  [51.85, 12.20],
  [52.13, 11.63], // Magdeburg
  [53.05, 11.00],
  [53.55, 10.00], // Hamburg
];

export const MAIN_RIVER: [number, number][] = [
  [50.10, 12.20], // Bayreuth area
  [49.90, 11.00], // Bamberg
  [49.80, 9.90], // Würzburg
  [50.11, 8.68], // Frankfurt
  [50.00, 8.30], // joins Rhine
];

export const ODER: [number, number][] = [
  [49.80, 18.10],
  [51.10, 17.05], // Wrocław
  [52.40, 14.60],
  [53.45, 14.55],
  [53.90, 14.20], // Stettin lagoon
];

export const SEA_FILL: [number, number][][] = [
  // North Sea triangle
  [
    [52.00, 2.40], [54.20, 2.40], [55.40, 6.00], [55.40, 8.20],
    [53.95, 8.10], [53.70, 6.80], [53.20, 5.50],
    [52.30, 4.40], [51.60, 3.10], [51.30, 2.80], [52.00, 2.40],
  ],
  // Baltic
  [
    [55.40, 10.50], [55.40, 20.60], [54.10, 20.60], [54.30, 18.50],
    [54.40, 16.00], [54.30, 13.80], [54.05, 11.50], [54.40, 9.50], [54.85, 8.30],
    [55.40, 10.50],
  ],
];

// Decorative coastline of Italy / Adriatic peeking south.
export const ITALY_HINT: [number, number][] = [
  [46.30, 13.40], [45.80, 13.00], [45.60, 12.30], [45.40, 12.60],
];
