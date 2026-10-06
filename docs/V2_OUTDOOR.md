# MycoTrail V2 web

## Implementazione

- Leaflet conservato. Il catalogo `src/lib/maps.ts` e' indipendente dal renderer: Topografica OpenTopoMap predefinita, Stradale OSM, Satellite e Outdoor MapTiler opzionali.
- Il cambio sfondo mantiene istanza, vista, punti e tracce. Errori cartografici espliciti con passaggio manuale a Stradale. Nessuna cache offline o download massivo dei tile.
- OpenTopoMap contiene sentieri, curve di livello e rilievo renderizzato. NON misura pendenze e NON classifica versanti. Qualita', aggiornamento e disponibilita' del servizio non sono garantiti.
- Bussola attivata su gesto dell'utente: heading assoluto del sensore quando disponibile, altrimenti course GPS o bearing fra fix sufficientemente distanti e attendibili. Dati sensore scadono dopo 5 s, course dopo 15 s. Nessun orientamento relativo spacciato per Nord. Il riferimento del sensore puo' essere magnetico; usare il telefono in piano, lontano da metalli e verificare sul campo.
- Fullscreen dell'interfaccia via CSS, compatibile anche senza Fullscreen API: non garantisce la scomparsa della barra del browser. Tasti per punto, auto, ritorno, registrazione, layer e SOS. Escape e contenimento del focus; dialoghi restano sopra la mappa.
- SOS locale: fix recente/precedente/impreciso, lat/lon, accuratezza, quota GPS e sua accuratezza se disponibili, timestamp, tel:112, copia e share sheet. Non e' un servizio di soccorso; nessuna chiamata automatica, nessun invio automatico. GPS senza internet possibile ma acquisizione non garantita; telefonate e invio dipendono dalla rete. Se il clipboard non e' disponibile, coordinate selezionabili manualmente.
- Permessi espliciti: concesso/negato/da chiedere, oppure da verificare se Permissions API non disponibile. Guida iPhone/Android senza apertura forzata delle impostazioni.

## Abilitare satellite e Outdoor

Configurare `VITE_MAPTILER_KEY` in Vercel e ricostruire. E' una chiave PUBBLICA del browser, da limitare ai domini autorizzati dal pannello del provider. Non inserire chiavi amministrative o token privati. Verificare piano, quote, condizioni e costi prima dell'uso; nessun account o abbonamento viene creato dal codice.

Il codice usa le API raster documentate: `satellite-v4` e `outdoor-v4`. Senza chiave le due scelte restano disabilitate con spiegazione; non vengono inviate richieste MapTiler. Il catalogo centralizza URL, attribuzione e zoom nativo per poter sostituire provider. Verificare sul deploy copertura e disponibilita' dei tile reali: i test automatizzati non certificano il servizio esterno.

Il browser comunica al fornitore l'area richiesta e normali metadati di rete. Nessun nostro server riceve il taccuino. Attribuzioni visibili anche a schermo intero.

## Compatibilita' dati

Invariati: `indexedDB.open("mycotrail", 1)`, store `data`, chiave `main`, schema backup `version: 1`, segmentazione tracce e GPX. I metadati sensore `LiveFix` restano in memoria; il callback del tracking trasmette solo i campi Fix V1. Nessuna migrazione distruttiva. Il layer preferito usa una chiave localStorage distinta, `mycotrail.map-layer.v2`, con fallback in memoria in caso di errore.

## Leaflet, MapLibre e versanti

Leaflet basta per satellite/raster topografico. Migrare soltanto il renderer quando il prodotto richiede DEM, hillshade dinamico o terreno 3D e dopo aver scelto dati/licenza/copertura. `DemSource` e `TerrainSample` documentano il confine futuro, non simulano dati.

Futura analisi: decodifica DEM in metri, pixel adiacenti anche ai bordi delle tile, correzione della scala metrica per latitudine, gradiente per slope/aspect, gestione NoData e zone piane (aspect nullo), overlay con legenda e risoluzione dichiarata. Le ombre di una mappa non sono una misura della pendenza. Nessun filtro versanti disponibile ora.

## GPS nativo, fase successiva

La PWA continua a sospendere registrazione e watch in background. Installarla sulla Home o aggiungere Wake Lock non rende affidabile il GPS a schermo spento. `LiveFix` e le funzioni pure della posizione costituiscono il confine per un futuro adapter nativo; nessun pacchetto Capacitor installato in questa fase.

1. Integrare Capacitor dopo collaudo V2 web, mantenendo una build web indipendente.
2. Implementare adapter posizione/permessi e lifecycle nativo. Il solo plugin ufficiale `@capacitor/geolocation` non risolve direttamente il background; valutare plugin dedicato e compatibilita' della versione.
3. Android: servizio di localizzazione in foreground, notifica persistente e permessi pertinenti alla versione Android. iOS: Background Modes Location Updates, descrizioni dei permessi e richiesta progressiva corretta.
4. Registrare in una coda persistente NATIVA quando la WebView e' sospesa; al rientro deduplicare, ordinare e importare i fix senza inventare segmenti. Non affidarsi al solo callback JavaScript o ai timer.
5. Disattivare la pausa automatica web soltanto nel percorso nativo verificato. Gestire chiusura forzata, riavvio, risparmio energetico, permesso revocato e storage pieno senza promesse di continuita' assoluta.
6. L'archivio della WebView non e' automaticamente quello del browser: prevedere trasferimento esplicito backup/importazione. Non cancellare quello originale. Nessun login/backend/Squad necessario.
7. Collaudo reale Android/iPhone su percorso noto, schermo spento, assenza di rete e soste; confrontare punti, buchi, durata, distanza e batteria.

## Riferimenti

- https://opentopomap.org/about
- https://operations.osmfoundation.org/policies/tiles/
- https://docs.maptiler.com/cloud/api/maps/
- https://docs.maptiler.com/cloud/api/tiles/
- https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/
- https://capacitorjs.com/docs/apis/geolocation
- https://github.com/capacitor-community/background-geolocation
