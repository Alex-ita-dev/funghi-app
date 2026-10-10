# Mappa MycoScore — condizioni ecologiche locali

Base: `main` con PR #6, commit `c8bf29d`. Prima dell'intervento sono stati verificati [v1](MYCOSCORE_V1.md), [v2](MYCOSCORE_V2.md) e [v2.1](MYCOSCORE_V2_1_ECOLOGY.md). L'overlay meteo v2 viene sostituito: area e punto chiamano **la stessa funzione `computeEcology`**, senza una formula alternativa. Algoritmo `mycoscore-2.1.1`.

## Esperienza

MycoScore → specie → Mostra mappa condizioni → posizionare la mappa → **Analizza questa zona**. Un rettangolo tratteggiato anticipa esattamente il dominio; sono visibili superficie e numero di celle. Sotto zoom 13 il comando è disabilitato e invita ad avvicinarsi. Nessuna configurazione di meteo, terreno, stagione o provider.

La mappa mantiene l'analisi precedente durante pan/zoom; il comando diventa **Analizza nuova area** quando cambia la griglia. Nessuna analisi viene avviata dal movimento, dall'apertura del pannello o in background. Il cambio specie ricalcola solo gli score sulla stessa area e gli stessi input. Il titolo identifica il profilo attivo e il risultato ha data dell'analisi, data dei dati e anzianità in minuti.

Mostra/nascondi conserva l'analisi; elimina rimuove il risultato visualizzato, conservando le cache ambientali e gli snapshot limitati per il riuso offline. L'opacità è sotto la legenda, in un controllo richiudibile. Disclaimer disponibile: **La mappa indica compatibilità delle condizioni ambientali, non presenza certa di funghi.**

## Area, griglia e risoluzione

Configurazione unica: `src/lib/mycoArea.ts`, `areaConfig`.

| Zoom | Griglia | Lato area | Superficie | Lato cella |
| --- | --- | --- | --- | --- |
| 13–14 | 6×6 | 3 km | ~9 km² | 500 m |
| 15–16 | 8×8 | 2 km | ~4 km² | 250 m |
| ≥17 | 10×10 | 1 km | ~1 km² | 100 m |

Massimo assoluto **100 celle**, anche nell'orchestratore. Centro stabilizzato a 0,002° per riusare lo stesso dominio dopo piccoli spostamenti. Le celle tassellano il rettangolo di anteprima; nessuna estensione alla provincia o al viewport intero. Coordinate non finite, poli oltre ±80° e prossimità dell'antimeridiano oltre ±179,9° vengono rifiutate.

Il campione al centro rappresenta la cella, non ogni suo metro. Copertura annuale nominale 10 m con nove campioni locali, terreno GLO-90 con stencil Horn di 100 m, meteo condiviso a 0,01° (il modello meteorologico può essere ancora più grossolano). Il DEM può distinguere quota e versante tra celle; la griglia non crea microclimi osservati né precisione forestale a un metro. Nessuna interpolazione di score.

## Pipeline e limiti delle richieste

1. Cache statica/copertura del suolo.
2. `habitatCompatibility` del motore condiviso: acqua, neve/ghiaccio, nudo e built senza vegetazione → esclusione; unknown → dati insufficienti sulla mappa.
3. Solo per celle rimanenti: DEM e adapter suolo facoltativo.
4. Solo dopo: cache dinamica e meteo.
5. `computeEcology` con latitudine, data UTC, terreno e SpeciesProfile; pubblicazione dello snapshot completo.

Le fasi sono separate: la loro concorrenza non si somma. **Concorrenza heatmap 4**, DEM **2**. Nessun lancio di 100 pipeline complete. Quattro richieste è un compromesso conservativo per smartphone; non è un benchmark di batteria su dispositivo fisico.

| Provider | Batching reale | Deduplicazione/cache |
| --- | --- | --- |
| Esri/IO `getSamples` | 8 celle = fino a 72 punti per MultiPoint (9 per cella); massimo 4 batch simultanei | stessa chiave land v2.1, provider + coordinate a 5 decimali; punti duplicati deduplicati prima dei batch |
| Marine Regions WFS | per cella, solo fallback dopo 9 campioni unknown; sequenziale dentro ciascun batch | risultato water nella stessa cache land; massimo 4 richieste contemporanee |
| Open-Meteo elevation | fino a 100 coordinate per richiesta, 2 simultanee | stencil comuni deduplicati, chiave provider + coordinate a 6 decimali |
| Open-Meteo forecast | fino a 9 anchor per richiesta, massimo 4 batch simultanei | stessa griglia 0,01° dell'analisi puntuale; temperature/umidità del suolo incluse |
| Suolo pedologico | nessuna chiamata: adapter opzionale già disabilitato in v2.1 | null esplicito; non si inventa una cache SoilGrids senza provider |

Esri associa tramite `locationId`, mai tramite posizione nella risposta: un NoData omesso non sposta i risultati delle altre celle. Il WFS marino rimane puntuale: non viene inventato un batch non supportato. Il batch meteo verifica il numero di risposte e valida ogni anchor separatamente.

Sonda pubblica di sviluppo: batch Esri di 72 punti vicino a 43,52°N /11,48°E, risposta con 72 campioni, ID0–71, anno2025, nessun errore. Conferma tecnica del batching, non validazione della mappa ecologica sul campo.

Fonti delle capacità native: [Esri Get Samples](https://developers.arcgis.com/rest/services-reference/enterprise/get-samples/), [Open-Meteo forecast](https://open-meteo.com/en/docs), [elevation API](https://open-meteo.com/en/docs/elevation-api). Attribuzioni sulla mappa. Stesse condizioni, limiti e privacy dei provider descritti in v2.1; nessuna telemetria remota.

## Cache e offline

Si riusa `boundedCache`, nessun secondo database o migrazione del journal. Le cache statiche v2.1 (land 90 giorni/256 record, DEM 180 giorni/4096 campioni) e dinamiche (meteo 6 ore/7 giorni/32 anchor) restano condivise con il punto.

La cache computed `mycotrail.areas.ecological` conserva **massimo 6 snapshot** per **7 giorni**, comprensivi degli input: scelta più prudente di 10–20 per limitare localStorage mobile. Ogni snapshot memorizza il meteo una sola volta per anchor; le celle referenziano l'indice, evitando 100 copie dei 30 giorni. Chiave: **algorithmVersion + specie + chiave spaziale/griglia + giorno UTC**; il timestamp meteo governa il TTL, non viene ringiovanito dal cambio specie. Stesso giorno e meno di 6 ore per riuso online di un risultato completo. I risultati parziali sono ritentabili esplicitamente e riusano comunque i dati validi nei livelli sottostanti.

Lo snapshot di un altro profilo può fornire gli input allo stesso motore senza rete. Le tre specie condividono le hard exclusions attuali del v2.1; cambiano compatibilità marginali, pesi, curve e categorie. Non vengono aggiunte esclusioni specie-specifiche inventate per forzare differenze di mappa.

Offline si può riaprire un'area compatibile conservata, incluso il dettaglio, con etichetta **Dati memorizzati** e timestamp. Nuova area senza snapshot: messaggio di connessione necessaria. Lo sfondo cartografico resta soggetto alla cache tile già esistente; la persistenza dell'analisi non scarica nuove mappe offline. Storage pieno/negato: fallback in memoria, nessuna promessa di conservazione dopo reload.

## Rendering, accessibilità e dettaglio

Un renderer **Leaflet Canvas**, massimo 100 rettangoli `L.Path`, nessun componente React complesso sovrapposto per cella. Pane analisi z-index **350**, anteprima non interattiva **349**; tracce/GPS nel pane overlay 400, marker auto/ritrovamenti sopra. L'anteprima ha `pointer-events:none` e non intercetta i tap delle celle. La selezione cella è risolta dal click della mappa con i bounds: i canvas superiori di GPS/tracce/marker non provocano una nuova analisi puntuale al posto del dettaglio cached. Nascondere smonta il renderer senza toccare dati, GPS o layer di base. Topografica, satellite, outdoor e stradale non vengono modificati.

Ogni cella ha score nullable, confidence numerica e stato `valid | unsuitable | insufficientData`. `uncertain` e `insufficient` del motore sono presentati come dati insufficienti, preservando la distinzione nel dettaglio completo.

Legenda numerica 0–24 /25–44 /45–64 /65–79 /80–100 con categorie; **area non idonea** grigia con bordo tratteggiato e simbolo ▧ nella legenda/lista; **dati insufficienti** con bordo puntinato, riempimento tenue e ?. Confidence minore riduce solamente l'opacità, mai score o colore della categoria. Testo, numeri, pattern e lista di pulsanti per tastiera/screen reader affiancano i colori. Legenda e controlli usano i token light/dark e le sei lingue dell'app.

Il tap passa lo snapshot completo a **MycoScoreCard**, la scheda puntuale esistente. Include anche celle escluse/senza dati. Se recente (o offline) non effettua nessuna richiesta. Mostra la stessa formula, score, motivazioni, habitat, quota, slope/aspect, meteo e dettagli disponibili. Una successiva richiesta esplicita di aggiornamento usa le cache provider già condivise; non esiste un secondo renderer del dettaglio.

## Annullamento, errori e soglia dati

Avanzamento celle completate, barra e **Annulla**. Le celle escluse completano dopo il land cover; quelle valide completano con il relativo batch meteo. Durante le fasi statiche il contatore può restare fermo: non è una percentuale fittizia del traffico. AbortController interrompe richieste pendenti quando il fetch lo supporta, impedisce nuove code e blocca la pubblicazione tardiva. I dati raw già completati e validati possono rimanere in cache; uno snapshot parzialmente scritto da un annullamento non viene salvato. Nessun polling, refresh automatico o timer persistente a fine analisi.

Errori parziali preservano le altre celle. Oltre metà delle celle con dati insufficienti compare un messaggio generale con invito a riprovare. Acqua/esclusioni non contano come errori.

**Unica correzione al motore**: v2.1.0 permetteva uno score con un solo fattore meteorologico tra umidità, temperatura ed essiccamento. v2.1.1 richiede almeno umidità **e** temperatura calcolabili. Vale identicamente per punti e mappa; confidence e fattori opzionali restano separati. Il bump invalida snapshot computed precedenti, riusando raw cache. Nessuna riscrittura delle formule ecologiche.

## Prestazioni e verifica

`metrics` locale: numero celle, richieste HTTP effettive per provider, cache hit (land/meteo oppure celle computed), durata inclusi calcolo/serializzazione. Conteggio per AbortSignal ereditato dal request pool, senza strumenti esterni. In sviluppo `console.debug`, nulla inviato in rete. Gli hit dei singoli campioni DEM non sono sommati al contatore; il loro riuso si osserva con zero richieste elevation.

Misure locali con Vitest/jsdom, servizi mock, 64 celle, intorno a 43,52°N /11,48°E. Benchmark ripetuto tre volte: **media cold 73,6 ms, warm 3,0 ms**, 15 chiamate cold e zero warm. Un passaggio a griglia 100 celle con raw cache della zona riusata ha richiesto 13 land +2 DEM, zero meteo, 42 ms. La tabella riporta anche singoli scenari:

| Caso | Chiamate | Tempo locale osservato |
| --- | --- | --- |
| Tutto bosco, cache completamente vuota | 8 land +6 DEM +1 meteo = **15** | ~108 ms |
| Land/DEM freddi, meteo già presente | 8 land +6 DEM, 9 hit meteo | ~38 ms |
| Stessa area fresca | **0**, 64 hit computed | ~3 ms |
| Tutto acqua | **8 land**, zero DEM/meteo | ~17 ms |
| Griglia 36 celle, 3 km | 5 land +4 DEM +2 meteo = **11** | ~88 ms |

La media è su tre esecuzioni; gli altri tempi sono singoli scenari riproducibili con mock (attesa simulata land 1 ms nei nuovi test), **non latenza reale dei provider o media di rete**. Il numero di anchor/stencil deduplicati varia con posizione, zoom, esclusioni e cache; al massimo 13 batch land, 9 DEM, 12 meteo per 100 celle, più fino a 100 fallback WFS. Con il dominio reale i batch meteo sono normalmente molti meno. Nessun retry automatico.

Snapshot 64 celle/9 anchor misurato **55.217–66.962 byte JSON UTF-8** (~54–65 KiB, secondo i campi della fixture); localStorage usa stringhe, non è una misura di heap. Sei snapshot analoghi ~324–392 KiB UTF-8. Il rendering mantiene un canvas e ≤100 path, più un canvas per anteprima. Non è stata misurata la memoria residente o la batteria su smartphone fisico; nessuna dichiarazione di frame rate non verificata.

Test: griglia/bounds/limiti/chiavi, batching/concorrenza/abort, cache/versioni/offline, guasti HTTP/JSON/DEM parziali, lago/edificato/bosco/prato misto/nudo, quote300/600/900 e N/S, equivalenza con `computeEcology`, cambio specie senza fetch, soglia qualità e confidence solo visiva. E2E con provider mock: Porcini → analisi → canvas/legenda → acqua distinta/bosco → tap condiviso → Finferli diverso senza rete → nascondi → controlli GPS e journal intatti; reload offline, annullamento e zoom senza richieste. Chromium desktop, WebKit iPhone, Chromium Android 360 px tramite workflow del repository.

Limiti ecologici v2.1 conservati: copertura annuale, ospiti arborei ignoti, terreno/meteo da modelli, niente calibrazione con raccolte, quota/versante possono avere effetti piccoli o nulli quando altri fattori limitano lo score. Nessuna navigazione alle celle, previsione futura, mappa nazionale, account, cloud, condivisione, riconoscimento o GPS background.
