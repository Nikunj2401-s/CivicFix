export const CATEGORIES = {
  pothole:            { label: 'Pothole',            color: '#c7422f', mark: 'P' },
  garbage:            { label: 'Garbage',            color: '#2f7d5b', mark: 'G' },
  water_leakage:      { label: 'Water leakage',      color: '#2b6ca3', mark: 'W' },
  broken_streetlight: { label: 'Broken streetlight', color: '#d9962b', mark: 'L' },
  road_damage:        { label: 'Road damage',        color: '#6a5aa8', mark: 'R' }
};

export const STATUS = {
  pending:     { label: 'Pending',     color: '#d9962b' },
  in_progress: { label: 'In progress', color: '#2b6ca3' },
  resolved:    { label: 'Resolved',    color: '#2f7d5b' }
};

export const SEVERITY = { 1: 'Minor', 2: 'Low', 3: 'Moderate', 4: 'High', 5: 'Critical' };

export function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
