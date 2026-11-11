import { lazy, Suspense, useEffect, useState } from 'react';
import Overview from './pages/Overview';
import Airports from './pages/Airports';
import Airlines from './pages/Airlines';
const Heatmap = lazy(() => import('./pages/Heatmap'));

const page = () => location.hash.replace(/^#\/?/, '');

export default function App() {
  const [p, setP] = useState(page());
  useEffect(() => {
    const on = () => setP(page());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const link = (to: string, label: string) => (
    <a href={`#/${to}`} className={p === to ? 'on' : ''}>{label}</a>
  );

  return (
    <div className="shell">
      <header>
        <div className="brand">Malaysian Airspace <span>Analytics</span></div>
        <nav>
          {link('', 'Ringkasan')}
          {link('airports', 'Lapangan terbang')}
          {link('airlines', 'Syarikat')}
          {link('map', 'Peta')}
        </nav>
      </header>
      <Suspense fallback={<p className="msg">Memuatkan peta...</p>}>
        {p === 'airports' ? <Airports /> : p === 'airlines' ? <Airlines /> : p === 'map' ? <Heatmap /> : <Overview />}
      </Suspense>
    </div>
  );
}