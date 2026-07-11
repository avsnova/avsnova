import { useState, useEffect } from "react";
import { User, ShieldCheck, Save, Send, Key } from "lucide-react";
import { Card, Button, Input, Badge } from "../ui/shadcn";
import { apiFetch } from "../../utils/api";

interface ProfileViewProps {
  userName: string;
  userEmail: string;
  userPhone: string;
  onRefreshUser?: () => void;
}

export default function ProfileView({ userName, userEmail, userPhone, onRefreshUser }: ProfileViewProps) {
  const [profileName, setProfileName] = useState(userName);
  const [profileEmail, setProfileEmail] = useState(userEmail);
  const [profilePhone, setProfilePhone] = useState(userPhone);
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // Security Password OTP flows
  const [newPassword, setNewPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpCodeSent] = useState(false);
  const [isLoadingOtp, setIsLoadingOtp] = useState(false);
  const [isLoadingPass, setIsLoadingPass] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    setProfileName(userName);
    setProfileEmail(userEmail);
    setProfilePhone(userPhone);
  }, [userName, userEmail, userPhone]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingInfo(true);
    setErrorMsg("");
    setMessage("");

    try {
      await apiFetch("/api/profile/update", {
        method: "POST",
        body: JSON.stringify({
          name: profileName,
          email: profileEmail,
          phone: profilePhone,
          currentPassword: confirmPassword
        }),
      });
      setMessage("Personal information updated successfully.");
      setConfirmPassword("");
      if (onRefreshUser) onRefreshUser();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to update profile.");
    } finally {
      setIsLoadingInfo(false);
    }
  };

  const handleRequestOtp = async () => {
    setIsLoadingOtp(true);
    setErrorMsg("");
    setMessage("");
    try {
      const res = await apiFetch("/api/profile/request-password-otp", {
        method: "POST"
      });
      setOtpCodeSent(true);
      setMessage(res.message || "A secure security OTP code has been dispatched to your email.");
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to request security OTP.");
    } finally {
      setIsLoadingOtp(false);
    }
  };

  const handleSavePass = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingPass(true);
    setErrorMsg("");
    setMessage("");

    if (!newPassword || !otpCode) {
      setErrorMsg("New password and security OTP code are required.");
      setIsLoadingPass(false);
      return;
    }

    try {
      const res = await apiFetch("/api/profile/update-password", {
        method: "POST",
        body: JSON.stringify({ otp: otpCode, newPassword }),
      });
      setMessage(res.message || "Password updated successfully.");
      setNewPassword("");
      setOtpCode("");
      setOtpCodeSent(false);
    } catch (err: any) {
      setErrorMsg(err.message || "Password update failed. Please check your OTP.");
    } finally {
      setIsLoadingPass(false);
    }
  };

  return (
    <div className="space-y-8 font-inter">
      
      {/* ——— HEADER ——— */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1 font-space">
          <User className="h-4 w-4" />
          <span>Aurea Core Identity Verification</span>
        </div>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold font-space text-white">Profile & Security Settings</h2>
        <p className="text-xs md:text-sm text-purple-200/60 mt-1 max-w-2xl">
          Configure your personal identity profile, update security credentials with real-time OTP confirmation, and manage your contact settings.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {errorMsg}
        </div>
      )}

      {message && (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          {message}
        </div>
      )}

      {/* ——— TWO COLUMNS: PERSONAL INFO & CHANGE PASSWORD ——— */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        
        {/* Personal Information */}
        <Card className="space-y-6">
          <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-md">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-space tracking-tight">Personal Profile</h3>
                <p className="text-xs text-purple-200/50">Primary contact parameters</p>
              </div>
            </div>
            <Badge variant="success">Verified Identity</Badge>
          </div>

          <form onSubmit={handleSaveInfo} className="space-y-4">
            <Input label="Full Name" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
            <Input label="Email Address" type="email" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required />
            
            {profileEmail.toLowerCase().trim() !== userEmail.toLowerCase().trim() && (
              <Input 
                label="Confirm Current Password to Authorize Email Change" 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                placeholder="Enter your current password..." 
                required 
              />
            )}

            <Input label="Phone Number" type="tel" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} placeholder="+234 816 555 1234" />
            
            <Button type="submit" size="lg" isLoading={isLoadingInfo} className="w-full flex items-center justify-center gap-2 mt-2">
              <Save className="h-4 w-4" />
              <span>Save Profile Changes</span>
            </Button>
          </form>
        </Card>

        {/* Security & Change Password (OTP-verified) */}
        <Card className="space-y-6">
          <div className="flex items-center justify-between border-b border-purple-500/15 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shadow-md">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white font-space tracking-tight">Security & Encryption</h3>
                <p className="text-xs text-purple-200/50">Protect credentials using OTP pings</p>
              </div>
            </div>
            <Badge variant="info">TLS 1.3 Active</Badge>
          </div>

          {!otpSent ? (
            <div className="space-y-4 text-center py-6">
              <Key className="h-12 w-12 text-cyan-400/20 mx-auto animate-pulse" />
              <p className="text-xs sm:text-sm text-purple-200/60 leading-relaxed max-w-xs mx-auto">
                Updating your account password requires a secure 6-digit OTP code sent to your registered email address.
              </p>
              <Button 
                onClick={handleRequestOtp} 
                isLoading={isLoadingOtp}
                className="w-full flex items-center justify-center gap-2 mt-2"
              >
                <Send className="h-4 w-4" />
                <span>Request Security OTP Code</span>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSavePass} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-purple-200/70 font-space block">Security OTP Code</label>
                <input
                  type="text"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  required
                  className="w-full px-4 py-2.5 bg-black/40 border border-cyan-500/30 rounded-xl text-center font-mono tracking-widest text-white placeholder-purple-200/20 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all"
                />
              </div>

              <Input 
                label="New Secure Password" 
                type="password" 
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)} 
                placeholder="••••••••••••" 
                required 
              />
              
              <div className="flex gap-3 mt-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setOtpCodeSent(false)} 
                  className="flex-1 text-xs"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  isLoading={isLoadingPass} 
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Update Password</span>
                </Button>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}