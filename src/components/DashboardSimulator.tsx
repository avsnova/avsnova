import React, { useState, useEffect, useRef } from "react";
import { 
  Sparkles, Video, TrendingUp, ShoppingBag, FileText, 
  CheckCircle2, AlertCircle, ArrowRight, Shield, Copy, 
  RefreshCw, Smartphone, Play, Pause, Download, ChevronRight
} from "lucide-react";
import { copyToClipboard } from "../utils/clipboard";

// Product interface for Marketplace
interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  icon: string;
}

const PRODUCTS: Product[] = [
  { id: "canva", name: "Canva Pro (1 Year)", category: "Design", price: 3500, icon: "🎨" },
  { id: "spotify", name: "Spotify Premium (6 Months)", category: "Entertainment", price: 2000, icon: "🎵" },
  { id: "office", name: "Microsoft Office 2024 Pro", category: "Utility", price: 4500, icon: "💼" },
  { id: "steam", name: "Steam Gift Card ($10)", category: "Gaming", price: 8000, icon: "🎮" },
];

interface DashboardSimulatorProps {
  initialTab?: number;
  userName?: string;
}

export default function DashboardSimulator({ initialTab = 3, userName = "Guest" }: DashboardSimulatorProps) {
  const [activeTab, setActiveTab] = useState(3);
  const [apiQuota, setApiQuota] = useState(15000); // Standard SaaS API Unit Quota
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Sync activeTab with initialTab prop if it changes
  useEffect(() => {
    setActiveTab(initialTab === 1 || initialTab === 2 ? 4 : initialTab);
  }, [initialTab]);

  // Toast notifications
  const [notifications, setNotifications] = useState<{ id: number; message: string; type: "success" | "info" | "warning" }[]>([]);
  const addNotification = (message: string, type: "success" | "info" | "warning" = "success") => {
    const id = Date.now();
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 4000);
  };

  const handleCopy = async (text: string, label: string) => {
    const ok = await copyToClipboard(text);
    setCopiedText(text);
    addNotification(ok ? `${label} copied to clipboard!` : `Copy failed — copy manually`, ok ? "success" : "warning");
    setTimeout(() => setCopiedText(null), 2000);
  };

  // ——— TAB 1: AI IMAGE STUDIO STATE ———
  const [imagePrompt, setImagePrompt] = useState("A futuristic banking application layout, 3D glassmorphism interface, purple and neon cyan glows, extremely high detail, fintech design style");
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [imgProgress, setImgProgress] = useState(0);
  const [imgResult, setImgResult] = useState<boolean>(false);
  const [selectedStyle, setSelectedStyle] = useState("3D Cyberpunk");

  const handleGenerateImage = () => {
    setIsGeneratingImg(true);
    setImgProgress(0);
    setImgResult(false);
    setApiQuota(prev => Math.max(0, prev - 250));
    const interval = setInterval(() => {
      setImgProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsGeneratingImg(false);
          setImgResult(true);
          addNotification("AI image generated successfully! (250 API Units used)", "success");
          return 100;
        }
        return prev + 5;
      });
    }, 120);
  };

  // ——— TAB 2: AI VIDEO STUDIO STATE ———
  const [videoPrompt, setVideoPrompt] = useState("Cinematic slow motion of digital coins cascading into a glowing vault, high fidelity, 4k resolution");
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoResult, setVideoResult] = useState(false);
  const [isPlayingVideo, setIsPlayingVideo] = useState(true);

  const handleGenerateVideo = () => {
    setIsVideoGenerating(true);
    setVideoProgress(0);
    setVideoResult(false);
    setApiQuota(prev => Math.max(0, prev - 800));
    const interval = setInterval(() => {
      setVideoProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsVideoGenerating(false);
          setVideoResult(true);
          addNotification("AI video rendered successfully! (800 API Units used)", "success");
          return 100;
        }
        return prev + 4;
      });
    }, 150);
  };

  // ——— TAB 3: VIRTUAL NUMBER STATE ———
  const [otpCountry, setOtpCountry] = useState("us");
  const [otpService, setOtpService] = useState("telegram");
  const [isOtpRequesting, setIsOtpRequesting] = useState(false);
  const [virtualNumber, setVirtualNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);
  const timerRef = useRef<any>(null);

  const handleRequestNumber = () => {
    const serviceCosts: Record<string, number> = { whatsapp: 800, telegram: 600, google: 500 };
    const cost = serviceCosts[otpService] || 500;
    setIsOtpRequesting(true);
    setVirtualNumber("");
    setOtpCode("");
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeout(() => {
      setApiQuota(prev => Math.max(0, prev - cost));
      setIsOtpRequesting(false);
      
      let num = "";
      if (otpCountry === "us") num = `+1 (201) 555-0${Math.floor(100 + Math.random() * 900)}`;
      else if (otpCountry === "uk") num = `+44 7911 12${Math.floor(100 + Math.random() * 900)}`;
      else num = `+234 816 555 ${Math.floor(1000 + Math.random() * 9000)}`;
      
      setVirtualNumber(num);
      addNotification(`Virtual number allocated! (${cost} API Units used)`, "success");
      
      setOtpTimer(60);
      addNotification("Waiting for verification code...", "info");
      let timeRemaining = 60;
      timerRef.current = setInterval(() => {
        timeRemaining -= 1;
        setOtpTimer(timeRemaining);
        
        if (timeRemaining === 52) {
          const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
          setOtpCode(generatedOtp);
          addNotification(`OTP Verification Code Received: ${generatedOtp}`, "success");
          if (timerRef.current) clearInterval(timerRef.current);
        }
        if (timeRemaining <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
        }
      }, 1000);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ——— TAB 4: SMM PANEL STATE ———
  const [smmPlatform, setSmmPlatform] = useState("instagram");
  const [smmService, setSmmService] = useState("followers");
  const [smmQuantity, setSmmQuantity] = useState("1000");
  const [isSmmBoosting, setIsSmmBoosting] = useState(false);
  const [smmProgressCount, setSmmProgressCount] = useState(1240);
  const [smmTargetCount, setSmmTargetCount] = useState(1240);

  const handleSmmBoost = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(smmQuantity);
    if (isNaN(qty) || qty < 100) {
      addNotification("Minimum order quantity is 100", "warning");
      return;
    }
    const ratePer1000 = smmService === "followers" ? 1200 : smmService === "likes" ? 400 : 250;
    const cost = Math.round((qty / 1000) * ratePer1000);
    setIsSmmBoosting(true);
    setApiQuota(prev => Math.max(0, prev - cost));
    addNotification(`Boost campaign launched! (${cost} API Units used)`, "success");
    const startVal = 1240;
    const targetVal = startVal + qty;
    setSmmProgressCount(startVal);
    setSmmTargetCount(targetVal);
    // Dynamic scale-up simulation
    let current = startVal;
    const steps = 40;
    const stepSize = Math.ceil(qty / steps);
    const interval = setInterval(() => {
      current += stepSize;
      if (current >= targetVal) {
        current = targetVal;
        clearInterval(interval);
        setIsSmmBoosting(false);
        addNotification("Growth boost campaign completed successfully!", "success");
      }
      setSmmProgressCount(current);
    }, 80);
  };

  // ——— TAB 5: MARKETPLACE STATE ———
  const [isPurchasingProd, setIsPurchasingProd] = useState<string | null>(null);
  const [purchasedKeys, setPurchasedKeys] = useState<{ prodId: string; key: string; name: string }[]>([]);

  const handleBuyProduct = (product: Product) => {
    setIsPurchasingProd(product.id);
    setTimeout(() => {
      setApiQuota(prev => Math.max(0, prev - 500));
      setIsPurchasingProd(null);
      
      // Generate serial key
      const randomHex = () => Math.floor(1000 + Math.random() * 9000).toString(16).toUpperCase();
      const serialKey = `AVS-${product.id.toUpperCase()}-${randomHex()}-${randomHex()}-${randomHex()}`;
      
      setPurchasedKeys(prev => [{ prodId: product.id, key: serialKey, name: product.name }, ...prev]);
      addNotification(`License key generated for ${product.name}!`, "success");
    }, 1500);
  };


  return (
    <div className="relative w-full rounded-2xl glass-panel border border-purple-500/20 overflow-hidden shadow-2xl flex flex-col md:flex-row min-h-[600px]">
      
      {/* Dynamic Notifications overlay */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {notifications.map(n => (
          <div 
            key={n.id} 
            className={`pointer-events-auto p-3 rounded-xl border flex items-start gap-2 text-xs shadow-lg transition-all duration-300 animate-float ${
              n.type === "success" 
                ? "bg-purple-950/90 border-purple-500/40 text-purple-200" 
                : n.type === "warning"
                ? "bg-amber-950/90 border-amber-500/40 text-amber-200"
                : "bg-cyan-950/90 border-cyan-500/40 text-cyan-200"
            }`}
          >
            {n.type === "success" && <CheckCircle2 className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />}
            {n.type === "warning" && <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />}
            {n.type === "info" && <RefreshCw className="h-4 w-4 text-cyan-400 shrink-0 animate-spin mt-0.5" />}
            <span>{n.message}</span>
          </div>
        ))}
      </div>

      {/* ——— SIDEBAR TABS ——— */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-purple-500/15 bg-black/40 p-4 shrink-0 flex flex-col justify-between">
        <div>
          {/* User Card */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-purple-900/10 border border-purple-500/10 mb-5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center font-bold text-white text-sm shadow-md">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden">
              <div className="text-xs text-purple-200/50 flex items-center gap-1 font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Sandbox Session</span>
              </div>
              <div className="text-sm font-bold text-white truncate font-space">
                {userName === "Guest" ? "Demo Account" : userName}
              </div>
            </div>
          </div>

          {/* Sidebar API Quota Display */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 to-cyan-950/20 border border-purple-500/20 mb-6 shadow-inner relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-1 bg-purple-500/10 rounded-bl-xl border-l border-b border-purple-500/15 text-[9px] text-purple-300 font-semibold tracking-wider uppercase">
              Trial Plan
            </div>
            <div className="text-xs text-purple-300/70 font-semibold uppercase tracking-wider">API Quota Units</div>
            <div className="text-2xl font-bold font-space text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-white to-cyan-200 mt-1 flex items-baseline gap-1">
              <span>{apiQuota.toLocaleString()}</span>
              <span className="text-xs font-normal text-purple-300/60">/ 15,000</span>
            </div>
            <div className="mt-3 w-full bg-purple-950/60 rounded-full h-1.5 overflow-hidden border border-purple-500/20">
              <div 
                className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full transition-all duration-300"
                style={{ width: `${(apiQuota / 15000) * 100}%` }}
              />
            </div>
          </div>

          {/* Service Selector Tabs */}
          <div className="space-y-1.5 md:space-y-1 overflow-x-auto md:overflow-x-visible flex md:flex-col pb-2 md:pb-0 custom-scrollbar-thin gap-2 md:gap-0">
            {[
              { id: 3, name: "SMS OTP Activations", icon: Smartphone, tag: "Numbers" },
              { id: 4, name: "SMM Growth Panel", icon: TrendingUp, tag: "Socials" },
              { id: 5, name: "Digital Software", icon: ShoppingBag, tag: "Keys" },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-3 px-3.5 py-3 rounded-xl text-left text-xs font-semibold transition-all shrink-0 md:shrink-1 cursor-pointer ${
                    isActive
                      ? "bg-purple-500/20 border-l-2 border-l-purple-500 border border-y-purple-500/20 border-r-purple-500/20 text-white shadow-md shadow-purple-500/5"
                      : "text-purple-200/60 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <Icon className={`h-4.5 w-4.5 shrink-0 ${isActive ? "text-purple-400" : "text-purple-300/40"}`} />
                  <span className="flex-1 truncate hidden sm:inline md:inline">{tab.name}</span>
                  <span className="hidden md:inline px-1.5 py-0.5 rounded-full bg-purple-500/10 text-[9px] text-cyan-400 border border-purple-500/10 font-bold uppercase shrink-0">
                    {tab.tag}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden md:block text-[10px] text-purple-200/40 border-t border-purple-500/10 pt-3 mt-4">
          Interactive Web Sandbox · v2.4
        </div>
      </div>

      {/* ——— SIMULATOR SCREEN ——— */}
      <div className="flex-1 p-6 md:p-8 bg-black/20 flex flex-col justify-between relative overflow-hidden">
        {/* Decorative Grid backdrop in screen */}
        <div className="absolute inset-0 digital-grid opacity-15 pointer-events-none" />
        <div className="relative z-10 flex-1 flex flex-col">
          
          {/* TAB 1: AI IMAGE STUDIO SIMULATION */}
          {activeTab === 1 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Creative Suite</span>
                </div>
                <h3 className="text-2xl font-bold font-space text-white">AI Image Studio</h3>
                <p className="text-xs text-purple-200/60 mt-1">
                  Generate professional digital illustrations, logos, and high-fidelity concept artwork with simple text prompts.
                </p>
              </div>

              {/* Grid: Prompt and Output */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-1">
                {/* Left controls */}
                <div className="space-y-4 flex flex-col justify-center">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-purple-200/70">Image Description (Prompt)</label>
                    <textarea
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      rows={3}
                      className="w-full p-3 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 transition-all resize-none leading-relaxed"
                    />
                  </div>

                  {/* Style selector */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-purple-200/70">Creative Style</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {["3D Cyberpunk", "Photo Realistic", "Anime Sketch", "Abstract Neon", "Oil Paint", "Minimal Line"].map(style => (
                        <button
                          key={style}
                          type="button"
                          onClick={() => setSelectedStyle(style)}
                          className={`py-1.5 px-2 rounded-lg border text-[10px] font-semibold text-center transition-all cursor-pointer ${
                            selectedStyle === style 
                              ? "bg-purple-500/15 border-purple-500 text-white" 
                              : "bg-black/30 border-purple-500/10 text-purple-200/50 hover:text-purple-200"
                          }`}
                        >
                          {style}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-purple-500/5 border border-purple-500/10 rounded-xl p-3">
                    <span className="text-[11px] text-purple-200/60">Execution Cost: <span className="font-bold text-white">250 Units</span></span>
                    <button
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImg}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-xs font-bold text-white hover:brightness-110 active:scale-[0.95] transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingImg ? "Generating..." : "Generate Artwork"}
                      <Sparkles className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Right output */}
                <div className="rounded-xl border border-purple-500/20 bg-black/40 relative overflow-hidden flex items-center justify-center min-h-[220px] shadow-inner">
                  {/* Status Indicator */}
                  {!isGeneratingImg && !imgResult && (
                    <div className="text-center p-6 space-y-2">
                      <Sparkles className="h-8 w-8 text-purple-400/30 mx-auto animate-pulse" />
                      <p className="text-xs font-semibold text-purple-200/50">Ready for generation</p>
                      <p className="text-[10px] text-purple-200/30 max-w-[200px] mx-auto">Fill prompt and click Generate. Image will display here.</p>
                    </div>
                  )}

                  {isGeneratingImg && (
                    <div className="text-center p-6 space-y-3 w-full max-w-[240px]">
                      <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-500/20">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-100"
                          style={{ width: `${imgProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-purple-200/60 font-semibold">
                        <span>{imgProgress < 30 ? "Analyzing..." : imgProgress < 70 ? "Generating layers..." : "Polishing..."}</span>
                        <span>{imgProgress}%</span>
                      </div>
                    </div>
                  )}

                  {imgResult && !isGeneratingImg && (
                    <div className="absolute inset-0 flex flex-col justify-between p-3 animate-float">
                      {/* Premium CSS abstract art simulation representing the prompt */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-purple-950 via-purple-900/40 to-cyan-950/40 opacity-40 z-0" />
                      
                      {/* Generative art visual block */}
                      <div className="absolute inset-4 rounded-lg border border-purple-500/30 overflow-hidden bg-[#0d0720] flex items-center justify-center">
                        {/* Dynamic decorative visual mimicking high-end 3D art */}
                        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                          <div className="absolute w-40 h-40 rounded-full bg-purple-500/20 blur-xl animate-pulse-slow" />
                          <div className="absolute w-24 h-24 rounded-full bg-cyan-500/20 blur-xl animate-drift" />
                          
                          {/* Simulated 3D Coin/Interface */}
                          <div className="relative z-10 w-28 h-28 rounded-2xl border border-white/15 bg-white/5 backdrop-blur-md shadow-2xl flex flex-col justify-between p-3 transform rotate-6 hover:rotate-0 transition-transform duration-500">
                            <div className="flex justify-between items-start">
                              <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-purple-500 to-cyan-500 flex items-center justify-center">
                                <Shield className="h-3 w-3 text-white" />
                              </div>
                              <span className="text-[8px] font-bold text-cyan-400 px-1.5 rounded bg-cyan-500/10 border border-cyan-500/25">AVS ASSET</span>
                            </div>
                            <div>
                              <div className="text-[8px] text-white/50 uppercase font-semibold">Mock Asset</div>
                              <div className="text-sm font-bold font-space text-white">$24,852.12</div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Overlaid prompt info */}
                      <div className="relative z-10 bg-black/60 backdrop-blur-md border border-white/10 rounded-lg p-2 flex justify-between items-center w-full mt-auto">
                        <div className="truncate pr-4">
                          <p className="text-[9px] text-purple-200/50 font-bold uppercase">Prompt Result</p>
                          <p className="text-[10px] text-white truncate max-w-[150px]">{imagePrompt}</p>
                        </div>
                        <button 
                          onClick={() => addNotification("High-res art downloaded to simulator storage!", "success")}
                          className="p-1.5 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: AI VIDEO STUDIO SIMULATION */}
          {activeTab === 2 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1">
                  <Video className="h-3.5 w-3.5" />
                  <span>Cinematic Suite</span>
                </div>
                <h3 className="text-2xl font-bold font-space text-white">AI Video Studio</h3>
                <p className="text-xs text-purple-200/60 mt-1">
                  Transform short text descriptions into stunning 4-second cinematic video clips, perfect for promos and content reels.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-1">
                {/* Left inputs */}
                <div className="space-y-4 flex flex-col justify-center">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-purple-200/70">Video Scene Description</label>
                    <textarea
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      rows={3}
                      className="w-full p-3 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 transition-all resize-none leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs font-semibold text-purple-200/50">Framerate</label>
                      <select className="w-full mt-1 px-3 py-2 bg-black/40 border border-purple-500/20 rounded-lg text-xs text-purple-200 focus:outline-none focus:border-purple-500">
                        <option>24 FPS (Cinematic)</option>
                        <option>30 FPS (Standard)</option>
                        <option>60 FPS (Ultra-Smooth)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-purple-200/50">Camera Motion</label>
                      <select className="w-full mt-1 px-3 py-2 bg-black/40 border border-purple-500/20 rounded-lg text-xs text-purple-200 focus:outline-none focus:border-purple-500">
                        <option>Slow Pan Right</option>
                        <option>Zoom In</option>
                        <option>Orbital Rotation</option>
                        <option>Dynamic Crane</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-purple-500/5 border border-purple-500/10 rounded-xl p-3">
                    <span className="text-[11px] text-purple-200/60">Execution Cost: <span className="font-bold text-white">800 Units</span></span>
                    <button
                      onClick={handleGenerateVideo}
                      disabled={isVideoGenerating}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-xs font-bold text-white hover:brightness-110 active:scale-[0.95] transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isVideoGenerating ? "Rendering..." : "Render Video"}
                      <Video className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Right Video Mockup */}
                <div className="rounded-xl border border-purple-500/20 bg-black/40 relative overflow-hidden flex items-center justify-center min-h-[220px] shadow-inner">
                  {!isVideoGenerating && !videoResult && (
                    <div className="text-center p-6 space-y-2">
                      <Video className="h-8 w-8 text-purple-400/30 mx-auto animate-pulse" />
                      <p className="text-xs font-semibold text-purple-200/50">Ready for rendering</p>
                      <p className="text-[10px] text-purple-200/30 max-w-[200px] mx-auto">Fill prompt and camera details, then click Render. Preview will appear here.</p>
                    </div>
                  )}

                  {isVideoGenerating && (
                    <div className="text-center p-6 space-y-3 w-full max-w-[240px]">
                      <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-500/20">
                        <div 
                          className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-100"
                          style={{ width: `${videoProgress}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-purple-200/60 font-semibold">
                        <span>{videoProgress < 30 ? "Queuing clip..." : videoProgress < 70 ? "Computing vectors..." : "Compiling H.264..."}</span>
                        <span>{videoProgress}%</span>
                      </div>
                    </div>
                  )}

                  {videoResult && !isVideoGenerating && (
                    <div className="absolute inset-0 flex flex-col justify-between p-3">
                      {/* Premium CSS interactive video simulation */}
                      <div className="absolute inset-4 rounded-lg border border-purple-500/30 overflow-hidden bg-[#0a0515] flex flex-col items-center justify-center">
                        {/* Interactive dynamic background waves simulating video motion */}
                        <div className="absolute inset-0 bg-gradient-to-br from-purple-950/20 to-cyan-950/30 z-0" />
                        
                        <div className="relative z-10 w-full h-full flex flex-col items-center justify-center overflow-hidden">
                          {/* Custom vector animated vault loading effect */}
                          <div className="w-20 h-20 border border-purple-500/20 rounded-full bg-purple-950/30 backdrop-blur-sm flex items-center justify-center shadow-xl animate-float">
                            <div className="w-12 h-12 rounded-full border border-cyan-500/40 bg-cyan-950/40 flex items-center justify-center">
                              <Shield className="h-5 w-5 text-cyan-400 animate-pulse-slow" />
                            </div>
                          </div>

                          {/* Cascade particles */}
                          {isPlayingVideo && (
                            <div className="absolute inset-x-0 top-0 bottom-0 pointer-events-none">
                              {[1, 2, 3, 4, 5, 6].map((idx) => (
                                <span 
                                  key={idx}
                                  className="absolute h-2 w-2 rounded-full bg-cyan-400/60 blur-[1px] animate-bounce"
                                  style={{
                                    left: `${15 + idx * 12}%`,
                                    top: `${(idx * 7) % 80}%`,
                                    animationDuration: `${1 + (idx * 0.2)}s`,
                                    animationDelay: `${idx * 0.1}s`
                                  }}
                                />
                              ))}
                            </div>
                          )}

                          {/* Controls bar */}
                          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between bg-black/70 backdrop-blur-md border border-white/10 rounded-md px-2.5 py-1.5 z-20">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setIsPlayingVideo(!isPlayingVideo)}
                                className="text-white hover:text-purple-400 transition-colors cursor-pointer"
                              >
                                {isPlayingVideo ? <Pause className="h-3.5 w-3.5 fill-white" /> : <Play className="h-3.5 w-3.5 fill-white" />}
                              </button>
                              {/* Video seek bar mockup */}
                              <div className="w-24 sm:w-32 h-1 bg-purple-950 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full bg-purple-500 ${isPlayingVideo ? "w-3/4" : "w-1/2"}`}
                                  style={{ transition: "width 0.2s" }}
                                />
                              </div>
                              <span className="text-[8px] font-mono text-purple-200/50">00:0{isPlayingVideo ? "3" : "2"} / 00:04</span>
                            </div>
                            <button 
                              onClick={() => addNotification("Video downloaded in MP4 format (demo)!", "success")}
                              className="p-1 rounded bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 transition-all text-[8px] font-bold cursor-pointer"
                            >
                              MP4
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SMS VIRTUAL NUMBER SIMULATION */}
          {activeTab === 3 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-cyan-400 font-semibold text-xs uppercase tracking-wider mb-1">
                  <Smartphone className="h-3.5 w-3.5" />
                  <span>Connectivity & Verification</span>
                </div>
                <h3 className="text-2xl font-bold font-space text-white">SMS / Virtual Number Panel</h3>
                <p className="text-xs text-purple-200/60 mt-1">
                  Get high-reliability US, UK, or global virtual numbers for instant OTP verification on WhatsApp, Telegram, Google, and 500+ services.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-1">
                {/* Left input */}
                <div className="space-y-4 flex flex-col justify-center">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-purple-200/70">Select Country</label>
                      <select 
                        value={otpCountry}
                        onChange={(e) => setOtpCountry(e.target.value)}
                        className="w-full px-3 py-2.5 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-purple-200 focus:outline-none focus:border-purple-500 font-semibold"
                      >
                        <option value="us">🇺🇸 United States (500 Units)</option>
                        <option value="uk">🇬🇧 United Kingdom (600 Units)</option>
                        <option value="ng">🇳🇬 Nigeria (800 Units)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-purple-200/70">Select Service</label>
                      <select 
                        value={otpService}
                        onChange={(e) => setOtpService(e.target.value)}
                        className="w-full px-3 py-2.5 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-purple-200 focus:outline-none focus:border-purple-500 font-semibold"
                      >
                        <option value="telegram">Telegram (Fast Delivery)</option>
                        <option value="whatsapp">WhatsApp (Business Support)</option>
                        <option value="google">Google / Gmail Verification</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={handleRequestNumber}
                    disabled={isOtpRequesting}
                    className="w-full py-3 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-xl text-xs font-bold text-white hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 font-space cursor-pointer"
                  >
                    {isOtpRequesting ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span>Allocating Virtual Node...</span>
                      </>
                    ) : (
                      <>
                        <span>Generate Virtual Number</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                {/* Right Output Terminal */}
                <div className="rounded-xl border border-purple-500/20 bg-black/50 p-5 relative overflow-hidden flex flex-col justify-between min-h-[220px] shadow-inner font-mono">
                  {/* Digital Terminal Glow */}
                  <div className="absolute inset-0 bg-cyan-950/5 pointer-events-none" />
                  {!virtualNumber && !isOtpRequesting && (
                    <div className="flex-1 flex flex-col items-center justify-center text-center space-y-2 font-inter">
                      <Smartphone className="h-8 w-8 text-cyan-400/30 animate-pulse" />
                      <p className="text-xs font-semibold text-purple-200/50">Node Standby</p>
                      <p className="text-[10px] text-purple-200/30 max-w-[220px]">Choose country & service, then click Generate to allocate a dedicated secure line.</p>
                    </div>
                  )}

                  {isOtpRequesting && (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-3 font-inter">
                      <div className="relative">
                        <div className="h-10 w-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Shield className="h-4 w-4 text-cyan-400 animate-pulse" />
                        </div>
                      </div>
                      <p className="text-xs text-cyan-400 font-semibold animate-pulse">Routing secure SMS channel...</p>
                    </div>
                  )}

                  {virtualNumber && !isOtpRequesting && (
                    <div className="space-y-4 flex-1 flex flex-col justify-between">
                      {/* Allocated Number Display */}
                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-4 relative">
                        <div className="absolute top-2 right-2 flex items-center gap-1 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5 text-[8px] font-bold text-cyan-400 uppercase tracking-wider">
                          Active Line
                        </div>
                        <div className="text-[9px] text-cyan-400/50 font-bold uppercase tracking-wider">Allocated Number</div>
                        <div className="text-xl font-bold font-space text-white mt-1 flex items-center justify-between">
                          <span>{virtualNumber}</span>
                          <button 
                            onClick={() => handleCopy(virtualNumber, "Phone number")}
                            className="p-1 rounded hover:bg-cyan-500/10 text-cyan-400 transition-colors cursor-pointer"
                          >
                            {copiedText === virtualNumber ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>

                      {/* SMS Inbox Terminal */}
                      <div className="flex-1 bg-black/80 rounded-xl border border-purple-500/15 p-4 flex flex-col justify-between min-h-[100px]">
                        <div className="flex justify-between items-center text-[9px] text-purple-200/40 font-bold uppercase tracking-wider border-b border-purple-500/10 pb-1.5 mb-2">
                          <span>SMS Receiving Terminal</span>
                          {otpTimer > 0 && (
                            <span className="text-cyan-400 flex items-center gap-1 font-semibold normal-case">
                              <RefreshCw className="h-3 w-3 animate-spin" />
                              waiting (expires in {otpTimer}s)
                            </span>
                          )}
                        </div>

                        {/* OTP SMS Content */}
                        <div className="flex-1 flex items-center justify-center">
                          {otpCode ? (
                            <div className="w-full text-center space-y-2 animate-float">
                              <div className="text-[10px] text-emerald-400 font-bold flex items-center justify-center gap-1 uppercase">
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                OTP Received Successfully!
                              </div>
                              <div className="text-2xl font-bold font-space tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center gap-2">
                                <span>{otpCode}</span>
                                <button 
                                  onClick={() => handleCopy(otpCode, "OTP Code")}
                                  className="p-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 transition-colors cursor-pointer"
                                >
                                  {copiedText === otpCode ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                </button>
                              </div>
                              <div className="text-[9px] text-purple-200/40">Use this code immediately to verify your {otpService} account.</div>
                            </div>
                          ) : (
                            <div className="text-center text-purple-200/30 text-[10px] py-3">
                              [System logs: Standing by for incoming carrier broadcast...]
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SMM PANEL SIMULATION */}
          {activeTab === 4 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span>Growth Panel</span>
                </div>
                <h3 className="text-2xl font-bold font-space text-white">Social Media Marketing Boost</h3>
                <p className="text-xs text-purple-200/60 mt-1">
                  Expand your digital reach. Buy real followers, high-retention views, and organic-like engagement for Instagram, TikTok, YouTube, and X.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-1">
                {/* Left configuration */}
                <form onSubmit={handleSmmBoost} className="space-y-4 flex flex-col justify-center">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-purple-200/70">Select Network</label>
                      <select 
                        value={smmPlatform}
                        onChange={(e) => setSmmPlatform(e.target.value)}
                        className="w-full px-3 py-2.5 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-purple-200 focus:outline-none focus:border-purple-500 font-semibold"
                      >
                        <option value="instagram">Instagram</option>
                        <option value="tiktok">TikTok</option>
                        <option value="youtube">YouTube</option>
                        <option value="twitter">Twitter / X</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-purple-200/70">Boost Type</label>
                      <select 
                        value={smmService}
                        onChange={(e) => setSmmService(e.target.value)}
                        className="w-full px-3 py-2.5 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-purple-200 focus:outline-none focus:border-purple-500 font-semibold"
                      >
                        <option value="followers">Real Followers (1,200 Units / 1k)</option>
                        <option value="likes">Organic Likes (400 Units / 1k)</option>
                        <option value="views">High Retention Views (250 Units / 1k)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-purple-200/70">Order Quantity</label>
                    <input 
                      type="number"
                      value={smmQuantity}
                      onChange={(e) => setSmmQuantity(e.target.value)}
                      placeholder="1000"
                      className="w-full px-3 py-2.5 bg-black/40 border border-purple-500/20 rounded-xl text-xs text-white focus:outline-none focus:border-purple-500 font-semibold"
                    />
                    <div className="flex gap-1 mt-1.5">
                      {["500", "1000", "5000", "10000"].map(qty => (
                        <button
                          key={qty}
                          type="button"
                          onClick={() => setSmmQuantity(qty)}
                          className="px-2 py-1 rounded-md bg-purple-500/5 border border-purple-500/10 hover:bg-purple-500/15 hover:border-purple-500/25 text-[9px] font-semibold text-purple-300 transition-all cursor-pointer"
                        >
                          {qty}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center bg-purple-500/5 border border-purple-500/10 rounded-xl p-3">
                    <span className="text-[11px] text-purple-200/60">Execution Units: <span className="font-bold text-white">{Math.round((parseInt(smmQuantity) || 0) / 1000 * (smmService === "followers" ? 1200 : smmService === "likes" ? 400 : 250)).toLocaleString()} Units</span></span>
                    <button
                      type="submit"
                      disabled={isSmmBoosting}
                      className="px-4 py-2 bg-gradient-to-r from-purple-600 to-cyan-500 rounded-lg text-xs font-bold text-white hover:brightness-110 active:scale-[0.95] transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isSmmBoosting ? "Launching Boost..." : "Launch Boost"}
                      <TrendingUp className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </form>

                {/* Right Analytics Mockup */}
                <div className="rounded-xl border border-purple-500/20 bg-black/40 p-5 relative overflow-hidden flex flex-col justify-between min-h-[220px] shadow-inner">
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded px-1.5 py-0.5 text-[8px] font-bold text-purple-400 uppercase tracking-wider">
                    Analytics Monitor
                  </div>
                  <div className="space-y-4">
                    <div className="text-xs text-purple-200/40 uppercase font-space tracking-wider">Simulated Target Node</div>
                    
                    {/* Growth Counter Visualizer */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/60 border border-purple-500/10 rounded-xl p-3.5 text-center">
                        <div className="text-[10px] text-purple-200/40 uppercase font-semibold">Current Count</div>
                        <div className="text-2xl font-bold font-space text-white mt-1 animate-pulse">
                          {smmProgressCount.toLocaleString()}
                        </div>
                      </div>
                      <div className="bg-black/60 border border-purple-500/10 rounded-xl p-3.5 text-center">
                        <div className="text-[10px] text-purple-200/40 uppercase font-semibold">Target Count</div>
                        <div className="text-2xl font-bold font-space text-cyan-400 mt-1">
                          {smmTargetCount.toLocaleString()}
                        </div>
                      </div>
                    </div>

                    {/* Stepper Growth Progress */}
                    {isSmmBoosting && (
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] text-purple-200/60 font-semibold">
                          <span className="flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping" />
                            Pumping active nodes...
                          </span>
                          <span>{Math.round(((smmProgressCount - 1240) / (smmTargetCount - 1240)) * 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-purple-950 rounded-full overflow-hidden border border-purple-500/20">
                          <div 
                            className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 transition-all duration-100"
                            style={{ width: `${((smmProgressCount - 1240) / (smmTargetCount - 1240)) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {!isSmmBoosting && smmTargetCount > 1240 && (
                      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-center text-[11px] font-semibold text-emerald-400 flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Campaign successfully delivered to target node!</span>
                      </div>
                    )}
                  </div>
                  <div className="text-[9px] text-purple-200/30 text-center border-t border-purple-500/10 pt-3 font-mono">
                    System utilizes API-driven secure routing paths. 100% safe.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DIGITAL SOFTWARES & LICENSES */}
          {activeTab === 5 && (
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-purple-400 font-semibold text-xs uppercase tracking-wider mb-1">
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Marketplace Panels</span>
                </div>
                <h3 className="text-2xl font-bold font-space text-white">Digital Key Marketplace</h3>
                <p className="text-xs text-purple-200/60 mt-1">
                  Purchase premium software licenses, game key activations, and streaming bundles instantly at unmatched wholesale prices.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch flex-1">
                {/* Left products listing */}
                <div className="space-y-3 flex flex-col justify-center">
                  <div className="text-xs font-semibold text-purple-200/70 mb-1">Hot Available Products</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PRODUCTS.map(product => {
                      const isPurchasing = isPurchasingProd === product.id;
                      return (
                        <div 
                          key={product.id}
                          className="bg-black/30 border border-purple-500/15 hover:border-purple-500/30 rounded-xl p-3 flex flex-col justify-between gap-3 transition-all relative group"
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-2xl">{product.icon}</span>
                            <span className="text-[8px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded uppercase">
                              {product.category}
                            </span>
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white font-space truncate">{product.name}</h4>
                            <div className="text-sm font-bold text-purple-300 font-space mt-1">₦{product.price.toLocaleString()}</div>
                          </div>
                          <button
                            onClick={() => handleBuyProduct(product)}
                            disabled={!!isPurchasingProd}
                            className="w-full py-2 bg-purple-500/10 hover:bg-gradient-to-r hover:from-purple-600 hover:to-cyan-500 border border-purple-500/20 group-hover:border-transparent rounded-lg text-[10px] font-bold text-white transition-all flex items-center justify-center gap-1 disabled:opacity-50 cursor-pointer"
                          >
                            {isPurchasing ? (
                              <>
                                <RefreshCw className="h-3 w-3 animate-spin" />
                                <span>Securing key...</span>
                              </>
                            ) : (
                              <>
                                <span>Buy License</span>
                                <ChevronRight className="h-3 w-3" />
                              </>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right purchased keys list */}
                <div className="rounded-xl border border-purple-500/20 bg-black/40 p-4 relative flex flex-col min-h-[220px] shadow-inner">
                  <div className="flex justify-between items-center border-b border-purple-500/10 pb-2 mb-3">
                    <span className="text-xs text-purple-200/50 font-bold uppercase font-space tracking-wider">Your Inventory Keys</span>
                    <span className="px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/10 text-[9px] text-purple-300 font-bold">
                      {purchasedKeys.length} Keys
                    </span>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[160px] space-y-2 custom-scrollbar-thin pr-1">
                    {purchasedKeys.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-2 py-8">
                        <ShoppingBag className="h-7 w-7 text-purple-400/20" />
                        <p className="text-[10px] text-purple-200/30">No keys purchased yet. Click buy on any license card to instantly generate keys.</p>
                      </div>
                    ) : (
                      purchasedKeys.map((item, idx) => (
                        <div 
                          key={idx}
                          className="bg-black/60 rounded-lg border border-purple-500/15 p-2.5 flex justify-between items-center gap-3 animate-float"
                        >
                          <div className="truncate flex-1">
                            <div className="text-[9px] text-purple-300 font-bold truncate">{item.name}</div>
                            <div className="text-[10px] font-mono text-cyan-400 select-all font-bold mt-0.5 truncate">{item.key}</div>
                          </div>
                          <button
                            onClick={() => handleCopy(item.key, `${item.name} license`)}
                            className="p-1.5 rounded bg-purple-500/10 hover:bg-purple-500/25 text-purple-300 transition-all shrink-0 cursor-pointer"
                          >
                            {copiedText === item.key ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="text-[8px] text-purple-200/30 text-center border-t border-purple-500/10 pt-2 font-mono mt-auto">
                    All keys originate from authorized distributors with lifetime activations.
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* ——— FOOTER BAR OF SIMULATOR ——— */}
        <div className="relative z-10 border-t border-purple-500/10 pt-4 mt-6 flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-3.5">
            <div className="flex items-center gap-1 text-[10px] text-purple-200/40 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>API Uptime: 99.99%</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-purple-200/40 font-semibold">
              <span className="h-2 w-2 rounded-full bg-purple-500"></span>
              <span>Node Layer: TLS 1.3</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-purple-200/40 font-semibold">Quota Management:</span>
            <button 
              onClick={() => {
                setApiQuota(15000);
                addNotification("API Quota reset to 15,000 Units", "info");
              }}
              className="p-1 rounded hover:bg-white/5 text-purple-200/40 hover:text-white transition-colors cursor-pointer"
              title="Reset Quota"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}