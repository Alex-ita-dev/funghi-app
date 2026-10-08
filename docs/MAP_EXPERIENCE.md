# Esperienza cartografica — Blocco 3

Base: `main` dopo il merge della PR #1 (`b1c7c34`). Nessuna migrazione Leaflet, nessuna modifica a GPS, modello delle uscite, transazioni IndexedDB o backup V1.

## Provider

| Modalità | Provider esistente | Configurazione |
| --- | --- | --- |
| Topografica | OpenTopoMap | Nessuna chiave |
| Satellite | MapTiler satellite-v4 | `VITE_MAPTILER_KEY` |
| Outdoor / Sentieri | MapTiler outdoor-v4 | `VITE_MAPTILER_KEY` |
| Stradale | OpenStreetMap | Nessuna chiave |

La chiave MapTiler è pubblica e incorporata al build: configurarla per l'ambiente Vercel desiderato e ricostruire. Usare restrizioni di dominio e rispettare quote/condizioni del provider. Senza chiave le due opzioni sono visibili ma disabilitate; nessun servizio a pagamento è necessario per usare l'app con Topografica/Stradale. Non sono state aggiunte richieste di anteprime remote: le miniature sono icone e campioni grafici indicativi, non immagini geografiche.

## Preferenze e vista

- `preferences.mapLayer` aggiunge un campo compatibile ai settings V1. Se manca, legge la vecchia chiave locale `mycotrail.map-layer.v2`, senza cancellarla. I preset paese non cambiano il layer.
- Centro e zoom sono memorizzati separatamente in `mycotrail.map-viewport.v1`, validati alla lettura e aggiornati su `moveend`. Lo storage opzionale non blocca la mappa.
- Una vista salvata prevale sulla centratura iniziale del taccuino. Centrami, avvio/ripresa uscita, punti e ritorno auto continuano a eseguire le richieste esplicite. Il ritorno dalla schermata impostazioni non riesegue una vecchia centratura.
- Il fallback è temporaneo e non riscrive il layer preferito. Se una chiave non è disponibile viene mostrata Topografica. Se un intero gruppo di tile fallisce, o non ne arriva nessuno entro 10 secondi, si prova un provider pubblico non ancora fallito (Stradale, poi Topografica). Nessun ciclo infinito. Un singolo tile mancante non provoca il cambio quando altri vengono caricati.
- Se anche i provider alternativi sono irraggiungibili, rimangono punti/tracce, il messaggio di errore e Riprova mappa. Senza rete non si può garantire una cartografia nuova: questo blocco non scarica mappe offline.

## Interfaccia e accessibilità

Un unico pulsante apre un pannello compatto a due colonne sopra la mappa, senza coprire le attribuzioni. Stato attivo con bordo e spunta, `aria-pressed`, opzioni non disponibili disabilitate. Chiusura tramite pulsante, Escape, scelta o tocco esterno; ripristino del focus. Tema e sei lingue mantenuti.

Zoom e centratura sono allineati a destra; bussola a sinistra. Ritorno auto conserva la posizione nelle azioni dell'uscita/fullscreen. Il badge GPS esistente distingue ricerca, disponibilità/precisione, bassa precisione e permesso negato, senza nuovi watcher. Scala Leaflet con una sola unità attiva, secondo le preferenze. Attribuzioni sempre presenti; su schermi corti il fullscreen può scorrere per evitare sovrapposizioni.

## Verifica

- `npm run typecheck`: superato.
- `npm test`: 51 test superati, inclusi 8 nuovi test con Leaflet reale in jsdom, compatibilità preferenze precedenti, fallback senza chiave e watch GPS conservato durante cambio layer/tema/lingua/unità.
- `npm run build`: superato; restano gli avvisi preesistenti lucide `use client` e bundle >500 kB.
- `git diff --check`: superato.
- E2E Chromium tentati con un worker e arresto al primo errore: browser Playwright assente, blocco prima dell'apertura dell'app. L'installazione era già fallita nella sessione precedente per archivio non valido; non ripetuta. Nessun E2E dichiarato superato; WebKit/Android non eseguiti localmente.
- Suite E2E aggiornata: fallback automatico, pannello/attribuzioni e scala imperiale, 45 combinazioni configurate. Il workflow PR esistente esegue la suite sui runner GitHub: consultare il risultato effettivo.

jsdom verifica lifecycle, eventi e DOM ma non il layout visivo. Restano da verificare su preview iPhone/Android: leggibilità in luce/scuro, orientamento orizzontale, provider MapTiler con chiave reale e sensori GPS reali.
