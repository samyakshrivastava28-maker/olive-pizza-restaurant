import React, { useState } from 'react';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  signInWithCredential,
  GoogleAuthProvider,
  sendPasswordResetEmail 
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';
import toast from 'react-hot-toast';
import { requestPostLoginNotificationPermissions } from '../services/notificationPermissionService';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const formatAuthError = (err: any) => {
    const code = err?.code || '';
    switch (code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email or password. Please check your credentials.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/user-disabled':
        return 'This manager account has been disabled. Please contact administration.';
      case 'auth/too-many-requests':
        return 'Too many failed attempts. Please wait a few minutes before trying again.';
      case 'auth/network-request-failed':
        return 'Network connection error. Please check your internet connection.';
      case 'auth/popup-closed-by-user':
        return null;
      default:
        return err?.message || 'Authentication failed. Please check your credentials.';
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await FirebaseAuthentication.signInWithGoogle();
        const idToken = res.credential?.idToken;
        if (!idToken) throw new Error('Failed to get Google ID token on mobile device.');
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
      toast.success('Signed in successfully');
      requestPostLoginNotificationPermissions().catch(() => {});
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[Login] Google sign-in failed:', err);
      const msg = formatAuthError(err);
      if (msg) setError(msg);
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
      await signInWithEmailAndPassword(auth, email.trim(), password);
      toast.success('Welcome to Restaurant Management');
      requestPostLoginNotificationPermissions().catch(() => {});
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[Login] Email sign-in failed:', err);
      const msg = formatAuthError(err);
      if (msg) setError(msg);
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
      await sendPasswordResetEmail(auth, email.trim());
      toast.success('Password reset email sent');
    } catch (err: any) {
      const msg = formatAuthError(err) || 'Failed to send reset email';
      toast.error(msg);
    }
  };

  const handleQuickManagerSignIn = (selectedEmail: string, name: string, _role?: string) => {
    setEmail(selectedEmail);
    toast(`Selected ${name} (${selectedEmail}). Sign in with password or Google to establish your session.`, {
      icon: '🔐',
    });
  };

  return (
    <div className="min-h-screen bg-[#090d0b] text-[#e8eee9] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Card */}
        <div className="flex flex-col items-center text-center space-y-3">
          <AppLogo variant="full" size="xl" subtitle="Restaurant Management" />
          <p className="text-xs text-[#a4c29c] max-w-sm pt-1">
            Secure management portal for authorized branch managers, chefs, and restaurant operators.
          </p>
        </div>

        {/* Login Container */}
        <div className="p-6 sm:p-8 rounded-3xl bg-[#141b16] border border-[#26332a] shadow-2xl space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* 1-Click Fast Authorized Terminal Access */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleQuickManagerSignIn('olivepizzarjn@gmail.com', 'Olive Pizza Master GM', 'owner')}
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#57854d]/40 text-xs font-bold text-white flex items-center justify-between transition-all cursor-pointer shadow-sm hover:border-[#57854d]"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#c6a052]" />
                <div className="text-left">
                  <div className="font-extrabold text-white text-[11px]">Sign in as Master General Manager</div>
                  <div className="text-[10px] text-[#a4c29c]">olivepizzarjn@gmail.com</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#c6a052]" />
            </button>

            <button
              type="button"
              onClick={() => handleQuickManagerSignIn('olivepizzamaker@gmail.com', 'Head Kitchen Manager & Chef', 'restaurant_manager')}
              className="w-full py-2.5 px-3.5 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] hover:border-[#c6a052]/40 text-xs font-bold text-white flex items-center justify-between transition-all cursor-pointer shadow-sm"
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-4 h-4 text-[#57854d]" />
                <div className="text-left">
                  <div className="font-extrabold text-white text-[11px]">Sign in as Lead Kitchen Operator</div>
                  <div className="text-[10px] text-[#7ba372]">olivepizzamaker@gmail.com</div>
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-[#57854d]" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-[#26332a]" />
            <span className="text-[10px] uppercase font-bold text-[#7ba372]">Or OAuth / Email</span>
            <div className="flex-1 h-px bg-[#26332a]" />
          </div>

          {/* Google Sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-[#1b241e] hover:bg-[#222d26] border border-[#26332a] hover:border-[#c6a052]/40 font-bold text-xs text-white transition-all flex items-center justify-center gap-3 shadow-md disabled:opacity-50 cursor-pointer"
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
                  className="text-[11px] text-[#c6a052] hover:underline cursor-pointer"
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
              className="w-full py-3 rounded-xl bg-[#57854d] hover:bg-[#426939] text-white font-bold text-xs shadow-lg shadow-green-950/60 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
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
