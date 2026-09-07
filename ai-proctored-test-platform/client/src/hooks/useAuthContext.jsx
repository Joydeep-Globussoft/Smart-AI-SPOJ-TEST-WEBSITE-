// Auth Context — shared across Admin and Candidate panels
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { initSocket, disconnectSocket } from '../services/socketClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);       // { id, name, role, type: 'admin'|'candidate' }
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        // Reconnect socket
        initSocket(storedToken);
      } catch {
        localStorage.clear();
      }
    }
    setLoading(false);
  }, []);

  const purgeCandidateSessionStorage = () => {
    try {
      Object.keys(sessionStorage).forEach((key) => {
        if (
          key.startsWith('draft_') ||
          key === 'testSession' ||
          key === 'joinData'
        ) {
          sessionStorage.removeItem(key);
        }
      });
    } catch (_) {}
  };

  const login = useCallback((userData, accessToken, refreshToken) => {
    purgeCandidateSessionStorage();
    localStorage.setItem('token', accessToken);
    localStorage.setItem('user', JSON.stringify(userData));
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    setToken(accessToken);
    setUser(userData);
    initSocket(accessToken);
  }, []);

  const logout = useCallback(() => {
    disconnectSocket();
    purgeCandidateSessionStorage();
    localStorage.clear();
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedFields) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...updatedFields };
      localStorage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const isAdmin = user?.type === 'admin';
  const isSuperAdmin = user?.type === 'admin' && user?.role === 'SUPER_ADMIN';
  const isCandidate = user?.type === 'candidate';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, updateUser, isAdmin, isSuperAdmin, isCandidate }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
