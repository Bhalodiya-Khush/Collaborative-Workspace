import { useEffect, useState } from 'react';
import api from '../services/api';
import { AuthContext } from './auth-context';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('token')));

  const loadUser = async () => {
    try {
      const response = await api.get('/users/me');
      setUser(response.data.user);
      return response.data.user;
    } catch (error) {
      console.error('Failed to restore session:', error);
      localStorage.removeItem('token');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }
    loadUser();
  }, []);

  const login = async (email, password) => {
    const response = await api.post('/users/login', {
      email,
      password,
    });

    const { token, user: loggedInUser } = response.data;

    localStorage.setItem('token', token);
    setUser(loggedInUser);

    return loggedInUser;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser((prev) => (prev ? { ...prev, ...updatedUser } : updatedUser));
  };

  const value = {
    user,
    loading,
    login,
    logout,
    updateUser,
    refreshUser: loadUser,
    isAuthenticated: !!user,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
