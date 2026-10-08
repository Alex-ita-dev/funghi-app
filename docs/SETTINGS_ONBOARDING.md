# Preferenze e profilo — web 0.3.0

## Cosa cambia

- Tema chiaro, scuro e automatico (predefinito); ascolto live di `prefers-color-scheme`, `color-scheme` e colore della barra del browser. La variante scura usa superfici verdi antracite, testo crema e accenti arancio; nessun filtro sui tile.
- Sei cataloghi locali: italiano, inglese, tedesco, spagnolo, francese e portoghese. Interfaccia, messaggi GPS, permessi, mappe, bussola, SOS e condivisione coordinate tradotti. I contenuti dell'utente e i nomi delle uscite già registrati rimangono originali.
- Lingua iniziale da `navigator.languages`, fallback inglese. Dopo la prima scrittura il browser non sovrascrive la scelta locale.
- Paese ISO con preset esplicito per lingua, unità, data e ora. Regno Unito: miglia/piedi per distanza, metri quota, Celsius, kg, mm e 24 ore. Paesi multilingue usano un suggerimento modificabile, non una geolocalizzazione: la regione del browser è solo una proposta iniziale.
- Distanza, precisione GPS, quota, scala Leaflet, date e orari seguono le preferenze. Temperatura, peso e precipitazioni hanno conversioni/formatter pronti ma non introducono ancora meteo o peso dei ritrovamenti.
- Onboarding a sette passaggi brevi, compresi benvenuto e riepilogo: nickname facoltativo, paese, ricerca funghi/tartufi/entrambi, specie multiple e livello esperienza. La scelta non nasconde funzionalità. Riapertura tramite “Riconfigura profilo”, con annullamento senza salvataggio della bozza.

## Architettura

| Modulo | Responsabilità |
| --- | --- |
| `src/lib/preferences.ts` | Schemi Zod versionati, `Preferences`, `Profile`, preset paese, rilevamento lingua/regione, catalogo specie con ID estendibili |
| `src/lib/storage.ts` | Stesso adattatore IndexedDB; lettura iniziale e scrittura transazionale delle preferenze |
| `src/hooks/usePreferences.tsx` | Provider React, salvataggi serializzati, stato/errori, tema, lingua documento, formatter condivisi |
| `src/lib/i18n.ts`, `src/locales/*.ts` | Cataloghi tipizzati, interpolazione `{{name}}`, fallback inglese; nessun servizio remoto |
| `src/lib/units.ts` | Conversioni bidirezionali pure e presentazione con `Intl` |
| `src/components/PreferencesSettings.tsx` | Sezioni aspetto, lingua/regione, unità, profilo |
| `src/components/Onboarding.tsx` | Bozza locale, navigazione, riepilogo, conferma persistita prima dell'uscita |
| `src/App.tsx` | Gate iniziale, banner utenti esistenti e integrazione delle schermate |

La localizzazione è un piccolo sistema equivalente a gettext: le frasi italiane sono chiavi leggibili; ogni lingua implementa esattamente le stesse chiavi, controllate da TypeScript e test. Interpolare frasi complete per nuovi messaggi dinamici. I sei cataloghi sono inclusi nella cache PWA, quindi il cambio lingua non richiede internet. Non sono state aggiunte dipendenze di produzione.

## Dati e compatibilità

`indexedDB.open("mycotrail", 1)` e lo store `data` rimangono invariati. La chiave `main` e lo schema del taccuino/backup `version: 1` non cambiano. Nuova chiave indipendente `settings`:

```ts
{
  version: 1,
  preferences: { /* lingua, paese, tema, unità, data/ora */ },
  profile: { nickname, searchMode, favouriteSpecies, experience },
  onboardingCompleted: boolean,
  existingInstallation: boolean
}
```

La prima lettura controlla `main` e `settings` nella stessa transazione, prima di montare il taccuino. Se `main` esiste, anche vuoto, il profilo è facoltativo e l'accesso al taccuino resta libero. Se entrambi mancano, si crea soltanto `settings` e si mostra l'onboarding. Nessuna scrittura in `main` viene effettuata dalla configurazione. Un record preferenze invalido o di versione sconosciuta non viene sovrascritto automaticamente.

La conferma onboarding è considerata completata solo dopo `transaction.oncomplete`. In caso di quota/storage non disponibile, la procedura rimane aperta e offre il nuovo tentativo. Le modifiche di aspetto sono immediate; gli errori di persistenza sono visibili nelle impostazioni. Il cambio tema/lingua non smonta `Journal`, il renderer Leaflet o il watch GPS. Anche l'editor del profilo è un dialog sopra l'app esistente.

Le coordinate, accuratezze e distanze salvate mantengono le unità SI originali. I formatter non modificano le tracce. Segmentazione, pause, checkpoint, recupero, GPX e limiti GPS restano quelli della V2. La scala della mappa cambia unità senza ricreare la mappa.

**Backup:** l'esportazione JSON esistente conserva il formato V1 del taccuino; non include le nuove preferenze/profilo. Il ripristino del taccuino non modifica il profilo. Questa scelta permette di leggere i backup nelle versioni precedenti senza migrazioni. Per una futura esportazione completa definire un contenitore aggiuntivo e un import compatibile, senza alterare V1.

## Estensioni successive

Meteo e MycoScore potranno leggere `Preferences` e i formatter; Squad/account potranno riutilizzare `Profile` e gli ID specie. Non sono implementati né login né backend. Per Capacitor occorrerà un adattatore di persistenza/trasferimento esplicito: l'archivio web non viene spostato automaticamente nella WebView. Il GPS a schermo spento resta fuori da questa fase.

## Verifiche

- `npm run typecheck`, `npm test`, `npm run build` e `git diff --check` eseguiti localmente.
- 40 test unitari e React: precedenti test GPS/backup; conversioni bidirezionali e soglie; preset/fallback; parità dei sei cataloghi e interpolazioni; IndexedDB con `fake-indexeddb`; migrazione, dati invariati, salvataggi concorrenti; onboarding, retry dopo errore, annullamento; lingue, temi; watch GPS mantenuto durante cambio lingua e apertura profilo.
- I test React usano jsdom, con il solo renderer mappa sostituito nei flussi App. Non misurano layout o comportamento Safari.
- Playwright configura 42 combinazioni: 14 flussi su Chromium desktop, Chromium Android 360×800 e WebKit iPhone. Include i flussi V1/V2, onboarding, persistenza/offline, temi, sei lingue, unità su dati salvati e reconfigurazione non distruttiva.
- Esecuzione locale Chromium bloccata **prima dell'apertura della pagina**: l'ambiente nega `socket()` all'avvio del browser. Download browser standard non valido; provato anche Chromium 134 recuperato con un installer precedente. WebKit richiede librerie di sistema non installabili nell'ambiente. Nessun E2E o screenshot locale dichiarato superato.
- `.github/workflows/verify.yml` esegue typecheck, test, build e Playwright sulla PR, conservando trace/errori e screenshot light/dark. Consultare il risultato effettivo del check prima del merge: la sola presenza del workflow non è una prova superata.

## Revisione manuale prima del merge

1. Esportare un backup dall'installazione abituale; aprire la preview del branch (origine separata, archivio separato).
2. Completare onboarding nuovo, provare nickname vuoto, tutte le modalità ricerca, selezione multipla e indietro. Chiudere/riaprire dopo salvataggio e dopo una configurazione incompleta.
3. Con dati sintetici V1 nello stesso IndexedDB, verificare banner non bloccante, taccuino e storico. Riconfigurare o annullare; confrontare auto, punti, tracce e segmenti.
4. Provare luce/scuro/sistema su 360 px, iPhone e desktop, inclusi tastiera, focus, dialoghi, mappa fullscreen, SOS e attribuzioni. Le mappe mantengono i colori del provider.
5. Cambiare paese, poi sovrascrivere lingua/unità/data/ora; controllare al riavvio. Verificare che una traccia cambi visualizzazione senza cambiare coordinate/segmenti nel backup.
6. Provare GPS reale su percorso noto: questa fase non certifica sensori, consumo batteria o tracking nativo in background.

Limiti noti: bundle principale sopra 500 kB (sei cataloghi offline inclusi); avviso preesistente `use client` di lucide-react; manifest/static metadata d'installazione in italiano, mentre UI e titolo documento seguono la lingua. Nessuna revisione linguistica esterna dei cataloghi. Il numero SOS resta 112 come nella V2, non è un selettore automatico di numeri d'emergenza per paese.

## Ripresa verifica — 8 ottobre 2026

Revisione ripresa dal commit `c35587d`, senza ricreare i blocchi 1/2 o modificare il formato del taccuino.

- Corretta una regressione riprodotta con un test: dopo un errore di salvataggio della riconfigurazione, Annulla lasciava nickname, paese, lingua e unità della bozza nello stato React, pur senza averli salvati. Ora la conferma del profilo applica la bozza soltanto dopo il completamento della transazione; le normali impostazioni mantengono l'anteprima immediata.
- Il nuovo test fallisce sul codice precedente e passa con la correzione. Suite completa: **41/41 test superati**. Build di produzione (incluso `tsc --noEmit`) e `git diff --check` superati. Restano i due avvisi di build già indicati sopra.
- E2E Chromium tentati e bloccati prima di aprire l'app: eseguibile Playwright mancante. L'installazione restituisce un archivio Chrome non valido (`End of central directory record signature not found`); nessun browser locale alternativo trovato. Android Chromium e WebKit non eseguiti; nessuno dei 42 casi E2E viene dichiarato superato. Layout, screenshot e GPS reale rimangono da verificare nel browser/dispositivo.
- La consultazione dei workflow associati al commit di partenza non ha restituito esecuzioni PR. Non è quindi disponibile una conferma CI dei test browser in questa revisione.
- Nessuna modifica a `main`, nessun merge e nessuna pubblicazione effettuati.
