import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/AuthContext.jsx';

export default function ProfilePage() {
  const { user, updateName, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [name, setName] = useState(user.name);
  const [msg, setMsg] = useState('');

  useEffect(() => { api.me().then((d) => setStats(d.stats)).catch(() => {}); }, []);

  const save = async () => {
    setMsg('');
    try { await updateName(name.trim()); setMsg('Saved.'); }
    catch (e) { setMsg(e.message); }
  };

  const cards = [
    ['Reports filed', stats?.reported],
    ['Resolved', stats?.resolved],
    ['Issues backed', stats?.backed],
    ['Support received', stats?.support_received]
  ];

  return (
    <div className="mx-auto max-w-2xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="mb-5 text-sm text-ink-2">Your account and what you've contributed.</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="card p-3.5">
            <b className="num block text-2xl tracking-tight">{value ?? '—'}</b>
            <span className="text-[12.5px] text-ink-2">{label}</span>
          </div>
        ))}
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <label className="mb-1 block text-[13.5px] font-semibold">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-[13.5px] font-semibold">Email</label>
          <input className="input bg-rule-2" value={user.email} disabled />
        </div>
        <div>
          <label className="mb-1 block text-[13.5px] font-semibold">Role</label>
          <p className="text-sm text-ink-2">{user.role === 'admin' ? 'Ward administrator' : 'Resident'}</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" onClick={save}>Save changes</button>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
          {msg && <span className="text-[13px] text-ink-2">{msg}</span>}
        </div>
      </div>
    </div>
  );
}
