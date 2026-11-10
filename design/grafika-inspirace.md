# Grafická inspirace — Prime Minister UK Politics Sim

Reference: mobilní hra Prime Minister UK Politics Sim (Innovate Apps LTD),
gameplay video https://youtu.be/iX7QRcZf5XM. Následující principy převezmeme
v UI prototypu (Milník 2); engine jim již nyní poskytuje data.

## Převzaté principy

### 1. Inbox krizových karet jako hlavní herní smyčka
Hra je řízena e-mailovým inboxem plným urgencí: každé kolo dorazí karty
s rozhodnutími (události z `events.ts`, právní zprávy z `pravniTick`, krize z
`makroKrize`/`lokalniKrize`). Hráč kartu otevře, rozhodne se, uvidí důsledky.
- Náš ekvivalent: `SouhrnKola.zpravy` z `endTurn` + šablony událostí jako karty
  s akcemi; AI (Mistral) textově vypráví rámec karty, engine drží efekty.

### 2. Dashboard indikátorů napříč doménami
Jejich hra ukazuje ~150 indikátorů v 11 doménách. Přebíráme strukturovaný HUD
se souhrnem domén: finance (pokladna, majetek), kariéra (funkce, známost L/S/N,
sociální kapitál), pověst (integrita, etika, prodejnost), právo (kriminální
riziko, FEC audit), makro (HDP, inflace, nezaměstnanost, Fed, deficit, dluh,
rating), obec (spokojenost, kriminalita).
- UX pravidlo z jejich changelogu: „zelená vždy znamená dobře pro vás, červená
  zle — nezávisle na směru čísla“. Např. nízká kriminalita i nízký deficit
  jsou zelené, vysoké HDP růst zelený; barva kóduje prospěch hráče, nikoli
  znaménko hodnoty.
- Data dodává `hudData(state)` z `indicators.ts`.

### 3. Volební noc na živé mapě států
Jejich volby se odehrávají na hex mapě s postupným barvením. Náš ekvivalent:
hex/dlaždicová mapa USA (50 států + DC) s počty volitelů; během volební noci
se státy postupně vybarvují dle `VysledekPrezidentske.staty` (marže, EV,
výherce). Součet EV = 538 je testovaný invariant. U nižších závodů
(kongresové, obecní) mapa zobrazí jen relevantní obvod/město.

### 4. Novinové titulky jako zpětná vazba
Každé významné rozhodnutí komentuje fiktivní tisk (`tiskovka`, skandály,
volby) formou útržků titulků. Náš deník (`LogEntry`) je zdrojem; UI je
zobrazí jako novinové výstrižky s datem a perexem.

### 5. Sliby jako smlouva
Jejich voličské sliby mají stavy delivered / in progress / broken. Náš model
`Slib.stav` (`v_progressu` / `splnen` / `porusen`) s lhůtou 52 kol odpovídá;
UI zobrazí sliby jako „smlouvu s voliči“ s odpočtem lhůty.

### 6. Zákony dle rezortů
Jejich legislativa je tříděná dle resortů. Náš katalog akcí `zakon` má témata
(ekonomika, sociální, bezpečnost, zdravotnictví, infrastruktura) a databáze
zákonů (`zakony.ts`) kategorie a oblasti; UI nabídne kodex s fulltextem
(`hledejZakony`).

### 7. Rating + dluh + průzkum na domovské obrazovce
Nejdůležitější tři čísla vždy na očích: osobní rating (u nás podíl hlasů z
`pruzkum`), státní finance (dluh a rating z `Macro`) a souhlas voličů
(spokojenost). Mobilní zobrazení je primární (PWA), desktop vedlejší.

## Co jsme nechtěli přebírat

- Mikrotransakce a energy systém — hra je osobní, bez monetizace.
- Absolutní game over — u nás nikdy; odsouzení vede do stínové kariéry
  (demotion na outsidera, možnost návratu).
- Redakční humor britského typu — u nás věcný, formalizovaný tón s českými
  fiktivními titulky (např. „Lakeside Chronicle“).
