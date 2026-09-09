import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { CATEGORIES, SEVERITY, STATUS } from '../lib/constants.js';
import { Modal, ModalHeader, StatusPill, priorityBand } from './Bits.jsx';
import { useAuth } from '../lib/AuthContext.jsx';
import { useToast } from './Toast.jsx';

export default function IssueDetail({ id, onClose, onChange }) {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [issue, setIssue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.issue(id).then(setIssue).catch((e) => setErr(e.message)); }, [id]);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const back = async () => {
    setBusy(true);
    try {
      const updated = await api.upvote(id);
      setIssue((cur) => ({ ...cur, ...updated }));
      onChange?.();
      toast(`Backed — priority is now ${updated.priority_score}`, 'good');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await api.setStatus(id, status);
      setIssue(await api.issue(id));
      onChange?.();
      toast(`Moved to ${STATUS[status].label.toLowerCase()}`, 'good');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  if (!issue) {
    return (
      <Modal onClose={onClose}>
        <div className="space-y-3 p-6">
          {err ? <p className="text-sm text-signal">{err}</p> : (
            <>
              <div className="skel h-4 w-1/3" />
              <div className="skel h-36 w-full" />
              <div className="skel h-3 w-full" />
              <div className="skel h-3 w-2/3" />
            </>
          )}
        </div>
      </Modal>
    );
  }

  const cat = CATEGORIES[issue.category];
  const band = priorityBand(issue.priority_score);
  const reached = (s) => (issue.history || []).some((h) => h.status === s);

  return (
    <Modal onClose={onClose}>
      <ModalHeader
        title={cat.label}
        sub={`#${issue.id} · reported by ${issue.reporter}`}
        accent={cat.color}
        onClose={onClose}
      />

      <div className="px-5 py-4">
        {issue.photo_url && (
          <img src={issue.photo_url} alt="" className="mb-4 max-h-60 w-full rounded-xl object-cover" />
        )}

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusPill status={issue.status} />
          <span className={`badge ${band.bg} ${band.text}`}>Priority {issue.priority_score} · {band.label}</span>
          <span className="badge bg-ink/[.06] text-ink-2">▲ {issue.upvotes} backing</span>
        </div>

        <p className="mb-5 text-sm leading-relaxed">{issue.description}</p>

        <div className="mb-5 rounded-xl bg-paper p-4">
          <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">How the score is built</p>
          <p className="num text-[13.5px]">
            severity {issue.severity} ({SEVERITY[issue.severity]}) × 10 + {issue.upvotes} backing ={' '}
            <b className="text-[15px]">{issue.priority_score}</b>
          </p>
        </div>

        <dl className="mb-5 grid grid-cols-[86px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
          <dt className="text-ink-2">Location</dt>
          <dd className="num">{Number(issue.latitude).toFixed(6)}, {Number(issue.longitude).toFixed(6)}</dd>
          <dt className="text-ink-2">Filed</dt>
          <dd>{new Date(issue.created_at).toLocaleString()}</dd>
        </dl>

        <p className="mb-2.5 text-[10.5px] font-bold uppercase tracking-wide text-ink-3">Progress</p>
        <ul>
          {Object.entries(STATUS).map(([key, s], idx, arr) => {
            const hit = (issue.history || []).find((h) => h.status === key);
            const done = reached(key);
            return (
              <li key={key} className="relative grid grid-cols-[16px_1fr] gap-3 pb-4 last:pb-0">
                {idx < arr.length - 1 && (
                  <span className="absolute left-[7px] top-4 h-full w-px bg-rule" />
                )}
                <span
                  className="relative z-10 mt-1 h-3.5 w-3.5 rounded-full ring-2"
                  style={{
                    background: done ? s.color : '#fff',
                    boxShadow: done ? `0 0 0 3px ${s.color}22` : 'none',
                    '--tw-ring-color': done ? s.color : '#d6dde1'
                  }}
                />
                <span>
                  <b className="block text-[13.5px]" style={{ color: done ? undefined : '#8a9aa4' }}>{s.label}</b>
                  <span className="text-xs text-ink-3">
                    {hit ? new Date(hit.changed_at).toLocaleString() : 'Not yet'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-rule-2 bg-white/95 px-5 py-4 backdrop-blur">
        <button className="btn" disabled={issue.backed_by_me || busy} onClick={back}>
          {issue.backed_by_me ? '✓ You are backing this' : '▲ Back this issue'}
        </button>
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
