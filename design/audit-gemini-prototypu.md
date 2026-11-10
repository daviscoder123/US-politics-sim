# Audit prototypu „Statecraft" (repozitář US-POL)

Cizí prototyp politického simulátoru vygenerovaný AI jsme prošli soubor po
souboru. Cílem nebylo kopírování, ale oddělit osvědčené myšlenky od chyb a
promítnout jen to prospěšné do našeho návrhu.

## Závažné vady prototypu

1. Rozbitá sestavitelnost: čtyři moduly importují `../types/game`, který ve
   flattové struktuře neexistuje; `index.html` odkazuje na `/src/main.tsx`,
   který v repozitáři chybí. Projekt v dané podobě nelze spustit.
2. Nedeterminismus: `Math.random()` přímo v simulačním tiku — nelze
   replaovat ani testovat.
3. Britská kontaminace americké hry: Prime Minister, Labour/Conservative,
   Hung Parliament, NHS waiting lists, gilts, sleaze score.
4. Nevalidovaná důvěra v AI: výstup promptu (capitalChange, approvalDelta)
   jde bez kontroly přímo do herního stavu — model může hru libovolně
   narušit.
5. Faktní chyby v datech: TCJA Senát uveden 51–48 (správně 51–49), ACA
   připsáno 45 milionů nově pojištěných (reálně přibližně 20 milionů).

## Ověřená fakta (multi-source: Kongres, congress.gov, veřejné zdroje)

IRA 51–50 / 220–207 · CHIPS 64–33 / 243–187 · IIJA 69–30 / 228–206 ·
TCJA 51–49 / 227–203 · ACA 60–39 / 219–212 · BSCA 65–33 / 234–193.
Public laws: 117-169, 117-167, 117-58, 115-97, 111-148, 117-159.
SCOTUS: 9 soudců, poměr 6 konzervativních ku 3 liberálním.

## Převzaté myšlenky (transformovaně, nikoli zkopírovaně)

- In-tray briefings → náš „Stůl štábu": doporučení se negeneruje scénářem
  ani AI, ale počítá deterministicky ze stavu (`sestavBriefinky`).
- Návrhové odpovědi u tiskových otázek → návrhové štítky záměrů u chatu.
- Souhrn kola → strukturovaná odrážková zpráva v chatu.
- Katalog reálných zákonů a SCOTUS → vzdělávací archiv s opravenými fakty
  a zdroji (`engine/src/realne-zakony.ts`), vyhledávání tolerantní
  k diakritice.

## Záměrně nepřevzato

- Veškerý obsah (texty, mema, jména NPC, kabinet) — naše data jsou vlastní.
- Model „AI rozhoduje o číslech" — náš engine vše validuje (parsujPlan,
  validateAiEventProposal); AI pouze navrhuje, engine vykonává.
- Britské pojmy a struktura kariéry kopírující UK simulátor, jehož kopií
  prototyp de facto byl.

Závěr: z prototypu zůstaly čtyři myšlenky na vedení hráče a jedna datová
inspirace. Veškerý kód, obsah i architektura zůstávají naše.
