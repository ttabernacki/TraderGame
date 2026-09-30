# Design spine

The career is **one road**, not a star. Lisbon → Lagos/Funchal/Las Palmas →
Arguim → Mina → Mpinda (Congo) → Benguela → the Cape → Moçambique → Melinde →
Calecute → Cochim, and home. Every commission, act, story, charter and errand
lies at a point on that road (`src/progression/road.ts`). A voyage does all the
business at a place in one call and goes on. **Nothing may require sailing back
along the road for a clue, a letter, or a reward.** Lisbon is where a voyage
begins and ends, and where the Casa, the court and the shipyard are — not a
checkpoint between acts.

## Rules for new content

1. A story's steps run in road order. If step N+1 is behind step N, it is
   wrong: change the step, not the sailing.
2. News comes to the captain. Letters, succession, rewards and the King's
   answer arrive at the port he is in (or at Lisbon if the story is *about*
   Lisbon, and only if he is going there anyway).
3. Waits are paid by the voyage, not by the player. A "come back in 90 days"
   gate is a bug; a gate that the rest of the voyage satisfies is fine
   (`prester.wait`, 300 days, is satisfied by the India run).
4. Gifts, cargo and papers a story hands the captain are stowed for him
   (`stowTools`), not left for him to shop for.
5. Two beats at one port are fine and expected: a scene answered at once
   surfaces the next due beat.

## What is done

- **Acts advance by dispatch.** When an act's goal is met, the King's answer
  (closing reward, the next act's opening and its commission) arrives 14 days
  later at the next port, wherever it is. The court scenes still play if the
  captain happens to be in Lisbon. (`chronicle.ts: dispatch`)
- **Act commissions settle at any quay.** A finished act commission is paid
  by the King's factor at the next port and the next act's is issued with the
  letter (`Game.dischargeAtDispatch`, `takeChargeByDispatch`). Only the
  ordinary coast work still waits for court. `reach` objectives already true
  count when a commission is taken (Cape for Act IV).
- **The Leak** runs home along the coast: Mina → Arguim → Lagos → Lisbon
  (Rua Nova and the reckoning in one visit). Was Mina → Lisbon → Lagos →
  Arguim → Lisbon.
- **The Manikongo's Embassy**: gifts are stowed at court; the succession is
  settled on arrival at Mpinda; the king's letter is answered at Lisbon. Was
  three separate returns to the Congo with 90- and 60-day waits.
- **The Biscayan's Ship**: the Casa's purse and letter are had from the
  Casa's man at Las Palmas, not by sailing to Lisbon and back.
- **The Road** (Orders, first tab): every live obligation in road order, with
  distance, so the next leg can be planned.

## Verdicts

Keep and deepen:
- Sailing/navigation core, the reckoning-vs-chart model, weather and currents.
- Officer arcs (the company): they ride the road for free.
- Acts as the spine; the five-act chronicle and dated history.
- Feitorias: the only thing that turns voyages into a position.

Keep, but they are not the game:
- Ventures/charters: the reason to trade between commissions. They now show
  on the Road with days left; do not add more kinds.
- Estate, Casa: Lisbon-side money and politics. Leave alone.

Cut or fold (candidates, in order):
- Orders tabs: Rival folded into Chronicle (a rival is a story, not a page).
- Anything that asks for the same errand twice (a commission objective and a
  story step that want the same place should be one step).
