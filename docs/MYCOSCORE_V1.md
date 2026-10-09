# MycoScore v1 — indice di condizioni favorevoli

Base: main dopo PR #3 (`97efba5`). MycoScore è un indice euristico sperimentale 0–100, NON una probabilità, una previsione certa, un modello AI o un'indicazione di commestibilità. Nessuna validazione agronomica/micologica sul campo è stata effettuata. Un valore alto non implica presenza di micelio, habitat adatto o funghi: substrato, specie arboree, stagionalità e storia locale non sono ancora inclusi.

## Architettura e flusso

`src/lib/mycoScore.ts`: tipi ambientali canonici, aggregazione, profili, curve, pesi, classificazione e spiegazioni; modulo puro senza React, fetch, storage o dipendenze da preferenze. `src/services/mycoEnvironment.ts`: adapter HTTP, validazione, aggregati giornalieri e cache. `MycoScoreCard`: presentazione, scelta profilo e ciclo di vita richiesta. I futuri calcoli per griglia potranno riusare il modulo puro, senza introdurre ora scansioni o heatmap.

L'utente attiva MycoScore e tocca un punto intenzionalmente. Un indicatore viola separato dai ritrovamenti resta sulla mappa. Chiudere la scheda consente un'altra selezione; il pulsante Esci disattiva la modalità. Navigare altrove annulla richieste e selezione. La selezione di auto/ritrovamenti ha precedenza. Nessuna richiesta durante pan/zoom e nessuna lettura del GPS per il punteggio. Nessuna modifica a watchPosition, algoritmi GPS, tracce, pause, segmenti, checkpoint, ritorno auto, database del taccuino o backup.

## Fonte e variabili

Una richiesta GET a [Open-Meteo Forecast API](https://open-meteo.com/en/docs), `past_days=30`, `forecast_days=0`, `timezone=GMT`. Sono stime da modelli/forecast archiviati, non misure di una stazione o sensori nel punto. Si usano solo i 30 giorni UTC completi prima della data della richiesta, senza mescolare oggi incompleto o previsioni future.

- Daily: rain_sum + showers_sum (pioggia liquida, neve esclusa), temperature_2m_mean/min/max, et0_fao_evapotranspiration.
- Hourly: relative_humidity_2m, soil_temperature_6cm, soil_moisture_3_to_9cm. Medie giornaliere solo con almeno 20 ore valide; dati non numerici/fuori intervalli fisici ampi diventano null.
- Quota: elevation della risposta, DEM a 90 m descritto dal provider, in metri per la cella interrogata. Evitata una seconda richiesta di elevazione.
- Suolo: scelta deliberata di 6 cm e 3–9 cm per continuità con i dati recenti dell'endpoint Forecast. Non vengono presentati come 0–7 cm ERA5. Nessuna ricostruzione artificiale delle profondità.
- Esposizione e pendenza: null. Una sola quota DEM non basta per ricavarle; demandate alla v2 con una fonte di terreno adeguata.

La griglia di cache è 0,01° (circa 1,1 km in latitudine; longitudine variabile). La quota riguarda quella cella, non la coordinata precisa mostrata sopra la scheda; le celle meteo del provider possono essere molto più grandi. Non si ricava esposizione dall'orientamento del telefono.

## Aggregati canonici

Pioggia totale su 7/14/21/30 giorni: la somma è disponibile solo se tutti i giorni della finestra hanno un valore. Mai trasformare null in zero. Pioggia significativa = almeno **5 mm di pioggia liquida in un giorno UTC**: soglia progettuale per distinguere una bagnatura apprezzabile da pochi decimi, non garanzia di infiltrazione. Giorni dall'ultimo evento: ieri = 1; se un giorno più recente è assente, valore sconosciuto; nessun evento in 30 giorni completi = almeno 30.

Aria: media ultimi 7 giorni, estremi delle minime/massime giornaliere su 7 giorni; andamento = media ultimi 3 meno media dei 3 precedenti. Suolo e umidità relativa: medie degli ultimi 3 giorni. Le medie richiedono almeno l'80% dei giorni validi (6/7 o 3/3). ET₀ totale di 3 giorni; deficit di essiccamento = max(0, ET₀ totale − pioggia totale degli stessi 3 giorni). È un proxy atmosferico, non un bilancio idrico completo del terreno: non modella drenaggio, tipo di suolo, chioma, ruscellamento o evapotraspirazione effettiva.

## Formula, pesi e intervalli

Ogni curva trapezoidale `[a,b,c,d]` restituisce 0 sotto a/sopra d, sale linearmente da 0 a 100 tra a e b, resta 100 tra b e c, scende linearmente a 0 tra c e d. Il risultato viene limitato a 0–100. Il deficit è non negativo, quindi per essiccamento si usa solo il plateau a zero e il ramo discendente. L'umidità relativa è validata 0–100: 101 serve solo a chiudere matematicamente il trapezio.

| Fattore | Peso | Generico [a,b,c,d] | Porcini [a,b,c,d] |
| --- | ---: | --- | --- |
| Umidità suolo, m³/m³, media 3 gg | 25 | 0.08, 0.22, 0.38, 0.55 | 0.10, 0.24, 0.36, 0.52 |
| Pioggia liquida 14 gg, mm | 20 | 0, 25, 80, 180 | 0, 30, 75, 160 |
| Temperatura aria media 7 gg, °C | 15 | 2, 12, 22, 32 | 4, 14, 21, 30 |
| Temperatura suolo media 3 gg, °C | 15 | 2, 10, 20, 30 | 4, 12, 20, 28 |
| Giorni dall'ultima pioggia significativa | 10 | 0, 3, 10, 25 | 0, 5, 12, 25 |
| Deficit essiccamento 3 gg, mm | 10 | -30, -15, 0, 20 | -30, -15, 0, 15 |
| Umidità relativa media 3 gg, % | 5 | 30, 70, 100, 101 | 35, 75, 100, 101 |

**Motivazione progettuale**, non coefficienti scientificamente stimati: l'umidità del suolo è il proxy più diretto della disponibilità d'acqua (25); la pioggia antecedente descrive l'apporto (20); il regime termico riceve 30 punti divisi tra aria e suolo; latenza dopo pioggia e perdita atmosferica valgono 10 ciascuna; l'umidità dell'aria, proxy indiretto, solo 5. Le finestre sovrapposte di pioggia 7/21/30 giorni sono mostrate ma non sommate come fattori separati, per limitare il doppio conteggio. Rimane correlazione tra i fattori idrici e tra le temperature: limite dichiarato della v1.

I valori numerici sono parametri iniziali di prodotto da calibrare, non soglie universali tratte dalla letteratura né una stima della probabilità di fruttificazione. Il profilo Porcini illustra intervalli un po' più stretti e una latenza più lunga; non distingue specie di Boletus, stagioni, regioni o alberi ospiti. Tutti i parametri sono centralizzati in `speciesProfiles` e `weights`. Nessun bonus di quota: senza contesto ecologico sarebbe arbitrario e duplicherebbe in parte la temperatura. Quota informativa, peso 0; esposizione/pendenza peso 0 finché non affidabili.

Score = round(sum(peso × sottopunteggio disponibile) / sum(pesi disponibili)). Tutti i fattori assenti → score null e “Dati insufficienti”, NON 0. L'eccesso di pioggia e l'umidità molto alta scendono sul ramo destro delle curve; caldo/freddo, lunga siccità e alto deficit riducono il risultato. Pioggia di ieri ha compatibilità post-pioggia ridotta; più pioggia non significa automaticamente meglio. Non ci sono veto assoluti: una media con fattori estremi va interpretata insieme alle spiegazioni.

Classi sul risultato arrotondato: 0–24 scarse, 25–44 poco favorevoli, 45–64 discrete, 65–79 favorevoli, 80–100 molto favorevoli.

Spiegazioni: fino a due fattori sotto 45, ordinati per peso × (100 − sottopunteggio), poi i fattori restanti ordinati per peso × sottopunteggio; massimo 4. Ogni frase mostra il fattore reale e il suo sottopunteggio: <45 penalizzante, 45–64 intermedio, >=65 compatibile. Se restano meno di due fattori, non si inventano spiegazioni aggiuntive.

## Missing data e affidabilità

I fattori assenti non contribuiscono né al numeratore né al denominatore. Completezza pesata >=85%: alta, >=55%: media, altrimenti bassa. L'etichetta misura **completezza**, non accuratezza scientifica, risoluzione spaziale o probabilità di trovare funghi. Il valore può essere alto con pochi fattori: l'etichetta bassa e i fattori mancanti restano visibili. La cache scaduta mostrata dopo un errore/offline forza affidabilità bassa; il periodo effettivo è sempre visibile.

## Cache, offline, errori

Cache versionata in memoria + localStorage, esclusivamente aggregati ambientali (nessuna foto): massimo 32 celle, TTL fresco 6 ore, conservazione massima 7 giorni. Scadenza/pulizia/limite applicati a ogni accesso; tempi futuri e JSON/schema corrotti ignorati. Se lo storage è bloccato/pieno si continua in memoria. Non si espande IndexedDB e non si modifica il backup del taccuino: dati ambientali rigenerabili, cache non inclusa nei backup. Il profilo modifica il calcolo locale, non la cache o la richiesta.

Cache fresca: zero chiamate. Cache scaduta: si tenta aggiornamento, poi fallback alla cache con avviso e data/ora se offline o in errore. Oltre 7 giorni nessun fallback. Nessuna cache compatibile offline: messaggio esplicito, resto dell'app operativo. La scadenza riguarda fetchedAt, mentre il periodo ambientale resta visibile separatamente. Un passaggio di mezzanotte entro il TTL può mostrare ancora la finestra del giorno precedente.

Una richiesta intenzionale per punto, timeout 12 s, AbortController propagato, cleanup timer/listener, annullamento alla chiusura/sostituzione/unmount. Risposte tardive annullate non aggiornano UI né cache. Errori HTTP/rate limit, JSON invalido e assenza totale di dati sono recuperabili tramite Riprova; nessun retry automatico o scansione area.

## Privacy e condizioni del provider

Vengono inviati al provider solamente latitudine/longitudine arrotondate e parametri ambientali pubblici; nessun nickname, ritrovamento, fungaia, fotografia o cronologia GPS. La richiesta browser comporta inevitabilmente l'indirizzo IP e normali metadati di rete. `credentials: omit`, `referrerPolicy: no-referrer`. L'avviso è visibile nella modalità prima del tap e nella scheda. La cache locale contiene le coordinate delle celle consultate, eliminabile cancellando i dati del sito, con limiti sopra indicati.

Attribuzione Open-Meteo e CC BY 4.0 visibile. [Condizioni Open-Meteo](https://open-meteo.com/en/terms): endpoint gratuito per uso **non commerciale**; prima di introdurre pubblicità, pagamenti o distribuire un prodotto commerciale serve riesaminare licenza e servizio. Non è richiesto un servizio a pagamento per questa fase privata e non viene configurata alcuna chiave.

## Localizzazione e verifica

Sei cataloghi i18n; Celsius/mm/metri interni, conversioni esclusivamente in UI via utility esistenti. Per differenze di temperatura °F = delta °C × 1.8, senza aggiungere 32. Date/ore e numeri seguono le preferenze; le finestre rimangono UTC dichiarate.

Test automatici con risposte mock: curve/profili, limiti 0–100, caldo/freddo/secco/saturazione, pioggia recente/eccessiva/siccità, ET₀, aggregazione e missing, classificazione, spiegazioni, affidabilità, unità, schema, TTL/retention/limite/cache persistente, offline, HTTP/JSON, timeout e cancellazione. E2E su desktop/Android/WebKit per selezione, scheda, profilo, cache dopo reload/offline, unità/lingua e invarianza del journal; suite GPS/foto/mappe precedente mantenuta. Risultati effettivi nel check della PR.

Rimandati: slope/aspect DEM robusti, validazione/calibrazione sul campo, habitat/stagionalità/ritrovamenti personali, profili specie accurati, griglia/heatmap/interpolazione. Nessun apprendimento automatico, backend o trasmissione dei dati personali del taccuino.
