import { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ApiError } from '@/lib/api';
import flowLogo from '@/assets/Flow-transparent.png';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@store.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Login failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0e0709] px-4">
      {/* Dynamic Brand Atmosphere (#ea174e) */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-28 -top-28 h-[30rem] w-[30rem] rounded-full bg-[#ea174e]/25 blur-[120px]" />
        <div className="absolute -bottom-36 -right-20 h-[32rem] w-[32rem] rounded-full bg-[#c20e3d]/20 blur-[130px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full bg-[#ea174e]/10 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.55) 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md animate-fadeIn">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <img
              src={flowLogo}
              alt="Company Logo"
              className="h-16 w-auto max-w-[330px] object-contain drop-shadow-[0_4px_24px_rgba(234,23,78,0.6)] transition duration-300 hover:scale-105"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Ibrahim Business Manager</h1>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/15 bg-white/95 p-7 shadow-2xl backdrop-blur-xl"
        >
          <h2 className="text-lg font-semibold text-slate-800">Sign in to continue</h2>
          <p className="mt-1 text-sm text-slate-500">Use your staff account credentials</p>

          {error && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Email
              </span>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 outline-none transition focus:border-[#ea174e] focus:ring-2 focus:ring-[#ea174e]/20"
                  placeholder="admin@store.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Password
              </span>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 outline-none transition focus:border-[#ea174e] focus:ring-2 focus:ring-[#ea174e]/20"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#ea174e] to-[#c20e3d] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[#ea174e]/30 transition hover:from-[#d61445] hover:to-[#a90c34] active:scale-[0.99] disabled:opacity-60 cursor-pointer"
          >
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
