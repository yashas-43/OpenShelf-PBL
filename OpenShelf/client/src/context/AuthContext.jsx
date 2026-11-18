import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);
const TOKEN_KEY = 'openshelf_token';
const USER_KEY = 'openshelf_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(Boolean(localStorage.getItem(TOKEN_KEY)));
  const [sessionError, setSessionError] = useState('');

  const signOut = () => {
    // A browser-only sign-out must also discard the server-issued PDF reader cookie.
    api.post('/api/student-pdfs/logout', {}, { withCredentials: true }).catch(() => {});
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setChecking(false);
    setSessionError('');
  };

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    let active = true;
    api.get('/api/auth/me')
      .then(({ data }) => {
        if (active) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      })
      .catch((error) => {
        if (!active) return;
        if (error.response?.status === 401) signOut();
        else setSessionError('Could not verify your session. Check the server connection and try refreshing.');
      })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  const signIn = ({ token, user: signedInUser }) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(signedInUser));
    setUser(signedInUser);
    setSessionError('');
    setChecking(false);
  };

  const updateUser = (nextUser) => {
    setUser(nextUser);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const context = useMemo(() => ({ user, checking, sessionError, signIn, signOut, updateUser }),
    [user, checking, sessionError]);
  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider.');
  return context;
}
