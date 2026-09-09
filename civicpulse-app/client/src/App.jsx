import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './lib/AuthContext.jsx';
import { useGeo } from './lib/useGeo.js';
import { api } from './lib/api.js';
import AuthPage from './pages/AuthPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import MinePage from './pages/MinePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import IssueDetail from './components/IssueDetail.jsx';

export default function App() {
  const { user, loading, isAdmin, logout } = useAuth();
  const { position, error: geoError } = useGeo(true);   // live position, asked for on load
  const [tab, setTab] = useState('map');
  const [issues, setIssues] = useState([]);
  const [focus, setFocus] = useState(null);

  const reload = useCallback(() => {
    if (!user) return;
    api.issues().then(setIssues).catch(() => {});
  }, [user]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (user) setTab(user.role === 'admin' ? 'admin' : 'map'); }, [user?.id]);

  if (loading) return <div className="grid h-screen place-items-center text-sm text-ink-2">Loading…</div>;
  if (!user) return <AuthPage />;

  const tabs = [
    ['map', 'Map'],
    ['report', 'Report an issue'],
    ['mine', 'My reports'],
    ...(isAdmin ? [['admin', 'Dashboard']] : []),
    ['profile', 'Profile']
  ];

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-14 flex-none items-center gap-4 bg-ink px-4 text-white">
        <div className="flex items-baseline gap-2 text-[17px] font-bold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-amber" />
          CivicFix
        </div>
        <nav className="ml-auto flex gap-0.5">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-md px-3 py-2 text-sm ${
                tab === key ? 'bg-white font-semibold text-ink' : 'text-[#a8b8c2] hover:bg-white/10 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden border-l border-white/20 pl-4 text-[13px] leading-tight sm:block">
          <b className="block font-semibold">{user.name}</b>
          <span className="text-[11.5px] text-[#93a5b1]">{isAdmin ? 'Ward administrator' : 'Resident'}</span>
        </div>
        <button onClick={logout} className="rounded-md border border-white/25 px-2.5 py-1.5 text-xs text-[#cfdae1] hover:border-white hover:text-white">
          Sign out
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto">
        {tab === 'map' && <MapPage issues={issues} you={position} reload={reload} />}
        {tab === 'report' && (
          <ReportPage
            you={position}
            geoError={geoError}
            reload={reload}
            goToMap={(id) => { setTab('map'); setFocus(id); }}
          />
        )}
        {tab === 'mine' && <MinePage reload={reload} />}
        {tab === 'admin' && isAdmin && <AdminPage issues={issues} reload={reload} />}
        {tab === 'profile' && <ProfilePage />}
      </main>

      {focus && <IssueDetail id={focus} onClose={() => setFocus(null)} onChange={reload} />}
    </div>
  );
}
