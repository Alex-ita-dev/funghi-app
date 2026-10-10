# MycoScore v2 — condizioni locali, non presenza certa

> Documento storico: l’overlay descritto qui è sostituito dalla [Mappa MycoScore ecologica](MYCOSCORE_HEATMAP.md), che usa il motore v2.1 condiviso.

`algorithmVersion = 2.0.0`. La v2 estende il motore deterministico v1, senza riscriverne le curve meteo. Non è un modello AI né una previsione biologicamente validata. Non stima presenza, quantità, commestibilità o sicurezza dei funghi. Non utilizzare colori o pendenze per valutare la sicurezza di un itinerario.

## Uso e area

Nella modalità MycoScore scegliere Generico/Porcini, attivare **Mostra mappa condizioni**, quindi **Analizza questa zona**. Porcini è proposto inizialmente se presente nelle specie preferite. La selezione puntuale rimane disponibile; toccare una cella apre la stessa scheda dettagliata, senza nuove richieste.

L'analisi è centrata sulla mappa, non sul GPS, e copre un quadrato esplicitamente indicato. Non segue automaticamente pan, zoom, cambio profilo o scheda. L'analisi precedente resta visibile con un avviso finché si preme Aggiorna. Disattivazione e uscita annullano richieste in corso. Il pulsante Annulla conserva l'ultimo risultato completo, senza pubblicare una griglia parziale in lavorazione.

Configurazione centralizzata in `src/lib/mycoArea.ts`:

| Zoom | Griglia | Lato area | Lato cella |
| --- | --- | --- | --- |
| <13 | non consentito | — | — |
| 13–14 | 5×5 = 25 | 2 km | 400 m |
| ≥15 | 7×7 = 49 | 1,4 km | 200 m |

Massimo 49 celle / 4 km², anche se la viewport è molto più ampia. Centro stabilizzato a 0,002° per favorire il riuso. Coordinate oltre ±80° di latitudine o ±179,9° di longitudine sono escluse. Le distanze usano una proiezione locale con fattore cos(latitudine): adeguata alla piccola area, non un motore GIS globale. Inquadrature strette possono mostrare solo una parte dell'area indicata.

## Fonti e richieste

- [Open-Meteo Forecast API](https://open-meteo.com/en/docs): stesse variabili e finestra v1 (30 giorni UTC completi, senza previsioni future). Pioggia 7/14/21/30 giorni; ultima pioggia ≥5 mm; aria, umidità, suolo, ET₀. Il suolo è quello modellato a 6 cm / 3–9 cm, non una misura del punto.
- [Open-Meteo Elevation API](https://open-meteo.com/en/docs/elevation-api): **Copernicus DEM GLO-90, rilascio 2021, circa 90 m**, quote in metri. L'adapter `TerrainProvider` permette sostituzioni senza cambiare motore o componenti. Una griglia di campioni non aumenta la risoluzione del DEM.
- MapTiler Terrain RGB è stato valutato ma non introdotto: richiederebbe chiave, decodifica raster e gestione tile. Il provider scelto dà quote reali senza obbligare a servizi a pagamento. `VITE_MAPTILER_KEY` continua a riguardare i layer cartografici già esistenti.
- Il servizio pubblico Open-Meteo senza chiave è per uso **non commerciale**, soggetto ai limiti del provider; verificare licenza/hosting prima di un rilascio commerciale. Batching riduce round trip HTTP, non necessariamente unità contabilizzate dal provider.

Le celle sono raggruppate su **al massimo nove anchor meteo**, arrotondati a 0,01° e deduplicati. Un'unica richiesta meteo multi-coordinate serve gli anchor mancanti; le celle vicine condividono il risultato. Non si interpola il meteo e non si dichiara precisione a 200 m. Ogni cella usa poi il proprio terreno reale.

Ogni punto richiede uno stencil DEM 3×3 (massimo 441 campioni). Campioni identici vengono deduplicati, serviti prima dalla cache e poi richiesti in gruppi **≤100 coordinate**, con **concorrenza massima 2**. La fase terreno segue quella meteo. Limite a cache vuota: **1 richiesta meteo + 3 quota** per 25 celle; **1 + 5** per 49, spesso meno grazie a sovrapposizioni/cache. Analisi ripetuta fresca: **zero richieste**. Cambio solo profilo riusa dati ambientali/terreno. Se il meteo è del tutto assente, non scarichiamo inutilmente il terreno.

Timeout 12 secondi per richiesta, controllo HTTP/JSON, AbortController, nessun retry automatico. Una località meteo malformata o un batch DEM fallito non distrugge gli altri dati. Un array batch di lunghezza errata viene rifiutato per evitare associazioni geografiche errate. Annullamento impedisce scritture di risposte tardive e avvio dei batch rimanenti. Dati grezzi completati prima dell'annullamento possono restare in cache; nessun risultato di area incompleto viene pubblicato.

## Terreno: quota, slope, aspect

Campioni nell'ordine NW,N,NE,W,C,E,SW,S,SE, distanza **100 m** fra centri. Lo stencil è coerente con i circa 90 m del DEM. Coordinate inviate a sei decimali.

Gradiente Horn 3×3 (d=100 m):

```
gE = (NE + 2E + SE - NW - 2W - SW) / (8d)
gN = (NW + 2N + NE - SW - 2S - SE) / (8d)
slope = atan(sqrt(gE² + gN²)) * 180/π
aspect = (atan2(-gE, -gN) * 180/π + 360) % 360
```

Aspect è la direzione di discesa: N=0°, E=90°, S=180°, W=270°. Settore cardinale più vicino (45°), tradotto tramite i18n. Per slope <2°, esposizione **non significativa**, mai una direzione arbitraria. Quote non finite o esterne a [-500,9000] m, vicini mancanti, pendenze >80°: derivati assenti, senza sostituzione con zero. La quota centrale valida può restare disponibile. Se manca il DEM, la scheda mostra la quota modellata già disponibile da v1, mentre slope/aspect rimangono assenti.

Si tratta di pendenza/aspetto derivati da un modello di elevazione grossolano: vegetazione, manufatti, micro-rilievi, zone costiere, discontinuità e precisione verticale possono influenzarli. Nessuna informazione su bosco, specie arboree o habitat viene inventata. Esposizione non deriva dall'orientamento del telefono.

## Formula v2 e profili

`src/lib/mycoScoreV2.ts` riusa `computeMycoScore` di v1 e aggiunge tre fattori in `secondaryProfiles`, centralizzati per profilo. Tutti i dati restano canonici; conversioni °C/°F, mm/in, m/ft e formato data avvengono solo nella scheda.

| Fattore | Generico | Porcini |
| --- | ---: | ---: |
| Tutti i fattori meteo v1, nelle stesse proporzioni | 90% | 87% |
| Pendenza | 3% | 3% |
| Esposizione/essiccamento | 4% | 5% |
| Stagione | 3% | 5% |

Pendenza: 100 fino a 15°, poi -2 punti per grado, minimo 20. È una prudente euristica di maggiore deflusso sui versanti ripidi, non una regola sulla presenza fungina.

Pressione di essiccamento `P = clamp(max((aria7 - 18)/12, deficit3/15), 0, 1)`, dove deficit3 è max(0,ET₀3−pioggia3) della v1. Richiede entrambi i dati. Esposizione = `85 + 15 × cos(aspect) × emisfero × P`, con emisfero +1 nord / -1 sud. Quasi pianeggiante o fascia tropicale |lat|<23,5°: 85 neutro. Rilievo mancante: fattore assente. È un lieve correttivo per versanti meno soleggiati quando caldo/essiccamento lo rendono plausibile, non un vantaggio universale del nord.

Stagionalità temperata (mese UTC della `analysisDate`), mesi traslati di sei nell'emisfero sud:

| Profilo | Favorevoli (100) | Marginali | Altri mesi |
| --- | --- | --- | --- |
| Generico | maggio, giugno, settembre, ottobre | aprile, luglio, agosto, novembre: 85 | 70 |
| Porcini | giugno, settembre, ottobre | maggio, luglio, agosto, novembre: 75 | 45 |

Nei tropici stagione=85 costante: nessuna pretesa di descrivere stagione delle piogge. Questi mesi sono una prima ipotesi per climi temperati e non una fenologia universale; il loro peso è intenzionalmente basso. Porcini raggruppa più specie: non modella separatamente edulis/aereus/aestivalis/pinophilus. Quote estreme e clima locale incidono attraverso i dati meteo; nessun bonus arbitrario di quota.

Somma pesata rinormalizzata sui soli fattori disponibili, arrotondata e limitata 0–100. **Se nessun fattore meteo v1 è disponibile, il punteggio rimane assente**, anche in presenza di terreno e stagione. Classi v1 immutate: 0–24,25–44,45–64,65–79,80–100. Copertura alta≥85%, media≥55%, altrimenti bassa, intesa come completezza dati e non probabilità scientifica. Cache scaduta abbassa l'affidabilità mostrata. Spiegazioni estratte dai fattori reali: prima le due limitazioni più importanti, poi fattori favorevoli fino a quattro righe. Il dettaglio espandibile espone tutti i contributi.

## Cache, versioni e offline

Cache pubbliche ambientali JSON locali, separate da IndexedDB dei ritrovamenti e dalle fotografie. Nessuna migrazione del database:

| Cache | Chiave | Freschezza / conservazione | Limite |
| --- | --- | --- | --- |
| Meteo v1 | coordinate 0,01° | 6 ore / 7 giorni | 32 anchor |
| Terreno v2 | provider + coordinate campione a 6 decimali | 180 giorni | 4096 campioni |
| Aree v2 | **algorithmVersion + profilo + griglia + giorno UTC analisi** | 6 ore, stessa data / 7 giorni | 6 aree |

L'area contiene ambienti deduplicati (max9) e risultati/terreno delle celle (max49), senza replicare 30 giorni di meteo per ogni cella. TTL dell'area decorre dai dati meteo più vecchi, non dall'ultimo tap. Si rimuovono scaduti, duplicati, timestamp futuri e record meno recenti; schema validato in lettura. Versioni algoritmo diverse non vengono caricate. Nessun dato ambientale mancante viene mantenuto per 180 giorni. Se localStorage è indisponibile o pieno si continua in memoria con gli stessi limiti.

Offline, attivare la heatmap ripristina l'ultima area compatibile per griglia/profilo/versione; Aggiorna può riutilizzarla entro conservazione, mostrando **Dati memorizzati**, data e avviso se scaduta. Senza area compatibile si mostra un solo messaggio, senza richieste/ripetizioni. Un errore online può ripiegare su cache precedente. Aree parziali restano consultabili offline, ma online non vengono considerate complete e fresche: un aggiornamento esplicito può recuperare i dati mancanti. `analysisDate` è presente per evoluzione futura, ma la UI non offre +3/+5 giorni.

## Rendering, accessibilità e isolamento GPS

Leaflet esistente, pane dedicato z-index350 e un solo renderer **Canvas** per al massimo49 rettangoli semitrasparenti, non49 marker DOM. Nessuna ricreazione della mappa per cambiare profilo, lingua o tema. Opacità 0,15–0,65 (default0,35), applicata senza ricreare layer. Eventi e renderer rimossi al cambio risultato/uscita. Il GPS e i marker restano sopra l'overlay; attribuzioni dei provider restano visibili con attribuzione aggiuntiva Open-Meteo/Copernicus.

Legenda numerica 0/25/50/75/100 e categorie espandibili; celle senza score grigie, mai presentate come score0. Elenco espandibile di punteggi con pulsanti fornisce alternativa accessibile al tap Canvas. Controlli touch ≥44px, temi chiaro/scuro, testi nelle sei lingue. Stato e avanzamento sono annunciati; pan/zoom si limitano ad aggiornare la viewport, senza rete. La griglia piccola, parse/cache limitati e richieste asincrone mantengono il lavoro contenuto sul main thread; non è un benchmark di tutti gli smartphone.

Non sono modificati watchPosition, filtri, tracce, pause, checkpoint, uscite, ritorno auto, foto o backup. La selezione MycoScore è separata dalla posizione registrata.

## Privacy e limiti

Il provider riceve esclusivamente coordinate meteo e stencil di elevazione necessari, oltre ai metadati di rete ordinari (es. IP). Fetch omette credenziali e referrer. Non inviamo nickname, fungaie, ritrovamenti, foto o cronologia GPS. L'azione è intenzionale e la UI lo indica prima dell'analisi. Cache conservata localmente; nessun backend o sincronizzazione.

Rimandati: heatmap regionali, scansione continua, confronto punti, meteorologia futura, DEM ad alta risoluzione, habitat/copertura arborea, calibrazione scientifica e personale, apprendimento, riconoscimento specie. MycoScore esprime compatibilità ambientale, non garanzia di raccolta.

## Verifica

Test unitari per Horn/cardinali/flat/DEM anomalo, griglia/limiti, profili/emisferi/stagione, pesi/assenza/0–100, cache/versioni/TTL/eviction, batching/concorrenza/annullamento, errori parziali e offline. API sempre mockate. E2E pertinenti coprono profilo, avvio esplicito, Canvas, tap/dettaglio, pendenza/esposizione, cache dopo riapertura offline, rimozione e annullamento, nessuna richiesta al solo zoom, invarianza journal e disponibilità controlli GPS. Suite precedenti conservate.

Comandi: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Risultati effettivi e limitazioni dell'ambiente sono riportati nella PR.
