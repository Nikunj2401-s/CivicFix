import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-5">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-white">
          <h1 className="mb-2 text-[29px] font-bold leading-tight tracking-tight">
            Report what's broken on your street.
          </h1>
          <p className="text-sm text-[#9db0bc]">
            Photo, location, done. Neighbours back it up, the ward office tracks it.
          </p>
        </div>

        <div className="card">
          <div className="flex gap-5 border-b border-rule-2 px-5">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setErr(''); }}
                className={`border-b-2 py-3 text-sm font-semibold ${
                  mode === m ? 'border-ink text-ink' : 'border-transparent text-ink-3'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <div className="space-y-3 p-5">
            {mode === 'register' && (
              <div>
                <label className="mb-1 block text-[13px] font-semibold">Name</label>
                <input className="input" value={form.name} onChange={set('name')} placeholder="Your name" />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[13px] font-semibold">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold">Password</label>
              <input
                className="input" type="password" value={form.password} onChange={set('password')}
                placeholder="At least 6 characters"
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
            </div>
            {err && <p className="text-[13px] text-signal">{err}</p>}
            <button className="btn w-full" onClick={submit} disabled={busy}>
              {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
