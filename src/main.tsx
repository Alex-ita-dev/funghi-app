import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return <main><span className="label">IL TUO COMPAGNO NEL BOSCO</span><h1>Funghi App</h1><p>Percorsi, ritrovamenti e fungaie. Tutto in un unico posto.</p><section><h2>Stiamo preparando la prima uscita</h2><p>Qui troverai la mappa, il punto auto e i tuoi ritrovamenti.</p><span className="badge">Progetto in sviluppo</span></section></main>;
}

createRoot(document.getElementById('root')!).render(<App />);
