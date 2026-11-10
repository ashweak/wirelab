"use client";

import { Component, type ReactNode } from "react";

/** Keeps one broken panel (e.g. 3D on a machine without WebGL) from taking down the page. */
export default class ErrorBoundary extends Component<
  { children: ReactNode; label: string; onReset?: () => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="max-w-md">
          <p className="text-sm font-semibold text-red-300">{this.props.label} stopped working</p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">{this.state.error.message}</p>
          <button
            onClick={() => {
              this.setState({ error: null });
              this.props.onReset?.();
            }}
            className="mt-3 rounded bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-900"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
