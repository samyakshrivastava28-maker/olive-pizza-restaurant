import React, { useState, useEffect, useRef } from 'react';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Mail, 
  Phone, 
  ShieldCheck, 
  ArrowRight, 
  AlertCircle, 
  RotateCcw, 
  ArrowLeft, 
  Lock, 
  Building2
} from 'lucide-react';
import { AppLogo } from '../components/common/AppLogo';
import { fetchApi } from '../lib/api';
import { useManagerStore } from '../store/managerStore';
import toast from 'react-hot-toast';
import { requestPostLoginNotificationPermissions } from '../services/notificationPermissionService';

export const LoginPage: React.FC = () => {
  // Step 1: 'check' (Account Eligibility), Step 2: 'verify' (6-Digit Temporary Code)
  const [step, setStep] = useState<'check' | 'verify'>('check');
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [identifierInput, setIdentifierInput] = useState('');
  
  // Verification Code State
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  
  // Timers & Loading
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';
  const { isAuthorized, clearRestricted } = useManagerStore();

  // Redirect if already authorized
  useEffect(() => {
    if (isAuthorized) {
      navigate(from, { replace: true });
    }
  }, [isAuthorized, navigate, from]);

  // Clean any stale restricted locks when mounting the verification page
  useEffect(() => {
    clearRestricted();
  }, [clearRestricted]);

  // Cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Handle Step 1: Pre-Check Eligibility
  const handleCheckEligibility = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = identifierInput.trim();
    if (!cleanInput) {
      setError(authMethod === 'email' ? 'Please enter your registered email address.' : 'Please enter your 10-digit mobile number.');
      return;
    }

    if (authMethod === 'email' && !cleanInput.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    if (authMethod === 'phone' && cleanInput.replace(/\D/g, '').length < 10) {
      setError('Please enter a valid 10-digit mobile phone number.');
      return;
    }

    setIsLoading(true);

    try {
      const resp = await fetchApi<any>('/api/auth/management/check-eligibility', {
        method: 'POST',
        body: JSON.stringify({
          identifier: cleanInput,
          targetApp: 'RESTAURANT_MANAGER'
        })
      });

      if (!resp.success || !resp.eligible) {
        setError(resp.message || 'This account is not verified or authorized for Restaurant Management. Please contact Olive Pizza administration.');
        setIsLoading(false);
        return;
      }

      // Success: Account is eligible and 6-digit code has been dispatched
      setVerifiedEmail(resp.email || cleanInput);
      setMaskedEmail(resp.maskedEmail || resp.email || cleanInput);
      setResolvedName(resp.name || 'Restaurant Manager');
      setResendCooldown(60);
      setCode(['', '', '', '', '', '']);
      setStep('verify');
      toast.success(resp.message || 'Verification code sent to your email!');

      // Focus first digit after render
      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setError(err?.message || 'Unable to verify account eligibility. Please check your network connection and retry.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Step 2: Code Input Changes
  const handleDigitChange = (index: number, val: string) => {
    // Only accept numeric
    const clean = val.replace(/\D/g, '');
    if (!clean && val !== '') return;

    const newCode = [...code];

    // If user pasted multi-digit text
    if (clean.length > 1) {
      const pastedDigits = clean.slice(0, 6).split('');
      pastedDigits.forEach((d, i) => {
        if (i < 6) newCode[i] = d;
      });
      setCode(newCode);
      const nextFocus = Math.min(pastedDigits.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newCode[index] = clean;
    setCode(newCode);

    // Auto-advance to next input
    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length > 0) {
      const newCode = ['', '', '', '', '', ''];
      pasted.split('').forEach((d, i) => {
        newCode[i] = d;
      });
      setCode(newCode);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
    }
  };

  // Handle Resend Verification Code
  const handleResendCode = async () => {
    if (resendCooldown > 0 || isResending || !verifiedEmail) return;

    setIsResending(true);
    setError(null);

    try {
      const resp = await fetchApi<any>('/api/auth/management/resend-code', {
        method: 'POST',
        body: JSON.stringify({ email: verifiedEmail })
      });

      if (!resp.success) {
        setError(resp.message || 'Failed to resend verification code. Please wait before retrying.');
        return;
      }

      setResendCooldown(60);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
      toast.success('Fresh verification code sent to your email.');
    } catch (err: any) {
      setError(err?.message || 'Network error while requesting new code.');
    } finally {
      setIsResending(false);
    }
  };

  // Handle Step 2: Verify Code and Sign In
  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fullCode = code.join('').trim();
    if (fullCode.length !== 6) {
      setError('Please enter the complete 6-digit verification code.');
      return;
    }

    setIsLoading(true);

    try {
      const resp = await fetchApi<any>('/api/auth/management/verify-code-signin', {
        method: 'POST',
        body: JSON.stringify({
          email: verifiedEmail,
          code: fullCode,
          targetApp: 'RESTAURANT_MANAGER'
        })
      });

      if (!resp.success || !resp.customToken) {
        setError(resp.message || 'Invalid or expired verification code. Please check your email or request a new code.');
        setIsLoading(false);
        return;
      }

      // Sign in to Firebase Auth using verified Custom Token
      const userCredential = await signInWithCustomToken(auth, resp.customToken);
      const user = userCredential.user;
      const u = resp.user || {};

      // Complete session into manager store
      useManagerStore.setState({
        user,
        managerProfile: {
          uid: user.uid,
          name: u.name || user.displayName || resolvedName || 'Restaurant Manager',
          email: user.email || verifiedEmail,
          role: u.role as any || 'manager',
          branchId: u.branchId || 'branch_rjn_main',
          branchName: u.branchName || 'Olive Pizza — Rajnandgaon HQ',
          permissions: u.permissions || ['*'],
          isActive: true
        },
        userRole: u.role || 'manager',
        isAuthorized: true,
        isAuthChecking: false,
        restrictedReason: null,
        restrictedEmail: null,
        activeBranchId: u.branchId || 'branch_rjn_main',
        activeBranchName: u.branchName || 'Olive Pizza — Rajnandgaon HQ',
        permissions: u.permissions || ['*']
      });

      toast.success(`Welcome back, ${u.name || resolvedName || 'Manager'}!`);
      requestPostLoginNotificationPermissions().catch(() => {});
      navigate(from, { replace: true });
    } catch (err: any) {
      console.error('[LoginPage] Sign in verification error:', err);
      setError(err?.message || 'Verification failed. Please check your code or request a new one.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b08] text-[#e8eee9] flex items-center justify-center p-4 font-sans relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] bg-[#57854d]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-[#c6a052]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="w-full max-w-md bg-[#0e1410]/95 backdrop-blur-2xl border border-[#1e2a21] rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* App Brand Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <AppLogo size="lg" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#57854d]/10 border border-[#57854d]/30 text-[#86a77d] text-[11px] font-semibold tracking-wide uppercase mb-2">
              <Building2 className="w-3.5 h-3.5" />
              Restaurant Management Portal
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">
              {step === 'check' ? 'Staff & Manager Access' : 'Verify One-Time Code'}
            </h1>
            <p className="text-xs text-[#a4c29c] mt-1 max-w-xs mx-auto leading-relaxed">
              {step === 'check'
                ? 'Verify your authorized Olive Pizza account credentials to receive a temporary login code.'
                : `Enter the 6-digit code sent to your registered email address.`}
            </p>
          </div>
        </div>

        {/* Global Error Notice */}
        {error && (
          <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-start gap-3 text-red-200 text-xs animate-in fade-in slide-in-from-top-1 duration-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* STEP 1: ELIGIBILITY PRE-CHECK */}
        {step === 'check' && (
          <form onSubmit={handleCheckEligibility} className="space-y-5">
            {/* Verification Method Tabs */}
            <div className="grid grid-cols-2 p-1 bg-[#090d0a] border border-[#1b261e] rounded-2xl">
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('email');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                  authMethod === 'email'
                    ? 'bg-[#1b261e] text-white shadow-md'
                    : 'text-[#86a77d] hover:text-white'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                Email Address
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMethod('phone');
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold rounded-xl transition-all ${
                  authMethod === 'phone'
                    ? 'bg-[#1b261e] text-white shadow-md'
                    : 'text-[#86a77d] hover:text-white'
                }`}
              >
                <Phone className="w-3.5 h-3.5" />
                Phone Number
              </button>
            </div>

            {/* Input Field */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-[#a4c29c] uppercase tracking-wider block">
                {authMethod === 'email' ? 'Registered Email Address' : 'Registered Mobile Number'}
              </label>
              <div className="relative">
                {authMethod === 'email' ? (
                  <>
                    <input
                      type="email"
                      value={identifierInput}
                      onChange={e => setIdentifierInput(e.target.value)}
                      placeholder="e.g. manager@olivepizza.com or webhub2811@gmail.com"
                      autoFocus
                      required
                      className="w-full pl-10 pr-4 py-3 bg-[#090d0a] border border-[#1f2d22] rounded-2xl text-white text-sm placeholder-[#465c49] focus:outline-none focus:border-[#57854d] focus:ring-2 focus:ring-[#57854d]/20 transition-all font-mono"
                    />
                    <Mail className="w-4 h-4 text-[#86a77d] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  </>
                ) : (
                  <>
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-[#86a77d] font-semibold border-r border-[#1f2d22] pr-2.5">
                      <span>🇮🇳</span>
                      <span>+91</span>
                    </div>
                    <input
                      type="tel"
                      value={identifierInput}
                      onChange={e => setIdentifierInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="10-digit registered number"
                      autoFocus
                      required
                      className="w-full pl-20 pr-4 py-3 bg-[#090d0a] border border-[#1f2d22] rounded-2xl text-white text-sm placeholder-[#465c49] focus:outline-none focus:border-[#57854d] focus:ring-2 focus:ring-[#57854d]/20 transition-all font-mono"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Security Notice */}
            <div className="p-3 rounded-2xl bg-[#090d0a]/60 border border-[#172219] flex items-center gap-2.5 text-[11px] text-[#86a77d]">
              <Lock className="w-4 h-4 text-[#57854d] shrink-0" />
              <span>Passwordless verification. A 6-digit one-time authorization code will be dispatched to your email.</span>
            </div>

            {/* Action Submit */}
            <button
              type="submit"
              disabled={isLoading || !identifierInput.trim()}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#57854d] to-[#436b3b] hover:from-[#659959] hover:to-[#4e7d44] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-[#57854d]/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Account...</span>
                </>
              ) : (
                <>
                  <span>Verify Account & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* STEP 2: TEMPORARY 6-DIGIT CODE VERIFICATION */}
        {step === 'verify' && (
          <form onSubmit={handleVerifyCode} className="space-y-6">
            {/* Masked Email Info Pill */}
            <div className="p-3.5 rounded-2xl bg-[#090d0a] border border-[#1b261e] flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-[#57854d]/20 border border-[#57854d]/40 flex items-center justify-center text-[#86a77d] shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-[10px] uppercase font-semibold text-[#86a77d] tracking-wider">Sent to verified email</p>
                  <p className="text-xs font-mono font-bold text-white truncate">{maskedEmail}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStep('check');
                  setError(null);
                }}
                className="text-[11px] font-semibold text-[#c6a052] hover:text-[#dfb762] hover:underline shrink-0 flex items-center gap-1"
              >
                <ArrowLeft className="w-3 h-3" />
                Change
              </button>
            </div>

            {/* 6-Digit Code Inputs */}
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-[#a4c29c] uppercase tracking-wider block text-center">
                Enter 6-Digit Verification Code
              </label>
              <div className="flex justify-between gap-2 sm:gap-3" onPaste={handlePaste}>
                {code.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={el => { inputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleDigitChange(idx, e.target.value)}
                    onKeyDown={e => handleKeyDown(idx, e)}
                    className="w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-black font-mono bg-[#090d0a] border-2 border-[#1f2d22] focus:border-[#57854d] focus:ring-4 focus:ring-[#57854d]/20 rounded-2xl text-white outline-none transition-all"
                  />
                ))}
              </div>
            </div>

            {/* Resend Code Section */}
            <div className="flex items-center justify-between text-xs text-[#86a77d] px-1">
              <span>Didn't receive the code?</span>
              {resendCooldown > 0 ? (
                <span className="font-mono text-[#c6a052] font-semibold">
                  Resend in {resendCooldown}s
                </span>
              ) : (
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={isResending}
                  className="font-bold text-[#86a77d] hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${isResending ? 'animate-spin' : ''}`} />
                  Resend Code
                </button>
              )}
            </div>

            {/* Action Verify Submit */}
            <button
              type="submit"
              disabled={isLoading || code.some(d => !d)}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-[#57854d] to-[#436b3b] hover:from-[#659959] hover:to-[#4e7d44] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-2xl transition-all shadow-lg shadow-[#57854d]/20 flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Verifying Code...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Verify & Enter Restaurant Manager</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* Security Footer Notice */}
        <div className="pt-2 text-center border-t border-[#162018]">
          <p className="text-[10px] text-[#5c7a56] flex items-center justify-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-[#57854d]" />
            Olive Pizza Zero-Trust Architecture • Encrypted Session
          </p>
        </div>
      </div>
    </div>
  );
};
