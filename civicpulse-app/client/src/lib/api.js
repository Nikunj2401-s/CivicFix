const TOKEN_KEY = 'civicfix.token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

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
    throw err;
  }
  return data;
}

export const api = {
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),
  updateMe: (body) => request('/auth/me', { method: 'PATCH', body }),

  issues: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v && v !== 'all'));
    return request(`/issues${qs.toString() ? `?${qs}` : ''}`);
  },
  mine: () => request('/issues/mine'),
  issue: (id) => request(`/issues/${id}`),
  checkDuplicate: (body) => request('/issues/check-duplicate', { method: 'POST', body }),
  create: (form) => request('/issues', { method: 'POST', form }),
  upvote: (id) => request(`/issues/${id}/upvote`, { method: 'POST' }),
  unvote: (id) => request(`/issues/${id}/upvote`, { method: 'DELETE' }),
  setStatus: (id, status) => request(`/issues/${id}/status`, { method: 'PATCH', body: { status } }),
  stats: () => request('/issues/admin/stats')
};
