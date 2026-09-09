import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, STATUS, ago } from '../lib/constants.js';
import IssueDetail from '../components/IssueDetail.jsx';
import { Stat, StatusPill, priorityBand, Empty } from '../components/Bits.jsx';
import { useToast } from '../components/Toast.jsx';

export default function AdminPage({ issues, busy, reload, onRoute }) {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState('priority');
  const [open, setOpen] = useState(null);

  useEffect(() => { api.stats().then(setStats).catch(() => {}); }, [issues]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = issues.filter((i) => {
      if (cat !== 'all' && i.category !== cat) return false;
      if (status !== 'all' && i.status !== status) return false;
      if (!term) return true;
      return [`#${i.id}`, i.description, CATEGORIES[i.category].label, i.reporter]
        .join(' ').toLowerCase().includes(term);
    });
    const by = {
      priority: (a, b) => b.priority_score - a.priority_score,
      upvotes: (a, b) => b.upvotes - a.upvotes,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at)
    }[sort];
    return [...list].sort(by);
  }, [issues, q, cat, status, sort]);

  const change = async (id, next) => {
    try { await api.setStatus(id, next); reload(); toast(`#${id} moved to ${STATUS[next].label.toLowerCase()}`, 'good'); }
    catch (e) { toast(e.message, 'error'); }
  };

  const clearable = q || cat !== 'all' || status !== 'all';

  return (
    <div className="mx-auto max-w-7xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Ward dashboard</h1>
      <p className="mb-5 text-sm text-ink-2">
        Sorted by priority score — severity × 10 + supporters. Highest first.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat value={stats?.total} label="Reports filed" />
        <Stat value={stats?.pending} label="Pending" />
        <Stat value={stats?.in_progress} label="In progress" />
        <Stat value={stats?.resolved} label="Resolved" />
        <Stat value={stats?.supporters} label="Residents backing" />
        <Stat value={stats?.top_priority} label="Top priority score" accent />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">⌕</span>
          <input
            className="input pl-8"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search description, category, reporter or #id"
          />
        </div>
        <select className="input w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
        </select>
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
        <select className="input w-auto" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="priority">Priority</option>
          <option value="upvotes">Supporters</option>
          <option value="newest">Newest</option>
        </select>
        {clearable && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setQ(''); setCat('all'); setStatus('all'); }}>
            Clear
          </button>
        )}
      </div>

      <p className="mb-2 text-[12.5px] text-ink-2">
        Showing <b className="num text-ink">{rows.length}</b> of {issues.length}
      </p>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 z-10 bg-[#f7f9fa]">
              <tr className="text-left text-[11px] uppercase tracking-wide text-ink-2">
                <th className="border-b border-rule px-3 py-3 font-semibold">Priority</th>
                <th className="border-b border-rule px-3 py-3 font-semibold">Photo</th>
                <th className="border-b border-rule px-3 py-3 font-semibold">Issue</th>
                <th className="border-b border-rule px-3 py-3 font-semibold">Support</th>
                <th className="border-b border-rule px-3 py-3 font-semibold">Filed</th>
                <th className="border-b border-rule px-3 py-3 font-semibold">Status</th>
                <th className="border-b border-rule px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {busy && !issues.length && (
                <tr><td colSpan={7} className="p-4">
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skel h-10 w-full" />)}
                  </div>
                </td></tr>
              )}

              {rows.map((i) => {
                const band = priorityBand(i.priority_score);
                return (
                  <tr key={i.id} className="align-top transition hover:bg-[#f7f9fa]">
                    <td className="border-b border-rule-2 px-3 py-3">
                      <span className={`flex w-14 flex-col items-center rounded-lg py-1.5 ${band.bg}`}>
                        <b className={`num text-lg font-bold leading-none ${band.text}`}>{i.priority_score}</b>
                        <span className={`mt-0.5 text-[9px] font-bold uppercase ${band.text}`}>{band.label}</span>
                      </span>
                    </td>
                    <td className="border-b border-rule-2 px-3 py-3">
                      {i.photo_url
                        ? <img src={i.photo_url} alt="" className="h-11 w-16 rounded-md object-cover ring-1 ring-rule" />
                        : <span className="grid h-11 w-16 place-items-center rounded-md bg-rule-2 text-[10px] text-ink-3">none</span>}
                    </td>
                    <td className="min-w-[280px] max-w-md border-b border-rule-2 px-3 py-3 text-[13.5px]">
                      <span className="inline-flex items-center gap-2 font-semibold">
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: CATEGORIES[i.category].color }} />
                        {CATEGORIES[i.category].label}
                      </span>
                      <div className="mt-0.5 line-clamp-2 text-ink-2">{i.description}</div>
                      <div className="num mt-1 text-[11.5px] text-ink-3">
                        #{i.id} · {i.reporter} · {Number(i.latitude).toFixed(5)}, {Number(i.longitude).toFixed(5)}
                      </div>
                    </td>
                    <td className="num border-b border-rule-2 px-3 py-3 text-[13.5px] font-semibold">▲ {i.upvotes}</td>
                    <td className="whitespace-nowrap border-b border-rule-2 px-3 py-3 text-[13px] text-ink-2">{ago(i.created_at)}</td>
                    <td className="border-b border-rule-2 px-3 py-3">
                      <StatusPill status={i.status} className="mb-1.5" />
                      <select
                        className="block rounded-md bg-white px-2 py-1 text-[12.5px] ring-1 ring-rule"
                        value={i.status}
                        onChange={(e) => change(i.id, e.target.value)}
                      >
                        {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="border-b border-rule-2 px-3 py-3">
                      <div className="flex flex-col gap-1.5">
                        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(i.id)}>Open</button>
                        {onRoute && i.status !== 'resolved' && (
                          <button className="btn btn-sm" onClick={() => onRoute(i.id)}>Route</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!rows.length && !busy && (
                <tr><td colSpan={7}>
                  <Empty title="No reports match" glyph="⌕">Clear the search or widen the filters.</Empty>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && <IssueDetail id={open} onClose={() => setOpen(null)} onChange={reload} />}
    </div>
  );
}
