# Politický simulátor USA

Dlouhodobý kariérní simulátor americké politiky: cesta od individua (např. zakladatele firmy)
přes komunální a exekutivní funkce až po prezidentský úřad. Hra je primárně ovládána AI chatem
(Mistral API), ale veškerá herní logika je vykonávána deterministickým rules enginem, který
AI návrhy pouze validuje a aplikuje. Vysoká obtížnost („dračí doupě“); prohra nikdy není
trvalým koncem — po odsouzení či prohrách hráč pokračuje ve stínové kariéře.

Herní čas: 1 kolo = 1 herní týden; realistická délka herní kariéry je 500–800 kol (12–16 let).
Cílová platforma: PWA (desktop i mobil).

## GitHub Pages (okamžitě hratelné)

Repozitář obsahuje generátor statického webu bez bundleru (`sestav-static.cjs`):

```bash
node sestav-static.cjs   # vygeneruje site/app.js + site/index.html + site/404.html
```

Větev `gh-pages` obsahuje výstup v kořeni; web běží na adrese
`https://daviscoder123.github.io/US-politics-sim/`. Stránka načítá React,
ReactDOM, @babel/standalone (transform TypeScript/JSX v prohlížeči) a Tailwind
z veřejných CDN; veškerá herní logika je v jediném `app.js`.

### Integrace Mistral AI

Hru lze hrát zcela bez klíče přes místního poradce štábu (`engine/src/poradce.ts`).
S klíčem z [console.mistral.ai](https://console.mistral.ai) funguje plnohodnotná
AI vrstva: klíč se vkládá v nastavení štábu (uložen jen v localStorage prohlížeče),
tlačítkem „Ověřit klíč Mistral“ se provede kontrola vůči `api.mistral.ai/v1/models`.
API Mistral podporuje CORS (`access-control-allow-origin: *`), takže prohlížeč
volá API přímo — žádný server ani proxy není potřeba.

## Architektura enginu

Moduly ve `engine/src/` (jazyk TypeScript, strippatelná syntaxe bez enumů a namespaces,
identifikátory česky, veškerá náhodnost výhradně přes seedovaný `Rng`):

| Modul | Odpovědnost |
| --- | --- |
| `rng.ts` | Deterministický generátor (mulberry32): uniform, int, range, chance, pick, normal |
| `state.ts` | Typy stavu, 12 archetypů prologu, `vytvorNovouHru` (kalibrace makro USA 2027), `rngProStav`, startovní NPC |
| `zakony.ts` | Databáze 30 zákonů (citace, shrnutí, efekty ve hře, zdroje) + fulltextové vyhledávání a citace |
| `realne-zakony.ts` | Archiv 6 historických zákonů USA (IRA, CHIPS, IIJA, TCJA, ACA, BSCA) s ověřenými výsledky hlasování a náklady + 9 soudců Nejvyššího soudu; fulltextové hledání tolerantní k diakritice |
| `law.ts` | Ústavní volitelnost (Art. I §2/§3, Art. II §1, 22. a 26. dodatek), FEC limity 2025–2026, kontrola darů (cizí peníze, koordinace, quid pro quo), sankční kaskáda FEC → skandál → DOJ → odsouzení |
| `economy.ts` | Okunova a Phillipsova křivka, NAIRU 4,3 %, Taylorovo pravidlo pro Fed, fiskální stimul, akumulace dluhu, rating, detekce krizí, lokální tick |
| `indicators.ts` | Kariérní brance (prahy od kandidáta 25 tis. $ po prezidenta 60 mil. $), lokální krize, data pro HUD |
| `social.ts` | Prestižní brána konverzací `prestiž − (sociální kapitál + vztah×5 + bonus úřadu)`, sliby a jejich lhůty |
| `elections.ts` | Utility model voliče, Monte Carlo, primárky (práh 15 %, bonus vítěze), Electoral College (51 států, 538 volitelů), kalendář voleb |
| `actions.ts` | Katalog 24 akcí (prolog, kampaň, obec, kongres/guverner/prezident, ilegální akce), validace včetně právních varování |
| `events.ts` | Tematické šablony událostí (klima, migrace, geopolitika, dluh, technologie, energetika) a `validateAiEventProposal` — schema validace návrhů AI (povolené klíče efektů, magnituda −1..1) |
| `audit.ts` | Otisk stavu a replay helper (determinismus) |
| `game.ts` | Orchestrace: `applyPlayerAction`, `endTurn` (ticky, kalendář, primárky v týdnu 24, volby v týdnu 45, stínová kariéra) |
| `ai.ts` | Vrstva AI chatu: `systemovyPrompt` (role náčelníka štábu, katalog akcí a pravidel JSON schématu), `stavProAi` (kompaktní kontext), `parsujPlan` (whitelist akcí a parametrů, clamp, limit AP), `provedPlan` (sekvenční provedení přes engine) |
| `poradce.ts` | Místní poradce štábu bez API klíče: deterministický překladač záměrů (kmenová shoda českých slov včetně skloňování, odvoz parametrů — částky, NPC dle jména, témata), poradenské odpovědi ze stavu; plán provádí tentýž engine jako u AI |

## AI chat (Milník 3)

Hlavním ovládáním hry je přirozený jazyk. Hráč napíše štábu svůj záměr („zajisti mi sponzory
a zvedni známost ve státě“) a AI (Mistral API, model `mistral-small-latest` s možností změny)
přeloží záměr do striktního JSON schématu: `{reci, akce: [{akce, parametry, duvod}], udalost?}`.
Engine plán očistí a zvaliduje (`parsujPlan`):

- pouze akce dostupné na aktuální úrovni úřadu (whitelist dle `dostupneAkce`);
- pouze whitelisted parametry, číselné clamp, výčtové hodnoty;
- limit 6 akcí a celkový rozpočet AP;
- volitelná vyprávěcí událost projde `validateAiEventProposal` (povolené klíče efektů,
  magnituda −1..1) a aplikuje ji `applyAiEvent`.

AI tedy nikdy nesahá na stav přímo: pouze navrhuje, engine rozhoduje a vykonává.
Hra tím zůstává deterministická a replaovatelná (109 testů invariantů). Bez API
klíče přebírá záměry místní poradce (`engine/src/poradce.ts`) — hra je tak plně
hratelná i bez klíče; klíč se ukládá jen do localStorage prohlížeče.

## Vodítka pro hráče (uživatelská přívětivost)

Rozhraní nevyžaduje znalost pravidel dopředu — hra hráče vede sama, ze stavu:

- Stůl štábu: karta nad chatem každý týden odvodí nejnaléhavější agendu
  (právní riziko, volební výbor, kampaň, slib v lhůtě, kariérní brána) a každý
  bod lze jedním kliknutím zapsat do chatu jako hotový záměr.
- Zpravodajský pás: nejnovější událost světa hry se zobrazuje nad chatem
  jako newsflash (neutralní šedý accent, barevné pravidlo platí jen pro hráče).
- Odpočet voleb: při běžící kampani hlavička ukazuje týdny do primárek
  (týden 24) a do všeobecných voleb (týden 45).
- Návrhové štítky: před první zprávou nabídne hra 4–5 konkrétních záměrů
  odvozených ze stavu (sblížit se s odbory, podat návrh zákona…).
- Strukturovaný souhrn kola: vyhodnocení týdne už není odstavec textu, ale
  odrážkový seznam oddělených událostí.
- Ruční akce jsou seskupeny do šesti oblastí (Finance a kampaň, Lidé a vztahy,
  Vystoupení a pověst, Rozvoj, Správa a úřad) místo ploché stěny 25 tlačítek.
- Prolog obsahuje kartu „Jak se hraje“ se třemi kroky ovládání.
- Archiv rozšířen o Historické zákony USA (plnotextové hledání, diakritika
  nevadí) a přehled devíti soudců Nejvyššího soudu včetně právních filozofií.

## Databáze zákonů

Součástí enginu je databáze 30 záznamů (`engine/src/zakony.ts`), každý s citací, názvem,
kategorií, shrnutím, efekty ve hře a zdroji. Zahrnuje:

- Ústavu USA: Art. I §2/§3 (věkové prahy Kongresu), Art. II §1 (natural-born, 35 let,
  emoluments), dodatky XV, XIX, XXII (max dvě zvolení), XXV, XXVI.
- Volební právo: FECA 1971, 52 U.S.C. §30116 (limity darů), §30118 (korporace a odbory),
  §30121 (cizí peníze), 11 C.F.R. §§100.5, 109, 110.4, BCRA 2002, Hatch Act.
- Precedenty: Buckley v. Valeo, Citizens United v. FEC, SpeechNow.org v. FEC,
  U.S. Term Limits v. Thornton.
- Trestní: 18 U.S.C. §201 (úplatky federálních úředníků), §666 (programy s federální
  participací — městská úroveň, práh 5 000 $).
- Exekutivu a finance: Impoundment Control Act 1974, Anti-Deficiency Act, právo států
  (kvalifikace), home rule.

Engine do herních zpráv automaticky vkládá citace přes `citujZakony(ids)`, takže každé
právní rozhodnutí ve hře má odkaz do kodexu.

## Právní kalibrace (ověřeno z více zdrojů)

- FEC limity 2025–2026: jednotlivec 3 500 $ na volbu (7 000 $ za cyklus), PAC 5 000 $,
  strana 44 300 $ ročně, registrační práh výboru 5 000 $, evidence nad 200 $, hotovost
  do 100 $, anonymní do 50 $. Super PAC neomezeně, ale bez koordinace. Vlastní financování
  neomezeně, hlášené (Buckley v. Valeo). Zdroje: fec.gov, 52 U.S.C. §30101 a násl.
  (uscode.house.gov), eCFR titul 11.
- Ústavní volitelnost: prezident natural-born občan, 35 let, 14 let rezidence, max dvě
  zvolení (22. dodatek); Sněmovna 25 let / 7 let občanství; Senát 30 / 9; komunální funkce
  dle práva státu (zpravidla 18 let). Naturalizovaný občan nesmí být prezidentem ani
  viceprezidentem, smí však usednout do Kongresu a ve většině států i na guvernérský post.
- 18 U.S.C. §201/§666: quid pro quo je federální zločin; u programů s federální
  participací (§666) je práh hodnoty 5 000 $.

## Ekonomická kalibrace (podzim 2026)

Výchozí makro nové hry: HDP růst 2,1 %, inflace CPI 3,7 %, nezaměstnanost 4,2 %,
Fed ~3,88 %, deficit 6,2 % HDP (CBO, FY2026), veřejný dluh ~100 % HDP, rating AA+.
Model používá Okunovu a Phillipsovu křivku (NAIRU 4,3 %) a Taylorovo pravidlo.

## Testy

Deterministické testy invariantů (node:test, bez externích závislostí, Node ≥ 22
s podporou `--experimental-strip-types`):

```bash
npm test
```

Pokrytí (109 testů): determinismus Rng a replay celé hry (JSON otisk), právní invarianty
(naturalizovaný nikdy prezidentem, limity FEC, cizí peníze, quid pro quo, sankční
kaskáda), ekonomika (směr Okun/Phillips, rating, akumulace dluhu), volby (součet EV = 538,
favorit vyhrává, vyrovnaný zápas ≈ 50 %, primárky a delegáti), sociální brána,
AP rozpočet akcí, volební scénáře end-to-end, vrstva AI chatu (parsování plánu,
whitelist akcí a parametrů, rozpočet AP, validace událostí, replay AI plánu)
a bitová identita sloučeného `engine-bundle.ts` s modulárním enginem.

## Aplikace (Milník 2 a 3)

React UI ve `app/` (české rozhraní, temný design, responzivní), ovládání AI chatem
s ručními akcemi jako sekundární cestou:

- `App.tsx` — prolog (jméno, věk, domovský stát, seed, 12 karet archetypů), kompaktní
  hlavička (identita, finance, kolo/týden, AP, ukončení kola), hlavní panel = chat se
  štábem (zprávy hráč/AI s výsledky provedených akcí, nastavení API klíče Mistral a
  modelu v localStorage), boční panel = kariérní brance, osobní ukazatele a makro
  (pravidlo „zelená vždy dobře pro vás"), sbalené sekce Ruční akce (karty akcí
  s modálními formuláři) a Archiv (kodex zákonů s fulltextem, sliby, lidé, deník),
  dlaždicová mapa USA (51 států + DC, 538 volitelů) v modálním okně volební noci,
  autosave do localStorage.
- Importuje výhradně z `engine/engine-bundle.ts` — sloučený engine
  (generovaný z modulů `engine/src/` skriptem `merge.cjs`; replay bitově identický,
  ověřeno testem `test/bundle.test.ts`).
- Spuštění lokálně (Node ≥ 20):
  `cd app && npm install && npm run dev` (Vite + React 18).
- Získání API klíče: zaregistrujte se na console.mistral.ai, vytvořte API klíč
  a vložte jej v aplikaci v panelu „AI“ v hlavičce. Klíč zůstává v prohlížeči.
- Grafické principy: viz `design/grafika-inspirace.md` (Prime Minister UK Politics
  Sim, ReLife a zásady AI-chat-first zjednodušení).

## Vývojářské skripty

- `node merge.cjs` — regeneruje `engine/engine-bundle.ts` z `engine/src/*.ts`
  (pořadí modulů včetně `ai.ts`, deduplikace identických deklarací).
- `node overeni.cjs` — rychlá kontrola balance závorek, přítomnosti importovaných
  exportů v bundlu a souladu mapy USA s `STATY_EV`.

## Plán milníků

1. Deterministický rules engine + testy — hotovo.
2. Prolog a React prototyp UI — hotovo (`app/`, `engine/engine-bundle.ts`).
3. Napojení Mistral API — hotovo (`engine/src/ai.ts`, chat UI, 109 testů).
4. PWA obal, ukládání a načítání her, replay.
5. Kalibrace obtížnosti a balancování kariérních brancí.
6. Obsahová rozšíření (státy, média, sponzoři).
7. Nasazení pro osobní použití.

## Poznámka k obsahu

Hra používá fiktivní osoby, města a média; státy, instituce a zákony jsou reálné.
Hra respektuje americké právo v rozsahu herního modelu a nejde o právní poradenství.
