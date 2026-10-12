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

## Rejseoversigt og personlige oplysninger

Rejseoversigten viser tre rejseben i én lodret tidslinje. Handicapservice er integreret i togbenet med selvstændige bookingkontroller. Gemte rejser, stationsredigering, kilder og kontroloplysninger kan udfoldes. Der er ingen særskilte bookingpaneler under tidslinjen.

Manuelle udgifter gemmes som heltal i øre i `manualPrices`, uafhængigt af `priceEstimate`. Manglende værdier udelades. Vis kun "Samlet pris", når alle tre priser er registreret; ellers "Registrerede udgifter". Takstmodulerne bevares, men appens planlægning bruger `calculatePrices: false`.

Mødeinterval er 15 minutter som standard, eller 30 efter brugerens valg. Mødetiden beregnes fra togafgangen; ved bekræftet Handicapservice bruges den bekræftede togidentitet. Dette ændrer ingen bookingbuffer. Eksplicit redigering af en bekræftet afhentning kræver brugerhandling og bevarer andre aftaler; genberegning må aldrig ændre deres tider.

Stationskomponenten (`station-select.js`) bruger stationers ID, navn og koordinater. Eksempeldata findes separat i `stations.js`. Automatisk bestemte og tidligere gemte stationer uden for datasættet bevares som valgbare værdier. Adresse-autocomplete er uafhængig. Stationsredigering efter registrering af aftaler er spærret, så aftaler ikke flyttes til en anden station ved et uheld.

Dokumentoriginaler opbevares som ArrayBuffer i IndexedDB med journeyId. Henvisning og bytes erstattes eller fjernes i samme transaktion. PDF læses med [PDF.js](https://github.com/mozilla/pdf.js), DOCX med [docx-preview](https://github.com/VolodymyrBaydalka/docxjs). Bibliotekerne indlæses først ved brug. DOCX vises i en iframe uden scripts og med en Content Security Policy, der blokerer eksterne ressourcer. PDF-worker leveres med appens offentlige assets. Dokumenter over 20 MB afvises; DOCX må højst være 60 MB udpakket. Beskadigede eller adgangskodebeskyttede dokumenter giver en læsbar fejl; originalen kan stadig hentes. Browsergengivelse af Word-layout kan afvige fra Word.

## Integreret planlægningsflade og adressefavoritter

Planlægningen fylder skærmen uden ydre kortkant, sidemargin eller separat header. Logoet sidder i formularområdet. Desktop har formular til venstre og et fast kort til højre; mobil placerer kortet efter formularen. Rejseoversigtens logo ligger i den eksisterende kompakte navigation.

Adresseforslag vises i en combobox med grid-popup, fordi adressens valg og favoritknappen er to selvstændige handlinger. Piletaster og Enter vælger adresser; Tab giver adgang til stjernerne, og Escape lukker popupen. Musevalg beholder fokus i feltet ved mousedown, mens touch bevarer scrolling og vælger på click. Fokus uden for komponenten og klik udenfor lukker straks og annullerer åbne opslag; ingen blur-forsinkelse bruges.

Favoritter er brugerens eksplicitte valg og gemmes som komplette adresseobjekter i IndexedDB-indstillingen `favoriteAddresses`. Der oprettes ingen søgehistorik. Samme favoritter bruges i begge felter, står i en særskilt sektion, og overlap med søgeresultater fjernes efter stabil adresseidentifikation. Favoritter kan vælges uden geocoder-netværksadgang.

Kortmarkører er Leaflet-divIcons, så ingen PNG-stier er nødvendige. A er afgang med blå fyldning; B er destination med hvid fyldning og blå kant. Retningen sendes separat til kortet, så en destination uden afgang stadig får B. Popuptekst indsættes som tekst, ikke HTML.
