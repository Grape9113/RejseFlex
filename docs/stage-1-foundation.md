# RejseFlex: Stage 1-fundament

Status: designgrundlag til gennemgang før `to-spec`. Ingen app er implementeret.

## Produktgrænse

RejseFlex er en uofficiel dansk rejseguide for brugere med kommunalt bevilget handicapkørsel, behov for DSB Handicapservice ved tog og uden handicapbil. Den primære rejse er handicapkørsel → tog → handicapkørsel. Appen beregner, foreslår, forklarer, husker, advarer og linker videre. Den booker ikke transport, assistance eller billetter.

Brugeren angiver fra, til og seneste ønskede ankomst på destinationsadressen. Appen foreslår en rejsekæde og vælger som udgangspunkt næste bookinghandling ud fra afhængigheder. Brugeren behøver ikke selv kende trafikselskaber eller bookingrækkefølge. En plan med utilstrækkeligt grundlag vises som foreløbig med konkret angivelse af, hvad der skal kontrolleres.

## Domænemodel

- **Sted**: brugerens søgetekst, valgt adresse/navn, koordinater og kilde. Geografisk klassifikation er et separat resultat og kan være ukendt.
- **Rejseønske**: startsted, destination og ønsket ankomsttid. Søgning er midlertidig, indtil brugeren vælger en rejseplan.
- **Rejseplan**: valgt kæde, planens oprindelse (demo eller senere rigtig datakilde), gennemførlighed/ukendte forhold og bookingforløb.
- **Rejseben**: handicapkørsel eller tog, med start/slut og planlagte tidspunkter. Et handicapkørselsben rummer relevant trafikselskab, estimeret pris med eksplicit ukendt tilstand, bookingkanal, instruktioner og manuelt registrerede aftalevilkår. Et togben rummer stationer, afgang, ankomst og plads til senere forsinkelse/aflysning.
- **Handicapserviceopgave**: knyttet til et bestemt togvalg og dets stationer, med behov, bookingstatus, frist, mødetid og vejledning. Et nyt togvalg efter bekræftelse skaber konflikt.
- **Bookingopgave**: separat fra rejsebenet. Den har afhængigheder, status, anbefalet næste handling, brugerens registrerede tider og særskilt bekræftelse af, at en ekstern bestilling er gennemført.
- **Dokumentreference**: senere lokal tilknytning af en fil til rejseplan eller opgave. Selve filen er runtime-data på enheden.

Planlagte tider, brugerens faktisk oplyste tider og bookingbekræftelse er forskellige oplysninger. Bekræftede aftaler ændres aldrig automatisk. Genberegning ændrer åbne forslag og producerer en synlig konflikt, hvis en fast aftale ikke kan forenes med resten.

## Modulgrænser og dataflow

1. **Stedsøgning** omsætter naturlig søgetekst til valgbare steder og koordinater. En udskiftelig geokodningsadapter sender kun aktuel søgetekst til tjenesten. Kortvisning er en separat adapter baseret på OpenStreetMap-data. Brugeren informeres om ekstern søgning.
2. **Geografisk klassifikation** omsætter koordinater til eventuelt trafikområde/trafikselskab. Et ukendt resultat er gyldigt input til planlægning; det pågældende handicapkørselsben får ingen konkret bookinginstruktion, før området er kendt.
3. **Togkilde** leverer stationer og forbindelser gennem en udskiftelig grænseflade. Første kilde er tydeligt mærkede demoafgange. Modellen har plads til senere driftsstatus.
4. **Planlægning** danner kandidatrejser af steddata, togforbindelser, handicapkørselsben og tidsmæssige constraints. Ukendte priser, buffere eller regler repræsenteres som ukendte værdier, ikke gæt forklædt som fakta.
5. **Regel- og vidensevaluering** anvender versionerede offentlige data med type (beregningsregel, krav, advarsel, tip), kilde, sidst verificeret, geografisk scope, gyldighedsperiode og anvendelsesområde. Resultatet indeholder både effekt og forklaring. Konflikter og manglende nødvendige regler bliver eksplicitte evalueringsresultater. Regeldata ligger uden for UI-logikken.
6. **Journey workflow** opretter bookingopgaver og afhængigheder, vælger normalt næste handling automatisk og genberegner efter brugerinput. Valget kan forklares ud fra plan, registrerede aftaler og anvendte regler. Manglende nødvendig viden udløser en målrettet kontrolopgave.
7. **Lokal lagring** gemmer valgte rejseplaner, bookingoplysninger og senere dokumenter på enheden. Repository og deploy indeholder kun appkode, assets og bevidst offentlige data.
8. **UI** viser startskærm med integreret kort og primær interaktion fra → til → ankomsttid. Efter søgning er rejseoversigt og “Næste handling” i centrum. Cards viser handicapkørsel, tog, Handicapservice og handicapkørsel med status, vigtigste tid, handling, relevante regler/tips og senere dokumenter.

## Workflow og tilstande

En bookingopgave kan være `ikke klar`, `klar til booking`, `afventer brugerinput`, `bestilt`, `kræver genberegning` eller `færdig`. Fejl og konflikter er særskilte årsager/resultater, ikke skjulte statusser. En bekræftet bestilling kræver eksplicit brugerbekræftelse; indtastning af et tidspunkt alene er ikke nok.

Bookingrækkefølge følger afhængigheder og styrende/usikre ben. For eksemplet Søndersø → Dock 1 kan systemet først foreslå sidste handicapkørsel, derpå vælge tog ud fra faktisk afhentningstid, derpå Handicapservice til det valgte tog og til sidst første handicapkørsel. Den konkrete rækkefølge er et evalueret resultat, ikke en fast UI-sekvens. Uafklaret regelviden giver kun brugerens kontrol/valg, hvor den er nødvendig.

En rejseplans gennemførlighed bør skelne mellem mindst `foreløbig`, `planlagt` og `konflikt`. Demoindhold er en særskilt oprindelsesmarkering, som forbliver synlig på alle relevante visninger. Demoafgange må ikke fremstå som reelle afgange.

## PWA, hosting og privatliv

Frontend er mobile-first og statisk hostbar på GitHub Pages, inklusive korrekt base path, klientrouting og assets under repositoryets Pages-sti. PWA-cachen må kun indeholde offentlige app-assets og offentlige data. Personlige rejser og filer gemmes lokalt i browseren gennem en isoleret lageradapter; dokumenter skal senere kunne lagres som lokale binære data. Ingen uploadsti til GitHub eller Pages. Offentligt GitHub-repository er kildekodens source of truth. En senere backend til push eller livefunktioner er et separat system og kræver en særskilt privatlivsbeslutning.

## Håndtering af usikkerhed

Enhver tidsværdi og pris bør bære oprindelse og sikkerhed: brugerbekræftet, datakilde, beregnet, demo eller ukendt. Planlægning må ikke kalde en rejse gennemførlig, når nødvendige constraints ikke er vurderet. Manglende togdata, geokodningsfejl, ukendt trafikområde, udløbet regel, uforenelige tider og lokal lagerfejl skal give specifikke brugerforståelige resultater. Appen skal kunne vise en foreløbig kæde uden at give ubegrundet bookingråd.

## Bevidst udsat

Præcise priser, komplette trafikselskabsaftaler, alle stationsregler, bookingfrister, overgangsstationsvalg og standardbuffere er åbne data-/regelspørgsmål. Første implementation bruger grænseflader, eksplicit ukendt tilstand og tydeligt mærkede demoeksempler. Direkte booking, billetkøb, anden transport end den primære rejsekæde, liveforsinkelser og push ligger uden for Stage 1.
