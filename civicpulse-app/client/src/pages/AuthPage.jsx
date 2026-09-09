import { useState } from 'react';
import { useAuth } from '../lib/AuthContext.jsx';

const POINTS = [
  ['Photo, pin, done', 'Your location is captured the moment the app opens.'],
  ['No duplicate piles', 'If a neighbour already reported it, you back theirs instead.'],
  ['Watch it move', 'Pending to In progress to Resolved, visible the whole way.']
];

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
    <div className="min-h-screen bg-ink lg:grid lg:grid-cols-[1.1fr_minmax(420px,.9fr)]">
      {/* left: the pitch */}
      <section className="flex flex-col justify-center px-6 py-12 text-white sm:px-12 lg:px-16">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber text-sm font-black text-ink">CF</span>
          <span className="text-lg font-bold tracking-tight">CivicFix</span>
        </div>

        <h1 className="max-w-xl text-[34px] font-bold leading-[1.12] tracking-tight sm:text-[42px]">
          Report what's broken on your street.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#9db0bc]">
          Potholes, garbage, water leaks, dead streetlights. Neighbours back it up, the ward office
          works the queue by priority.
        </p>

        <ul className="mt-10 max-w-md space-y-5">
          {POINTS.map(([head, body], i) => (
            <li key={head} className="flex gap-4">
              <span className="num grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-[13px] font-bold text-amber">
                {i + 1}
              </span>
              <span>
                <b className="block text-[14.5px]">{head}</b>
                <span className="text-[13.5px] leading-relaxed text-[#9db0bc]">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* right: the form */}
      <section className="flex items-center justify-center bg-paper px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="card overflow-hidden">
            <div className="flex gap-6 border-b border-rule-2 px-5">
              {['login', 'register'].map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setErr(''); }}
                  className={`-mb-px border-b-2 py-3.5 text-sm font-semibold transition ${
                    mode === m ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
                  }`}
                >
                  {m === 'login' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <div className="space-y-4 p-5">
              {mode === 'register' && (
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input id="name" className="input mt-1.5" value={form.name} onChange={set('name')} placeholder="Your name" />
                </div>
              )}
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" className="input mt-1.5" type="email" value={form.email}
                       onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div>
                <label className="label" htmlFor="pw">Password</label>
                <input id="pw" className="input mt-1.5" type="password" value={form.password}
                       onChange={set('password')} placeholder="At least 6 characters"
                       autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                       onKeyDown={(e) => e.key === 'Enter' && submit()} />
              </div>

              {err && (
                <p className="rounded-lg bg-signal/10 px-3 py-2 text-[13px] text-signal">{err}</p>
              )}

              <button className="btn w-full" onClick={submit} disabled={busy}>
                {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
                {busy ? 'Working…' : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-[12.5px] leading-relaxed text-ink-2">
            {mode === 'login' ? 'New here? Create an account — it takes a few seconds.'
                              : 'Already registered? Switch to sign in.'}
          </p>
        </div>
      </section>
    </div>
  );
}
