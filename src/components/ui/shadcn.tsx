import React from "react";
import { cn } from "../../utils/cn";
import { useBodyScrollLock } from "../../utils/useBodyScrollLock";

// ——— BUTTON ———
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "relative inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/50 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer font-space select-none",
          variant === "primary" && "bg-gradient-to-r from-purple-600 via-purple-500 to-cyan-500 text-white shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 hover:brightness-110",
          variant === "secondary" && "bg-purple-500/10 border border-purple-500/20 text-purple-200 hover:bg-purple-500/20 hover:border-purple-500/30 hover:text-white",
          variant === "outline" && "bg-black/30 border border-white/10 text-purple-200/80 hover:bg-white/5 hover:text-white hover:border-white/20",
          variant === "ghost" && "bg-transparent text-purple-200/70 hover:bg-white/5 hover:text-white",
          variant === "danger" && "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-300",
          size === "sm" && "px-3 py-1.5 text-xs rounded-lg",
          size === "md" && "px-4 py-2.5 text-xs sm:text-sm",
          size === "lg" && "px-6 py-3.5 text-sm sm:text-base",
          className
        )}
        {...props}
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4 text-current" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Processing...</span>
          </span>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = "Button";

// ——— CARD ———
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  glow?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hoverable, glow, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative bg-[#0d081e]/80 backdrop-blur-xl border border-purple-500/15 rounded-2xl p-6 shadow-xl overflow-hidden transition-all duration-300 flex flex-col",
          hoverable && "hover:border-purple-500/35 hover:shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-1 cursor-pointer",
          className
        )}
        {...props}
      >
        {glow && (
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
        )}
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

// ——— BADGE ———
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "success" | "warning" | "danger" | "info" | "default" | "purple";
}

export const Badge = ({ className, variant = "default", children, ...props }: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-space border shrink-0",
        variant === "default" && "bg-white/5 border-white/10 text-purple-200/70",
        variant === "success" && "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
        variant === "warning" && "bg-amber-500/10 border-amber-500/20 text-amber-400",
        variant === "danger" && "bg-red-500/10 border-red-500/20 text-red-400",
        variant === "info" && "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
        variant === "purple" && "bg-purple-500/10 border-purple-500/20 text-purple-300",
        className
      )}
      {...props}
    >
      {variant === "success" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
      {variant === "warning" && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
      {variant === "danger" && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}
      {variant === "info" && <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />}
      {variant === "purple" && <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />}
      {children}
    </span>
  );
};

// ——— INPUT & SELECT ———
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  label?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, icon, label, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="text-xs font-semibold text-purple-200/70 font-space block">{label}</label>}
        <div className="relative flex items-center">
          {icon && <span className="absolute left-3.5 text-purple-200/40 pointer-events-none">{icon}</span>}
          <input
            ref={ref}
            className={cn(
              "w-full bg-black/40 border border-purple-500/20 rounded-xl py-2.5 text-xs sm:text-sm text-white placeholder-purple-200/30 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-inter",
              icon ? "pl-10 pr-4" : "px-4",
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);
Input.displayName = "Input";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, children, ...props }, ref) => {
    return (
      <div className="space-y-1.5 w-full">
        {label && <label className="text-xs font-semibold text-purple-200/70 font-space block">{label}</label>}
        <select
          ref={ref}
          className={cn(
            "w-full bg-black/40 border border-purple-500/20 rounded-xl px-4 py-2.5 text-xs sm:text-sm text-purple-100 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all font-inter font-semibold cursor-pointer",
            className
          )}
          {...props}
        >
          {children}
        </select>
      </div>
    );
  }
);
Select.displayName = "Select";

// —–— TABS NAVIGATOR ———
interface TabsProps {
  tabs: { id: string; label: string; count?: number }[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}

export const Tabs = ({ tabs, activeTab, onChange, className }: TabsProps) => {
  return (
    <div className={cn("flex items-center gap-1.5 overflow-x-auto pb-2 sm:pb-0 custom-scrollbar-thin border-b border-purple-500/15", className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
            className={cn(
              "px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-t-xl border-b-2 transition-all shrink-0 flex items-center gap-2 cursor-pointer font-space",
              isActive 
                ? "border-b-purple-500 bg-purple-500/10 text-white font-bold" 
                : "border-b-transparent text-purple-200/50 hover:text-purple-200 hover:bg-white/5"
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={cn("px-1.5 py-0.5 rounded-full text-[10px]", isActive ? "bg-purple-500/20 text-cyan-400" : "bg-white/5 text-purple-200/40")}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

// ——— SKELETON ———
export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn("animate-pulse rounded-xl bg-purple-500/10 border border-purple-500/15", className)}
      {...props}
    />
  );
};

// ——— MODAL ———
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export const Modal = ({ isOpen, onClose, title, description, children }: ModalProps) => {
  useBodyScrollLock(isOpen);
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md my-8 bg-[#0e0922] border border-purple-500/30 rounded-2xl p-6 shadow-2xl z-10 animate-float">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-xl font-bold font-space text-white">{title}</h3>
            {description && <p className="text-xs text-purple-200/60 mt-1">{description}</p>}
          </div>
          <button onClick={onClose} className="text-purple-200/40 hover:text-white text-lg font-bold p-1">×</button>
        </div>
        {children}
      </div>
    </div>
  );
};
