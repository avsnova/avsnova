import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Mail, Lock, User, ShieldCheck, ArrowRight, Eye, EyeOff, Sparkles, Phone, Key, ArrowLeft, Check, AlertCircle, Loader2 } from "lucide-react";
import { apiFetch, setSessionToken } from "../utils/api";
import { useToast } from "./ui/Toast";

interface AuthModalsProps {
  isOpen: boolean;
  onClose: () => void;
  type: "login" | "signup";
  onSuccess: (user: { name: string; email: string; wallet_balance: number; role?: string; username?: string; phone?: string }, meta?: { isNew?: boolean }) => void;
  toggleType: () => void;
}

/* ————— Validation helpers (UI-only; backend logic untouched) ————— */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());
// Phone: numeric only, at least 9 and at most 11 digits (local number).
const phoneDigits = (v: string) => v.replace(/\D/g, "");
const isValidPhone = (v: string) => { const d = phoneDigits(v); return d.length >= 9 && d.length <= 11; };
// Username: lowercase letters, digits, underscore; min 3 chars.
const isValidUsername = (v: string) => /^[a-z0-9_]{3,}$/.test(v);

interface Strength { score: number; label: string; color: string; bar: string; }
function passwordStrength(pw: string): Strength {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"];
  const colors = ["text-red-400", "text-red-400", "text-amber-400", "text-yellow-300", "text-emerald-400", "text-emerald-400"];
  const bars = ["bg-red-500", "bg-red-500", "bg-amber-500", "bg-yellow-400", "bg-emerald-500", "bg-emerald-400"];
  return { score, label: labels[score], color: colors[score], bar: bars[score] };
}

// Map raw backend/network messages to friendly, user-facing copy.
function friendlyAuthError(raw: string, mode: "login" | "signup" | "forgot"): string {
  const m = (raw || "").toLowerCase();
  if (/invalid email or password|incorrect|wrong password|not found/.test(m)) return "Incorrect email or password. Please try again.";
  if (/username already taken|username.*exist/.test(m)) return "That username is already taken. Please choose another.";
  if (/email already registered|email.*exist/.test(m)) return "This email is already registered. Try logging in instead.";
  if (/fill in all|required field/.test(m)) return "Please complete all required fields.";
  if (/invalid username/.test(m)) return "Please choose a valid username (letters, numbers or underscores).";
  if (/not registered|no account/.test(m)) return "We couldn't find an account with that email.";
  if (/invalid or expired|invalid code|expired/.test(m)) return "That verification code is invalid or has expired.";
  if (/network|failed to fetch|connection|econnrefused|timeout/.test(m)) return "Connection problem. Please check your internet and try again.";
  if (/500|database error/.test(m)) return "Something went wrong on our side. Please try again in a moment.";
  return raw || (mode === "login" ? "Sign-in failed. Please try again." : "Something went wrong. Please try again.");
}

/* ————— Reusable premium floating-label field ————— */
interface FieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ReactNode;
  required?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  status?: "idle" | "valid" | "invalid";
  hint?: string;
  trailing?: React.ReactNode;
}
function Field({ id, label, type = "text", value, onChange, icon, required, autoComplete, inputMode, maxLength, status = "idle", hint, trailing }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const float = focused || value.length > 0;
  const borderCls = status === "invalid"
    ? "border-red-500/50 focus-within:border-red-500"
    : status === "valid"
    ? "border-emerald-500/50 focus-within:border-emerald-500"
    : "border-purple-500/20 focus-within:border-purple-500";
  return (
    <div className="space-y-1">
      <div className={`relative flex items-center rounded-xl bg-black/40 border ${borderCls} transition-colors duration-200 focus-within:ring-2 focus-within:ring-purple-500/25`}>
        <span className={`absolute left-3.5 transition-colors ${status === "invalid" ? "text-red-400/70" : status === "valid" ? "text-emerald-400/70" : "text-purple-200/40"}`}>
          {icon}
        </span>
        <label
          htmlFor={id}
          className={`absolute left-10 pointer-events-none font-space transition-all duration-200 ${
            float ? "top-1 text-[9px] text-purple-300/70" : "top-1/2 -translate-y-1/2 text-xs sm:text-sm text-purple-200/40"
          }`}
        >
          {label}{required && <span className="text-purple-400/60"> *</span>}
        </label>
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          required={required}
          autoComplete={autoComplete}
          inputMode={inputMode}
          maxLength={maxLength}
          aria-invalid={status === "invalid"}
          className="w-full bg-transparent pl-10 pr-10 pt-4 pb-2 text-xs sm:text-sm text-white placeholder-transparent focus:outline-none font-inter rounded-xl"
        />
        <span className="absolute right-3 flex items-center gap-1">
          {trailing}
          {!trailing && status === "valid" && <Check className="h-4 w-4 text-emerald-400 animate-check-pop" />}
          {!trailing && status === "invalid" && <AlertCircle className="h-4 w-4 text-red-400" />}
        </span>
      </div>
      {hint && (
        <p className={`text-[10px] pl-1 flex items-center gap-1 ${status === "invalid" ? "text-red-400/80" : status === "valid" ? "text-emerald-400/80" : "text-purple-200/40"}`}>
          {status === "valid" && <Check className="h-3 w-3" />}
          {status === "invalid" && <X className="h-3 w-3" />}
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}

const LOGIN_STAGES = ["Verifying credentials…", "Securing your session…", "Loading your dashboard…"];
const SIGNUP_STAGES = ["Creating your account…", "Setting up your wallet…", "Almost there…"];

export default function AuthModals({ isOpen, onClose, type, onSuccess, toggleType }: AuthModalsProps) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);

  // Auto-capture a referral code from the URL (?ref=CODE) so invited users don't have to type it.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const ref = p.get("ref");
      if (ref) setReferralCode(ref);
    } catch { /* ignore */ }
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingMsg, setLoadingMsg] = useState("");
  const stageTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Forgot password specific states
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Sync mode with the parent trigger type
  useEffect(() => {
    setMode(type);
    setError("");
    setSuccessMsg("");
    setForgotStep(1);
  }, [type, isOpen]);

  // Lock background scroll while open + Escape to close
  useEffect(() => {
    if (isOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !isLoading) onClose(); };
    if (isOpen) window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [isOpen, isLoading, onClose]);

  useEffect(() => () => { if (stageTimer.current) clearInterval(stageTimer.current); }, []);

  // Live validation statuses
  const emailStatus = email.length === 0 ? "idle" : isValidEmail(email) ? "valid" : "invalid";
  const usernameStatus = username.length === 0 ? "idle" : isValidUsername(username) ? "valid" : "invalid";
  const phoneStatus = phoneNumber.length === 0 ? "idle" : isValidPhone(phoneNumber) ? "valid" : "invalid";
  const strength = useMemo(() => passwordStrength(password), [password]);
  const passwordStatus = password.length === 0 ? "idle" : password.length >= 6 ? "valid" : "invalid";
  const confirmStatus = confirmPassword.length === 0 ? "idle" : confirmPassword === password ? "valid" : "invalid";

  const startStageMessages = (stages: string[]) => {
    let i = 0;
    setLoadingMsg(stages[0]);
    stageTimer.current = setInterval(() => {
      i = Math.min(i + 1, stages.length - 1);
      setLoadingMsg(stages[i]);
    }, 1100);
  };
  const stopStageMessages = () => { if (stageTimer.current) { clearInterval(stageTimer.current); stageTimer.current = null; } setLoadingMsg(""); };

  if (!isOpen) return null;

  const resetForm = () => {
    setEmail(""); setUsername(""); setPassword(""); setConfirmPassword("");
    setName(""); setPhoneNumber(""); setReferralCode(""); setAgreeTerms(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) { setError("Please complete all required fields."); return; }
    if (!isValidEmail(email)) { setError("Please enter a valid email address."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }

    if (mode === "signup") {
      if (!name || !phoneNumber || !username) { setError("Please enter your name, username, and phone number."); return; }
      if (!isValidUsername(username)) { setError("Username must be at least 3 characters (letters, numbers or underscores)."); return; }
      if (!isValidPhone(phoneNumber)) { setError("Please enter a valid phone number (9 to 11 digits)."); return; }
      if (password !== confirmPassword) { setError("Passwords do not match. Please verify."); return; }
      if (!agreeTerms) { setError("Please agree to the Terms & Conditions to continue."); return; }
    }

    setIsLoading(true);
    startStageMessages(mode === "signup" ? SIGNUP_STAGES : LOGIN_STAGES);

    try {
      let res;
      if (mode === "signup") {
        res = await apiFetch("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({ name, email, password, phone: phoneDigits(phoneNumber), username, referralCode: referralCode.trim() || undefined }),
        });
      } else {
        res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      }

      setSessionToken(res.token);
      stopStageMessages();
      setIsLoading(false);
      const wasSignup = mode === "signup";
      onSuccess({ name: res.user.name, email: res.user.email, wallet_balance: res.user.wallet_balance, role: res.user.role, username: res.user.username, phone: res.user.phone }, { isNew: wasSignup });
      onClose();
      resetForm();
    } catch (e: any) {
      stopStageMessages();
      setIsLoading(false);
      setError(friendlyAuthError(e.message, mode));
    }
  };

  // Forgot Password Steps Handlers
  const handleForgotPasswordStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    if (!email) { setError("Please enter your email address."); return; }
    if (!isValidEmail(email)) { setError("Please enter a valid email address."); return; }
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
      setIsLoading(false);
      setSuccessMsg(res.message);
      setForgotStep(2);
    } catch (e: any) {
      setIsLoading(false);
      setError(friendlyAuthError(e.message, "forgot"));
    }
  };

  const handleForgotPasswordStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    if (!resetCode) { setError("Please enter the 6-digit verification code."); return; }
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/auth/verify-reset-code", { method: "POST", body: JSON.stringify({ email, code: resetCode }) });
      setIsLoading(false);
      setSuccessMsg(res.message);
      setForgotStep(3);
    } catch (e: any) {
      setIsLoading(false);
      setError(friendlyAuthError(e.message, "forgot"));
    }
  };

  const handleForgotPasswordStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setSuccessMsg("");
    if (!newPassword) { setError("Please enter a new password."); return; }
    if (newPassword.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (newPassword !== confirmNewPassword) { setError("New passwords do not match. Please verify."); return; }
    setIsLoading(true);
    try {
      const res = await apiFetch("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ email, code: resetCode, newPassword }) });
      setIsLoading(false);
      toast(res.message || "Your password has been updated successfully!", "success");
      setMode("login");
      setForgotStep(1);
      setResetCode(""); setNewPassword(""); setConfirmNewPassword("");
      setError(""); setSuccessMsg("");
    } catch (e: any) {
      setIsLoading(false);
      setError(friendlyAuthError(e.message, "forgot"));
    }
  };

  const switchMode = (next: "login" | "signup") => { setMode(next); setError(""); setSuccessMsg(""); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-inter overflow-y-auto" role="dialog" aria-modal="true" aria-label={mode === "signup" ? "Create account" : mode === "forgot" ? "Reset password" : "Log in"}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md transition-opacity duration-300" onClick={() => !isLoading && onClose()} />

      {/* Modal Container */}
      <div className="relative w-full max-w-md max-h-[92vh] overflow-y-auto overflow-x-hidden rounded-3xl glass-panel border border-purple-500/30 p-6 sm:p-8 shadow-2xl animate-sheet-up custom-scrollbar-thin">

        {/* Glow orbs */}
        <div className="absolute -top-12 -right-12 h-36 w-36 rounded-full bg-purple-500/20 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-cyan-500/20 blur-2xl pointer-events-none" />

        {/* Close */}
        <button
          onClick={() => !isLoading && onClose()}
          aria-label="Close"
          className="absolute top-4 right-4 text-purple-200/50 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60 z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ——— LOGIN / SIGNUP ——— */}
        {mode !== "forgot" && (
          <>
            <div className="text-center mb-6">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 border border-purple-500/25 mb-3">
                <ShieldCheck className="h-5 w-5 text-purple-300" />
              </div>
              <h3 className="text-2xl font-bold font-space tracking-tight text-white">
                {mode === "login" ? "Welcome Back" : "Create Your Account"}
              </h3>
              <p className="text-xs text-purple-200/50 mt-1">
                {mode === "login" ? "Log in to your Aurevashop dashboard" : "Join Aurevashop in just a few seconds"}
              </p>
            </div>

            {/* Segmented mode switch */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/40 border border-purple-500/15 mb-5" role="tablist">
              <button
                type="button" role="tab" aria-selected={mode === "login"}
                onClick={() => switchMode("login")}
                className={`py-2 rounded-lg text-xs font-bold font-space transition-all cursor-pointer ${mode === "login" ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-md" : "text-purple-200/60 hover:text-white"}`}
              >
                Log In
              </button>
              <button
                type="button" role="tab" aria-selected={mode === "signup"}
                onClick={() => switchMode("signup")}
                className={`py-2 rounded-lg text-xs font-bold font-space transition-all cursor-pointer ${mode === "signup" ? "bg-gradient-to-r from-purple-600 to-cyan-500 text-white shadow-md" : "text-purple-200/60 hover:text-white"}`}
              >
                Create Account
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 flex items-start gap-2 animate-toast-shake" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {mode === "signup" && (
                <>
                  <Field
                    id="auth-username" label="Unique Username" icon={<User className="h-4 w-4" />} value={username}
                    onChange={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    required autoComplete="username" status={usernameStatus}
                    hint={username.length === 0 ? "Letters, numbers & underscores" : usernameStatus === "valid" ? "Looks good" : "At least 3 characters (a-z, 0-9, _)"}
                  />
                  <Field
                    id="auth-name" label="Full Name" icon={<User className="h-4 w-4" />} value={name}
                    onChange={setName} required autoComplete="name"
                    status={name.length === 0 ? "idle" : name.trim().length >= 2 ? "valid" : "invalid"}
                  />
                  <Field
                    id="auth-phone" label="Phone Number" icon={<Phone className="h-4 w-4" />} value={phoneNumber}
                    onChange={(v) => setPhoneNumber(v.replace(/[^\d]/g, ""))}
                    required autoComplete="tel" inputMode="numeric" maxLength={11} status={phoneStatus}
                    hint={phoneNumber.length === 0 ? "9 to 11 digits" : phoneStatus === "valid" ? "Valid phone number" : `${phoneDigits(phoneNumber).length} digits — needs 9 to 11`}
                  />
                </>
              )}

              <Field
                id="auth-email" label="Email Address" type="email" icon={<Mail className="h-4 w-4" />} value={email}
                onChange={setEmail} required autoComplete="email" inputMode="email" status={emailStatus}
                hint={email.length === 0 ? undefined : emailStatus === "valid" ? "Valid email" : "Invalid email format"}
              />

              <Field
                id="auth-password" label="Password" type={showPassword ? "text" : "password"} icon={<Lock className="h-4 w-4" />}
                value={password} onChange={setPassword} required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                status={mode === "signup" ? passwordStatus : "idle"}
                trailing={
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}
                    className="text-purple-200/40 hover:text-purple-200/80 transition-all active:scale-90 cursor-pointer">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              {/* Password strength (signup only) */}
              {mode === "signup" && password.length > 0 && (
                <div className="space-y-1.5 px-0.5 animate-fade-up">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i < strength.score ? strength.bar : "bg-white/10"}`} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`font-bold ${strength.color}`}>{strength.label}</span>
                    <span className={`flex items-center gap-1 ${password.length >= 6 ? "text-emerald-400" : "text-purple-200/40"}`}>
                      {password.length >= 6 ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border border-current" />}
                      At least 6 characters
                    </span>
                  </div>
                </div>
              )}

              {mode === "signup" && (
                <Field
                  id="auth-confirm" label="Confirm Password" type="password" icon={<Lock className="h-4 w-4" />}
                  value={confirmPassword} onChange={setConfirmPassword} required autoComplete="new-password" status={confirmStatus}
                  hint={confirmPassword.length === 0 ? undefined : confirmStatus === "valid" ? "Passwords match" : "Passwords don't match"}
                />
              )}

              {mode === "signup" && (
                <Field
                  id="auth-referral" label="Referral Code (optional)" icon={<Key className="h-4 w-4" />}
                  value={referralCode} onChange={(v) => setReferralCode(v.trim())}
                  hint={referralCode ? "You'll both earn rewards 🎉" : "Have a friend's code? Enter it to earn bonuses."}
                />
              )}

              {mode === "signup" ? (
                <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                  <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-purple-500/20 bg-black/40 text-purple-600 focus:ring-purple-500 focus:ring-offset-black cursor-pointer" />
                  <span className="text-[11px] text-purple-200/60 leading-tight">
                    I agree to the <a href="#" className="text-cyan-400 hover:underline">Terms of Service</a> and <a href="#" className="text-cyan-400 hover:underline">Privacy Policy</a>.
                  </span>
                </label>
              ) : (
                <div className="flex items-center justify-between pt-0.5 select-none">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-purple-500/20 bg-black/40 text-purple-600 focus:ring-purple-500 focus:ring-offset-black cursor-pointer" />
                    <span className="text-xs text-purple-200/60">Keep me logged in</span>
                  </label>
                  <button type="button" onClick={() => { setMode("forgot"); setForgotStep(1); setError(""); setSuccessMsg(""); }}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer">
                    Forgot Password?
                  </button>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit" disabled={isLoading}
                className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 py-3.5 text-sm font-bold font-space text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-80 disabled:pointer-events-none mt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="animate-spin h-4 w-4" />
                    <span>{loadingMsg || (mode === "login" ? "Signing you in…" : "Creating account…")}</span>
                  </span>
                ) : (
                  <>
                    <span>{mode === "login" ? "Sign In Securely" : "Create Free Account"}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </form>

            {/* Bottom toggle */}
            <div className="text-center mt-5 pt-4 border-t border-purple-500/10">
              <p className="text-xs text-purple-200/50">
                {mode === "login" ? "Don't have an account yet?" : "Already have an account?"}{" "}
                <button
                  onClick={() => { switchMode(mode === "login" ? "signup" : "login"); toggleType(); }}
                  type="button"
                  className="text-cyan-400 hover:text-cyan-300 font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer inline-flex items-center gap-1"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>{mode === "login" ? "Create Account" : "Sign In"}</span>
                </button>
              </p>
            </div>
          </>
        )}

        {/* ——— FORGOT PASSWORD ——— */}
        {mode === "forgot" && (
          <div className="space-y-4">
            <div className="text-center mb-6">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500/20 to-cyan-500/20 border border-purple-500/25 mb-3">
                <Key className="h-5 w-5 text-purple-300" />
              </div>
              <h3 className="text-2xl font-bold font-space tracking-tight text-white">
                {forgotStep === 1 && "Reset Password"}
                {forgotStep === 2 && "Enter Reset Code"}
                {forgotStep === 3 && "Choose New Password"}
              </h3>
              <p className="text-xs text-purple-200/50 mt-1">
                {forgotStep === 1 && "Enter your email to receive a 6-digit verification code"}
                {forgotStep === 2 && `We sent a secure code to ${email}`}
                {forgotStep === 3 && "Secure your account with a strong password"}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-xs text-red-300 flex items-start gap-2 animate-toast-shake" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{error}</span>
              </div>
            )}
            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-start gap-2">
                <Check className="h-4 w-4 shrink-0 mt-0.5" /> <span>{successMsg}</span>
              </div>
            )}

            {forgotStep === 1 && (
              <form onSubmit={handleForgotPasswordStep1} className="space-y-4">
                <Field id="forgot-email" label="Email Address" type="email" icon={<Mail className="h-4 w-4" />} value={email}
                  onChange={setEmail} required inputMode="email" status={emailStatus} />
                <SubmitBtn isLoading={isLoading} label="Send Verification Code" loadingLabel="Sending code…" />
              </form>
            )}

            {forgotStep === 2 && (
              <form onSubmit={handleForgotPasswordStep2} className="space-y-4">
                <div className="relative flex items-center rounded-xl bg-black/40 border border-purple-500/20 focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/25 transition-colors">
                  <span className="absolute left-3.5 text-purple-200/40"><ShieldCheck className="h-4 w-4" /></span>
                  <input type="text" inputMode="numeric" maxLength={6} value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" required
                    aria-label="Verification code"
                    className="w-full pl-10 pr-4 py-3 bg-transparent text-sm text-white placeholder-purple-200/30 tracking-[0.5em] font-mono text-center focus:outline-none rounded-xl" />
                </div>
                <SubmitBtn isLoading={isLoading} label="Verify Code" loadingLabel="Verifying…" />
                <div className="text-center">
                  <button type="button" onClick={() => { setForgotStep(1); setError(""); setSuccessMsg(""); }}
                    className="text-xs text-cyan-400 hover:underline bg-transparent border-none cursor-pointer">Change Email</button>
                </div>
              </form>
            )}

            {forgotStep === 3 && (
              <form onSubmit={handleForgotPasswordStep3} className="space-y-4">
                <Field id="new-pass" label="New Password" type={showPassword ? "text" : "password"} icon={<Lock className="h-4 w-4" />}
                  value={newPassword} onChange={setNewPassword} required
                  status={newPassword.length === 0 ? "idle" : newPassword.length >= 6 ? "valid" : "invalid"}
                  hint={newPassword.length === 0 ? "At least 6 characters" : newPassword.length >= 6 ? "Strong enough" : "Needs at least 6 characters"}
                  trailing={
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Hide password" : "Show password"}
                      className="text-purple-200/40 hover:text-purple-200/80 active:scale-90 cursor-pointer">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  } />
                <Field id="new-pass-confirm" label="Confirm New Password" type="password" icon={<Lock className="h-4 w-4" />}
                  value={confirmNewPassword} onChange={setConfirmNewPassword} required
                  status={confirmNewPassword.length === 0 ? "idle" : confirmNewPassword === newPassword ? "valid" : "invalid"}
                  hint={confirmNewPassword.length === 0 ? undefined : confirmNewPassword === newPassword ? "Passwords match" : "Passwords don't match"} />
                <SubmitBtn isLoading={isLoading} label="Reset Password" loadingLabel="Saving password…" />
              </form>
            )}

            <button type="button" onClick={() => { setMode("login"); setForgotStep(1); setError(""); setSuccessMsg(""); }}
              className="mt-4 text-xs text-purple-300 hover:text-white flex items-center justify-center gap-1.5 mx-auto hover:underline bg-transparent border-none cursor-pointer">
              <ArrowLeft className="h-3.5 w-3.5" /> <span>Back to Login</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SubmitBtn({ isLoading, label, loadingLabel }: { isLoading: boolean; label: string; loadingLabel: string }) {
  return (
    <button type="submit" disabled={isLoading}
      className="relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 py-3.5 text-sm font-bold font-space text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 hover:brightness-110 active:scale-[0.98] transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-80 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
      {isLoading ? <><Loader2 className="animate-spin h-4 w-4" /> <span>{loadingLabel}</span></> : <><span>{label}</span> <ArrowRight className="h-4 w-4" /></>}
    </button>
  );
}
