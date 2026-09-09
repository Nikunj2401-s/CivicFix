import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, STATUS, ago } from '../lib/constants.js';
import IssueDetail from '../components/IssueDetail.jsx';

export default function AdminPage({ issues, reload }) {
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

  const change = async (id, next) => { await api.setStatus(id, next); reload(); };

  const cards = [
    ['Reports filed', stats?.total], ['Pending', stats?.pending],
    ['In progress', stats?.in_progress], ['Resolved', stats?.resolved],
    ['Residents backing', stats?.supporters], ['Top priority score', stats?.top_priority]
  ];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7">
      <h1 className="text-2xl font-bold tracking-tight">Ward dashboard</h1>
      <p className="mb-5 text-sm text-ink-2">Sorted by priority score — severity × 10 + supporters.</p>

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="card p-3.5">
            <b className="num block text-2xl leading-tight tracking-tight">{value ?? '—'}</b>
            <span className="text-[12.5px] text-ink-2">{label}</span>
          </div>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          className="input min-w-[200px] flex-1" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search description, category, reporter or #id"
        />
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
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#f7f9fa] text-left text-[11.5px] text-ink-2">
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Priority</th>
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Photo</th>
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Issue</th>
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Support</th>
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Filed</th>
              <th className="border-b border-rule px-3 py-2.5 font-semibold">Status</th>
              <th className="border-b border-rule px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id} className="align-top">
                <td className="num border-b border-rule-2 px-3 py-2.5 border-l-4" style={{ borderLeftColor: CATEGORIES[i.category].color }}>
                  <b className="text-lg">{i.priority_score}</b>
                </td>
                <td className="border-b border-rule-2 px-3 py-2.5">
                  {i.photo_url
                    ? <img src={i.photo_url} alt="" className="h-10 w-14 rounded object-cover" />
                    : <span className="block h-10 w-14 rounded bg-rule-2" />}
                </td>
                <td className="max-w-sm border-b border-rule-2 px-3 py-2.5 text-[13.5px]">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <span className="h-2 w-2 rounded-sm" style={{ background: CATEGORIES[i.category].color }} />
                    {CATEGORIES[i.category].label}
                  </span>
                  <div className="text-ink-2">{i.description.slice(0, 90)}</div>
                  <div className="num text-xs text-ink-3">
                    #{i.id} · {i.reporter} · {Number(i.latitude).toFixed(5)}, {Number(i.longitude).toFixed(5)}
                  </div>
                </td>
                <td className="num border-b border-rule-2 px-3 py-2.5 text-[13.5px]">{i.upvotes}</td>
                <td className="border-b border-rule-2 px-3 py-2.5 text-[13.5px]">{ago(i.created_at)}</td>
                <td className="border-b border-rule-2 px-3 py-2.5">
                  <select
                    className="rounded-md border border-rule bg-white px-2 py-1 text-[13px]"
                    value={i.status}
                    onChange={(e) => change(i.id, e.target.value)}
                  >
                    {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                  </select>
                </td>
                <td className="border-b border-rule-2 px-3 py-2.5">
                  <button className="btn btn-ghost btn-sm" onClick={() => setOpen(i.id)}>Open</button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="px-5 py-9 text-center text-[13.5px] text-ink-2">
                <b className="block text-ink">No reports match</b>Clear the search or widen the filters.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <IssueDetail id={open} onClose={() => setOpen(null)} onChange={reload} />}
    </div>
  );
}
