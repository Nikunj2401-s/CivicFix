import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';
import { Stat } from '../components/Bits.jsx';
import { useToast } from '../components/Toast.jsx';

export default function ProfilePage() {
  const { user, updateName, logout } = useAuth();
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.me().then((d) => setStats(d.stats)).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try { await updateName(name.trim()); toast('Profile saved', 'good'); }
    catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const initials = user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="mx-auto max-w-2xl px-5 py-7">
      <div className="mb-6 flex items-center gap-4">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-xl font-bold text-white">
          {initials}
        </span>
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight">{user.name}</h1>
          <p className="text-sm text-ink-2">
            {user.email} · {user.role === 'admin' ? 'Ward administrator' : 'Resident'}
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value={stats?.reported} label="Reports filed" />
        <Stat value={stats?.resolved} label="Resolved" />
        <Stat value={stats?.backed} label="Issues backed" />
        <Stat value={stats?.support_received} label="Support received" accent />
      </div>

      <div className="card divide-y divide-rule-2">
        <div className="p-5">
          <label className="label" htmlFor="pname">Display name</label>
          <p className="hint mb-2.5">This is the name shown on the reports you file.</p>
          <input id="pname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="p-5">
          <label className="label">Email</label>
          <p className="hint mb-2.5">Used to sign in. Contact the ward office to change it.</p>
          <input className="input bg-rule-2 text-ink-2" value={user.email} disabled />
        </div>
        <div className="flex flex-wrap items-center gap-2.5 p-5">
          <button className="btn" onClick={save} disabled={busy || !name.trim() || name === user.name}>
            Save changes
          </button>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
