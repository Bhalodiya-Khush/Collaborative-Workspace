import { useEffect, useState } from 'react';
import api from '../services/api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const token = localStorage.getItem('token');

    if (!token) {
      return;
    }

    const loadUser = async () => {
      try {
        const response = await api.get('/users/me');
        setUser(response.data.user);
      } catch (error) {
        console.error('Failed to restore session:', error);
        localStorage.removeItem('token');
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    loadUser();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/users/login', {
      email,
      password,
    });

    const { token, user } = response.data;

    localStorage.setItem('token', token);
    setUser(user);

    return user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

