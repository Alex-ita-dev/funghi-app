# Verifica della prima versione

Eseguita il 6 ottobre 2026.

- Build di produzione e controllo TypeScript: superati.
- 9 test unitari: superati (distanza, qualità GPS, jitter, salti, segmenti, pause/riprese, recupero, GPX e validazione backup).
- 4 flussi end-to-end in Chromium desktop e Chromium con viewport/touch iPhone 14 Pro Max: verificati in entrambe le configurazioni. Totale 8 combinazioni. Il test di inserimento manuale è stato ripetuto con successo dopo la correzione dell'avviso cartografia che intercettava i tocchi.
- Flussi: auto/registrazione/riapertura/conclusione/GPX; rifiuto GPS e creazione/modifica/eliminazione punti; backup; assenza di overflow e riapertura offline dell'interfaccia.
- Controllo visivo desktop e mobile; nessuna eccezione JavaScript nelle pagine osservate.
- Audit delle dipendenze di produzione: nessuna vulnerabilità segnalata al momento della verifica.

## Limiti delle verifiche

Le posizioni nei test sono sintetiche. Il download della cartografia pubblica non era disponibile nell'ambiente di test: è stato verificato il comportamento in errore, non la resa dei tile live. Non sono state precaricate mappe alternative o immagini fittizie.

Chromium con viewport iPhone non equivale a Safari. La configurazione Playwright include anche WebKit, ma quel browser non è stato eseguito in questo ambiente. GPS reale, consumo batteria, Safari/PWA iOS, wake lock e affidabilità durante un'uscita devono essere provati sul telefono seguendo `TEST_IPHONE.md`.

Il progetto è predisposto per Vercel; nessun deploy è stato effettuato e nessun servizio con account è stato collegato.
