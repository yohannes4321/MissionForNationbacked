// createSlice is logic (VALUE), PayloadAction is a TYPE.
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

// AuthState and User are just blueprints (TYPES).
import type { AuthState, User } from '../types/index';

// Helper function to safely get user from localStorage
const getSafeUser = (): User | null => {
  const storedUser = localStorage.getItem('user');
  if (!storedUser || storedUser === 'undefined') return null; // Catch the "undefined" string!
  try {
    return JSON.parse(storedUser) as User;
  } catch (e) {
    return null;
  }
};

const initialState: AuthState = {
  user: getSafeUser(),
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token') && localStorage.getItem('token') !== 'undefined',
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth: (state, action: PayloadAction<{ token: string; user: User }>) => {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
      
      localStorage.setItem('token', action.payload.token);
      localStorage.setItem('user', JSON.stringify(action.payload.user));
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.loading = false;
    },
    logout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
      localStorage.clear();
    },
  },
});

export const { setAuth, setLoading, setError, logout } = authSlice.actions;
export default authSlice.reducer;