import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { hasError: boolean; error?: Error; }

/**
 * ErrorBoundary — app-wide safety net. Instead of white-screening on an unexpected
 * render error, it shows a branded recovery screen with reload / go-home actions.
 * Wraps the whole app in main.tsx.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Best-effort client-side logging; keep it quiet in production.
    console.error("[ErrorBoundary] Caught render error:", error, info.componentStack);
  }

  handleReload = () => {
    // Reload the current view.
    window.location.reload();
  };

  handleHome = () => {
    // Clear the route hash and reload to a clean state.
    try { window.location.hash = ""; } catch { /* ignore */ }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen bg-[#05020a] flex flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="text-2xl font-black font-space tracking-tight text-white select-none">
          AVS<span className="text-cyan-400"> Nova</span>
        </div>
        <div className="max-w-md">
          <h1 className="text-xl font-bold font-space text-white mb-2">Something went wrong</h1>
          <p className="text-sm text-purple-200/60 leading-relaxed">
            An unexpected error interrupted this page. Your data is safe — please reload to continue.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={this.handleReload}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-cyan-500 text-sm font-bold text-white shadow-lg shadow-purple-500/20 hover:brightness-110 active:scale-[0.98] transition cursor-pointer font-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          >
            Reload Page
          </button>
          <button
            onClick={this.handleHome}
            className="px-6 py-2.5 rounded-xl bg-white/5 border border-purple-500/25 text-sm font-bold text-white hover:bg-white/10 active:scale-[0.98] transition cursor-pointer font-space focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }
}
