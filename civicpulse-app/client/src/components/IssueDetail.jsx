import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, SEVERITY, STATUS } from '../lib/constants.js';
import { Modal, StatusPill } from './Bits.jsx';
import { useAuth } from '../lib/AuthContext.jsx';

export default function IssueDetail({ id, onClose, onChange }) {
  const { isAdmin } = useAuth();
  const [issue, setIssue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.issue(id).then(setIssue).catch((e) => setErr(e.message)); }, [id]);

  const refresh = (updated) => { setIssue((cur) => ({ ...cur, ...updated })); onChange?.(); };

  const back = async () => {
    setBusy(true);
    try { refresh(await api.upvote(id)); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const changeStatus = async (status) => {
    setBusy(true);
    try {
      refresh(await api.setStatus(id, status));
      const fresh = await api.issue(id);
      setIssue(fresh);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (!issue) {
    return <Modal onClose={onClose}><div className="p-6 text-sm text-ink-2">{err || 'Loading…'}</div></Modal>;
  }

  const cat = CATEGORIES[issue.category];
  const reached = (s) => (issue.history || []).some((h) => h.status === s);

  return (
    <Modal onClose={onClose}>
      <header className="border-b border-rule-2 px-5 py-4">
        <h3 className="text-[17px] font-semibold tracking-tight">{cat.label}</h3>
        <p className="num mt-1 text-[13px] text-ink-2">
          Issue #{issue.id} · reported by {issue.reporter}
        </p>
      </header>

      <div className="px-5 py-4">
        {issue.photo_url && (
          <img src={issue.photo_url} alt="" className="mb-4 max-h-56 w-full rounded-lg object-cover" />
        )}
        <p className="mb-4 text-sm">{issue.description}</p>

        <dl className="mb-4 grid grid-cols-[92px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
          <dt className="text-ink-2">Priority</dt>
          <dd className="num">
            <b>{issue.priority_score}</b> — severity {issue.severity} × 10 + {issue.upvotes} backing
          </dd>
          <dt className="text-ink-2">Severity</dt><dd>{SEVERITY[issue.severity]}</dd>
          <dt className="text-ink-2">Location</dt>
          <dd className="num">{Number(issue.latitude).toFixed(6)}, {Number(issue.longitude).toFixed(6)}</dd>
          <dt className="text-ink-2">Filed</dt><dd>{new Date(issue.created_at).toLocaleString()}</dd>
        </dl>

        <ul className="mt-5">
          {Object.entries(STATUS).map(([key, s]) => {
            const hit = (issue.history || []).find((h) => h.status === key);
            return (
              <li key={key} className="relative grid grid-cols-[14px_1fr] gap-3 pb-3.5">
                <span
                  className="mt-1 h-3 w-3 rounded-full border-2"
                  style={{ background: reached(key) ? '#16232e' : '#fff', borderColor: reached(key) ? '#16232e' : '#d6dde1' }}
                />
                <span>
                  <b className="block text-[13.5px]">{s.label}</b>
                  <span className="text-xs text-ink-3">{hit ? new Date(hit.changed_at).toLocaleString() : 'Not yet'}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {err && <p className="mt-2 text-[13px] text-signal">{err}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule-2 px-5 py-4">
        <button className="btn" disabled={issue.backed_by_me || busy} onClick={back}>
          {issue.backed_by_me ? 'You are backing this' : 'Back this issue'}
        </button>
        <StatusPill status={issue.status} />
        {isAdmin && (
          <select
            className="input ml-auto w-auto"
            value={issue.status}
            disabled={busy}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        )}
      </div>
    </Modal>
  );
}
