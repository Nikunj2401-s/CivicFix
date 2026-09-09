/**
 * Talks to the CivicFix Express API.
 *
 * Every function here keeps the name and return shape the UI already expects,
 * so App.jsx did not have to be rewritten — only the bodies changed from mock
 * data to real requests. Vite proxies /api and /uploads to localhost:4000.
 */

const TOKEN_KEY = 'civicfix.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));
export const isAuthed = () => Boolean(getToken());
export const signOut = () => setToken(null);

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: form ? form : body ? JSON.stringify(body) : undefined
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    if (res.status === 401) setToken(null);
    throw err;
  }
  return data;
}

/* ------------------------------------------------------------------ issues */

export async function getIssues(filters = {}) {
  const params = new URLSearchParams();
  if (filters.category && filters.category !== 'all') params.set('category', filters.category);
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  const issues = await request(`/issues${params.toString() ? `?${params}` : ''}`);

  if (!filters.search) return issues;
  const query = filters.search.toLowerCase();
  return issues.filter((item) =>
    `${item.description} ${item.category} ${item.reporter} ${item.id}`.toLowerCase().includes(query)
  );
}

export async function getIssue(id) {
  return request(`/issues/${id}`);
}

/**
 * The form hands us a base64 data URL for the photo; the API wants a real file
 * under a multipart field, so convert it here rather than in the component.
 */
export async function createIssue(input) {
  const form = new FormData();
  form.append('category', input.category);
  form.append('description', input.description);
  form.append('severity', String(input.severity));
  form.append('latitude', String(input.latitude));
  form.append('longitude', String(input.longitude));
  form.append('confirm', 'true');            // the UI already ran its own nearby check

  if (input.photo_url?.startsWith('data:')) {
    const blob = await (await fetch(input.photo_url)).blob();
    const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    form.append('photo', blob, `report.${ext}`);
  }

  return request('/issues', { method: 'POST', form });
}

export async function upvoteIssue(id) {
  return request(`/issues/${id}/upvote`, { method: 'POST' });
}

export async function backIssue(id) {
  return upvoteIssue(id);
}

export async function updateIssueStatus(id, status) {
  return request(`/issues/${id}/status`, { method: 'PATCH', body: { status } });
}

export async function getMyReports() {
  const [me, mine] = await Promise.all([request('/auth/me'), request('/issues/mine')]);
  return mine.filter((issue) => issue.user_id === me.user.id);
}

/* -------------------------------------------------------------------- auth */

export async function getCurrentUser() {
  const { user, stats } = await request('/auth/me');
  return {
    ...user,
    stats,
    ward: user.role === 'admin' ? 'Ward office · administrator' : 'Resident register'
  };
}

export async function signIn({ email, password }) {
  const { token, user } = await request('/auth/login', { method: 'POST', body: { email, password } });
  setToken(token);
  return user;
}

export async function register({ name, email, password }) {
  const { token, user } = await request('/auth/register', { method: 'POST', body: { name, email, password } });
  setToken(token);
  return user;
}

/* --------------------------------------------------------- duplicate check */

export function distanceInMeters(first, second) {
  const R = 6371000;
  const lat1 = (first.latitude * Math.PI) / 180;
  const lat2 = (second.latitude * Math.PI) / 180;
  const dLat = ((second.latitude - first.latitude) * Math.PI) / 180;
  const dLon = ((second.longitude - first.longitude) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Runs in SQL on the server: same category, not resolved, inside the radius.
 * Falls back to a client-side sweep only if no category has been picked yet.
 */
export async function findNearbyIssues(latitude, longitude, radiusMeters = 50, category) {
  if (category) {
    const { duplicates } = await request('/issues/check-duplicate', {
      method: 'POST',
      body: { category, latitude, longitude }
    });
    return duplicates;
  }
  const issues = await getIssues();
  return issues.filter(
    (item) => item.status !== 'resolved' && distanceInMeters({ latitude, longitude }, item) <= radiusMeters
  );
}

/* stats for the ward dashboard */
export async function getStats() {
  return request('/issues/admin/stats');
}
