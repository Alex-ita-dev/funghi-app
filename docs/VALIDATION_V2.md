# Verifica V2 web

## Eseguito nell'ambiente di sviluppo

- TypeScript e `npm run build`: superati. Avvisi non bloccanti: direttiva `use client` di lucide-react e bundle principale sopra 500 kB.
- `npm test`: 16 test superati, inclusi i 9 test V1 e 7 nuovi test su catalogo, bearing, filtri direzione, metadati GPS e testo SOS.
- `git diff --check`: superato.
- Nessuna modifica a `src/lib/model.ts`, `src/lib/storage.ts`, nome/versione/store di IndexedDB o formato dei backup.

## Non verificato in questo ambiente

`npm run test:e2e` e' stato tentato ma i 18 casi (9 scenari x Chromium/WebKit mobile) non hanno potuto avviare i browser: binari assenti. Anche `npx playwright install chromium webkit` ha fallito per archivio scaricato non valido. NON sono 18 test superati e non e' una certificazione iPhone/Android. Nessuno screenshot V2 acquisito.

I nuovi scenari coprono cambio layer e fallback, preferenza persistente, comandi fullscreen, SOS offline con quota/condivisione e scadenza fix, GPS negato e fallback heading. I tile pubblici sono bloccati nei test per evitare dipendenze da rete e servizi esterni. Gli scenari predefiniti assumono assenza di `VITE_MAPTILER_KEY`.

## Collaudo richiesto prima dell'uso sul campo

1. Installare i browser di test: `npx playwright install --with-deps chromium webkit`; eseguire build e `npm run test:e2e`.
2. Su browser reale controllare topografica, curve e attribuzioni; cambiare layer mantenendo centro, zoom, auto, punti e traccia attiva. Verificare errori e pulsanti Riprova/Stradale.
3. Configurare la chiave MapTiler solo dopo approvazione di piano/quote; verificare Satellite/Outdoor, copertura, zoom e limitazione ai domini autorizzati. Nessuna chiave e' stata attivata qui.
4. Fullscreen su iPhone e Android, portrait/landscape: layer, bussola, GPS, SOS, salva punto, salva auto, ritorno, pausa/ripresa; controllare dialoghi, safe area, tastiera e attribuzioni.
5. Bussola: permesso consentito/negato, sensore assente, telefono ruotato, confronto con bussola fisica. Course GPS durante cammino e nessuna freccia persistente dopo scadenza. Nessuna prova in luoghi sconosciuti contando soltanto su MycoTrail.
6. SOS senza fix, fix vecchio, impreciso e quota nulla: copia, annullamento condivisione e offline. Non chiamare il 112 per un test: verificare solo il link senza avviare chiamate.
7. Vecchi dati V1 e backup: aprire, modificare un punto, completare uscita, esportare/importare e verificare segmenti. Non usare fungaie reali nei report pubblici.
8. Tracking in background deve ancora andare in pausa. Il GPS nativo a schermo spento NON e' implementato.
