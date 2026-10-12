# Kontrol af rejseoversigt og lokale oplysninger

Implementeringen følger GitHub Issue #15. Der er ingen ændringer af takstdata; appens visning og nye manuelle udgifter er afkoblet fra prisoverslag.

## Automatiske kontroller

- `npm test`: 51 beståede tests. De eksisterende domænetests for geografi, takster, bookingafhængigheder og faste aftaler er bevaret. UI-assertions for fire kort og beregnede priser er opdateret til de nye krav.
- Nye tests i `tests/journey-management.test.js` dækker tre rejseben, manuelle priser inkl. nul som eksplicit pris, delsum/total, validering, mødeinterval, midnat og dansk sommertid, IndexedDB-genåbning, originaldokumenter, erstatning/sletning, rollback ved fejlet transaktion, søgbart stationsvalg inkl. ældre stationer, automatisk stationsvalg og eksplicit redigering af bekræftede tider.
- `npm run verify:deploy`: produktionsbuild og afgrænsning af offentlige assets består. PDF-workeren leveres som offentlig JavaScript-modul; dokumenter og testfixtures indgår ikke i buildet.
- `git diff --check` og `npm audit --omit=dev`: ingen fejl eller kendte produktionssårbarheder ved kontrollen.

## Browserkontrol

Kontrolleret i den samarbejdende Chromium-browser ved 1280 px desktop og 390 px mobilbredde. Testdokumenterne er syntetiske: et DOCX med overskrift, afsnit og tabel samt en PDF med to sider (`tests/fixtures/documents.js`).

- Upload af begge filtyper via filfelterne gemmer originalbytes og tilføjer dokumenthandlinger i togbenet.
- DOCX-visningen indeholder tekst og en faktisk HTML-tabel; mobilmargenerne er tilpasset for at undgå smalle, svært læselige kolonner.
- PDF-visningen tegner begge sider på canvas og giver tilgængelig tekst samt zoom.
- Genindlæsning og genåbning bevarer dokumenter, tre manuelt angivne priser og 30-minuttersvalget.
- Manuelle priser på 50,50 / 100 / 25 kr. vises som en samlet pris på 175,50 kr. En enkelt registreret pris vises som registrerede udgifter.
- Mødetiden skifter straks fra 10.45 til 10.30 for en togafgang kl. 11.00. Tastaturfokus bevares på segmentkontrollen efter lagring.
- Rejseoversigten har præcis tre primære trin, ingen separate bookingpaneler og intet vandret overflow.

Word-layout kan variere i browseren. Beskadigede eller adgangskodebeskyttede filer får en fejl i læseren; originalfilen forbliver lokal og kan hentes. Stationslisten er bevidst midlertidig og kan erstattes i `src/stations.js`. Aftalte stationer ændres ikke gennem redigeringskontrollen efter registrering af en booking.
