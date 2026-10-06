# Funghi App

Web app mobile per le uscite nel bosco, progettata per diventare in seguito un'app iOS e Android con Capacitor.

## Avvio

Richiede Node.js 22 o successivo.

```sh
npm install
npm run dev
```

## Prima fase

- Mappa e posizione GPS.
- Salvataggio della posizione auto.
- Registrazione del percorso e visualizzazione del percorso per rientrare.
- Ritrovamenti e fungaie con note.

La struttura iniziale contiene solo la schermata di avvio: queste funzioni devono ancora essere implementate. Nella fase successiva verranno aggiunti Supabase per account e sincronizzazione, Squad e foto.

## Vincoli

Il tracciamento GPS web richiede HTTPS (o localhost) e non garantisce registrazione con schermo bloccato su iPhone. Il rientro dovrà mostrare la traccia percorsa, senza suggerire scorciatoie in linea retta. Le mappe offline richiedono un servizio che ne consenta il download: i tile pubblici OpenStreetMap non vanno scaricati in massa.

## Architettura

React + TypeScript + Vite. Interfaccia in src; servizi GPS, persistenza e backend verranno mantenuti separati per facilitare il passaggio a Capacitor.

## Riservatezza

Non inserire password, chiavi server o coordinate personali nella repository. I servizi gratuiti hanno limiti e non garantiscono costi nulli a qualsiasi scala.
