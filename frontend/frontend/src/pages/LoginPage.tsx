import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setAuth, setLoading, setError } from '../store/authSlice';
import api from '../api/axios';
import { Church } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading, error } = useAppSelector((state) => state.auth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    dispatch(setLoading(true));
    
    try {
      const response = await api.post('/api/auth/login', { email, password });
      // response.data should contain { token, user: { id, email, role } }
      dispatch(setAuth(response.data));
      navigate('/');
    } catch (err: any) {
      dispatch(setError(err.response?.data?.error || 'Authentication failed'));
    }
  };

  return (
    <div className="min-h-screen bg-[#1a3c34] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden">
        <div className="p-8 md:p-12">
          <div className="flex justify-center mb-6">
            <div className="bg-[#d4af37] p-4 rounded-2xl shadow-lg">
              <Church className="text-[#1a3c34] w-10 h-10" />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-[#1a3c34] text-center mb-2">Welcome Back</h2>
          <p className="text-gray-500 text-center mb-8">Mission For Nation Administration</p>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 border-l-4 border-red-600 text-sm rounded-r">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-bold text-[#1a3c34] mb-2 uppercase tracking-wide">Email Address</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all"
                placeholder="admin@mission.org"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-[#1a3c34] mb-2 uppercase tracking-wide">Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#d4af37] hover:bg-[#b08d26] text-[#1a3c34] font-black py-4 rounded-xl shadow-lg shadow-gold/20 transition-all transform active:scale-95 disabled:opacity-50"
            >
              {loading ? 'VERIFYING...' : 'SIGN IN TO DASHBOARD'}
            </button>
          </form>
        </div>
        
        <div className="bg-gray-50 py-4 px-8 text-center border-t border-gray-100">
          <p className="text-xs text-gray-400">Secure Access for Authorized Personnel Only</p>
        </div>
      </div>
    </div>
  );
}