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

## Claims on the Casa's sheet, and survey sheets (D3)

Claims live in `src/knowledge/claims.ts` (`CLAIM_DEFS`, each with a `source` line). Each run draws 10-15 of 16; which Prester John is the real one,
how far a real place is drawn from where it is, and where a phantom sits (a degree or so either way) are decided by the seed alone. What a
second informer says is right three times in four against the seed's truth; both figures, and every teller and rumour sentence, are **invented**.

| Claim | Grade | Note |
|---|---|---|
| Antillia / the Seven Cities; Satanazes | documented | Pizzigano chart (1424); Dulmo and Estreito's patent for Antillia, 1486. The red sea and whistling at Satanazes are **invented**. |
| Brasil west of the Azores; Hy-Brasil | documented | On Atlantic charts from Dulcert (1325). The Bristol searches of 1480 onward are documented; the fog "one day in seven years" is a tale told in later Irish sources and is used as hearsay only. |
| St Brendan's island; the Sea of Darkness | documented | Both persisted as belief into the 1700s and in Arab geography (Bahr al-Zulumat). The positions given are **invented**. |
| The Isle of Women | documented | Marco Polo's Male and Female islands; the position (off Socotra) is **invented**. |
| The land of the Holy Cross, Fernando de Noronha, St Helena, São Lourenço | documented | Found 1500, c. 1501-03, 1502 and 1500. The 1482-85 rumours of each, and the displacement of the sheet, are **invented**; the islands are at their real positions (`world/isles`). |
| The Rio de Ouro | documented | Baldaia, 1436. It is an inlet and had no gold; the gold and the Casa's "day off" error are **invented**. |
| Sofala and the gold kingdom behind it | approximate | The Mwene Mutapa and Sofala's gold trade are documented; the Portuguese were there from 1500-05, so a 1485 rumour is **invented**. |
| Prester John at three latitudes | documented / invented | Benin's Ogané taken for Prester John by Aveiro's men (c. 1486, Pacheco Pereira); Covilhã and Paiva sent to Ethiopia (1487); Prester in India (Marco Polo, Mandeville). Which one is "real" in a run is a game device, not history (history says Ethiopia). |

**Sheets.** Region boxes, prices per grade (Casa 240, Genoese 400, rival 560 cruzados per grade per unit weight), the standing paid and lost,
the 14%-a-year chance a coast changes and the half-grade a change takes off a buyer's copy are all **invented** balance. The Genoese factors at Lisbon,
Lagos and Funchal are plausible (Genoese in the Portuguese sugar and Atlantic trade) and unsourced here.

## Mina as a Deep port (C4)

Data and prose in `src/places/deep.ts`; the Quarters in `src/ui/quarters/`. The Patron is Kwesi, the gold-broker who already
speaks in the Traffic's "Who buys" scene; this deepens him rather than adding a stranger.

| Item | Grade | Note |
|---|---|---|
| São Jorge da Mina raised in 1482; named for St George, whose day is 23 April | documented | The Castle's foundation and name. The game keeps the saint's day with a mass and the flag; that observance is **approximate** (inferred, not sourced). |
| Gold weighed in dust against weights, on the beach, on the Akan buyers' own scales | documented | The practice; no particular weight system or value is claimed. |
| The dry-season gold trade; two wet seasons on the Gulf of Guinea coast | approximate | The months used (gold Dec-Mar, great rains Apr-Jul, small rains Oct-Nov) are the climate's, not a dated record. |
| Fever as the Castle's killer | documented | Reflected in the calendar's fever multiplier (x2 in the great rains, x1.5 in the small); the multipliers are **invented**. |
| Pawnship as a custom of the coast (a person pledged for a debt) | documented | The practice; the Thursday hearing and Kojo's case are the Traffic's (C2), not this build's. |
| Trade between the Gold Coast and Benin by sea and canoe | documented | The route and goods are generic; that it is Kwesi's house's own practice is **invented**. |

**Invented, marked as such:** Kwesi (an Akan day-name, Sunday-born, of no real man), his house, his sister's son Yaw, the interpreter's
few words, the factor's new clerk; the Casa's ship "looked for in March and September" and its effect on brass and cloth; every sum,
multiplier and threshold (the regard track's weights, the credit of 150 and 300 cruzados, the House at 0.7, gold at 0.96, the dues
effects of honest and false weights); the four beats of the arc (the canoe trade to the Benin creeks, the clerk's question, the letter
to a broker, the half-ounce weight).

**Deliberately left generic:** the identity of the Captain of the Castle and of the factor; the name of Kwesi's house and of the
polity beyond "Eguafo's country"; any year but 1482.

**The Quarters' own invented verbs:** shore leave (a day, a few cruzados, morale and the fo'c'sle's regard up, fever risk on a fever
coast), keeping the day (mass, with or without a chaplain), buying a round at the tavern. All numbers are the game's.

## Arguim, Melinde, Calecute and Lisbon as Deep ports (D6)

Data and prose in `src/places/ports/{arguim,melinde,calecute,lisboa}.ts`; the header of each file repeats this table for its port. The
Patrons are people with agency: each has an interest, a rule he keeps, and a way of being wrong about the captain.

| Item | Grade | Note |
|---|---|---|
| Arguin: the Crown's fort and factor; gum, gold dust and captives bought for wheat, cloth and horses; the caravan road from the Sahara | documented | Zurara; Pacheco Pereira. Ahmad ibn Yahya is the Traffic's broker (C2), deepened. |
| The Imraguen fishers of the Banc d'Arguin and the shoals that wrecked ships; ransom (manumission) honoured in Islamic law and the bar on enslaving free Muslims | documented | The practice; Bilal, his boat and Ahmad's stance are **invented**. |
| Caravans in the cool months; gum gathered in the dry season; the harmattan, Dec-Mar | approximate | Months are climate, not a dated record. The wheat ship in May and October and the hot-months fever (x1.4) are **invented**. |
| Melinde at odds with Mombasa and welcoming the Portuguese; a Melinde pilot taking Gama to India (1498) | documented | Accounts of the pilot differ; Hamisi is the company's invention (docs/DESIGN.md), not claimed to be him. |
| The monsoons (kaskazi, kusi) as the Indian Ocean's timetable; rhymed rutters of the Arab pilots (Ibn Majid, 1490); the long rains (Mar-May) and the short (Oct-Dec) | documented | The turning (5-26 April) is read off the game's own wind, not a record. |
| Fleets from Cambay and Hormuz in Melinde with the north-east monsoon, and sailing for India on the south-west | approximate | Multipliers **invented**. |
| Nairuzi, the Swahili new year on 20-23 March | approximate | The coast kept more than one new year (Persian reckoning; the Shirazi July feast); the date is a game choice. |
| Calicut: the Zamorin, the pepper port, the Mappila merchants, the Koya as the Mappila head and port officer (shah bandar) | documented | The title; Mammali, his house, his sister's son, the Friday table, the failed crop, the letter to Cochim and the pass are **invented**. |
| The sea closed to shipping in the south-west monsoon (about June-August); pepper to the warehouses Dec-Mar; Onam in Aug-Sep and Vishu in April | approximate | Festival dates move with the Malayalam calendar; used as months. |
| Lisbon: the Casa da Mina and Casa dos Escravos on the Ribeira; the Rua Nova dos Mercadores; the Order of Christ (Tomar), its jurisdiction and revenues overseas (*Romanus Pontifex*, 1455) | documented | The Order's friar and the bursar's office are generic; Frei Diogo and Frei Lourenço are **invented**. |
| Conversos fleeing Castile (Inquisition from 1478-80); the expulsion of 1492 and João II's fee; the Edict of December 1496 and the forced conversions of 1497 | documented | The arc's third beat reads the date and says only what the period knew. Branca Nunes, her nephew Isaac and her cousin Jorge are **invented**. |
| Corpus Christi procession with St George; Lent; Santo António on 13 June; plague years at Lisbon | documented / approximate | Lent and Corpus Christi move; used as months. |
| The Mina ships' arrival at Lisbon in May and November | invented | Mirrors the Casa's ship leaving for Mina in March and September (C4). |

**Invented, marked as such:** Ahmad's cousin Idriss and the Wolof broker Demba Sy; Salim bin Abdalla, the boy Sefu and the pilots' roll as a guild with a
rule against ships that stop dhows; Mammali; Fernão Vaz, Branca Nunes, Frei Diogo, Frei Lourenço; the four beats of each arc; every sum, multiplier, threshold,
credit (Arguim 120/250, Melinde 200/400, Calecute 250/500, Lisbon 300/600 and 120), House factor (0.7-0.8) and dues perk (0.92-0.96).

**Deliberately left generic:** the factor and the Captain of Arguim; the Sultan and majlis of Melinde; the Zamorin and his officer; the Provedor, the
Order's commander and the King's officers at Lisbon; any year but those documented above.

## Swahili coast, Malabar and the Rule (D4)

Powers' moves in `src/world/powers/{swahili,malabar,crescent,stubs}.ts`; dated shocks in `data.ts` (`SCHEDULE`, each with a `source` and grade);
scenes in `src/progression/powerScenes.ts`; the Rule's reading in `src/world/powers/rule.ts`. The KINDS of event are attested; the chances,
durations and effects on prices are the game's own balance.

| Item | Grade | Note |
|---|---|---|
| Melinde's welcome to da Gama (April 1498), a pilot for the crossing, and its enmity with Mombasa | documented | Subrahmanyam, *The Career and Legend of Vasco da Gama*; Portuguese and Arabic accounts. The pilot's name and origin are disputed and not used. |
| Da Gama at Calicut (20 May 1498); the Muslim merchants' opposition at the Zamorin's court | documented | Subrahmanyam; Malekandathil, *Maritime India*. |
| The Portuguese took vessels and pilots by force on the first voyage's coast leg | approximate | Which vessel and when is not given. Held as a small push on the Rule only. |
| Cabral at Calicut (September 1500); the attack on the Portuguese factory and the bombardment (December 1500) | documented | Pearson, *The Portuguese in India*; Subrahmanyam. Numbers killed vary and are not given. |
| Cochin and Cannanore give the Portuguese factories (December 1500 to January 1501); Cochin's tribute to the Zamorin | documented | Pearson; Subrahmanyam. |
| Venetian alarm at Portuguese pepper (1501-02), a Venetian embassy to Cairo (1504) | documented | Girolamo Priuli's diaries. The game dates the alarm by year only. |
| Da Gama's second voyage (1502), tribute forced from Kilwa; the practice of the cartaz becoming regular | approximate | The exact first pass is not fixed; the game claims no year in a scene for the cartaz. |
| Almeida takes Kilwa and Mombasa (July and August 1505); a fort at Kilwa | documented | Pearson; Subrahmanyam. |
| The Mamluk fleet to Gujarat (1507-08), Chaul (1508), defeat at Diu (February 1509) | documented | Pearson; Subrahmanyam. The game gives years only. |
| Albuquerque's attack on Aden (1513) and the plan to blockade the Red Sea; Hormuz (1515) | approximate | The Rule's "blockade" stage follows this policy by the middle of the 1510s; no scene names a year. |
| Kilwa's gold: tithe on gold from Sofala; dynastic disputes at Kilwa in the late fifteenth century | documented / approximate | The trade is documented. The game uses "a fight over the stool" with no names or dates; the frequency is invented. |
| Mombasa as the strongest harbour on the coast and Melinde's rival | documented | Date of the enmity not claimed. |
| Gujarat's Cambay merchants resident at Melinde and Calicut | documented | The Cambay man in the scenes is invented. |

**Invented, marked as such:** every personal name in the D4 scenes (Mwinyi Hamad bin Faraji, Mwinyi Juma bin Salim, Jivan Kanji, Rui Teles,
Rashid bin Sultani, Juma bin Omari, Mwinyi Chande bin Abdallah, Kunhi Raman, Ibrahim Koya and the Koya house, Ali Kutty, Karunakaran,
Govinda Pillai); the harbour-master's roll of passes at Melinde, the 250-cruzado bond, the surety of nine dhows and the forty-one let out; Cochin's
tribute as a sum; the six stopped dhows; the vizier's counting house and chest; the Powers' monthly chances and durations; the effects on
prices, stock and dues; the league and the convoys as moves of a Power (the Crescent's stages are the game's staging of a documented
Mamluk, Gujarati and Calicut co-operation in 1507-09).

**Deliberately left generic:** the sultans of Kilwa, Mombasa and Melinde (no names, though the polity data lists rulers); the Zamorin and the
Raja of Cochim (unnamed); the identity of the Portuguese factor at any port; any year for the cartaz; the numbers of ships stopped.

**The Rule's reading.** The stage is the Front's (history shocks plus the captain's deeds, `FRONT_DELTAS`); the Book's single line is
`ruleReading` over a conduct table whose signs the falsifier checks against the delta table. The two places that set it (Calecute and Kilwa)
and "fixed when Act V opens" are the game's design.

## Patrons, titles and clauses (D5)

Dated agenda events live in `src/identity/patrons.ts` (`AGENDA`), each with a `source` and a grade.

| Item | Grade | Note |
|---|---|---|
| Duke of Braganza executed 1483; Duke of Viseu killed by the King 1484 | documented | Hair; Disney, *A History of Portugal*. That the Crown's patron grows stronger is the game's own reading. |
| Baptism of the Manikongo 1491 | documented | Rui de Pina. The Order's funding of priests and masons is **invented**. |
| João II dies, Oct 1495; Manuel I | documented | Via the Powers' schedule (`joao-dies`). The four months' warning, the eight months' fall and the old circle's clients falling are **invented**. |
| Edict of expulsion Dec 1496; forced conversions 1497 | documented | Tavares; Soyer. The calling-in of Rua Nova credit and its 24 months are **invented**; the Church's baptism policy turns from patience to the font on the Edict. |
| Franciscans sail with Cabral, 1500 | approximate | The Order's funds are **invented**. |
| Lisbon massacre of New Christians, April 1506 | documented | Tavares; Soyer. The credit effect and its 18 months are **invented**. |

**Invented, marked as such:** the three patrons' cuts (0, 8%, 12%); every order title and text (the tenth of Madeira, priests for Mpinda,
a chapel on the Cape road, letters for Prester John, the Christians of St Thomas); the Church's loves and hates; the "favourite who falls"
when the Court Front reaches its second stage; all thirty-two titles' names, thresholds and teller lines; the clause prices, terms and
the pairing of pieces to clauses; the generated names.

## Strangers as people (D7)

Data and generator in `src/game/strangers.ts` (cultures, houses, names, errands); terms in `src/game/terms.ts`; the Rule's reading is D4's.
The KINDS of ship, errand and encounter are attested; every master, owner, ship, house and sum below is the game's.

| Item | Grade | Note |
|---|---|---|
| Merchant ships of the western Indian Ocean (Swahili, Arab, Gujarati and Mappila/Malabari) sailing the monsoon between the Swahili coast, Aden, Hormuz, Cambay and the Malabar ports | documented | Pearson, *The Indian Ocean*; Malekandathil, *Maritime India*; Subrahmanyam on Gama's coast leg. Ships are drawn with the lateen caravel and small nau meshes already in the renderer; no dhow/baghla mesh is claimed (docs/RENDER_UPGRADE.md). |
| Gujarati merchants resident at Melinde and Calicut; Mappila houses at Calicut; Arab houses at Aden | documented | Also in the D4 rows. The houses named in prose are generic ("a Vania counting-house at Cambaia"). |
| Pilgrims to Mecca by way of Aden, envoys carrying letters between courts, a factor's wife travelling to her father's house, an out-of-work pilot looking for a ship, a prince's gift sent with a trusted master | approximate | The kinds of errand are attested by the period's accounts; the use of them as hail passengers is a game device. |
| Genoese hulls and capital in the Atlantic trade; Castilian interlopers on the Guinea coast against the Portuguese monopoly; Norman voyages from Dieppe | documented / approximate | Zurara; Pacheco Pereira; the Genoese in the Madeira sugar trade. The Dieppe voyages are traditionally dated to the 1480s but the evidence is thin: used as flavour only. |
| Moorish corsairs on the Algarve coast and the Strait | approximate | Raids on the Algarve are well attested for the fifteenth century; the Salé of later corsair fame is not claimed. |
| Passes, tolls and the stopping of ships under the King's letter as the Rule's stages | approximate | See the D4 table above: the practice of the cartaz becoming regular is dated by the game to Act IV-V, not to a year. |

**Invented, marked as such:** every master's name (built from the given names and patronymics of the culture and drawn per seed;
`strangers.ts` marks each record `invented: true` and refuses the names the game or history already holds), every owner, house and
boat, the thirty-five houses and their circuits, the five temper types and their lines, every passenger and the lots in every hold,
the twelve-to-thirty cruzado gifts, the 5% toll and the 12% duty, the weights of the errands, the regard arithmetic (a tone times a
weight, a fifth of it for word, a fraction of the Power's regard, the cartaz clause), the days word takes to run to a court (D5's
`wordDays`), and the rumours the masters tell (drawn from the Powers' mill, with the master named as the teller).

**Deliberately left generic:** every real master, pilot and merchant of the period (none is used; Malemo Cana and Ahmad ibn Majid are on the
generator's refusal list), the owners of the ships of any real port, and the sultans, Zamorin and Raja (unnamed, as in D4).

## Dynasty-lite and the assembled endings (E2)

Code in `src/identity/dynasty.ts` (the hand-off), `src/company/succession.ts` (the company) and `src/progression/endings.ts` (the evaluation
and its paragraphs). The structure of a career as a line is the design team's (v2-story Pillar 6); the history it leans on is thin and is
marked.

| Item | Grade | Note |
|---|---|---|
| The *Lei Mental* (1434): a grant of Crown land passes whole to the eldest legitimate son and reverts to the Crown without one | documented | João I / Duarte, 1434 (Disney, *A History of Portugal*; Hespanha on the Crown's donations). The lordship ending uses it; a natural son needing a letter of legitimation, and a nephew taking it by the Crown's favour for a fee, are the game's readings of it, not cited cases. |
| A boy in Lisbon in 1500 who will keep the Casa's books and write the history of the Indies from its papers (the Book ending) | documented | João de Barros, b. 1496, factor of the Casa da Índia from 1525, *Décadas da Ásia* (first Década 1552). He is not named in the text. |
| An heir put into the flagship as a page or a clerk | approximate | Boys and kin sailed in the fleets' ships in every rank; the use of it as an ending sentence is a game device. |
| The islands (Madeira, São Tomé) as a place a ruined man goes | approximate | Degredados and the disgraced were sent or went to the islands; no case is claimed. |

**Invented, marked as such:** every number in the hand-off (the 0.5 a patron's favour is halved to and the 0.2 floor of a first meeting; the
0.4 a father's title counts for; the half-term of a grant; the 8-and-16-year fade is the Ledger's own and was already there; the 0.7 a court's
attitude eases to; the 0.25 a repudiated Ledger fades to; half the purse and no standing for a man who puts the name off); the relation weights
(son 60%, nephew 20%, natural son 12%, ward 8%) and ages 17-30; the names (the origin pools of D5); the rule that the pilot's and the master's
seats are taken by a promoted mate or a warm hand, the three-in-four chance that a freed man's child is the new Língua, and the rule that a man
who left on bad terms stays an enemy; all six endings' scoring weights and every sentence of them (and the invented lordships Alvito, Sortelha,
Ferreira de Aves and Castelo Rodrigo are the game's, as the King's Offer had them).

**Deliberately left generic:** who the heir's mother is; any real captain's heir; the year the line ends. The heir begins in 1482 on the game's
clock (the history runs afresh around him, as `inheritFrom` always had it) but into a world whose Fronts, patrons' falls, clauses and
Traffic stage are the father's.
