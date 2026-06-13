import type { FamilyMember, GameState } from "./types";
import { pushLog } from "./log";

const MALE_GIVEN = ["Jakob", "Anton", "Ulrich", "Markus", "Hans", "Konrad", "Wilhelm", "Friedrich", "Lorenz", "Peter", "Sebastian", "Georg"];
const FEMALE_GIVEN = ["Barbara", "Anna", "Magdalena", "Helena", "Margaretha", "Sibylla", "Veronika", "Katharina", "Ursula", "Elisabeth"];
const TRAIT_POOL = ["Shrewd", "Pious", "Cunning", "Generous", "Hot-Tempered", "Patient", "Ambitious", "Cautious", "Charming", "Severe"];

let nextFamilyId = 1;

function makeId() { return `fam-${nextFamilyId++}`; }

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function pickTraits(): string[] {
  const a = pick(TRAIT_POOL);
  let b = pick(TRAIT_POOL);
  while (b === a) b = pick(TRAIT_POOL);
  return [a, b];
}

export function makeFoundingFamily(surname: string, startYear: number): FamilyMember[] {
  const patriarch: FamilyMember = {
    id: makeId(),
    givenName: "Jakob",
    surname,
    birthYear: startYear - 32,
    deathYear: null,
    isHead: true,
    isHeir: false,
    parentId: null,
    spouseId: null,
    traits: ["Shrewd", "Ambitious"],
  };
  const heir: FamilyMember = {
    id: makeId(),
    givenName: "Anton",
    surname,
    birthYear: startYear - 8,
    deathYear: null,
    isHead: false,
    isHeir: true,
    parentId: patriarch.id,
    spouseId: null,
    traits: ["Patient"],
  };
  return [patriarch, heir];
}

export function age(member: FamilyMember, year: number): number {
  return year - member.birthYear;
}

export function tickDynasty(state: GameState) {
  // Yearly mortality check on the 1st of January.
  if (state.date.month !== 1 || state.date.day !== 1) return;
  const year = state.date.year;

  for (const m of state.family) {
    if (m.deathYear !== null) continue;
    const a = age(m, year);
    if (a < 50) continue;
    // Mortality curve: 1% at 50, growing to ~25% at 80.
    const p = Math.min(0.5, Math.max(0, (a - 45) * 0.012));
    if (Math.random() < p) {
      m.deathYear = year;
      if (m.isHead) {
        pushLog(state, `${m.givenName} ${m.surname} has died at ${a}. The house mourns.`, "event");
        // Promote heir.
        const heir = state.family.find((x) => x.isHeir && x.deathYear === null);
        if (heir) {
          m.isHead = false;
          heir.isHead = true;
          heir.isHeir = false;
          pushLog(state, `${heir.givenName} ${heir.surname} assumes leadership of the house.`, "event");
          // Spawn a new heir as the head's eldest child (abstracted).
          spawnHeir(state, heir);
        }
      } else if (m.isHeir) {
        pushLog(state, `${m.givenName} ${m.surname}, the heir presumptive, has died at ${a}.`, "event");
        // Spawn a replacement heir for the current head.
        const head = state.family.find((x) => x.isHead && x.deathYear === null);
        if (head) spawnHeir(state, head);
      } else {
        pushLog(state, `${m.givenName} ${m.surname} has died at ${a}.`, "info");
      }
    }
  }
}

function spawnHeir(state: GameState, parent: FamilyMember) {
  const heir: FamilyMember = {
    id: makeId(),
    givenName: pick(MALE_GIVEN),
    surname: parent.surname,
    birthYear: state.date.year - (18 + Math.floor(Math.random() * 6)),
    deathYear: null,
    isHead: false,
    isHeir: true,
    parentId: parent.id,
    spouseId: null,
    traits: pickTraits(),
  };
  state.family.push(heir);
  pushLog(state, `${heir.givenName} ${heir.surname} is now the heir to the house.`, "info");
}

export function houseHead(state: GameState): FamilyMember | null {
  return state.family.find((m) => m.isHead && m.deathYear === null) ?? null;
}

export function houseHeir(state: GameState): FamilyMember | null {
  return state.family.find((m) => m.isHeir && m.deathYear === null) ?? null;
}

// Silence unused-export complaints in strict mode.
export { FEMALE_GIVEN };
