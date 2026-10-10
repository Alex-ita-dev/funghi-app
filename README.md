# MycoTrail

**Il bosco, a modo tuo.** V2 web outdoor per custodire ritrovamenti, fungaie e percorsi. React + TypeScript + Vite, con Leaflet e dati locali in IndexedDB.

## Funzioni implementate

- Preferenze locali, tema chiaro/scuro/sistema, sei lingue, preset paese e unità personalizzabili; onboarding e profilo cercatore facoltativo per utenti esistenti. Dettagli e verifiche in [SETTINGS_ONBOARDING.md](docs/SETTINGS_ONBOARDING.md).
- Topografica OpenTopoMap (sentieri, curve di livello, rilievo), Stradale OSM e switch mobile. Satellite e Outdoor MapTiler disponibili solo dopo configurazione della chiave pubblica.
- Bussola del dispositivo su richiesta, fallback direzione GPS e indicatore Nord.
- Mappa a schermo intero con salva punto, salva auto, ritorno, registrazione e SOS.
- SOS locale con coordinate, precisione, quota se disponibile, timestamp, chiamata 112, copia e condivisione. Non e' un servizio di soccorso.
- Punto auto da GPS o scelto manualmente sulla mappa; ogni uscita mantiene il proprio punto auto.
- Uscite con avvio, pausa, ripresa, conclusione, distanza e tempo attivo.
- Tracce segmentate: le interruzioni del GPS e le pause non vengono collegate artificialmente.
- Ritorno all'auto con punto di arrivo e traccia registrata. La distanza mostrata è in linea d'aria, non un itinerario pedonale.
- Taccuino con ritrovamenti e fungaie: nome, note, ricerca, filtri, modifica ed eliminazione.
- Storico delle uscite, esportazione GPX, backup JSON e ripristino validato.
- PWA con icona Home e cache dell'interfaccia. La cartografia non viene precaricata per l'uso offline.
- Gestione dei permessi negati, GPS impreciso, assenza di rete e problemi di salvataggio.

Non contiene account, sincronizzazione, Squad o riconoscimento AI. Fotografie locali e terreno MycoScore sono descritti più avanti. Nessuna chiave necessaria per Topografica/Stradale; `VITE_MAPTILER_KEY` serve per Satellite/Outdoor. Dettagli e percorso nativo in [V2_OUTDOOR.md](docs/V2_OUTDOOR.md). Rifiniture, persistenza e fallback: [MAP_EXPERIENCE.md](docs/MAP_EXPERIENCE.md).

## Sviluppo

Node.js **22.12+** (consigliato Node 24).

```sh
npm ci
npm run dev
```

```sh
npm test          # logica GPS, segmenti, recupero e backup
npm run typecheck # controllo TypeScript
npm run build    # TypeScript e produzione PWA
npm run preview  # prova della build e del service worker
```

I test browser sono in `tests/e2e`. Richiedono i browser Playwright:

```sh
npx playwright install --with-deps chromium webkit
npm run build
npm run test:e2e
```

Il GPS richiede HTTPS o localhost. Un indirizzo HTTP della rete locale aperto sull'iPhone non basta: per provarlo sul telefono usare il deploy HTTPS.

## Pubblicazione su Vercel

1. Accedere a Vercel con GitHub.
2. Importare `Alex-ita-dev/funghi-app`, autorizzando l'accesso a questa repo.
3. Framework: **Vite**. Comando build: `npm run build`. Cartella output: `dist`. Installazione: `npm ci`.
4. Scegliere Node 24. Configurare facoltativamente `VITE_MAPTILER_KEY` per Satellite/Outdoor e avviare il deploy. La chiave e' pubblica: limitarla ai domini del progetto e verificare quote e condizioni del provider.
5. Aprire il sito nel browser: su iPhone **Condividi → Aggiungi alla schermata Home**; su Android menu → **Installa app/Aggiungi alla schermata Home**.

`vercel.json` contiene la configurazione di build e gli header. Deploy del progetto: https://mycotrail.vercel.app/.

Usare sempre lo stesso indirizzo: IndexedDB è separato per origine e un dominio diverso avrà un taccuino diverso. Esportare un backup prima di cambiare dominio o installazione.

## GPS e persistenza

- Nessuna richiesta di posizione all'apertura: il GPS si attiva con un'azione esplicita.
- Si accettano fix entro 30 secondi e con accuratezza massima 50 m. Si scartano duplicati, jitter e salti oltre 12 m/s nello stesso tratto.
- Dopo oltre 45 secondi fra punti accettati viene creato un nuovo tratto. Il filtro è prudente: può spezzare la traccia anche dopo una sosta.
- Passando in background l'uscita va in pausa; al ritorno richiede **Riprendi**. Nessuna promessa di GPS continuo con schermo bloccato su iPhone.
- La riapertura recupera l'uscita in pausa all'ultimo salvataggio. Durante la registrazione viene salvato anche un checkpoint ogni 10 secondi.
- Quando disponibile, Screen Wake Lock prova a mantenere acceso lo schermo; non evita una chiusura manuale né i limiti del sistema operativo.
- Le scritture IndexedDB sono serializzate e atomiche. Un errore non viene nascosto: si invita a esportare il contenuto ancora in memoria.
- Web Locks impedisce a due schede aperte di modificare contemporaneamente il taccuino nei browser che lo supportano.
- Limiti della prima versione: 500 uscite, 10.000 punti nel taccuino, 100.000 posizioni per uscita, backup importato massimo 25 MB.

## Dati e mappe

I dati dell'utente rimangono nel browser e **non vengono salvati nella repo**. Cancellare i dati del sito, cambiare origine o perdere il dispositivo può eliminarli: il backup è essenziale. Nessun analytics e nessun backend applicativo. I font sono inclusi nella build.

I tile vengono richiesti al provider del layer selezionato (OpenTopoMap, OpenStreetMap o MapTiler se configurato), che riceve le normali informazioni di rete e l'area cartografica richiesta. Attribuzione sempre visibile; caching HTTP del browser; nessun download in massa né cache offline dei tile. La disponibilità del servizio non è garantita. Per distribuzione su larga scala o mappe offline bisognerà scegliere un fornitore idoneo.

Riferimenti: [Leaflet](https://leafletjs.com/reference.html), [policy tile OSM](https://operations.osmfoundation.org/policies/tiles/), [Geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition), [Vite PWA](https://vite-pwa-org.netlify.app/guide/), [Vercel / Vite](https://vercel.com/docs/frameworks/frontend/vite).

## Struttura e prossime fasi

- `src/lib/model.ts`: tipi, validazione, geodesia, tracce e GPX.
- `src/lib/storage.ts`: adattatore IndexedDB e download.
- `src/hooks`: GPS e stato persistente.
- `src/components`: mappa, finestre di dialogo e identità visiva.
- `src/lib/preferences.ts`, `src/hooks/usePreferences.tsx`: preferenze/profilo versionati nello stesso IndexedDB, chiave distinta dal taccuino.
- `src/locales`, `src/lib/i18n.ts`, `src/lib/units.ts`: cataloghi offline e formattazione senza alterare i valori GPS salvati.
- `src/App.tsx`: flussi dell'utente e schermate.
- `docs/TEST_IPHONE.md`: protocollo di prova prima di usare l'app in un'uscita reale.

Prima fase successiva: collaudo V2 web e configurazione provider. Poi Capacitor con adattatore nativo per GPS, permessi e background; l'interfaccia React e la logica delle tracce sono riutilizzabili. Login, backend e Squad restano esclusi da questa fase.

Il nome MycoTrail è provvisorio ai fini del lancio: disponibilità del marchio e omonimie non sono ancora stati verificati.

Ritrovamenti e foto locali: [schema, backup e limiti](docs/FINDING_PHOTOS_DETAILS.md).

MycoScore puntuale: [formula, dati e limiti v1](docs/MYCOSCORE_V1.md).

### Mappa MycoScore: condizioni ecologiche locali

In MycoScore scegli Generico, Porcini o Finferli, mostra la mappa condizioni e premi **Analizza questa zona**. Anteprima locale di 1–9 km², griglia adattiva 36–100 celle, esclusioni habitat prima del meteo, batching e concorrenza limitata. Canvas Leaflet, legenda accessibile, confidence separata, annullamento, opacità e cache offline. Pan e zoom non avviano richieste. Cambiare specie riusa gli input; toccare una cella apre la scheda puntuale senza nuovi fetch quando i dati sono freschi.

Area e punto usano **lo stesso motore ecologico v2.1.1**. [UX, provider, cache, prestazioni e limiti](docs/MYCOSCORE_HEATMAP.md). La mappa indica compatibilità ambientale, non presenza certa di funghi. GPS, tracce, fotografie e database delle uscite restano indipendenti. La [documentazione v2](docs/MYCOSCORE_V2.md) descrive l'implementazione storica sostituita.

### MycoScore v2.1: analisi ecologica puntuale

Scegli **Generico, Porcini o Finferli** e tocca un punto. Prima del meteo vengono verificate copertura del suolo e compatibilità dell'habitat: acqua, neve/ghiaccio, suolo nudo e superfici completamente edificate danno **Area non idonea**, senza un falso punteggio numerico. Alberi e vegetazione dentro le città restano analizzabili.

Il nuovo motore riusa meteo e DEM esistenti; integra habitat, plausibilità geografica prudente, stagione/quota/clima, distribuzione della pioggia, suolo ed essiccamento. L'affidabilità è separata dal punteggio. Dettagli espandibili, sei lingue, unità personali e cache offline. Nuove fonti: Sentinel-2 Land Cover 2025 (Impact Observatory/Microsoft/Esri, 10 m) e Marine Regions come verifica marina nei vuoti del raster; nessuna chiave richiesta. SoilGrids non viene interrogato mentre il servizio REST è sospeso.

La mappa ecologica ora usa lo stesso motore puntuale, anche per Finferli. La patch v2.1.1 richiede umidità e temperatura calcolabili per mostrare uno score; riusa i dati raw delle versioni precedenti.

Formula, parametri, privacy, richieste (tipicamente 3 al primo tap, 0 in cache), differenza tra osservazioni/proxy/euristiche e limiti: [MYCOSCORE_V2_1_ECOLOGY.md](docs/MYCOSCORE_V2_1_ECOLOGY.md). Nessuna garanzia di presenza, quantità, commestibilità o sicurezza; modello non validato sul campo.
