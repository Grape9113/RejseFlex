# Import af rejsebilag

Manuel import og Android Web Share Target bruger samme importskærm og lagring. DOCX bliver `assistance` (Rejseplan), PDF bliver `ticket` (Kørestolspladsbillet). Klassificeringen bruger kun filendelsen og en konsistent MIME-type; den læser eller analyserer ikke dokumentindhold. XML og modstridende typer afvises. Tom/generisk MIME accepteres; DOCX accepterer også ZIP-MIME, PDF de almindelige PDF-varianter. Filer skal være 1 byte–20 MB.

`public/import-storage.js` deles af appen og den klassiske service worker. Midlertidige filer og oprettelseskladder gemmes med hver sin UUID i IndexedDB `rejseflex-imports/pending`. URL-fragmentet `#import=<id>` gør genindlæsning mulig. Ingen fil sendes til en server. Ved ny rejse bruges den eksisterende formular og bekræftelse; kladden gemmes ikke som en rejse før **Gem rejse og importér bilag**.

`journeyStore.completeImport` gemmer originalfilen og dokumentreferencen atomisk i den eksisterende database. Den læser rejsens seneste værdier og bevarer andre felter og dokumenter. Erstatning kræver brugerens særskilte tilvalg og det forventede eksisterende dokument-id; et konkurrerende skift af dokument afvises. Dokument-id `import-<id>` gør gentagelse idempotent. Hvis siden afbrydes efter gemning, men før oprydning, finder næste åbning det gemte dokument og afslutter uden at oprette en ekstra rejse. Afslutning og annullering sletter den midlertidige import. En afbrudt import beholdes til genoptagelse via dens URL.

Manifestet modtager ét bilag i feltet `documents` med POST/multipart til `/RejseFlex/share-target`. Service workeren gemmer filen før en 303-redirect til `/RejseFlex/#import=<id>`. Ruten er inden for installationens scope og kræver ingen backend. Fejl omdirigeres til importskærmen med en fast fejlkode. Eksisterende GET-cache og offline-navigation bevares.

## Kontrol på fysisk Android-enhed

1. Åbn den publicerede app i en understøttet Chrome-version og installer PWA'en. Ved en eksisterende installation skal det opdaterede manifest/WebAPK være registreret.
2. Del en DOCX-vedhæftning og derefter en PDF-vedhæftning fra mailappens delingsmenu. Kontrollér at RejseFlex vises, åbner importskærmen og klassificerer korrekt.
3. Importér til en ny og en eksisterende rejse. Kontrollér eksplicit erstatning, annullering, original download, dokumentvisning og genåbning efter reload/offline.
4. Kontrollér en manglende/ikke-understøttet fil og to næsten samtidige delinger. De må ikke blandes eller ændre eksisterende data uden bekræftelse.

Automatiserede multipart-POST-tests og browserkontrol kan ikke bevise integrationen med Androids native delingsmenu. iOS og desktop bruger **Importér rejsebilag** og en almindelig filvælger. Ingen native share extension er implementeret.

Chrome kan opdatere en eksisterende Android-installations WebAPK efter en manifestændring; geninstallation er normalt ikke nødvendig, men registreringen kan være forsinket. Se [Chrome: modtag delte filer](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) og [manifestopdateringer](https://web.dev/articles/manifest-updates). Hvis RejseFlex fortsat mangler i delingsmenuen efter opdatering, kan geninstallation være nødvendig for at få den nye registrering. Slet ikke webstedets lokale data.
