import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './lib/AuthContext.jsx';
import { useGeo } from './lib/useGeo.js';
import { api } from './lib/api.js';
import { ToastProvider } from './components/Toast.jsx';
import AuthPage from './pages/AuthPage.jsx';
import MapPage from './pages/MapPage.jsx';
import ReportPage from './pages/ReportPage.jsx';
import MinePage from './pages/MinePage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import DirectionsPage from './pages/DirectionsPage.jsx';
import IssueDetail from './components/IssueDetail.jsx';

export default function App() {
  const { user, loading, isAdmin, logout } = useAuth();
  const { position, accuracy, error: geoError } = useGeo(true);  // asked for on load, kept fresh
  const [tab, setTab] = useState('map');
  const [issues, setIssues] = useState([]);
  const [busy, setBusy] = useState(true);
  const [focus, setFocus] = useState(null);
  const [routeTo, setRouteTo] = useState(null);

  const reload = useCallback(() => {
    if (!user) return;
    setBusy(true);
    api.issues().then(setIssues).catch(() => {}).finally(() => setBusy(false));
  }, [user]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => { if (user) setTab(user.role === 'admin' ? 'admin' : 'map'); }, [user?.id]);

  if (loading) {
    return (
      <div className="grid h-screen place-items-center">
        <div className="flex items-center gap-3 text-sm text-ink-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-rule border-t-ink" />
          Loading CivicFix…
        </div>
      </div>
    );
  }
  if (!user) return <AuthPage />;

  const tabs = [
    ['map', 'Map', '◉'],
    ['report', 'Report', '＋'],
    ['mine', 'My reports', '▤'],
    ...(isAdmin ? [['admin', 'Dashboard', '▦'], ['directions', 'Directions', '➤']] : []),
    ['profile', 'Profile', '◑']
  ];

  return (
    <ToastProvider>
      <div className="flex h-screen flex-col">
        <header className="flex h-14 flex-none items-center gap-4 bg-ink px-4 text-white">
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-amber text-[13px] font-black text-ink">
              CF
            </span>
            <span className="text-[17px] font-bold tracking-tight">CivicFix</span>
          </div>

          <nav className="ml-auto hidden gap-1 md:flex">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  tab === key ? 'bg-white font-semibold text-ink' : 'text-[#a8b8c2] hover:bg-white/10 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 md:ml-0">
            <div className="hidden text-right text-[13px] leading-tight sm:block">
              <b className="block font-semibold">{user.name}</b>
              <span className="text-[11px] text-[#93a5b1]">{isAdmin ? 'Ward administrator' : 'Resident'}</span>
            </div>
            <button
              onClick={logout}
              className="rounded-lg px-2.5 py-1.5 text-xs text-[#cfdae1] ring-1 ring-white/25 transition hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className={`min-h-0 flex-1 pb-16 scroll-thin md:pb-0 ${
          tab === 'map' || tab === 'directions' ? 'overflow-hidden' : 'overflow-auto'
        }`}>
          {tab === 'map' && <MapPage issues={issues} busy={busy} you={position} reload={reload} />}
          {tab === 'report' && (
            <ReportPage
              you={position}
              accuracy={accuracy}
              geoError={geoError}
              reload={reload}
              goToMap={(id) => { setTab('map'); setFocus(id); }}
            />
          )}
          {tab === 'mine' && <MinePage reload={reload} />}
          {tab === 'admin' && isAdmin && (
            <AdminPage
              issues={issues}
              busy={busy}
              reload={reload}
              onRoute={(id) => { setRouteTo(id); setTab('directions'); }}
            />
          )}
          {tab === 'directions' && isAdmin && (
            <DirectionsPage
              issueId={routeTo}
              you={position}
              reload={reload}
              onPickAnother={() => setTab('admin')}
            />
          )}
          {tab === 'profile' && <ProfilePage />}
        </main>

        {/* thumb-reachable navigation on phones */}
        <nav className="fixed inset-x-0 bottom-0 z-[900] flex border-t border-rule bg-white/95 backdrop-blur md:hidden">
          {tabs.map(([key, label, glyph]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-medium transition ${
                tab === key ? 'text-ink' : 'text-ink-3'
              }`}
            >
              <span className="text-[15px] leading-none">{glyph}</span>
              {label}
            </button>
          ))}
        </nav>

        {focus && <IssueDetail id={focus} onClose={() => setFocus(null)} onChange={reload} />}
      </div>
    </ToastProvider>
  );
}
