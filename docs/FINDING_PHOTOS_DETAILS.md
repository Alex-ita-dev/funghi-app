# Ritrovamenti, foto e dettagli — Blocco 4

Base: main dopo PR #2 (`5c9f206`). Nessun backend, account, upload, AI o API ambientale. Foto e metadati restano nel browser.

## Schema e compatibilità

IndexedDB `mycotrail` passa da 1 a 2 aggiungendo tre store: `photoMeta` (keyPath id, indice findingId), `photos` (Blob JPEG), `photoThumbs` (Blob JPEG piccolo). Lo store `data` e le chiavi `main`/`settings` non vengono riscritti dalla migrazione. Chiudere altre schede dell'app se il browser segnala database occupato; una versione precedente aperta può bloccare l'upgrade.

Il taccuino resta V1 con nuovi campi opzionali: quantity (intero, anche zero), weightKg, habitats (ID stabili), soil, aspect (punti cardinali internazionali), altitudeM, spotId. Vecchi punti, coordinate, note e tracce restano validi. I tipi esistenti find/spot sono riutilizzati. Una fungaia può avere più ritrovamenti tramite spotId; eliminare/convertire una fungaia scollega i figli senza eliminarli. Storico ordinato per data decrescente, numero di registrazioni, peso totale noto e ultima data. Il totale conta registrazioni, non esemplari.

Ogni foto ha ID indipendente, findingId, MIME, timestamp, dimensione originale in byte, larghezza/altezza, primary e localOnly. Una foto principale per punto; fino a 8 foto. Nessuna immagine in localStorage o Base64 nel record principale. ID e proprietà locale preparano una futura sincronizzazione senza implementarla.

## Foto e UI

Input distinti: fotocamera (`capture=environment`) e libreria (`multiple`), entrambi `accept=image/*`. Il browser decide le funzioni disponibili. Canvas locale normalizza in JPEG a lato massimo 1920 px, qualità 0.86 (0.75 se necessario), massimo 3 MiB per immagine elaborata. Miniature a lato massimo 320 px e qualità 0.78. Limite file sorgente 25 MiB; file non decodificabili, compresi HEIC su browser incompatibili, producono un errore esplicito. La ricodifica non conserva EXIF: le coordinate dell'app sono separate. Non sostituisce l'originale nella libreria del telefono.

Modulo rapido: tipo, nome, posizione e foto. Quantità, peso, habitat, terreno, esposizione, quota, relazione e note sono espandibili. Il peso usa kg canonici e input g/kg oppure oz/lb; quota in metri con visualizzazione/input piedi quando scelti. La quota GPS proviene dal fix già disponibile, senza nuove richieste/watch; posizione e data non cambiano durante modifica. La correzione manuale della quota è facoltativa.

Le immagini scelte sono bozze in memoria: aggiunta/rimozione/promozione vengono persistite al Salva. Annulla lascia intatte le foto precedenti. Salvataggio e ripristino usano una sola transazione journal + immagini; errori mantengono la bozza aperta. La coda dati valuta le modifiche sullo stato più recente così i salvataggi GPS non sovrascrivono ritrovamenti concorrenti. Nessuna modifica ad algoritmi GPS, segmenti, pause o schema tracce.

Scheda selezionata dal marker con foto, data, riepilogo e dettagli. Il taccuino riusa le cards con miniatura principale, quantità/peso e filtri nome/note, tipo, date inclusive locali, con foto, habitat. Nessuna immagine nei marker non selezionati. Le miniature vengono lette vicino al viewport; Blob grandi soltanto nel visualizzatore o durante export. Object URL revocati alla sostituzione/smontaggio; compressione una sola volta per foto aggiunta. Le etichette nuove sono nei sei cataloghi.

## Backup e cancellazione

Export JSON V2: `{version:2,data:<taccuino V1>,photos:[metadati + base64 + thumbnailBase64]}`. Base64 esiste soltanto durante export/import. Lettura coerente dei Blob in transazione readonly. Limite file 100 MiB con messaggio esplicito; limite prudenziale di 70 MiB di immagini prima della codifica per contenere memoria. File molto grandi possono comunque richiedere memoria e tempo: non è un formato streaming.

Import accetta V1 senza foto e V2 con foto; valida schema, relazioni, ID univoci, foto principale, numero/dimensione immagini e firma JPEG prima di scrivere. Ripristino atomico sostituisce taccuino e immagini, pulendo le precedenti; preferenze utente preservate. Cancellare un punto elimina metadati, Blob e thumbnail nella stessa transazione; nessun Blob orfano intenzionale. Import non disponibile con un'uscita aperta.

## Verifica

Typecheck, build e 63 test unit/component superati localmente. Coperti schema legacy, upgrade reale DB V1, CRUD Blob, rollback su riferimenti mancanti, backup V1/V2 e ripristino, filtri/storico e unità peso. Test GPS/preferenze precedenti mantenuti.

E2E aggiunto sui tre browser configurati: immagine 2400 px ridimensionata, due foto, riapertura, visualizzatore, modifica e promozione principale, eliminazione, backup/ripristino e riapertura. Consultare il check GitHub della PR per il risultato effettivo; i browser locali non sono disponibili nell'ambiente. Restano i due casi offline WebKit esclusi nel blocco precedente (bug Playwright #42775). Test reali di fotocamera/HEIC, quota del sensore e spazio disponibile richiedono iPhone/Android fisici.

Limiti: fino a 8 foto per record; backup completo massimo 100 MiB; niente export parziale o sincronizzazione. La conservazione dipende dalla quota IndexedDB e dalle politiche del browser: cancellare i dati del sito elimina anche le foto. Le mappe continuano a contattare i provider esistenti; le fotografie non vengono inviate loro.
