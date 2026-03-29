import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User } from '../../../shared/types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (credential: string) => Promise<void>;
  devLogin: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  devLogin: async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login(credential: string) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Login failed');
    }

    const data = await res.json();
    setUser(data.user);
  }

  async function devLogin() {
    const res = await fetch('/api/auth/dev-login', {
      method: 'POST',
      credentials: 'include',
    });

    if (!res.ok) {
      throw new Error('Dev login failed');
    }

    const data = await res.json();
    setUser(data.user);
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, devLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
