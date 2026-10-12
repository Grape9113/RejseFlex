# RejseFlex visuelt designsystem

RejseFlex er et arbejdsredskab til rejseplanlægning. Grænsefladen prioriterer adressevalg, næste handling og rejsens trin. Alle eksisterende forbehold og kilder skal være synlige og læsbare.

## Typografi

Brug den lokale sans-serif-systemfont fra `src/styles.css`; ingen fontdownload er nødvendig. Sideoverskrifter er 24–28 px, sektionsoverskrifter 16–20 px, brødtekst 13–14 px og supplerende oplysninger 11–12 px. Brug vægt 600–700 til hierarki. Ingen serif eller dekorative overskrifter. Mobilfelter er mindst 16 px for at undgå automatisk zoom på iOS.

## Farver og tokens

CSS-variablerne i `:root` er fælles reference: `--ink` til primær tekst, `--muted` til sekundær tekst, `--accent` til handlinger og links, `--accent-hover` til hover, `--line` til kanter og `--surface` til komponentflader. Blå er den eneste almindelige accent. Gul, rød og grøn bruges kun til forbehold, konflikter og bekræftelse; teksten forklarer altid tilstanden.

Spacing-skalaen er 4, 8, 12, 16, 24 og 32 px (`--space-1` til `--space-6`). Standardkortradius er `--radius` (12 px), felter og knapper 8 px, små statusmærker 5 px. Kort afgrænses med en tynd kant; skygger reserveres til overlappende forslag.

## Layout og komponenter

Planlægning har maksimalt 1200 px bredde, rejseoversigten 1120 px. Desktop viser formular og kort ved siden af hinanden. Under 700 px kommer kortet efter formularen. Rejsetrin vises i fire kolonner, to under 1000 px og én under 440 px. Tekst og kildeoplysninger må bryde linjer og aldrig skjules for at passe i et kort.

Primære knapper bruger blå baggrund, sekundære handlinger hvid baggrund og kant. Felter har mindst 44 px højde, permanent label og tydelig fokusmarkering. Næste handling bruger en hvid flade med en smal blå kant. Forbehold, konflikter, gemte rejser og bookingafsnit bruger de samme afstande og kanter.

## Interaktive tilstande

Alle tastaturhandlinger har synlig `:focus-visible`. Felter får blå kant og fokusring. Adresseforslag markerer hover og valgt forslag med en lys blå flade. Deaktiverede knapper dæmpes. Bevægelse fjernes ved `prefers-reduced-motion`. Status må aldrig formidles med farve alene.

## Kontrol ved videreudvikling

Kontrollér planlægning, adresseforslag, rejseoversigt, gemte rejser, bookingtrin og fejltilstande ved både mobil- og desktopbredde. Bevar labels, live-regioner og alle demo- og datatjenesteforbehold. Kør `npm test` og `npm run verify:deploy`.
