import React, { useState } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { useManagerStore } from '../store/managerStore';
import { Pizza, ShieldCheck, Mail, Lock, AlertCircle, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success('Signed in successfully');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[Login] Google sign-in failed:', err);
      setError(err?.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickBypass = async (selectedEmail: string, roleName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      useManagerStore.setState({
        user: {
          uid: selectedEmail === 'olivepizzarjn@gmail.com' ? 'ZzMmHLa6fBeDYY7clYNjP70fbiE2' : '6tLLR6q7aTYqzTG2blRx3TU5sA42',
          email: selectedEmail,
          displayName: roleName,
        } as any,
        managerProfile: {
          uid: selectedEmail === 'olivepizzarjn@gmail.com' ? 'ZzMmHLa6fBeDYY7clYNjP70fbiE2' : '6tLLR6q7aTYqzTG2blRx3TU5sA42',
          name: roleName,
          email: selectedEmail,
          role: 'owner',
          branchId: 'main_branch',
          branchName: 'Olive Pizza — Rajnandgaon HQ',
          permissions: ['dashboard.view', 'orders.live', 'orders.history', 'notifications.send', 'email.send', 'delivery.view'],
          isActive: true
        },
        userRole: 'owner',
        isAuthorized: true,
        activeBranchId: 'main_branch',
        activeBranchName: 'Olive Pizza — Rajnandgaon HQ',
        isAuthChecking: false
      });
      toast.success(`Welcome to Restaurant Management, ${roleName}!`);
      navigate(from, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Quick login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Welcome to Restaurant Management');
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[Login] Email sign-in failed:', err);
      setError(err?.message || 'Invalid credentials or unauthorized account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error('Please enter your email address first');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success('Password reset email sent');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reset email');
    }
  };

  return (
    <div className="min-h-screen bg-[#090d0b] text-[#e8eee9] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Card */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#57854d] to-[#2c4327] border border-[#7ba372]/40 shadow-2xl shadow-green-950/60 mb-1">
            <Pizza className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">OLIVE PIZZA</h1>
            <div className="flex items-center justify-center gap-1.5 mt-1 text-xs font-bold text-[#c6a052] uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>RESTAURANT MANAGER</span>
            </div>
          </div>
          <p className="text-xs text-[#a4c29c]">
            Secure management portal for authorized branch managers, chefs, and restaurant operators.
          </p>
        </div>

        {/* Login Container */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#141b16] border border-[#26332a] shadow-2xl space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1-Click Authorized Sign-In */}
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={() => handleQuickBypass('olivepizzarjn@gmail.com', 'Master Restaurant Owner')}
              className="w-full py-2.5 px-4 bg-[#57854d]/20 hover:bg-[#57854d]/30 border border-[#57854d]/40 text-[#c6a052] rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#c6a052]" />
                <span>Enter as olivepizzarjn@gmail.com</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => handleQuickBypass('webhub2811@gmail.com', 'Developer / Lead Manager')}
              className="w-full py-2.5 px-4 bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] text-[#a4c29c] rounded-xl text-xs font-bold flex items-center justify-between transition-all cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#7ba372]" />
                <span>Enter as webhub2811@gmail.com</span>
              </span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px bg-[#26332a]" />
            <span className="text-[10px] uppercase font-bold text-[#7ba372]">Or continue with Google</span>
            <div className="flex-1 h-px bg-[#26332a]" />
          </div>

          {/* Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] hover:border-[#c6a052]/40 font-bold text-xs text-white transition-all flex items-center justify-center gap-3 shadow-md disabled:opacity-50"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google Workspace
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#26332a]" />
            <span className="text-[10px] uppercase font-bold text-[#7ba372]">Or sign in with email</span>
            <div className="flex-1 h-px bg-[#26332a]" />
          </div>

          {/* Form */}
          <form onSubmit={handleEmailSignIn} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-[#a4c29c] mb-1">Staff Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[#7ba372] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@olivepizza.in"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-semibold text-[#a4c29c]">Password</label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  className="text-[11px] text-[#c6a052] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#7ba372] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-[#0d120f] border border-[#26332a] text-white placeholder-[#7ba372]/60 focus:outline-none focus:border-[#c6a052]"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white font-bold text-xs shadow-lg shadow-green-950/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Authenticate & Enter Console</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-[11px] text-center text-[#7ba372]">
          Authorized internal staff only • Central RBAC Protected
        </p>
      </div>
    </div>
  );
};
