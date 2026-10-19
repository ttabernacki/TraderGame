# Sources and what is invented

Source discipline (docs/DESIGN.md): every dated or attributed event gets a note here or beside its data; the game's own
specifics are marked **invented**. Where a detail was uncertain the game is generic.

## The Powers and the Traffic (C2)

Dated shocks live in `src/world/powers/data.ts` (`SCHEDULE`), each with a `source` and a grade.

| Item | Grade | Note |
|---|---|---|
| Cão at the Congo, Dias's return, Columbus's return, Tordesillas, João II's death | documented | Dates come from `chronicle.ts` HISTORY; Cão's year differs by source (1482-84). |
| Casa dos Escravos at Lisbon | approximate | Documented from the 1480s; the game uses 1486 as a game date and claims no founding year. |
| Benin contact (João Afonso de Aveiro c. 1485-86; an ambassador to Lisbon) | documented | Ryder, *Benin and the Europeans* (1969); Pacheco Pereira, *Esmeraldo*. |
| Baptism of the Mani Soyo (3 April) and the Manikongo as João I (3 May), 1491 | documented | Rui de Pina; Pigafetta and Lopes. The game states no detail beyond the fact. |
| São Tomé given to Álvaro de Caminha, 1493 | documented | Hair; Seibert on São Tomé. |
| Edict of expulsion, December 1496 | documented | Forced conversions followed in 1497. |
| First sugar mills on São Tomé, early 1500s | approximate | The year is not claimed. |
| Succession at Kongo (Afonso I), c. 1506-09 | approximate | Sources differ; no scene gives a year. |
| Benin's refusal to export male captives, early sixteenth century (often c. 1516) | approximate | Ryder. Held as data only; no scene yet. |
| Traffic stage 1 "ransom and barter": people bought on the Saharan edge and Guinea coast for horses, wheat, cloth | documented | Zurara's *Chronicle of Guinea* for the Arguim trade; the Jolof horses-for-captives trade is in the polity blurb. Annual counts are not given in sources used here; the game's counts (41, 90, 160, 230) are **invented**. |
| People bought on the coast carried to São Jorge da Mina and sold for gold to Akan buyers | documented | Practice attested in the Mina trade of the 1470s-1500s; the route, freight (9 and 8 cruzados a head) and buyers named are **invented**. |
| Kongo's king holding the right to captives taken in war; elders and traders at odds | approximate | Echoes Afonso I's later complaints (1526 letters) about the sale of free-born Kongo; the game anticipates the argument and cites no letter. |

**Invented, marked as such:** every personal name in the Traffic scenes (the factors, Ahmad ibn Yahya, Khadija, Kwesi, Kojo, Pêro,
Nsaku, Mavungu, Gonçalo Anes, and the names in the cistern book); the Mpinda register and its single winnable fight (the
officer, the seal, the 200 cruzados); the Castle's Thursday hearing; Casa quota numbers; hold tonnage per person (0.25 t); loss on the
passage (1 in 1200 a day); the Powers' `means` figures, the Powers' monthly move probabilities and the Gold's fever seasons; every
fidelity and probability in the rumour mill.

**Deliberately left generic:** the identity of the Captain of São Jorge; any year for the Kongo succession; ethnic labels for those
carried; the number of people carried in any real year.
