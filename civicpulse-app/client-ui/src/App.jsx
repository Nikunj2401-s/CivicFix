import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Route, Switch, useLocation } from "wouter";
import L from "leaflet";
import exifr from "exifr";
import "leaflet/dist/leaflet.css";
import {
  Activity, AlertTriangle, ArrowDownUp, ArrowRight, Bell, Check, CheckCircle2, CircleHelp, ClipboardList,
  CloudUpload, FilePlus2, Filter, Flag, Gauge, Lightbulb, ListFilter, LocateFixed,
  LockKeyhole, Map as MapIcon, Menu, Navigation, Plus, Search, ShieldCheck,
  SlidersHorizontal, ThumbsUp, X,
} from "lucide-react";
import {
  backIssue, checkLand, createIssue, verifyIssue, signInWithGoogle, findNearbyIssues, getCurrentUser, getIssues, getMyReports,
  distanceInMeters, register, signIn, updateIssueStatus, upvoteIssue, isAuthed, signOut,
} from "./lib/api";

const CATEGORY_LABELS = {
  pothole: "Pothole",
  garbage: "Garbage",
  water_leakage: "Water leakage",
  broken_streetlight: "Broken streetlight",
  road_damage: "Road damage",
};
const CATEGORY_ICONS = {
  pothole: AlertTriangle,
  garbage: ClipboardList,
  water_leakage: Activity,
  broken_streetlight: Lightbulb,
  road_damage: Navigation,
};
const STATUS_LABELS = { pending: "Pending review", in_progress: "In progress", resolved: "Resolved" };

/* One place that watches the device position, so every map can show "you are here". */
function useMyPosition(watch = true) {
  const [position, setPosition] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const ok = (p) => { setPosition([p.coords.latitude, p.coords.longitude]); setAccuracy(p.coords.accuracy); };
    const opts = { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 };
    if (!watch) { navigator.geolocation.getCurrentPosition(ok, () => {}, opts); return undefined; }
    const id = navigator.geolocation.watchPosition(ok, () => {}, opts);
    return () => navigator.geolocation.clearWatch(id);
  }, [watch]);
  return { position, accuracy };
}

const youIcon = () => L.divIcon({ className: "", iconSize: [18, 18], iconAnchor: [9, 9],
  html: '<div class="you-dot"></div>' });

function metresBetween(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
            Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const formatKm = (m) => (m < 950 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
const formatMins = (sec) => {
  const mins = Math.max(1, Math.round(sec / 60));
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${String(mins % 60).padStart(2, "0")}`;
};

/* OSRM's public router over the OpenStreetMap road network — free, no key.
   Falls back to a straight line at 25 km/h if it cannot be reached. */
async function routeBetween(from, to) {
  const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}`
            + "?overview=full&geometries=geojson&steps=true";
  try {
    const response = await fetch(url);
    const data = await response.json();
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("no route");
    return { ...data.routes[0], approximate: false };
  } catch {
    const distance = metresBetween(from, to);
    return {
      distance, duration: distance / 6.5, approximate: true,
      legs: [{ steps: [] }],
      geometry: { coordinates: [[from[1], from[0]], [to[1], to[0]]] }
    };
  }
}

function stepInstruction(step) {
  const move = step.maneuver || {};
  const road = step.name?.trim() ? step.name : "the road";
  const way = { left: "left", right: "right", "slight left": "slightly left", "slight right": "slightly right",
                "sharp left": "sharp left", "sharp right": "sharp right", straight: "straight",
                uturn: "back around" }[move.modifier] || "";
  switch (move.type) {
    case "depart": return `Head out along ${road}`;
    case "turn": return `Turn ${way} onto ${road}`;
    case "new name": return `Continue onto ${road}`;
    case "roundabout":
    case "rotary": return `At the roundabout take exit ${move.exit || "—"} onto ${road}`;
    case "end of road": return `At the end of the road turn ${way} onto ${road}`;
    case "merge": return `Merge ${way} onto ${road}`;
    case "fork": return `Keep ${way} at the fork onto ${road}`;
    case "arrive": return "Arrive at the issue";
    default: return `Continue on ${road}`;
  }
}

function scoreBand(score) {
  if (score >= 65) return "red";
  if (score >= 40) return "amber";
  return "grey";
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

function formatShortDate(date) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short" }).format(new Date(date));
}

function locationLabel(issue) {
  const locations = {
    "CF-1048": "Infantry Road bus stop",
    "CF-1047": "Russell Market lane",
    "CF-1043": "Cubbon Park East gate",
    "CF-1039": "Queen’s Road crossing",
    "CF-1034": "Community Hall, 2nd Cross",
    "CF-1028": "Market Street entrance",
    "CF-1021": "4th Cross, ward park",
  };
  return locations[issue.id] || `${issue.latitude.toFixed(4)}, ${issue.longitude.toFixed(4)}`;
}

function useToast() {
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  return [toast, setToast];
}

function useIssueFeed(myOnly = false) {
  const [issues, setIssues] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const refresh = async () => {
    setIsLoading(true);
    setError("");
    try {
      setIssues(myOnly ? await getMyReports() : await getIssues());
    } catch {
      setError("The local issue register could not be read.");
    } finally {
      setIsLoading(false);
    }
  };
  useEffect(() => { refresh(); }, [myOnly]);
  return { issues, isLoading, error, refresh };
}

function Logo() {
  return (
    <div className="brand" data-testid="brand-civicfix">
      <div className="brand-mark">C</div>
      <div className="brand-name">CivicFix<small>WARD ACTION REGISTER</small></div>
    </div>
  );
}

function NavItem({ href, icon: Icon, label, current }) {
  return (
    <Link href={href} className={`nav-link ${current === href ? "active" : ""}`} data-testid={`link-${label.toLowerCase().replaceAll(" ", "-")}`}>
      <Icon aria-hidden="true" /><span>{label}</span>
    </Link>
  );
}

function AppShell({ children, title, eyebrow = "Resident workspace" }) {
  const [location] = useLocation();
  const [user, setUser] = useState({ name: "", ward: "" });
  useEffect(() => { getCurrentUser().then(setUser).catch(() => {}); }, []);
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Logo />
        <div className="nav-label">Civic register</div>
        <nav className="nav-list" aria-label="Primary navigation">
          <NavItem href="/map" icon={MapIcon} label="Issue map" current={location} />
          <NavItem href="/report" icon={FilePlus2} label="Report issue" current={location} />
          <NavItem href="/my-reports" icon={ClipboardList} label="My reports" current={location} />
          {user.role === "admin" && <NavItem href="/admin" icon={Gauge} label="Ward office" current={location} />}
          <NavItem href="/sign-out" icon={LockKeyhole} label="Sign out" current={location} />
        </nav>
        <div className="sidebar-spacer" />
        <div className="ward-card" data-testid="card-active-ward">
          <div className="eyebrow">Active ward</div>
          <strong>{user.ward || "Civic register"}</strong>
          <span>Live data · PostgreSQL</span>
        </div>
        <div className="profile-strip" data-testid="profile-current-user">
          <div className="avatar">{(user.name || "·").split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>
          <div><strong>{user.name || "Signed in"}</strong><span>{user.role === "admin" ? "Ward administrator" : "Resident account"}</span></div>
        </div>
      </aside>
      <main className="main-column">
        <header className="topbar">
          <div style={{ display: "flex", alignItems: "center" }}>
            <button className="icon-button mobile-menu" onClick={() => {}} aria-label="Open navigation" data-testid="button-open-navigation"><Menu size={17} /></button>
            <div><div className="topbar-kicker">{eyebrow}</div><div className="topbar-title">{title}</div></div>
          </div>
          <div className="topbar-actions">
            <button className="icon-button" aria-label="View alerts" onClick={() => {}} data-testid="button-view-alerts"><Bell size={16} /></button>
            <Link href="/report" className="quiet-button" data-testid="link-quick-report"><Plus size={15} /><span>New report</span></Link>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-header">
      <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{description && <p className="subhead">{description}</p>}</div>
      {action}
    </div>
  );
}

function Score({ score, large = false }) {
  const band = scoreBand(score);
  return <div className={`score-badge band-${band}`} style={large ? { fontSize: 40 } : undefined} data-testid={`score-${score}`}><span>{score}</span><small>priority</small></div>;
}

function StatusChip({ status }) {
  return <span className={`status-chip status-${status}`} data-testid={`status-${status}`}>{STATUS_LABELS[status]}</span>;
}

function LoadingPanel({ rows = 4 }) {
  return <div className="loading-stack" data-testid="state-loading">{Array.from({ length: rows }).map((_, index) => <div className="skeleton" key={index} style={{ height: index === 0 ? 42 : 58, width: `${96 - index * 7}%` }} />)}</div>;
}

function ErrorPanel({ onRetry }) {
  return <div className="error-state" data-testid="state-error"><AlertTriangle size={24} /><strong>Register unavailable</strong><span>Something interrupted the local register.</span><button className="button button-secondary" onClick={onRetry} data-testid="button-retry">Try again</button></div>;
}

function IssueQueueCard({ issue, onSelect }) {
  const Icon = CATEGORY_ICONS[issue.category] || Flag;
  return (
    <button className="queue-card" onClick={() => onSelect(issue)} data-testid={`card-issue-${issue.id}`}>
      <div className={`queue-stripe band-${scoreBand(issue.priority_score)}`} style={{ background: "currentColor" }} />
      <div>
        <div className="queue-title"><Icon size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />{CATEGORY_LABELS[issue.category]}</div>
        <div className="queue-location">{locationLabel(issue)}</div>
        <div className="queue-meta"><StatusChip status={issue.status} /><span>{issue.upvotes} backing{issue.upvotes === 1 ? "" : "s"}</span></div>
      </div>
      <Score score={issue.priority_score} />
    </button>
  );
}

function StatusTimeline({ status }) {
  const steps = [
    ["pending", "Pending review", "Reported and visible to the ward register."],
    ["in_progress", "In progress", "The ward office has acknowledged the work."],
    ["resolved", "Resolved", "The issue has been marked fixed."],
  ];
  const currentIndex = steps.findIndex(([value]) => value === status);
  return (
    <div className="status-timeline" data-testid="timeline-issue-status">
      {steps.map(([value, label, description], index) => (
        <div className={`timeline-step ${index <= currentIndex ? "complete" : ""} ${value === status ? "current" : ""}`} key={value}>
          <div className="timeline-node">{index < currentIndex ? <Check size={11} /> : index + 1}</div>
          <div><strong>{label}</strong><p>{description}</p></div>
        </div>
      ))}
    </div>
  );
}

function VerificationPanel({ issue }) {
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState(issue.my_verdict || null);
  const [note, setNote] = useState("");
  const [counts, setCounts] = useState({
    confirmations: Number(issue.confirmations || 0),
    disputes: Number(issue.disputes || 0)
  });
  const confirmations = counts.confirmations;
  const disputes = counts.disputes;
  const total = confirmations + disputes;
  const trust = total ? Math.round((confirmations / total) * 100) : null;

  const cast = async (next) => {
    setBusy(true);
    setNote("");
    try {
      const updated = await verifyIssue(issue.id, next);
      setVerdict(next);
      setCounts({
        confirmations: Number(updated.confirmations || 0),
        disputes: Number(updated.disputes || 0)
      });
    } catch (error) {
      setNote(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="verify-panel" data-testid={`panel-verify-${issue.id}`}>
      <div className="verify-head">
        <div>
          <div className="eyebrow">Community check</div>
          <p className="subhead">Seen this yourself? Residents verify each report so the ward office knows what is real.</p>
        </div>
        {trust !== null && (
          <div className={`trust-badge ${trust >= 60 ? "trust-good" : trust >= 40 ? "trust-mixed" : "trust-poor"}`} data-testid={`badge-trust-${issue.id}`}>
            <strong>{trust}%</strong>
            <span>{total} checked</span>
          </div>
        )}
      </div>
      <div className="verify-counts">
        <span data-testid={`text-confirmations-${issue.id}`}><CheckCircle2 size={14} />{confirmations} confirmed it is there</span>
        <span data-testid={`text-disputes-${issue.id}`}><X size={14} />{disputes} could not find it</span>
      </div>
      <div className="verify-actions">
        <button type="button" className={`button ${verdict === "confirm" ? "button-primary" : "button-secondary"}`} disabled={busy} onClick={() => cast("confirm")} data-testid={`button-confirm-${issue.id}`}>
          <CheckCircle2 size={14} />{verdict === "confirm" ? "You confirmed this" : "I can see it"}
        </button>
        <button type="button" className={`button ${verdict === "dispute" ? "button-primary" : "button-secondary"}`} disabled={busy} onClick={() => cast("dispute")} data-testid={`button-dispute-${issue.id}`}>
          <X size={14} />{verdict === "dispute" ? "You disputed this" : "Not there any more"}
        </button>
      </div>
      {note && <div className="help-text">{note}</div>}
    </div>
  );
}

function IssueDetailModal({ issue, onClose, onUpvote, canBack = true }) {
  const [isBacking, setIsBacking] = useState(false);
  const [backed, setBacked] = useState(issue?.backed_by_me);
  if (!issue) return null;
  const Icon = CATEGORY_ICONS[issue.category] || Flag;
  const handleBack = async () => {
    if (backed || isBacking) return;
    setIsBacking(true);
    await onUpvote(issue.id);
    setBacked(true);
    setIsBacking(false);
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="issue-detail-title" data-testid="modal-issue-detail">
        <div className="modal-head">
          <div><div className="eyebrow">{issue.id} · filed {formatDate(issue.created_at)}</div><h2 id="issue-detail-title"><Icon size={19} style={{ verticalAlign: "-3px", marginRight: 7 }} />{CATEGORY_LABELS[issue.category]}</h2></div>
          <button className="close-button" onClick={onClose} aria-label="Close issue detail" data-testid="button-close-issue-detail"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><StatusChip status={issue.status} /><span className="help-text">{locationLabel(issue)}</span></div>
          <div className="issue-photo" data-testid={`photo-issue-${issue.id}`}>{issue.photo_url ? <img src={issue.photo_url} alt={`Street evidence for ${issue.id}`} /> : <div><CloudUpload size={20} /><strong>No photo attached</strong><span>Residents can add a street-level photo when filing.</span></div>}</div>
          <div className="detail-score"><Score score={issue.priority_score} large /><div><div className="score-calculation"><span>{issue.severity} severity × 10</span><b>+</b><span>{issue.upvotes} resident backing</span><b>=</b><strong>{issue.priority_score}</strong></div><span>Priority is calculated from severity and resident backing. Higher scores are reviewed first by the ward office.</span></div></div>
          <p className="detail-copy">{issue.description}</p>
          <div className="detail-meta">
            <div><span>Reported by</span><strong>{issue.reporter}</strong></div>
            <div><span>Severity</span><strong>{issue.severity} / 5</strong></div>
            <div><span>Backed by</span><strong>{issue.upvotes} residents</strong></div>
          </div>
          <div className="detail-timeline"><div className="eyebrow">Status trail</div><StatusTimeline status={issue.status} /></div>
        </div>
        <VerificationPanel issue={issue} />
        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose} data-testid="button-dismiss-detail">Close</button>
          {canBack && <button className="button button-amber" disabled={backed || isBacking} onClick={handleBack} data-testid={`button-back-issue-${issue.id}`}><ThumbsUp size={15} />{backed ? "Backed by you" : isBacking ? "Recording…" : "Back this issue"}</button>}
        </div>
      </section>
    </div>
  );
}

function MapCanvas({ issues, onSelect }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);
  const youLayerRef = useRef(null);
  const centredRef = useRef(false);
  const { position, accuracy } = useMyPosition();
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;
    const map = L.map(mapNode.current, { zoomControl: false, attributionControl: true }).setView([12.9719, 77.5945], 15);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    youLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const sizeTimer = window.setTimeout(() => { if (mapRef.current === map) map.invalidateSize(); }, 100);
    return () => { window.clearTimeout(sizeTimer); map.remove(); mapRef.current = null; };
  }, []);
  useEffect(() => {
    if (!markerLayerRef.current) return;
    markerLayerRef.current.clearLayers();
    issues.forEach((issue) => {
      const band = scoreBand(issue.priority_score);
      const color = band === "red" ? "#b7473f" : band === "amber" ? "#c98525" : "#8e9ba7";
      const marker = L.marker([issue.latitude, issue.longitude], { icon: L.divIcon({ className: "", html: `<div class="marker-pin ${issue.status === "resolved" ? "marker-resolved" : ""}" style="background:${color}"><span>${issue.priority_score}</span></div>`, iconSize: [26, 26], iconAnchor: [13, 26] }) });
      marker.on("click", () => onSelectRef.current(issue));
      marker.bindTooltip(`${CATEGORY_LABELS[issue.category]} · ${issue.priority_score}`, { direction: "top", offset: [0, -19] });
      marker.addTo(markerLayerRef.current);
    });
  }, [issues]);

  /* drop a "you are here" dot, and centre on it the first time it arrives */
  useEffect(() => {
    if (!youLayerRef.current || !position) return;
    youLayerRef.current.clearLayers();
    L.marker(position, { icon: youIcon(), zIndexOffset: 700 })
      .bindTooltip("You are here").addTo(youLayerRef.current);
    if (accuracy && accuracy > 60) {
      L.circle(position, { radius: accuracy, color: "#2b6ca3", weight: 1, fillOpacity: .06, interactive: false })
        .addTo(youLayerRef.current);
    }
    if (!centredRef.current) { mapRef.current?.setView(position, 15); centredRef.current = true; }
  }, [position?.[0], position?.[1], accuracy]);

  const recentre = () => { if (position) mapRef.current?.flyTo(position, 16, { duration: .6 }); };

  return <div className="map-wrap"><div ref={mapNode} data-testid="map-issue-map" />{position && <button type="button" className="map-recentre" onClick={recentre} title="Centre on my location" data-testid="button-recentre-map"><LocateFixed size={16} /></button>}<div className="map-legend"><span className="legend-item"><i className="legend-dot" style={{ background: "var(--red)" }} />urgent 65+</span><span className="legend-item"><i className="legend-dot" style={{ background: "var(--amber)" }} />watch 40–64</span><span className="legend-item"><i className="legend-dot" style={{ background: "var(--grey-band)" }} />queued</span></div></div>;
}

function CategoryFilterChips({ issues, value, onChange }) {
  const options = [["all", "All"], ...Object.entries(CATEGORY_LABELS)];
  return <div className="category-chips" role="group" aria-label="Filter by issue category">{options.map(([category, label]) => <button className={`category-chip ${value === category ? "active" : ""}`} onClick={() => onChange(category)} key={category} data-testid={`button-filter-category-${category}`}><span>{label}</span><b>{category === "all" ? issues.length : issues.filter((issue) => issue.category === category).length}</b></button>)}</div>;
}

function MapPage() {
  const { issues, isLoading, error, refresh } = useIssueFeed();
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("priority");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useToast();
  const filtered = useMemo(() => issues.filter((issue) => (category === "all" || issue.category === category) && (status === "all" || issue.status === status) && `${issue.description} ${issue.category} ${locationLabel(issue)}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "recent" ? new Date(b.created_at) - new Date(a.created_at) : b.priority_score - a.priority_score), [issues, category, status, sort, search]);
  const handleUpvote = async (id) => { await upvoteIssue(id); await refresh(); setToast("Your backing has been recorded."); };
  const urgentCount = issues.filter((issue) => issue.priority_score >= 65 && issue.status !== "resolved").length;
  return (
    <AppShell title="Issue map">
      <div className="page">
        <PageHeader eyebrow="your ward · " title="See what needs fixing." description="A shared register of street-level issues. Back a report to make resident priorities visible to the ward office." action={<Link href="/report" className="button button-amber" data-testid="link-report-from-map"><FilePlus2 size={15} />Report an issue</Link>} />
        <div className="stat-grid">
          <div className="stat-card featured"><div className="stat-label">Open register</div><div className="stat-value">{issues.filter((issue) => issue.status !== "resolved").length}</div><div className="stat-meta">issues awaiting or receiving action</div></div>
          <div className="stat-card"><div className="stat-label">Urgent attention</div><div className="stat-value band-red">{urgentCount}</div><div className="stat-meta">priority score 65 and above</div></div>
          <div className="stat-card"><div className="stat-label">In progress</div><div className="stat-value">{issues.filter((issue) => issue.status === "in_progress").length}</div><div className="stat-meta">ward action is underway</div></div>
          <div className="stat-card"><div className="stat-label">Resolved this month</div><div className="stat-value band-amber">{issues.filter((issue) => issue.status === "resolved").length}</div><div className="stat-meta">closed with a status update</div></div>
        </div>
        <div className="filter-row">
          <div style={{ position: "relative", flex: 1, minWidth: 190 }}><Search size={15} style={{ position: "absolute", left: 11, top: 12, color: "var(--muted)" }} /><input className="input search-input" style={{ width: "100%", paddingLeft: 32 }} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the ward register" data-testid="input-search-issues" /></div>
          <select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)} data-testid="select-filter-status"><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <div className="segmented"><button className={sort === "priority" ? "active" : ""} onClick={() => setSort("priority")} data-testid="button-sort-priority"><ArrowDownUp size={12} /> Priority</button><button className={sort === "recent" ? "active" : ""} onClick={() => setSort("recent")} data-testid="button-sort-recent">Recent</button></div>
        </div>
        <CategoryFilterChips issues={issues} value={category} onChange={setCategory} />
        <div className="map-layout">
          <section className="panel map-panel"><div className="panel-header"><div><h2>Live issue map</h2><p>{filtered.length} visible reports · select a pin or queue item</p></div><button className="quiet-button" onClick={() => setToast("Map is centred on your ward.")} data-testid="button-centre-map"><LocateFixed size={14} />Centre ward</button></div>{isLoading ? <LoadingPanel /> : error ? <ErrorPanel onRetry={refresh} /> : <MapCanvas issues={filtered} onSelect={setSelected} />}</section>
          <section className="panel"><div className="panel-header"><div><h2>Priority queue</h2><p>Ordered by score, highest first</p></div><ListFilter size={17} color="var(--muted)" /></div>{isLoading ? <LoadingPanel rows={5} /> : error ? <ErrorPanel onRetry={refresh} /> : filtered.length ? <div className="issue-queue">{filtered.map((issue) => <IssueQueueCard key={issue.id} issue={issue} onSelect={setSelected} />)}</div> : <div className="empty-state" data-testid="state-empty-map"><Filter size={27} /><strong>No matching reports</strong><p>Try clearing a filter or searching another term.</p></div>}</section>
        </div>
      </div>
      <IssueDetailModal issue={selected} onClose={() => setSelected(null)} onUpvote={handleUpvote} />
      {toast && <div className="toast" role="status" data-testid="toast-map">{toast}</div>}
    </AppShell>
  );
}

function DuplicateModal({ nearby, onClose, onSupport, onCreateNew }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" data-testid="modal-duplicate-warning">
        <div className="modal-head"><div><div className="eyebrow">Before you file</div><h2>There may already be a report here.</h2></div><button className="close-button" onClick={onClose} aria-label="Close duplicate warning" data-testid="button-close-duplicate"><X size={18} /></button></div>
        <div className="modal-body"><p className="detail-copy">We found {nearby.length === 1 ? "an existing report" : `${nearby.length} existing reports`} within 50 metres. Supporting one helps the ward office see the combined need without creating a duplicate.</p><div className="duplicate-list">{nearby.map((issue) => <div className="duplicate-card" key={issue.id}><div><strong>{CATEGORY_LABELS[issue.category]} · {issue.id}</strong><span>{Math.round(issue.distance_meters ?? 0)}m away · {issue.upvotes} supporters</span><p>{issue.description}</p></div><button className="button button-secondary" onClick={() => onSupport(issue)} data-testid={`button-support-duplicate-${issue.id}`}><ThumbsUp size={13} />Back report</button></div>)}</div></div>
        <div className="modal-actions"><button className="button button-secondary" onClick={onClose} data-testid="button-cancel-report">Cancel</button><button className="button button-amber" onClick={onCreateNew} data-testid="button-create-new-anyway">Create new anyway <ArrowRight size={14} /></button></div>
      </section>
    </div>
  );
}

function ReportLocationMap({ latitude, longitude, onChange }) {
  const youRef = useRef(null);
  const { position: myPosition } = useMyPosition();
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;
    const initial = [Number(latitude), Number(longitude)];
    const map = L.map(mapNode.current, { zoomControl: true, attributionControl: true }).setView(initial, 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap contributors", maxZoom: 19 }).addTo(map);
    const marker = L.marker(initial, { draggable: true }).addTo(map);
    marker.bindTooltip("Drag or click to place", { direction: "top", offset: [0, -20] }).openTooltip();
    marker.on("dragend", () => {
      const point = marker.getLatLng();
      onChangeRef.current(point.lat, point.lng);
    });
    map.on("click", (event) => {
      marker.setLatLng(event.latlng);
      onChangeRef.current(event.latlng.lat, event.latlng.lng);
    });
    mapRef.current = map;
    markerRef.current = marker;
    const sizeTimer = window.setTimeout(() => { if (mapRef.current === map) map.invalidateSize(); }, 80);
    return () => { window.clearTimeout(sizeTimer); map.remove(); mapRef.current = null; markerRef.current = null; };
  }, []);
  useEffect(() => {
    if (!markerRef.current) return;
    const point = [Number(latitude), Number(longitude)];
    markerRef.current.setLatLng(point);
    mapRef.current?.panTo(point, { animate: true, duration: .25 });
  }, [latitude, longitude]);
  useEffect(() => {
    if (!mapRef.current || !myPosition) return;
    if (youRef.current) mapRef.current.removeLayer(youRef.current);
    youRef.current = L.marker(myPosition, { icon: youIcon(), zIndexOffset: 700 })
      .bindTooltip("You are here").addTo(mapRef.current);
  }, [myPosition?.[0], myPosition?.[1]]);

  return <div className="report-map-wrap"><div ref={mapNode} data-testid="map-report-location" />{myPosition && <button type="button" className="map-recentre" onClick={() => mapRef.current?.flyTo(myPosition, 17, { duration: .5 })} title="Centre on my location" data-testid="button-recentre-report"><LocateFixed size={16} /></button>}<div className="report-map-hint"><LocateFixed size={13} />Drag the pin or click the map to place it</div></div>;
}

function ReportPage() {
  const [, setLocation] = useLocation();
  const [category, setCategory] = useState("pothole");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState(3);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [accuracy, setAccuracy] = useState(null);
  const [geoState, setGeoState] = useState("locating");   // locating | ready | blocked | manual
  const [photoName, setPhotoName] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaKind, setMediaKind] = useState("photo");
  const [exifInfo, setExifInfo] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [videoPreview, setVideoPreview] = useState("");
  const [land, setLand] = useState(null);
  const [devicePos, setDevicePos] = useState(null);
  const [addressQuery, setAddressQuery] = useState("");
  const [lookupMessage, setLookupMessage] = useState("");
  const [nearby, setNearby] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useToast();
  const setCoordinates = (nextLatitude, nextLongitude) => {
    setLatitude(Number(nextLatitude).toFixed(6));
    setLongitude(Number(nextLongitude).toFixed(6));
  };

  /* Capture the device's position the moment the form opens. */
  const locateMe = (announce = false) => {
    if (!navigator.geolocation) { setGeoState("blocked"); return; }
    setGeoState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(position.coords.latitude, position.coords.longitude);
        setDevicePos([position.coords.latitude, position.coords.longitude]);
        setAccuracy(position.coords.accuracy);
        setGeoState("ready");
        if (announce) setToast("Pin moved to your current location.");
      },
      () => setGeoState("blocked"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  };
  useEffect(() => { locateMe(); }, []);
  /* Photos may carry a GPS tag. We read it to show where the picture was actually
     taken, but never reject a file for lacking one. */
  const handleMedia = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const isVideo = file.type.startsWith("video/");
    setMediaFile(file);
    setMediaKind(isVideo ? "video" : "photo");
    setPhotoName(file.name);
    setPhotoPreview(URL.createObjectURL(file));
    setExifInfo(null);
    if (isVideo) return;
    try {
      const gps = await exifr.gps(file);
      if (gps && Number.isFinite(gps.latitude)) {
        const drift = latitude && longitude
          ? metresBetween([Number(latitude), Number(longitude)], [gps.latitude, gps.longitude])
          : null;
        const gap = devicePos ? metresBetween(devicePos, [gps.latitude, gps.longitude]) : null;
        setExifInfo({ hasGps: true, latitude: gps.latitude, longitude: gps.longitude, drift, gap });
        setCoordinates(gps.latitude, gps.longitude);   // the camera knows best
        setGeoState("exif");
      } else {
        setExifInfo({ hasGps: false });
      }
    } catch { setExifInfo({ hasGps: false }); }
  };

  const handleVideo = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setVideoFile(file);
    setVideoName(file.name);
    setVideoPreview(URL.createObjectURL(file));
  };

  /* Land-use check, debounced so dragging the pin does not hammer the service. */
  useEffect(() => {
    if (!latitude || !longitude) return undefined;
    let cancelled = false;
    setLand(null);
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkLand(Number(latitude), Number(longitude));
        if (!cancelled) setLand(result);
      } catch { /* the server decides at submit time anyway */ }
    }, 700);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [latitude, longitude]);

  const lookupAddress = async () => {
    const query = addressQuery.trim();
    if (query.length < 3) { setLookupMessage("Type at least three characters."); return; }
    setLookupMessage("Searching OpenStreetMap…");
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`
      );
      const results = await response.json();
      if (!results.length) { setLookupMessage("Nothing found. Add the city name and try again."); return; }
      setCoordinates(Number(results[0].lat), Number(results[0].lon));
      setGeoState("manual");
      setLookupMessage(`Located: ${results[0].display_name}`);
    } catch {
      setLookupMessage("Address lookup is unavailable. Drag the pin instead.");
    }
  };

  const submitReport = async (force = false) => {
    if (!description.trim() || submitting) return;
    if (!latitude || !longitude) { setToast("Set a location before filing."); return; }
    if (!mediaFile || !exifInfo?.hasGps) { setToast("A geotagged photo is required."); return; }
    if (!videoFile) { setToast("A short video is required."); return; }
    setSubmitting(true);
    const location = { latitude: Number(latitude), longitude: Number(longitude) };
    if (!force) {
      const matches = await findNearbyIssues(location.latitude, location.longitude, 50, category);
      if (matches.length) { setNearby(matches.map((issue) => ({ ...issue, distance_meters: distanceInMeters(location, issue) }))); setSubmitting(false); return; }
    }
    await createIssue({ category, description: description.trim(), severity, latitude: location.latitude, longitude: location.longitude, photo_url: photoPreview, photo_file: mediaFile, video_file: videoFile, pinned_by_hand: geoState === "manual", device_lat: devicePos?.[0], device_lng: devicePos?.[1] });
    setSubmitting(false); setNearby([]); setToast("Report added to the your ward register."); setDescription(""); setPhotoName(""); setPhotoPreview("");
    window.setTimeout(() => setLocation("/my-reports"), 700);
  };
  const supportAndGo = async (issue) => { await backIssue(issue.id); setNearby([]); setSubmitting(false); setToast(`You backed ${issue.id}. No duplicate was filed.`); window.setTimeout(() => setLocation("/map"), 700); };
  return (
    <AppShell title="Report an issue">
      <div className="page">
        <PageHeader eyebrow="New register entry" title="Make the problem legible." description="A clear report gives the ward office a location, a priority signal, and a reason to act." />
        <div className="report-layout">
          <section className="panel form-panel">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Issue details</div>
            <h2>What needs attention?</h2>
            <p className="subhead" style={{ marginBottom: 24 }}>Keep it specific. Mention the landmark, what is unsafe, and how long it has been happening.</p>
            <div className="form-grid">
              <div className="field"><label htmlFor="issue-category">Category</label><select id="issue-category" className="filter-select" value={category} onChange={(event) => setCategory(event.target.value)} data-testid="select-report-category">{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
              <div className="field"><label>Severity</label><div className="range-row"><input type="range" min="1" max="5" value={severity} onChange={(event) => setSeverity(Number(event.target.value))} data-testid="input-report-severity" /><div className="severity-value" data-testid="text-report-severity">{severity}</div></div><div className="help-text">1 is inconvenient. 5 is an immediate safety concern.</div></div>
              <div className="field full"><label htmlFor="issue-description">Description</label><textarea id="issue-description" className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Example: A deep pothole opens across the left lane, 20m after the bus stop…" data-testid="input-report-description" /><div className="help-text">{description.length}/500 characters</div></div>
              <div className="field full">
                <div className="selected-category" data-testid="text-selected-category">
                  <span className="eyebrow">Filing under</span>
                  <strong>{CATEGORY_LABELS[category]}</strong>
                  <span className="chip-note">severity {severity} · {severity * 10} points before backing</span>
                </div>
                {land && (
                  <div className={`land-note land-${land.land_class}`} data-testid="text-land-class">
                    {land.land_class === "public" && <><ShieldCheck size={14} /><span><strong>Public land.</strong> {land.land_note}</span></>}
                    {land.land_class === "private" && <><AlertTriangle size={14} /><span><strong>This looks like private property.</strong> {land.land_note} The register covers roads, footpaths, drains and public spaces{land.enforced ? " — this report will be refused" : ""}.</span></>}
                    {land.land_class === "unknown" && <><CircleHelp size={14} /><span>{land.land_note}</span></>}
                  </div>
                )}
              </div>
              <div className="field full"><label htmlFor="report-address-search">Find a landmark</label><div className="location-search"><input id="report-address-search" className="input" value={addressQuery} onChange={(event) => setAddressQuery(event.target.value)} placeholder="Try Infantry Road or Russell Market" data-testid="input-report-address-search" /><button type="button" className="button button-secondary" onClick={lookupAddress} data-testid="button-lookup-address"><Search size={14} />Find location</button></div><div className="help-text">{lookupMessage || "Searches OpenStreetMap for a street or landmark."}</div></div>
              <div className="field full">
                <label>Your location</label>
                <div className="location-search">
                  <button type="button" className="button button-secondary" onClick={() => locateMe(true)} data-testid="button-use-my-location">
                    <LocateFixed size={14} />{geoState === "locating" ? "Locating…" : "Use my current location"}
                  </button>
                  <div className="help-text" style={{ margin: 0 }}>
                    {geoState === "locating" && "Asking your device for a position…"}
                    {geoState === "ready" && `GPS fix${accuracy ? ` · accurate to about ${Math.round(accuracy)} m` : ""}`}
                    {geoState === "manual" && "Pin set by hand. This is the spot that gets filed."}
                    {geoState === "blocked" && "Location unavailable. Drag the pin or search a landmark."}
                  </div>
                </div>
                {geoState === "ready" && accuracy > 100 && (
                  <div className="help-text">
                    That is a rough fix — laptops guess from WiFi and IP. Drag the pin onto the real spot before filing.
                  </div>
                )}
              </div>
              <div className="field full"><ReportLocationMap latitude={latitude} longitude={longitude} onChange={(nextLat, nextLng) => { setCoordinates(nextLat, nextLng); setGeoState("manual"); }} /></div>
              <div className="field"><label htmlFor="report-latitude">Latitude</label><input id="report-latitude" className="input" value={latitude} onChange={(event) => setLatitude(event.target.value)} data-testid="input-report-latitude" /></div>
              <div className="field"><label htmlFor="report-longitude">Longitude</label><input id="report-longitude" className="input" value={longitude} onChange={(event) => setLongitude(event.target.value)} data-testid="input-report-longitude" /></div>
              <div className="field full"><label>Photo evidence <span className="req-mark">geotagged, required</span></label><label className="upload-box" htmlFor="issue-photo">{photoPreview ? (mediaKind === "video" ? <video className="upload-preview" src={photoPreview} controls /> : <img className="upload-preview" src={photoPreview} alt="Selected street evidence preview" />) : <CloudUpload size={20} />}<strong>{photoName || "Add a street-level photo"}</strong><span className="help-text">Must carry a GPS tag — use your phone's camera app with location on</span><input id="issue-photo" type="file" accept="image/*" onChange={handleMedia} data-testid="input-report-photo" /></label>
                {exifInfo && (
                  <div className={`geo-tag-note ${exifInfo.hasGps ? "geo-ok" : "geo-bad"}`} data-testid="text-exif-status">
                    {exifInfo.hasGps ? (
                      <>
                        <strong>Location tag found.</strong> The camera recorded{" "}
                        <span className="mono">{exifInfo.latitude.toFixed(5)}, {exifInfo.longitude.toFixed(5)}</span>, and the
                        pin has been moved there. That coordinate is what gets filed.
                        {exifInfo.gap !== null && exifInfo.gap > 150 && (
                          <div className="mismatch-alert" data-testid="text-exif-mismatch">
                            <AlertTriangle size={14} />
                            <span>
                              <strong>The issue location is not where this photo was taken.</strong> The camera was
                              {" "}{formatKm(exifInfo.gap)} from where your device says you are now. Report the issue from
                              where it is, using a picture taken there — this report will be refused.
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <strong>This photo has no location tag, so it cannot be used.</strong> Take the picture
                        with your phone's camera app with location switched on. Photos captured inside a browser,
                        screenshots, and anything sent through WhatsApp have the tag stripped.
                      </>
                    )}
                  </div>
                )}</div>

              <div className="field full">
                <label>Video evidence <span className="req-mark">required</span></label>
                <label className="upload-box" htmlFor="issue-video">
                  {videoPreview ? <video className="upload-preview" src={videoPreview} controls /> : <CloudUpload size={20} />}
                  <strong>{videoName || "Add a short clip of the issue"}</strong>
                  <span className="help-text">A few seconds is enough. Moving footage is far harder to fake than a still.</span>
                  <input id="issue-video" type="file" accept="video/*" onChange={handleVideo} data-testid="input-report-video" />
                </label>
              </div>
            </div>
            <div className="form-actions">
              <div className="evidence-checklist" data-testid="list-evidence-checklist">
                <span className={mediaFile && exifInfo?.hasGps ? "done" : ""}>{mediaFile && exifInfo?.hasGps ? "✓" : "○"} Geotagged photo</span>
                <span className={videoFile ? "done" : ""}>{videoFile ? "✓" : "○"} Video clip</span>
                <span className={description.trim().length >= 10 ? "done" : ""}>{description.trim().length >= 10 ? "✓" : "○"} Description</span>
              </div>
              <Link href="/map" className="button button-secondary" data-testid="link-cancel-report">Cancel</Link><button className="button button-primary" disabled={!description.trim() || submitting || !mediaFile || !exifInfo?.hasGps || !videoFile || (land?.land_class === "private" && land?.enforced) || (exifInfo?.gap !== null && exifInfo?.gap > 150)} onClick={() => submitReport(false)} data-testid="button-submit-report">{submitting ? "Checking nearby reports…" : "Review and file report"}<ArrowRight size={15} /></button></div>
          </section>
          <aside className="panel info-panel"><div className="eyebrow">How CivicFix works</div><h3 style={{ marginTop: 7 }}>From street view to ward action</h3><div style={{ marginTop: 20 }}><div className="process-step"><div className="step-number">01</div><div><strong>Describe the street problem</strong><p>Use a landmark and a plain-language description.</p></div></div><div className="process-step"><div className="step-number">02</div><div><strong>Check for duplicates</strong><p>We look within 50 metres before creating a new entry.</p></div></div><div className="process-step"><div className="step-number">03</div><div><strong>Track accountable action</strong><p>The ward office updates the status as work moves forward.</p></div></div></div><div className="auth-note" style={{ marginTop: 3 }}><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />Your report is visible to residents in this ward.</div></aside>
        </div>
      </div>
      {nearby.length > 0 && <DuplicateModal nearby={nearby} onClose={() => { setNearby([]); setSubmitting(false); }} onSupport={supportAndGo} onCreateNew={() => submitReport(true)} />}
      {toast && <div className="toast" role="status" data-testid="toast-report">{toast}</div>}
    </AppShell>
  );
}

function MyReportsPage() {
  const { issues, isLoading, error, refresh } = useIssueFeed(true);
  const { issues: allIssues, refresh: refreshAll } = useIssueFeed();
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useToast();
  const backedIssues = allIssues.filter((issue) => issue.backed_by_me && issue.user_id !== "usr-01");
  const handleUpvote = async (id) => { await upvoteIssue(id); await Promise.all([refresh(), refreshAll()]); setToast("Your backing has been recorded."); };
  return (
    <AppShell title="My reports">
      <div className="page">
        <PageHeader eyebrow="Resident activity" title="Your reports, in the open." description="Follow what you raised, see resident backing, and keep the ward office accountable to a visible status." action={<Link href="/report" className="button button-amber" data-testid="link-report-from-my-reports"><FilePlus2 size={15} />New report</Link>} />
        <div className="stat-grid">
          <div className="stat-card featured"><div className="stat-label">Reports filed</div><div className="stat-value">{issues.length}</div><div className="stat-meta">in the your ward register</div></div>
          <div className="stat-card"><div className="stat-label">Issues backed</div><div className="stat-value">{backedIssues.length}</div><div className="stat-meta">reports you support</div></div>
          <div className="stat-card"><div className="stat-label">Receiving action</div><div className="stat-value">{issues.filter((issue) => issue.status === "in_progress").length}</div><div className="stat-meta">currently in progress</div></div>
          <div className="stat-card"><div className="stat-label">Resolved</div><div className="stat-value band-amber">{issues.filter((issue) => issue.status === "resolved").length}</div><div className="stat-meta">closed by ward office</div></div>
        </div>
        <section className="panel"><div className="panel-header"><div><h2>Filed by Ananya</h2><p>Most recent entries first</p></div><button className="quiet-button" onClick={() => { refresh(); refreshAll(); }} data-testid="button-refresh-my-reports"><Activity size={14} />Refresh</button></div>{isLoading ? <LoadingPanel rows={3} /> : error ? <ErrorPanel onRetry={refresh} /> : issues.length ? <div className="my-reports-grid" style={{ padding: 13 }}>{issues.map((issue) => <button className="report-card" key={issue.id} onClick={() => setSelected(issue)} style={{ textAlign: "left" }} data-testid={`card-my-report-${issue.id}`}><div className="report-card-head"><div><div className="eyebrow">{issue.id} · {formatShortDate(issue.created_at)}</div><h3 style={{ marginTop: 8 }}>{CATEGORY_LABELS[issue.category]}</h3></div><Score score={issue.priority_score} /></div><p>{issue.description}</p><div className="report-card-foot"><StatusChip status={issue.status} /><span>{issue.upvotes} resident backings</span></div></button>)}</div> : <div className="empty-state" data-testid="state-empty-my-reports"><FilePlus2 size={28} /><strong>No reports yet</strong><p>When you spot something that needs action, it will appear here.</p><Link href="/report" className="button button-amber" style={{ marginTop: 16 }} data-testid="link-first-report">File your first report</Link></div>}</section>
        <section className="panel" style={{ marginTop: 15 }}><div className="panel-header"><div><h2>Backed by you</h2><p>Existing reports you have supported</p></div><ThumbsUp size={16} color="var(--muted)" /></div>{backedIssues.length ? <div className="my-reports-grid" style={{ padding: 13 }}>{backedIssues.map((issue) => <button className="report-card" key={issue.id} onClick={() => setSelected(issue)} style={{ textAlign: "left" }} data-testid={`card-backed-report-${issue.id}`}><div className="report-card-head"><div><div className="eyebrow">{issue.id} · {formatShortDate(issue.created_at)}</div><h3 style={{ marginTop: 8 }}>{CATEGORY_LABELS[issue.category]}</h3></div><Score score={issue.priority_score} /></div><p>{issue.description}</p><div className="report-card-foot"><StatusChip status={issue.status} /><span>{issue.upvotes} resident backings</span></div></button>)}</div> : <div className="empty-state"><ThumbsUp size={26} /><strong>No backed reports yet</strong><p>Back a nearby issue from the map to keep it visible here.</p><Link href="/map" className="button button-secondary" style={{ marginTop: 16 }}>Browse the ward map</Link></div>}</section>
      </div>
      <IssueDetailModal issue={selected} onClose={() => setSelected(null)} onUpvote={handleUpvote} />
      {toast && <div className="toast" role="status" data-testid="toast-my-reports">{toast}</div>}
    </AppShell>
  );
}

function DirectionsModal({ issue, onClose, onStatus }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const lineRef = useRef(null);
  const youRef = useRef(null);
  const lastRoutedRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [state, setState] = useState("locating");   // locating | ready | blocked
  const [follow, setFollow] = useState(false);
  const { position } = useMyPosition(follow);
  const [origin, setOrigin] = useState(null);

  const destination = [Number(issue.latitude), Number(issue.longitude)];

  useEffect(() => {
    if (!navigator.geolocation) { setState("blocked"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => setOrigin([p.coords.latitude, p.coords.longitude]),
      () => setState("blocked"),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }, []);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return undefined;
    const map = L.map(mapNode.current, { zoomControl: false }).setView(destination, 14);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap · routing by OSRM", maxZoom: 19
    }).addTo(map);
    L.marker(destination, { icon: L.divIcon({ className: "",
      html: `<div class="marker-pin" style="background:#b7473f"><span>${issue.priority_score}</span></div>`,
      iconSize: [26, 26], iconAnchor: [13, 26] }) }).addTo(map).bindTooltip(CATEGORY_LABELS[issue.category]);
    mapRef.current = map;
    const timer = window.setTimeout(() => map.invalidateSize(), 90);
    return () => { window.clearTimeout(timer); map.remove(); mapRef.current = null; };
  }, []);

  /* work out the route, and redo it once we have drifted far enough to matter */
  useEffect(() => {
    const start = follow && position ? position : origin;
    if (!start) return;
    const drift = lastRoutedRef.current ? metresBetween(start, lastRoutedRef.current) : Infinity;
    if (drift < 80 && route) return;
    lastRoutedRef.current = start;
    let cancelled = false;
    routeBetween(start, destination).then((result) => {
      if (cancelled) return;
      setRoute(result);
      setState("ready");
      const map = mapRef.current;
      if (!map) return;
      if (lineRef.current) map.removeLayer(lineRef.current);
      lineRef.current = L.polyline(result.geometry.coordinates.map((c) => [c[1], c[0]]), {
        color: "#11243b", weight: 5, opacity: .85, dashArray: result.approximate ? "8 8" : null
      }).addTo(map);
      map.fitBounds(lineRef.current.getBounds(), { padding: [45, 45] });
    });
    return () => { cancelled = true; };
  }, [origin?.[0], origin?.[1], follow, position?.[0], position?.[1]]);

  useEffect(() => {
    const here = follow ? position : origin;
    if (!mapRef.current || !here) return;
    if (youRef.current) mapRef.current.removeLayer(youRef.current);
    youRef.current = L.marker(here, { icon: youIcon(), zIndexOffset: 700 })
      .bindTooltip("You are here").addTo(mapRef.current);
  }, [origin?.[0], origin?.[1], position?.[0], position?.[1], follow]);

  const steps = route?.legs?.[0]?.steps || [];
  const here = follow && position ? position : origin;
  const remaining = here ? metresBetween(here, destination) : null;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1${here ? `&origin=${here[0]},${here[1]}` : ""}`
    + `&destination=${destination[0]},${destination[1]}&travelmode=driving`;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose} data-testid="modal-directions">
      <div className="modal-card modal-wide" onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Route to issue</div>
            <h3>{CATEGORY_LABELS[issue.category]}</h3>
            <p className="subhead">{issue.id} · {locationLabel(issue)}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close directions" data-testid="button-close-directions"><X size={16} /></button>
        </div>

        <div className="directions-body">
          <div className="directions-map"><div ref={mapNode} data-testid="map-directions" /></div>

          <div className="directions-side">
            {state === "blocked" && <div className="auth-note">Your browser would not share a location, so a route cannot be drawn. Open the issue in a maps app instead.</div>}
            {state === "locating" && <div className="help-text">Finding your position…</div>}

            {route && (
              <>
                <div className="route-summary" data-testid="text-route-summary">
                  <strong>{formatMins(route.duration)}</strong>
                  <span>{formatKm(route.distance)} by road</span>
                  <span>Arriving about {new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(new Date(Date.now() + route.duration * 1000))}</span>
                </div>
                {route.approximate && <div className="help-text">Road routing is unreachable, so this is a straight-line estimate at 25 km/h. The distance and bearing are still right.</div>}
                {remaining !== null && remaining < 60 && <div className="help-text"><strong>You have arrived</strong> — within {Math.round(remaining)} m of the reported spot.</div>}

                <div className="route-actions">
                  <button type="button" className="button button-secondary" onClick={() => setFollow(!follow)} data-testid="button-follow-location">
                    <Navigation size={14} />{follow ? "Stop following" : "Follow my location"}
                  </button>
                  <a className="button button-secondary" href={mapsUrl} target="_blank" rel="noopener noreferrer" data-testid="link-open-maps">
                    <ArrowRight size={14} />Open in Maps
                  </a>
                </div>

                <div className="route-actions">
                  {issue.status !== "in_progress" && <button type="button" className="button button-primary" onClick={() => onStatus(issue.id, "in_progress")} data-testid="button-route-in-progress">Mark in progress</button>}
                  {issue.status !== "resolved" && <button type="button" className="button button-secondary" onClick={() => onStatus(issue.id, "resolved")} data-testid="button-route-resolved">Mark resolved</button>}
                </div>

                {steps.length > 0 && (
                  <ol className="route-steps" data-testid="list-route-steps">
                    {steps.map((step, index) => (
                      <li key={index}><span>{stepInstruction(step)}</span><b>{step.distance > 5 ? formatKm(step.distance) : ""}</b></li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminPage() {
  const { issues, isLoading, error, refresh } = useIssueFeed();
  const [toast, setToast] = useToast();
  const [adminSearch, setAdminSearch] = useState("");
  const [routing, setRouting] = useState(null);
  const [adminCategory, setAdminCategory] = useState("all");
  const [adminStatus, setAdminStatus] = useState("all");
  const handleStatus = async (id, status) => { await updateIssueStatus(id, status); await refresh(); setToast(`Status updated to ${STATUS_LABELS[status].toLowerCase()}.`); };
  const counts = Object.keys(CATEGORY_LABELS).map((category) => ({ category, count: issues.filter((issue) => issue.category === category).length }));
  const maxCount = Math.max(...counts.map((item) => item.count), 1);
  const filteredIssues = useMemo(() => issues.filter((issue) => (adminCategory === "all" || issue.category === adminCategory) && (adminStatus === "all" || issue.status === adminStatus) && `${issue.id} ${issue.description} ${issue.reporter} ${locationLabel(issue)}`.toLowerCase().includes(adminSearch.toLowerCase())).sort((a, b) => b.priority_score - a.priority_score), [issues, adminCategory, adminStatus, adminSearch]);
  return (
    <AppShell title="Ward office" eyebrow="Triage console">
      <div className="page">
        <PageHeader eyebrow="Civic register" title="Turn reports into action." description="Triage the resident register by priority, then leave a clear status trail for the people who raised it." action={<button className="button button-secondary" onClick={refresh} data-testid="button-refresh-admin"><Activity size={15} />Refresh register</button>} />
        <div className="stat-grid">
          <div className="stat-card featured"><div className="stat-label">Open workload</div><div className="stat-value">{issues.filter((issue) => issue.status !== "resolved").length}</div><div className="stat-meta">reports needing ward attention</div></div>
          <div className="stat-card"><div className="stat-label">Pending review</div><div className="stat-value">{issues.filter((issue) => issue.status === "pending").length}</div><div className="stat-meta">new resident entries</div></div>
          <div className="stat-card"><div className="stat-label">In progress</div><div className="stat-value">{issues.filter((issue) => issue.status === "in_progress").length}</div><div className="stat-meta">with an active action</div></div>
          <div className="stat-card"><div className="stat-label">Closed</div><div className="stat-value band-amber">{issues.filter((issue) => issue.status === "resolved").length}</div><div className="stat-meta">marked resolved</div></div>
        </div>
        <div className="admin-grid">
          <section className="panel"><div className="panel-header"><div><h2>Priority triage</h2><p>Change a status to publish an accountable update.</p></div><span className="eyebrow">{filteredIssues.length} of {issues.length} records</span></div><div className="admin-filters"><div className="admin-search"><Search size={14} /><input value={adminSearch} onChange={(event) => setAdminSearch(event.target.value)} placeholder="Search ID, reporter or place" data-testid="input-admin-search" /></div><select className="filter-select" value={adminCategory} onChange={(event) => setAdminCategory(event.target.value)} data-testid="select-admin-category"><option value="all">All categories</option>{Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="filter-select" value={adminStatus} onChange={(event) => setAdminStatus(event.target.value)} data-testid="select-admin-status"><option value="all">All statuses</option>{Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>{isLoading ? <LoadingPanel rows={5} /> : error ? <ErrorPanel onRetry={refresh} /> : filteredIssues.length ? <div className="table-wrap"><table className="data-table"><thead><tr><th>Photo</th><th>Issue</th><th>Priority</th><th>Filed</th><th>Evidence</th><th>Verified</th><th>Route</th><th>Status workflow</th></tr></thead><tbody>{filteredIssues.map((issue) => <tr key={issue.id}><td>{issue.photo_url ? (issue.media_type === "video" ? <video className="photo-thumb" src={issue.photo_url} muted data-testid={`video-thumb-${issue.id}`} /> : <img className="photo-thumb" src={issue.photo_url} alt={`Evidence for ${issue.id}`} data-testid={`photo-thumb-${issue.id}`} />) : <div className="photo-thumb photo-thumb-empty" data-testid={`photo-thumb-empty-${issue.id}`}><CloudUpload size={14} /></div>}</td><td><div className="table-title">{CATEGORY_LABELS[issue.category]}</div><div className="table-sub">{issue.id} · {locationLabel(issue)}</div></td><td><Score score={issue.priority_score} /></td><td><div className="table-sub">{formatDate(issue.created_at)}</div><div className="table-sub">{issue.reporter}</div></td><td>{issue.geo_source === "exif" && <div className="prov-tag prov-good" data-testid={`prov-exif-${issue.id}`}>photo GPS</div>}{issue.land_class === "private" && <div className="prov-tag prov-bad">private land</div>}{issue.land_class === "public" && <div className="prov-tag prov-good">public land</div>}{issue.video_url && <div className="prov-tag">video</div>}</td><td>{(() => { const c = Number(issue.confirmations || 0), d = Number(issue.disputes || 0), t = c + d;
  if (!t) return <span className="table-sub">not checked yet</span>;
  const pct = Math.round((c / t) * 100);
  return <div className={`trust-inline ${pct >= 60 ? "trust-good" : pct >= 40 ? "trust-mixed" : "trust-poor"}`} data-testid={`trust-cell-${issue.id}`}><strong>{pct}%</strong><span>{c} yes · {d} no</span></div>;
})()}</td><td><button type="button" className="quiet-button" onClick={() => setRouting(issue)} data-testid={`button-route-${issue.id}`}><Navigation size={13} />Directions</button></td><td><select className="filter-select status-select" value={issue.status} onChange={(event) => handleStatus(issue.id, event.target.value)} data-testid={`select-status-${issue.id}`}><option value="pending">Pending review</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></td></tr>)}</tbody></table></div> : <div className="empty-state" data-testid="state-empty-admin"><Search size={26} /><strong>No matching register entries</strong><p>Adjust the search or filters to widen the triage view.</p></div>}</section>
          <aside className="panel"><div className="panel-header"><div><h2>Register shape</h2><p>Reports by category</p></div><SlidersHorizontal size={16} color="var(--muted)" /></div><div className="bar-list">{counts.map(({ category, count }) => <div className="bar-item" key={category}><span>{CATEGORY_LABELS[category]}</span><div className="bar-track"><div className="bar-fill" style={{ width: `${(count / maxCount) * 100}%` }} /></div><strong>{count}</strong></div>)}</div><div className="panel-body" style={{ borderTop: "1px solid var(--line)" }}><div className="eyebrow">Service signal</div><div className="metric-list"><div className="metric-row"><span>Average priority</span><strong>{issues.length ? Math.round(issues.reduce((sum, issue) => sum + issue.priority_score, 0) / issues.length) : 0}</strong></div><div className="metric-row"><span>Resident backing</span><strong>{issues.reduce((sum, issue) => sum + issue.upvotes, 0)}</strong></div><div className="metric-row"><span>Resolution rate</span><strong>{issues.length ? `${Math.round((issues.filter((issue) => issue.status === "resolved").length / issues.length) * 100)}%` : "0%"}</strong></div></div></div></aside>
        </div>
      </div>
      {toast && <div className="toast" role="status" data-testid="toast-admin">{toast}</div>}
          {routing && (
        <DirectionsModal
          issue={routing}
          onClose={() => setRouting(null)}
          onStatus={async (id, status) => { await handleStatus(id, status); setRouting(null); }}
        />
      )}
    </AppShell>
  );
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

/* Google renders this button itself, from a script we load once. Without a client
   id configured the whole thing is skipped, so nothing breaks on a fresh clone. */
function GoogleButton({ onCredential, onError }) {
  const holder = useRef(null);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !holder.current) return undefined;
    let cancelled = false;

    const render = () => {
      if (cancelled || !window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => onCredential(response.credential)
      });
      window.google.accounts.id.renderButton(holder.current, {
        theme: "outline", size: "large", width: 320, text: "continue_with", shape: "rectangular"
      });
    };

    if (window.google?.accounts?.id) { render(); return undefined; }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => onError?.("Google sign-in could not load. Use an email and password.");
    document.head.appendChild(script);
    return () => { cancelled = true; };
  }, []);

  if (!GOOGLE_CLIENT_ID) return null;
  return (
    <div className="google-block">
      <div ref={holder} className="google-button" data-testid="button-google-signin" />
      <div className="auth-divider"><span>or use an email address</span></div>
    </div>
  );
}

function AuthPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    if (!email || !password || (mode === "register" && !name)) { setError("Fill in the fields above to continue."); return; }
    setBusy(true); setError("");
    try {
      await (mode === "signin"
        ? signIn({ email, password })
        : register({ name, email, password }));
      setLocation("/map");
    } catch (err) {
      setError(err.message || "Could not sign you in.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <section className="auth-aside"><Logo /><div className="auth-kicker">Public infrastructure, made legible</div><h1>Small reports.<br /><em>Visible action.</em></h1><p className="subhead">CivicFix connects a resident’s street view to the ward office responsible for fixing it.</p><div className="auth-footer">A shared register of street-level issues</div></section>
      <section className="auth-form-side"><div className="auth-card"><div className="eyebrow">Resident access</div>
        <GoogleButton
          onError={setError}
          onCredential={async (credential) => {
            setBusy(true); setError("");
            try { await signInWithGoogle(credential); setLocation("/map"); }
            catch (err) { setError(err.message || "Google sign-in failed."); }
            finally { setBusy(false); }
          }}
        /><h2>{mode === "signin" ? "Welcome back." : "Join the ward register."}</h2><p className="subhead">{mode === "signin" ? "Sign in to follow reports and back the issues your street needs fixed." : "Create a local account to file reports and keep a visible record of action."}</p><div className="auth-tabs"><button className={`auth-tab ${mode === "signin" ? "active" : ""}`} onClick={() => { setMode("signin"); setError(""); }} data-testid="button-auth-signin">Sign in</button><button className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => { setMode("register"); setError(""); }} data-testid="button-auth-register">Create account</button></div><form className="auth-form" onSubmit={submit}>{mode === "register" && <div className="field"><label htmlFor="auth-name">Full name</label><input id="auth-name" className="input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ananya Rao" data-testid="input-auth-name" /></div>}<div className="field"><label htmlFor="auth-email">Email address</label><input id="auth-email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" data-testid="input-auth-email" /></div><div className="field"><label htmlFor="auth-password">Password</label><input id="auth-password" className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" data-testid="input-auth-password" /></div>{error && <div className="auth-note" role="alert" data-testid="status-auth-error">{error}</div>}<button type="submit" className="button button-primary" disabled={busy} data-testid="button-submit-auth">{busy ? "Opening your register…" : mode === "signin" ? "Sign in to CivicFix" : "Create resident account"}<ArrowRight size={15} /></button></form><p className="auth-legal">By continuing, you agree that reports are visible to other residents in your ward. This demo uses local mock data only; no account details leave this device.</p></div></section>
    </div>
  );
}

function RedirectMap() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/map"); }, [setLocation]);
  return <div className="loading-stack" style={{ minHeight: "100dvh" }}><div className="skeleton" style={{ width: 170, height: 28 }} /><div className="skeleton" style={{ width: "70%", height: 100 }} /></div>;
}

function NotFoundPage() {
  return <div className="empty-state" style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}><div><CircleHelp size={32} /><strong>That page is not in the register.</strong><p>Return to the issue map to continue.</p><Link href="/map" className="button button-primary" style={{ marginTop: 16 }} data-testid="link-not-found-map">Open issue map</Link></div></div>;
}

function Protected({ component: Component }) {
  const [, setLocation] = useLocation();
  const allowed = isAuthed();
  useEffect(() => { if (!allowed) setLocation("/auth"); }, [allowed, setLocation]);
  if (!allowed) return null;
  return <Component />;
}

function SignOutPage() {
  const [, setLocation] = useLocation();
  useEffect(() => { signOut(); setLocation("/auth"); }, [setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RedirectMap} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/sign-out" component={SignOutPage} />
      <Route path="/map">{() => <Protected component={MapPage} />}</Route>
      <Route path="/report">{() => <Protected component={ReportPage} />}</Route>
      <Route path="/my-reports">{() => <Protected component={MyReportsPage} />}</Route>
      <Route path="/admin">{() => <Protected component={AdminPage} />}</Route>
      <Route component={NotFoundPage} />
    </Switch>
  );
}

export default function App() {
  return <Router />;
}