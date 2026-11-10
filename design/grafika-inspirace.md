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

## Druhá inspirace — ReLife Life Simulator (reimcode)

Reference: https://play.google.com/store/apps/details?id=com.reimer.relife
(rozhodovací simulátor života „rok za rokem"; 50 tis.+ stažení, hodnocení 4,7).

### 1. Obrazovka roku: věk + příjem + stav jako přehledný dashboard
ReLife staví hlavní obrazovku na kartě postavy: jméno, věk a peníze vždy
nahoře, pod nimi rozhodovací volby daného roku. Přebíráme: na herní
obrazovce je vždy vidět kdo jste (jméno, funkce), kolik máte peněz
(majetek + pokladna kampaně) a kolik je herního času (kolo/týden/rok).

### 2. Volby jako karty s jasnými trade-offy
Každý rok přináší karty rozhodnutí s okamžitými i dlouhodobými důsledky.
Náš ekvivalent: karty akcí z `dostupneAkce` + karty událostí z inboxu;
každá karta ukazuje cenu v AP a hlavní efekt, trade-off je součást textu.

### 3. Statistiky postavy jako pruhy
ReLife zobrazuje vlastnosti (zdraví, štěstí, inteligenci, reputaci)
jako pruhy. Přebíráme formát pruhů pro známost L/S/N, sociální kapitál,
integritu, etiku a rizika — barva dle pravidla „dobře/zle pro vás".

### 4. Novinky ze světa ovlivňují postavu
Změny ekonomiky a události ve světě zasahují do herního prostředí
zpravodajstvím na obrazovce. Náš ekvivalent: novinové titulky (fiktivní
„Lakeside Chronicle") reagují na makro ticky a skandály.

### 5. Zanechání odkazu / bilance kapitoly
ReLife na konci života ukazuje bilanci (úspěchy, majetek, vztahy).
Přebíráme: po prohrách i odsouzení zobrazíme „bilanci kapitoly"
a nabídneme pokračování — stínová kariéra nikdy nekončí definitivně.

### 6. Poučení z kritiky ReLife (Reddit, recenze)
Hráči vytýkali ReLife sterilní, monochromatické UI bez barev a bez
identity postavy („korporátní checkbox"). Závěr pro nás: nikoli čistě
šedivý formulářový vzhled — karty mají barevné akcenty, postava má
vizuální identitu (monogram, barva strany), typografie má hierarchii
(velká čísla, titulky, perexy). Zároveň nezopakujeme jejich chybě
malých tlačítek: primární akce jsou velké, minimálně 44 px na dotek.

## Co jsme nechtěli přebírat

- Mikrotransakce a energy systém — hra je osobní, bez monetizace.
- Absolutní game over — u nás nikdy; odsouzení vede do stínové kariéry
  (demotion na outsidera, možnost návratu).
- Redakční humor britského typu — u nás věcný, formalizovaný tón s českými
  fiktivními titulky (např. „Lakeside Chronicle“).

## Třetí revize — AI-chat-first (Milník 3)

Zpětná vazba hráče: hra působila uzavřeně (klikání po kartách akcí) a přehledně
přeplácaně. Závěry a promítnutí do UI:

### 1. Chat jako hlavní ovládání, karty jen sekundárně
Hráč nevybírá z katalogu, ale formuluje záměr přirozeným jazykem; AI náčelník
štábu (Mistral) plán převede do JSON schématu a engine jej validuje a vykonává.
Volnost rozhodování tak roste bez ohrožení determinismu: AI navrhuje, engine
rozhoduje (whitelist akcí a parametrů, rozpočet AP, validace událostí).
- Karty ručních akcí zůstávají sbalené v sekci „Ruční akce“ jako záložní cesta
  a bez API klíče.

### 2. Jedna obrazovka, tři kotvy
Hlavní scéna = chat vlevo (dominantní), pravý panel = brance, osobní ukazatele,
makro. Vše ostatní (kodex, sliby, lidé, deník) sbaleno do <details> „Archiv“.
Hlavička zredukována na jednu řádku: identita, finance, kolo/týden, AP,
Ukončit kolo, nastavení AI, nová hra.

### 3. Zpětná vazba v konverzaci
Výsledky akcí (✓/✗ se zprávami enginu, varování, vyřazené položky plánu)
se zobrazují přímo v bublinách chatu — hráč nemusí sledovat novýňský pás ani
deník. Zprávy endTurn přicházejí také do chatu.

### 4. Barvení zůstává pravidlem, ne ozdobou
Zelená = dobře pro vás, červená = zle; jednotné napříč brancí, ukazateli
a makrem. Minimalistické pruhy bez přebytečných čísel.

---

## Čtvrtá revize — user-friendly vodítka

Východisko: audit cizího prototypu „Statecraft" (repozitář US-POL) ukázal, že
silný není jeho rozsah, ale schopnost hru vést. Z prototypu jsme převzali
myšlenku „in-tray briefings" (obálka s naléhavými memorandy) — nikoli jejich
obsah ani scénářovou strukturu. U nás briefinky negeneruje pevný scénář, ale
funkce `sestavBriefinky`, která je deterministicky odvozuje ze stavu hry:
právní riziko, volební výbor, kampaň, slib v lhůtě, kariérní brána.

Co přibylo v rozhraní:

1. Stůl štábu — karta nad chatem s maximálně třemi doporučeními pro týden,
   každé s tlačítkem „Zapsat do chatu". Hráč nikdy nekviká prázdným polem.
2. Návrhové štítky pod vstupním polem před první zprávou — čtyři až pět
   záměrů odvozených ze stavu (`navrhyZameru`), kliknutí vyplní vstup.
3. Strukturovaný souhrn kola — odrážky místo odstavce; ChatZprava má
   volitelné pole `seznam`.
4. Seskupení ručních akcí do šesti oblastí s nadpisy — tlačítka zůstala
   nezměněná, jen dostaly strukturu (SKUPINA_AKCE, PORADI_SKUPIN).
5. Karta „Jak se hraje" v prologu — tři kroky: přirozený jazyk, AP a Stůl
   štábu, ukončení kola v hlavičce.
6. Archiv: Historické zákony USA s plnotextovým hledáním tolerantním k
   diakritice a grid devíti soudců SCOTUS. Ideologické štítky zákonů
   záměrně neutrální (bg-slate-700) — pravidlo zelené/červené barvy platí
   výhradně pro prospěch hráče, nikoli pro popis cizího obsahu.

Zahodeno z prototypu: britská kontaminace (Prime Minister, Labour, NHS,
gilts), nedeterministické Math.random v simulačním tiku a model „AI vypíše
čísla, UI je bez validace použije". Náš engine vše validuje (parsujPlan,
validateAiEventProposal) a fakta historických zákonů prošla multi-source
verifikací (Kongres, veřejné zdroje).

---

## Pátá revize — místní poradce a vzhled podle politických her

Východisko dvou podnětů: hra musí být plně hratelná bez API klíče a vzhled
má soutěžit s předlohami z internetu.

### Místní poradce štábu (bez klíče)

Dosud chat bez klíče vrátil jen chybovou hlášku. Nově překládá záměry
deterministický místní poradce (`engine/src/poradce.ts`): kmenová shoda
zvládá české skloňování („konverzaci“ najde „konverzace“), vytěží částku
(„5 000“, „$5000“, „10k“), pozná NPC podle příjmení a poradenské otázky
(„co bych měl dělat?“) zodpoví ze stavu — vždy bez akcí. Plán jde
stejnou cestí jako odpověď AI: sestaví Plan, engine jej validuje
a vykoná. Mistral API zůstává volitelným vylepšením; hlavička ukazuje
špíček režimu: „Štáb: Mistral AI“ nebo „Štáb: místní poradce“.

### Vizuální předlohy a jejich promítnutí

- Democracy 4 (Positech): dashboardová hustota dat, barevné výplně
  ukazatelů, situace jako karty s akcentem. Promítnuto: gradientní
  výplně pruhů, svislé akcentové linky u nadpisů panelů (brance amber,
  osobní sky, makro rose), kartičky Udaj s jemným rámem.
- Suzerain (Torpor): filmovost, výrazné akcenty, klidná typografie.
  Promítnuto: karty Stůl štábu a modální volební noc s akcentovým
  levým okrajem a výraznými titulky, ztmavené pozadí (slate-950).
- The Political Machine (Stardock) a volební vysílání CNN/FOX: mapa
  států, televizní scoreboard. Promítnuto: volební noc jako studio —
  dvě velká pole počítadel elektorských hlasů s progress bary k 270,
  mapa s gradientními dlaždicemi a stíny, trikolóra jako vizuální
  motiv v hlavičce, prologu i modální kartě.

### Drobná vylepšení rozhraní

- Hráčské bubliny chatu: gradient emerald→teal se stínem, asimetrické
  rohy; systémové zprávy jako „tikr“ s amber levou linkou.
- Tlačítka ručních akcí se zdvihnou a nasvítí při najetí; cena AP
  barvená dle tíže (1–2 sky, 3–4 amber, 5+ rose).
- Prolog: gradient titulek přes trikolórní pruh, karty archetypů
  s prohloubením při najetí, gradientní CTA.
- Ukazatele AP jako tečky 2.5px — čitelnější na první pohled.
