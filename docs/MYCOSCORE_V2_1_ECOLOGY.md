# MycoScore v2.1 — indice ecologico puntuale

Base: `main` dopo PR #5 (`5680090`). Versione originaria: **`mycoscore-2.1.0`**. Aggiornamento heatmap: **`mycoscore-2.1.1`**, soglia minima umidità + temperatura; vedere [mappa ecologica](MYCOSCORE_HEATMAP.md). Non è probabilità di raccolta, modello AI, identificazione o indicazione di commestibilità/sicurezza. Non è stato validato con osservazioni di fruttificazione sul campo. I numeri sono parametri progettuali iniziali, non coefficienti stimati dalla letteratura.

## Riutilizzo e flusso

Si conservano aggregazione e curve [v1](MYCOSCORE_V1.md), DEM, cache e overlay [v2](MYCOSCORE_V2.md). Il nuovo percorso puntuale separa idoneità permanente, condizioni temporanee e qualità dei dati:

1. Scelta Generico / Porcini / Finferli e tap intenzionale sulla mappa.
2. Copertura del suolo → compatibilità habitat → valutazione prudente dell'applicabilità geografica del profilo. Un'esclusione certa secondo la copertura interrompe meteo/DEM/suolo.
3. Meteo, DEM e adapter suolo opzionale indipendenti (`Promise.allSettled`). Latitudine, quota, calendario e clima recente alimentano la stagione e la compatibilità termica.
4. Motore puro → stato, score intero, confidence separata, massimo cinque motivazioni reali. Dettagli inizialmente chiusi.

`src/lib/ecologyModel.ts` centralizza tipi/profili/versione; `src/lib/mycoEcology.ts` contiene formule pure. `src/services/landCover.ts`, `ecologySoil.ts` e `mycoEcology.ts` gestiscono adapter e orchestrazione. `sharedRequest.ts` deduplica richieste identiche con conteggio dei sottoscrittori. La stessa `MycoScoreCard` serve punti e celle.

La [mappa ecologica](MYCOSCORE_HEATMAP.md) sostituisce ora l’overlay meteo v2: batching land cover, stessa formula puntuale, Generico/Porcini/Finferli e dettaglio da snapshot senza richieste aggiuntive. Le note seguenti documentano l’introduzione del motore; i dettagli aggiornati della pipeline area e delle sue cache sono nella nuova documentazione.

GPS, watchPosition, filtri, segmenti, pause, checkpoint, uscite, ritorno auto, foto, IndexedDB e backup non cambiano. Nessuna migrazione dati o richiesta di compilare habitat/quota/meteo.

## Fonti e natura dei dati

### Copertura del suolo

[Sentinel-2 10 m Land Cover](https://livingatlas.arcgis.com/landcover/), Impact Observatory / Microsoft / Esri, annata **2025**, CC BY 4.0. [Documentazione del produttore](https://docs.impactobservatory.com/lulc-maps/maps-for-good.html) e [servizio raster](https://ic.imagery1.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer?f=pjson).

È una **classificazione satellitare annuale prodotta dal provider**, non un rilievo botanico del punto. Il produttore usa classificatori ML; MycoTrail non implementa apprendimento, AI o riconoscimento immagini. Il servizio pubblico non richiede chiavi, ma disponibilità/quote/CORS possono cambiare: errori diventano dati assenti.

Una richiesta `getSamples`, `MultiPoint` EPSG:4326, anno fissato, nearest-neighbor, pixelSize10 m: centro + otto vicini a ±10 m. Si usano classi numeriche originali, non colori RGB. Le risposte vengono associate tramite `locationId`: il provider può omettere i punti NoData. Duplicati, anno errato e risoluzione >20 m vengono rifiutati. Non si inventa una precisione superiore ai 10 m nominali.

| Codice provider | Enum interno |
| --- | --- |
| 1 | water |
| 2 | trees |
| 4 | wetland |
| 5 | cropland |
| 7 | built |
| 8 | bare |
| 9 | snowIce |
| 11 | rangeland (erbe/arbusti misti) |
| 10 / assente / codice ignoto | unknown |

L'enum prevede anche shrubland, grassland e mossLichen per provider futuri: il dataset corrente non li distingue con affidabilità. `LandCoverProvider` permette sostituzioni. ESA WorldCover è stato valutato: i [servizi di visualizzazione](https://esa-worldcover.org/en/data-access) non sono consigliati per analisi dei pixel; scaricare grandi COG non è appropriato per un singolo tap mobile. Non vengono decodificati colori di una mappa WMS.

Il raster non copre necessariamente il mare aperto. **NoData non significa acqua**. Soltanto quando tutti i campioni sono sconosciuti viene interrogato [Marine Regions, Global Oceans and Seas v1 (2021), VLIZ](https://www.marineregions.org/sources.php#goas), [DOI 10.14284/542](https://doi.org/10.14284/542), WFS `MarineRegions:goas`, intersezione puntuale. Una feature marina valida autorizza `water`; nessuna intersezione/errore lascia `unknown`. Poligoni costieri, porti e modifiche recenti della costa hanno limiti; la confidence marina è inferiore a quella del raster. Il fallback non inventa laghi: quelli devono risultare dalla copertura.

### Meteo e DEM

Si riusano [Open-Meteo](https://open-meteo.com/en/docs) e il [DEM Copernicus GLO-90](https://open-meteo.com/en/docs/elevation-api) della v2. Meteo = **stime di modelli e forecast archiviati**, non misure in situ. Trenta giorni UTC completi, oggi escluso. Il meteo arrotonda a 0,01°; la risoluzione effettiva del modello può essere maggiore. Il DEM è un modello di elevazione circa 90 m, non un rilievo centimetri per centimetro.

Alle variabili v1 si aggiungono medie giornaliere VPD (`vapour_pressure_deficit`, kPa), vento a 10 m (km/h espliciti) e radiazione giornaliera (`shortwave_radiation_sum`, MJ/m²). Le nuove proprietà sono opzionali nello schema: cache meteo precedenti restano valide. Mancanti/invalidi non diventano zero. Si richiedono 20 ore valide per la media giornaliera, poi almeno l'80% dei giorni per gli aggregati. Nessuna richiesta di previsioni future.

Meteo pubblico senza chiave soggetto alle condizioni Open-Meteo, incluso l'uso non commerciale; un lancio commerciale richiede verifica della fornitura. L'app non introduce un abbonamento obbligatorio.

### Pedologia e simbionti

[SoilGrids](https://docs.isric.org/globaldata/soilgrids/) dichiara il servizio REST temporaneamente sospeso alla verifica del 10 ottobre 2026. Non viene aggiunto un endpoint instabile al percorso critico: `SoilProvider` restituisce `null`, senza chiamate, con spiegazione UI e confidence ridotta. Il modello prevede pH, carbonio organico g/kg e frazioni sabbia/limo/argilla %, ma nessun valore viene fabbricato. Per ora soltanto il pH facoltativo dei Finferli avrebbe peso; altre proprietà restano descrittive. Prima di abilitare un provider reale servono validazione di unità/profondità e cache statica dedicata.

`hostCompatibility=unknown` per Porcini/Finferli: la copertura arborea non permette di distinguere ospiti Fagaceae, Pinaceae o Betulaceae, predisposti nel profilo come gruppi indicativi. Non si deducono specie arboree o micelio. Il generico usa `notRequired` perché include ecologie diverse. Fonti di contesto: [Kew sui gruppi di porcini](https://www.kew.org/read-and-watch/porcini-new-species) e [US Forest Service, Ecology and management of commercially harvested chanterelle mushrooms](https://www.fs.usda.gov/pnw/pubs/pnw_gtr576.pdf). Queste fonti motivano cautela e associazione con le piante, **non validano i nostri intervalli numerici**.

## Habitat e biogeografia

Acqua, neve/ghiaccio, suolo nudo e built senza vegetazione vicina → `unsuitable`, score `null`. È una scelta prudente per documentare macrofunghi terrestri, non l'affermazione che ogni forma di vita fungina sia impossibile su quelle superfici. Errori del raster e roccia con vegetazione sub-pixel restano limiti.

Un pixel built con almeno un vicino trees/grassland/shrubland/rangeland diventa **marginale 10**, anziché escludere la città. La vegetazione reale nel centro urbano riceve gli stessi criteri di quella extraurbana. Non si utilizzano confini amministrativi.

| Habitat | Generico | Porcini | Finferli |
| --- | ---: | ---: | ---: |
| alberi | 100 | 100 | 100 |
| prato | 90 | 20 | 10 |
| arbusti | 85 | 40 | 25 |
| erbe/arbusti misti | 85 | 25 | 15 |
| coltivi | 60 | 10 | 5 |
| vegetazione allagata | 65 | 25 | 35 |
| muschi/licheni | 45 | 15 | 20 |

Compatibile ≥65, altrimenti marginale; dato sconosciuto resta `unknown`. Habitat sconosciuto → stato `uncertain`, senza score principale, anche con meteo perfetto; il sottopunteggio meteo rimane consultabile nei dettagli.

Biogeografia non usa poligoni inventati di presenza. Sono **fasce di applicabilità climatica dell'euristica**, non areali: Generico |lat|0–70°, Porcini/Finferli 25–65°N. Dentro: compatibile100. Fuori: incerto, generico65 / profili forestali50; risultato finale massimo64. L'emisfero sud non viene dichiarato incompatibile: alcuni gruppi vi esistono, ma una taratura temperata settentrionale non è automaticamente trasferibile. Il modello non sa distinguere ecotipi, introduzioni o distribuzioni continentali precise. Fasce descrittive tropicale <23,5°, subtropicale <40°, temperata <60°, boreale/polare oltre: proxy da latitudine, **non mappa Köppen**.

## Stagione, latitudine e quota

Mese frazionario UTC `m = mese + (giorno−1)/30`, traslato di sei mesi al sud. `L=|latitudine|`, `z=quota DEM`, altrimenti quota meteo. Due picchi prudenti:

```
autunno = 10.5 − (L−35)×0.05 − z/3000
primavera = 5.5 + (L−35)×0.035 + z/4000
pulse = max(exp(−(d(m,autunno)/width)²), springStrength×exp(−(d(m,primavera)/width)²))
calendar = floor + (100−floor)×pulse
```

`d` è distanza circolare in mesi. Quote/latitudini maggiori anticipano la finestra autunnale e ritardano quella primaverile: **assunzione fenologica**, non previsione locale. Sotto |lat|23,5° il calendario è assente: non si inventa la stagione delle piogge.

| Parametro | Generico | Porcini | Finferli |
| --- | ---: | ---: | ---: |
| floor | 55 | 25 | 30 |
| width, mesi | 2,7 | 1,7 | 2,2 |
| springStrength | 0,95 | 0,8 | 0,55 |

Trend suolo = media ultimi3 giorni − media3 precedenti. Compatibilità termica `T`: 25% curva aria +65% curva suolo +10% stabilità del trend (100 fino a ±2°C, −10 punti per grado ulteriore). Stagione =80% calendar +20% T. Componenti assenti rinormalizzate; tropici stagione assente.

La quota non riceve un bonus assoluto. Un **proxy locale di fascia termica**, non una mappa altitudinale dell'habitat:

```
target = centro plateau ideale aria + (calendar−75)/25
zTermica = max(0, z + (ariaMedia−target)/0.0065)
compatibilitàQuota = 35%×clamp(100−|z−zTermica|/12) +65%×T
```

Se manca calendar il suo correttivo è0. Il gradiente 6,5°C/km è una semplificazione atmosferica progettuale; inversioni, chiome ed esposizione reale possono contraddirlo. Non invita a spostarsi a una quota calcolata. La UI mostra solo compatibilità quota/clima. La funzione richiede quota e temperatura valide: assenti non vengono sostituiti da una quota preferita.

## Acqua, temperatura ed essiccamento

Curve trapezoidali `[a,b,c,d]`:0 ai limiti esterni, salita lineare a100, plateau b–c, discesa. Generico e Porcini riusano gli intervalli v1; Finferli aggiunge:

| Variabile | Finferli [a,b,c,d] |
| --- | --- |
| aria °C | 2,12,20,30 |
| suolo °C | 2,10,18,26 |
| umidità m³/m³ | 0.12,0.27,0.40,0.55 |
| pioggia14 mm | 0,30,90,180 |
| giorni post pioggia | 0,4,14,28 |
| deficit ET₀3−pioggia3 mm, non negativo | −30,−15,0,12 |
| umidità aria % | 40,75,100,101 |
| pH opzionale | 3,4.5,6.5,8 |

Pioggia significativa ≥5mm/giorno UTC, finestre7/14/21/30 e latenza v1 conservate. Distribuzione14giorni: `wetDays=count(rain≥1mm)`, `peakShare=max(rain)/sum(rain)`, `Rseq=100×(1−max(0,peakShare−0.3)×0.75)×min(1,wetDays/4)`. Zero pioggia →0; qualunque giorno mancante →assente. Un temporale unico perde punti rispetto alla stessa quantità distribuita; pioggerella da sola non garantisce idratazione. Rseq non descrive infiltrazione reale.

Umidità: suolo pesa70/80/85% per Generico/Porcini/Finferli; la parte residua combina pioggia14 (45%), latenza (25%), distribuzione (30%). Temperatura: suolo70/80/85%, aria30/20/15%. Il valore di ciascun sottosistema non può superare `floor+(100−floor)×scoreSuolo/100`, con floor25/15/10 rispettivamente. Tanto la saturazione quanto il suolo secco o troppo caldo/freddo penalizzano.

Drying:55% curva deficitET₀,25% VPD,10% vento,10% umidità aria. VPD/vento sono medie3giorni; curve:

| Profilo | VPD kPa | Vento km/h | Amplificazione aspect |
| --- | --- | --- | ---: |
| Generico | −1,0,0.8,3 | −1,0,15,55 | 1 |
| Porcini | −1,0,0.7,2.5 | −1,0,12,45 | 1,1 |
| Finferli | −1,0,0.6,2.2 | −1,0,10,40 | 1,2 |

ET₀ integra già energia, temperatura, vento e umidità; la radiazione viene visualizzata ma non aggiunta come ulteriore peso. Rimane correlazione fra variabili: il drying è un proxy atmosferico, non un bilancio idrico del sottobosco.

## Terreno e formula finale

Horn3×3, spaziatura100m, slope/aspect e validazioni rimangono v2. Pendenza:100 fino15°, poi−2/grado, minimo0. Aspect assente se slope<2°, DEM incompleto o fascia tropicale. Il fattore usa `88+12×cos(aspect)×emisfero×clamp(thermalSide+dryPressure×amplificazione,−0.5,1)`; `thermalSide=clamp((suolo−centroPlateau)/8,−1,1)`, `dryPressure=(100−drying)/100`. Il versante più fresco è favorito quando caldo/secco; con suolo freddo può essere favorito quello opposto. La stagione agisce anche attraverso le temperature osservate dal modello; non esiste un bonus Nord universale. Terreno =40% pendenza +25% aspect +35% compatibilità quota/clima, rinormalizzati.

| Sottosistema | Peso nominale | Motivazione progettuale |
| --- | ---: | --- |
| Umidità | 35 | disponibilità idrica del suolo dominante |
| Temperatura | 30 | limiti termici, soprattutto nel suolo |
| Essiccamento | 15 | pressione recente di perdita d'acqua |
| Stagione | 10 | contesto prudente, non criterio esclusivo |
| Terreno | 7 | correttivo secondario/proxy |
| Pedologia opzionale | 3 | contributo accessorio, mai requisito |

Media geometrica dei soli sottosistemi disponibili:

```
conditions = 100 × exp(sum(wi × ln(max(0.01,Fi)/100)) / sum(wi))
score = round(conditions × sqrt(HabitatScore/100) × sqrt(BiogeographyScore/100))
```

Il pavimento logaritmico evita log(0), non sostituisce dati mancanti. Senza umidità/temperatura/drying il risultato è `insufficient`, non uno score basato sul solo calendario. Per ciascuna curva fondamentale di umidità/temperatura suolo disponibile: `score≤round(20+0.8×curvaSuolo)`. Incertezza geografica: massimo64. Hard exclusion e habitat sconosciuto sopprimono il numero. Confidence **non compare** nella formula. Nessun NaN; score intero0–100. Classi v1 conservate. Le spiegazioni derivano dai fattori, con limitazioni <45 prima, poi fattori più favorevoli; massimo5.

## Confidence indipendente

Misura operativa della qualità/completamento, non accuratezza scientifica o probabilità:

- 35 punti copertura: qualità1 per raster2025, −0,08 per ogni anno oltre il primo, minimo0,5; Marine Regions0,7; unknown0. Risoluzione fuori limite viene già rifiutata dall'adapter.
- 40 punti completezza meteo: umidità suolo30%, temperatura suolo25%, aria10%, pioggia14 15%, latenza5%, deficit10%, umidità aria5%. Moltiplicata per freschezza1 entro6ore; poi max(0,25;0,75−ore oltre6/(7giorni)).
- 10 punti DEM con slope valido; 10 geografia compatibile (4 se incerta); 5 proprietà suolo disponibili.
- −2 VPD assente, −1 vento assente, −5 ospite non identificato nei profili forestali, −8 omogeneità land cover <60% dei9campioni.
- Habitat sconosciuto: massimo45. Hard exclusion:90×qualità copertura; non si penalizza il meteo deliberatamente non richiesto.

Alta≥85, media≥55, altrimenti bassa. Un indice alto con affidabilità media non viene automaticamente ribassato. I parametri sono modificabili e non rappresentano un intervallo di confidenza statistico.

## Cache, richieste e offline

Cache JSON in memoria + localStorage per piccoli **aggregati ambientali pubblici**, separate dalle fotografie/IndexedDB. Nessuna immagine o taccuino finisce in queste cache. Storage pieno/indisponibile → memoria limitata.

| Dati | Chiave | Freschezza / conservazione | Massimo |
| --- | --- | --- | ---: |
| Copertura | provider+coordinate5decimali | 90giorni | 256 |
| DEM v2 | provider+campioni6decimali | 180giorni | 4096 |
| Meteo v1 | anchor0,01° | 6ore /7giorni | 32 |
| Snapshot ecologico | algorithmVersion+profilo+coordinate5decimali+giornoUTC | 6ore e stesso giorno /7giorni | 32 |
| Overlay v2 | invariata, algoritmo distinto | 6ore /7giorni | 6aree |

La chiave land (~1m latitudine) evita di riusare il pixel di un edificio per il parco accanto; non promette risoluzione a1m. Lo snapshot conserva input validati e ricalcola il motore, mai un vecchio score incompatibile. TTL dinamico decorre dal meteo, non dal nuovo tap. Pulizia di scaduti, duplicati, timestamp futuri ed eviction dei più vecchi. Versioni algoritmo incompatibili ignorate, raw meteo/DEM riutilizzabili. Unknown land non persistito per90giorni; nessuna cache pedologica finché non esiste un provider affidabile.

Tipicamente **3 richieste** a cache vuota (copertura+meteo+batch9quote); **1** per un'esclusione sul raster, **2** per mare confermato dopo NoData; al massimo4 nel percorso di fallback marino senza intersezione seguito da meteo/DEM. Tap ripetuto fresco o solo cambio profilo con raw cache valide:0. Un tap su cella v2 fresca richiede solo copertura quando non in cache. Nessuna chiamata al solo pan/zoom, retry automatico, scan o download raster completo.

Timeout12s per richiesta; controllo HTTP, JSON e schema; AbortController; deduplica tap identici. Un sottoscrittore annullato non interrompe gli altri; chiudere/sostituire il punto annulla il lavoro non più necessario. Nessun listener residuo o pubblicazione tardiva dello snapshot; raw dati già completati possono restare in cache. La sola classificazione di territorio impossibile evita del tutto gli altri provider.

Offline: snapshot compatibile fino7giorni, data effettiva, etichetta **Dati memorizzati** e avviso oltre6ore. Nuovo punto senza copertura: idoneità non verificata; nessun normale score meteo spacciato per ecologico. Se mancano tutti i dati dinamici: dati insufficienti. Mappa/GPS/taccuino continuano normalmente. Un provider opzionale fallito lascia disponibili tutti gli altri dettagli.

## Privacy, UX e limiti

Al tap: Esri riceve il punto e otto vicini10m a sei decimali; solo in fallback VLIZ riceve il punto a sei decimali; Open-Meteo riceve anchor meteo0,01° e fino9coordinate dello stencil DEM100m. Oltre a coordinate/parametri pubblici, i provider vedono normali metadati di rete come IP. Fetch senza credenziali e referrer. **Mai nickname, identità applicativa, fungaie, ritrovamenti, tracce o foto.** Nessun backend, account, cloud utente o AI.

UI nelle sei lingue, preferenze °C/°F, mm/in, m/ft, km/h/mph e data/ora; calcolo sempre canonico. Fonti/attribuzioni e disclaimer conservati. Risultato semplice, motivazioni massime5, dettagli accessibili con `details/summary`; chiusura/abort invariati.

Limiti sostanziali: copertura annuale non attuale al minuto; pixel misti e piccoli parchi; copertura arborea senza ospiti; clima da latitudine senza areali; modelli meteo grossolani; suolo simulato; DEM90m; nessuna fenologia locale calibrata; SoilGrids disabilitato; profili aggregano specie diverse. Nessun modello può promettere la presenza del fungo senza osservare micelio, substrato e storia del luogo. Non usare score o slope per valutare la sicurezza di un percorso.

## Verifica

Unit test con servizi mockati: Adriatico/lago, Sahara nudo, piazza edificata, neve, parco alberato, bosco europeo favorevole/secco/saturo/caldo; distribuzione pioggia e drying; latitudini/emisferi, quote300/600/900 con climi coerenti; profili; slope/aspect contestuale; assenza dati, confidence, finitezza, range0–100; classi provider, NoData/fallback marino, versioni cache, TTL, deduplica, abort e guasti indipendenti. Suite precedenti conservate.

E2E mockati desktop Chromium, iPhone WebKit e Android360px: risultato/stati esclusi, Finferli, dettagli chiusi, DEM opzionale fallito, cache dopo riapertura/offline, unità e invarianza journal/GPS; conservate prove overlay v2. Le prove geografiche automatiche verificano risposte controllate, non la correttezza universale della classificazione satellitare. Sonde manuali sui servizi pubblici hanno controllato classi Sahara/edificato, NoData marino, intersezione Adriatico, assenza intersezione terrestre e CORS, senza dati privati.

Comandi: `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Esiti e limiti esecutivi effettivi nella PR. Non sono implementati apprendimento, distribuzioni specie dettagliate, riconoscimento immagini, previsioni future o sincronizzazione.
