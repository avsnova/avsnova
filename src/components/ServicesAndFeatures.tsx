import { 
  Smartphone, TrendingUp, ShoppingBag, 
  FileText, Zap, Gem, Lock, Globe, LayoutGrid, LifeBuoy, 
  UserPlus, PlusCircle, MousePointerClick, CheckCircle
} from "lucide-react";

interface ServicesAndFeaturesProps {
  onSelectService: (tabId: number) => void;
}

export default function ServicesAndFeatures({ onSelectService }: ServicesAndFeaturesProps) {
  
  const services = [
    {
      id: 3,
      title: "SMS / Virtual Number Panel (Demo)",
      description: "Access US, UK, and global virtual numbers for OTP verifications on any platform. Hundreds of services supported — delivered in seconds.",
      tag: "OTP Services",
      icon: Smartphone,
      accentColor: "from-cyan-500 to-teal-500",
    },
    {
      id: 4,
      title: "Social Media Growth",
      description: "Grow your social media presence fast. Buy real followers, likes, views, and engagement for Instagram, TikTok, YouTube, Twitter/X, and more.",
      tag: "Growth",
      icon: TrendingUp,
      accentColor: "from-pink-500 to-rose-500",
    },
    {
      id: 5,
      title: "Digital Marketplace",
      description: "Shop premium software licenses, subscriptions, and digital keys at unbeatable prices. Instant delivery direct to your account or inbox.",
      tag: "Software & Keys",
      icon: ShoppingBag,
      accentColor: "from-amber-500 to-orange-500",
    },
  ];

  const whyUsFeatures = [
    {
      title: "Instant Delivery",
      description: "Most orders complete in under 3 seconds. No queuing, no waiting. Real-time fulfillment.",
      icon: Zap,
    },
    {
      title: "Lowest Rates",
      description: "Competitive wholesale pricing across all categories without compromising on quality.",
      icon: Gem,
    },
    {
      title: "Secure & Private",
      description: "All transactions are fully encrypted. Your personal data is never shared, sold, or exposed.",
      icon: Lock,
    },
    {
      title: "Global Access",
      description: "Services work worldwide. Secure virtual numbers from over 50+ countries instantly available.",
      icon: Globe,
    },
    {
      title: "One Unified Dashboard",
      description: "All service categories live under one secure login. No app-switching or scattered billing.",
      icon: LayoutGrid,
    },
    {
      title: "24/7 Premium Support",
      description: "Live chat and support ticket infrastructure around the clock for every active account.",
      icon: LifeBuoy,
    },
  ];

  const steps = [
    {
      num: "01",
      title: "Create Your Account",
      description: "Sign up free with just your email. No document uploads, no waiting period, instant sandbox access.",
      icon: UserPlus,
    },
    {
      num: "02",
      title: "Configure Service Tier",
      description: "Select your preferred pay-as-you-go or subscription tier. Instant activation with zero setup fees.",
      icon: PlusCircle,
    },
    {
      num: "03",
      title: "Pick a Service",
      description: "Browse all active categories and configure your order with intuitive parameter controls in seconds.",
      icon: MousePointerClick,
    },
    {
      num: "04",
      title: "Receive Instantly",
      description: "Results are delivered to your dashboard or inbox with zero delays. View and download logs in real-time.",
      icon: CheckCircle,
    },
  ];

  const handleCardClick = (serviceId: number) => {
    onSelectService(serviceId);
    // Smooth scroll to simulator
    const simulatorElement = document.getElementById("demo-simulator");
    if (simulatorElement) {
      simulatorElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  return (
    <>
      {/* ——— SERVICES SECTION ——— */}
      <section id="services" className="relative py-24 px-6 max-w-7xl mx-auto z-10">
        
        {/* Glow Element */}
        <div className="absolute top-1/4 -left-36 h-[500px] w-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />
        <div className="text-center md:text-left mb-16 max-w-3xl">
          <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
            Unified Ecosystem
          </span>
          <h2 className="text-3xl md:text-5xl font-extrabold font-space text-white tracking-tight leading-tight">
            Everything Digital, <br />
            <span className="text-gradient-purple-cyan text-glow-purple">One Premium Platform</span>
          </h2>
          <p className="text-sm md:text-base text-purple-200/60 mt-4 leading-relaxed max-w-xl">
            Powerful service categories engineered for speed, utility, and absolute reliability. Click any card to test-drive it in our sandbox simulator.
          </p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <div
                key={service.id}
                onClick={() => handleCardClick(service.id)}
                className="group relative rounded-2xl p-6 glass-panel-interactive cursor-pointer overflow-hidden border border-purple-500/10 flex flex-col justify-between min-h-[250px]"
              >
                {/* Decorative Hover Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${service.accentColor} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
                
                <div>
                  {/* Icon & Accent */}
                  <div className="flex justify-between items-start mb-6">
                    <div className="h-12 w-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:border-purple-500/40 group-hover:bg-purple-500/20 transition-all duration-300 shadow-md">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-[9px] font-bold text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {service.tag}
                    </span>
                  </div>
                  {/* Text */}
                  <h3 className="text-lg font-bold text-white font-space tracking-tight group-hover:text-glow-purple group-hover:text-purple-300 transition-colors">
                    {service.title}
                  </h3>
                  <p className="text-xs text-purple-200/60 mt-2 leading-relaxed">
                    {service.description}
                  </p>
                </div>
                {/* Footer with micro-interaction */}
                <div className="border-t border-purple-500/10 pt-4 mt-6 flex justify-between items-center text-[11px] font-semibold text-purple-200/40">
                  <span>Simulate Service</span>
                  <span className="text-cyan-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    <span>Try Sandbox</span>
                    <span>→</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ——— WHY US SECTION ——— */}
      <div className="relative border-y border-purple-500/15 bg-black/45 py-24 px-6 overflow-hidden" id="why">
        {/* Dynamic Grid Background */}
        <div className="absolute inset-0 digital-grid opacity-10 pointer-events-none" />
        
        {/* Floating gradient orb */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none animate-pulse-slow" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16 max-w-2xl mx-auto">
            <span className="inline-block px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
              Quality Assurance
            </span>
            <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight">
              Built Different
            </h2>
            <p className="text-sm text-purple-200/60 mt-4 leading-relaxed">
              Designed from the ground up for speed, security, and global accessibility. A truly unified digital experience.
            </p>
          </div>

          {/* Why Us Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {whyUsFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={idx} 
                  className="flex gap-4 p-5 rounded-2xl hover:bg-white/5 border border-transparent hover:border-purple-500/10 transition-all duration-300"
                >
                  <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 shadow-md">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white font-space tracking-tight">{feature.title}</h4>
                    <p className="text-xs text-purple-200/50 mt-1.5 leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ——— HOW IT WORKS SECTION ——— */}
      <section id="how" className="relative py-24 px-6 max-w-7xl mx-auto z-10">
        
        {/* Glow Element */}
        <div className="absolute bottom-1/4 -right-36 h-[500px] w-[500px] rounded-full bg-cyan-500/5 blur-[120px] pointer-events-none" />
        <div className="text-center mb-16 max-w-2xl mx-auto">
          <span className="inline-block px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-bold text-cyan-400 uppercase tracking-widest mb-4">
            Simple Integration
          </span>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-extrabold font-space text-white tracking-tight">
            Up and Running in Minutes
          </h2>
          <p className="text-sm text-purple-200/60 mt-4 leading-relaxed">
            Four streamlined steps separating your signup from instantaneous service delivery. No paperwork, no complications.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative">
          
          {/* Connector Line for desktop */}
          <div className="hidden lg:block absolute top-1/2 left-8 right-8 h-0.5 border-t border-dashed border-purple-500/20 -translate-y-10 z-0 pointer-events-none" />
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <div 
                key={idx}
                className="relative z-10 rounded-2xl p-6 glass-panel border border-purple-500/10 flex flex-col justify-between hover:border-purple-500/35 transition-colors duration-300"
              >
                <div>
                  {/* Step Header */}
                  <div className="flex justify-between items-center mb-6">
                    <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shadow-md">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-2xl font-extrabold font-space text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 opacity-60">
                      {step.num}
                    </span>
                  </div>
                  {/* Step Content */}
                  <h4 className="text-sm font-bold text-white font-space tracking-tight">{step.title}</h4>
                  <p className="text-xs text-purple-200/50 mt-2 leading-relaxed">
                    {step.description}
                  </p>
                </div>
                {/* Subtext info */}
                <div className="text-[10px] text-purple-300/40 font-mono mt-5 uppercase tracking-wider">
                  Phase {step.num} · Verified
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}