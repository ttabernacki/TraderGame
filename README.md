# Carreira da Índia

A historical sailing and navigation simulation of Portuguese exploration, beginning
in 1482.

You have a lateen caravel, a crew who have heard what happens south of the line, a
quadrant, and a set of declination tables that do not run past the equator. The
wind belts will carry you south whether you like it or not, and will not carry you
back the way you came. Your latitude you can find from the sun and the pole star.
Your longitude nobody on earth can find, and will not for another two hundred and
sixty years.

```
npm install
npm run dev
```

## Controls

| | |
|---|---|
| `A` / `D` | Helm |
| `W` / `S` | Make and shorten sail |
| `Q` / `E` | Trim the sheets by hand |
| `T` | Hand the trim back to the watch |
| `Space` | Anchor / weigh anchor |
| `R` | Warp her off when aground |
| `C` | The chart |
| `N` | Take a sight |
| `L` | The logbook |
| `K` | The ship: company, stores, condition, skills |
| `P` | Go ashore |
| `V` | Change view |
| `[` `]` | Rate of time |
| Drag / scroll | Look around, zoom |

## What is actually simulated

**The wind.** Planetary belts keyed to the Intertropical Convergence Zone, which
migrates with the season: north-east trades, doldrums, horse latitudes, westerlies,
and their southern mirrors, plus the Indian Ocean monsoon which reverses twice a
year. This is what makes the *volta do mar* necessary — you cannot beat home up the
African coast against the trades, so you stand far out into the Atlantic until you
reach the westerlies and run down to Portugal. Sailing to India in the wrong half of
the year means waiting six months for the monsoon to turn.

**The sailing.** Apparent wind, lift and drag curves per sail with stall, leeway,
heel, weather helm, hull speed, and rig loads. A lateen yard will not brace closer
than eight degrees off the centreline and a square yard will not brace closer than
sixty, which is the entire reason a caravel can beat to windward and a nau cannot.
Tacking a lateen means dipping the whole yard around the mast, and until it is
across she makes no drive at all. Carry too much canvas in a breeze and you will
lose a spar.

**The navigation.** Dead reckoning from a chip log, a compass and a sandglass, with
every error the method really had: helmsman drift, an over-reading log, unrecorded
leeway, magnetic variation nobody has charted, and ocean currents that set you
sideways with no indication whatsoever on deck. Latitude is recovered by meridian
altitude of the sun or by the pole star — and Polaris in 1482 sits three and a half
degrees off the pole and circles it, so without the Regimento's rule of the Guards
you will be wrong by two hundred miles. Below the equator the pole star sets and
you must have solar tables or you have nothing. Longitude is never recovered at all.

**The chart.** Everything is drawn where the pilot *believed* he was when he saw it.
Survey a coast on a passage with a bad reckoning and it goes onto the sheet in the
wrong place and stays wrong. There is no marker showing where the ship truly is,
because no such information exists aboard.

**The crew.** Water, biscuit, salt meat, wine, and fresh provisions. Scurvy appears
after about six weeks without fresh food, worsens steeply, kills, and is cured
within a fortnight of getting ashore somewhere with fruit — which nobody in this
century understands, and which is why every ship that could touch at an island did
so however much the delay cost. Morale falls with time out of sight of land and
falls faster in water no Portuguese has sailed. If it bottoms out they will come aft
in a body and tell you to put the helm up for Portugal.

**The trade.** Real goods at real relative prices. Pepper costs about two cruzados
the quintal at Calicut and sells for thirty at Lisbon, and that difference is the
whole reason anyone made the voyage. Manilhas and brass basins buy gold on the Mina
coast and are an insult at a court that has been trading with China for three
hundred years — the mistake that humiliated Vasco da Gama in front of the Zamorin,
whose factors looked at his cloth and hats and honey and told him the poorest
merchant from Mecca gave more.

**The world.** Real coastlines from Iberia to the Malay peninsula, real ports with
the peoples who held them, real ocean currents including the Agulhas, real tides,
and storms seeded by the climatology of the place and season.

## Structure

```
src/core/         geodesy, simulation clock, seeded noise
src/world/        coastlines, wind belts, currents, tides, weather, ports, peoples
src/ship/         hull classes, rig aerodynamics, hull dynamics, upgrades
src/navigation/   celestial mechanics, instruments, dead reckoning, charts
src/crew/         company, provisions, scurvy, morale, skills
src/economy/      goods and port markets
src/diplomacy/    first contact and negotiation
src/progression/  Crown commissions, titles, discoveries
src/render/       Gerstner ocean, sky and star field, procedural caravel, terrain
src/ui/           head-up display, chart table, sighting, logbook, port screens
```

The star catalogue is precessed to the campaign epoch, so the sky overhead is the
sky of the 1480s rather than of today. That is not decoration: it is why Polaris
does not sit on the pole.
