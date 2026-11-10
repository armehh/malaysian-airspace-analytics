import { useEffect, useState } from 'react';
import Overview from './pages/Overview';
import Airports from './pages/Airports';

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
          <a className="off" title="Akan datang">Syarikat</a>
        </nav>
      </header>
      {p === 'airports' ? <Airports /> : <Overview />}
    </div>
  );
}
