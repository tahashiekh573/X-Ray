import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Keeps a rendering failure in the 3D stage from taking down the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[stage] crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl bg-void p-6 text-center">
        <h2 className="text-[15px] font-semibold text-white">The mirror view stopped unexpectedly</h2>
        <p className="max-w-md text-[13px] text-slate-300">{this.state.error.message}</p>
        <button type="button" className="rounded-lg bg-ice-400 px-3 py-1.5 text-[13px] font-medium text-void" onClick={() => this.setState({ error: null })}>
          Reload view
        </button>
      </div>
    );
  }
}
