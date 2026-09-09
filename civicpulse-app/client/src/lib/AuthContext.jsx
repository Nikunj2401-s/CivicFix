import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) return setLoading(false);
    api.me()
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const finish = ({ token, user }) => { setToken(token); setUser(user); return user; };

  const value = {
    user,
    loading,
    isAdmin: user?.role === 'admin',
    login: (email, password) => api.login({ email, password }).then(finish),
    register: (name, email, password) => api.register({ name, email, password }).then(finish),
    updateName: (name) => api.updateMe({ name }).then(({ user }) => setUser(user)),
    saveOffice: (latitude, longitude, label) =>
      api.setOffice({ latitude, longitude, label }).then(({ user }) => setUser(user)),
    logout: () => { setToken(null); setUser(null); }
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
