import type { HullClass, MastSpec } from '../../ship/hull';

/**
 * The ships of the Western Ocean fleets. Dimensions follow the Ming dockyard
 * lists and the sources' own disagreements (a "treasure ship" of 440 chi is not
 * believed by anyone who has built a wooden ship); the figures here are the
 * low, believable ones: the big ships sail like the largest wooden ships that
 * were ever worked.
 *
 * Rig: the battened junk sail is modelled as the nearest thing the physics has,
 * the lateen: it goes to windward better than any square sail, and trims by
 * sheet alone, so a small watch can work a great ship.
 */
const sail = (name: string, area: number, ceHeight: number, station: number): MastSpec =>
  ({ name, rig: 'lateen', area, ceHeight, station });

export const XIYANG_HULLS: HullClass[] = [
  {
    id: 'zhanchuan', name: 'Zhanchuan', english: 'War junk',
    tons: 120, lwl: 26, beam: 6.4, draft: 2.4, displacement: 190000,
    masts: [sail('Mainmast', 160, 13.5, 0.15), sail('Foremast', 100, 11.0, 0.62), sail('Mizzen', 70, 9.5, -0.6)],
    hold: 60, crewMin: 40, crewFull: 120, strength: 0.7, handiness: 0.8,
    cost: 1800, standing: 0, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'A fast junk with watertight compartments and a deck of fighting men. She keeps the fleet’s edges and answers any pirate who sees a treasure ship and mistakes it for a merchant.',
  },
  {
    id: 'zuochuan', name: 'Zuochuan', english: 'Troop junk',
    tons: 260, lwl: 36, beam: 9.2, draft: 3.2, displacement: 520000,
    masts: [sail('Mainmast', 280, 16.5, 0.1), sail('Foremast', 190, 14.0, 0.6), sail('Mizzen', 120, 11.0, -0.6)],
    hold: 150, crewMin: 80, crewFull: 240, strength: 0.8, handiness: 0.68,
    cost: 4200, standing: 0, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'The workhorse of the fleet: three masts, a company of soldiers, and the hold to carry the fleet’s silks, porcelain and iron.',
  },
  {
    id: 'liangchuan', name: 'Liangchuan', english: 'Grain junk',
    tons: 400, lwl: 40, beam: 10.8, draft: 3.6, displacement: 880000,
    masts: [sail('Mainmast', 340, 18.0, 0.1), sail('Foremast', 230, 15.0, 0.6), sail('Mizzen', 130, 12.0, -0.6)],
    hold: 340, crewMin: 70, crewFull: 160, strength: 0.82, handiness: 0.55,
    cost: 5200, standing: 0, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'Rice and salt for the fleet and for the ports where it is sold, in a deep, slow, strong hull.',
  },
  {
    id: 'shuichuan', name: 'Shuichuan', english: 'Water junk',
    tons: 220, lwl: 32, beam: 9.0, draft: 3.0, displacement: 470000,
    masts: [sail('Mainmast', 240, 15.0, 0.1), sail('Foremast', 150, 12.5, 0.6)],
    hold: 180, crewMin: 40, crewFull: 90, strength: 0.78, handiness: 0.6,
    cost: 3300, standing: 0, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'Tanks for fresh water, a month of it for the whole fleet. Without her the fleet cannot cross the Bay of Bengal.',
  },
  {
    id: 'machuan', name: 'Machuan', english: 'Horse junk',
    tons: 520, lwl: 46, beam: 12.5, draft: 3.9, displacement: 1300000,
    masts: [sail('Mainmast', 420, 20.0, 0.1), sail('Foremast', 290, 17.0, 0.6), sail('Mizzen', 160, 13.0, -0.6)],
    hold: 420, crewMin: 100, crewFull: 220, strength: 0.84, handiness: 0.5,
    cost: 7400, standing: 0, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'A broad deep ship for the horses and hides the courts of the west want, and heavy enough that she will fall behind on a close reach.',
  },
  {
    id: 'baochuan', name: 'Baochuan', english: 'Treasure junk',
    tons: 1100, lwl: 62, beam: 17.5, draft: 5.2, displacement: 3600000,
    masts: [sail('Mainmast', 700, 25.0, 0.12), sail('Foremast', 480, 21.0, 0.6), sail('Third mast', 380, 18.0, -0.2), sail('Mizzen', 260, 15.0, -0.62)],
    hold: 800, crewMin: 160, crewFull: 450, strength: 0.92, handiness: 0.4,
    cost: 18000, standing: 400, xiyang: true, paint: 'red', device: 'plain',
    blurb: 'The largest wooden ships the world has yet seen: nine masts in the old accounts and four in anything a carpenter will swear to. They carry the Emperor’s silks, the presents for forty kings, and the court.',
    castles: 0.55,
  },
];
