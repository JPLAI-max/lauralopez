import { Component, type ReactNode, type ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the header, e.g. "Admin Dashboard" */
  label?: string;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Class-based error boundary — catches render / lifecycle errors in the
 * subtree and shows a readable error card instead of a blank white page.
 * Wrapping the admin shell and the app root prevents any single crashed
 * component from taking down the whole UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, componentStack: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ componentStack: info.componentStack ?? null });
    console.error(
      "[ErrorBoundary] Uncaught error in",
      this.props.label ?? "component tree",
      "\n",
      error,
      "\nComponent stack:",
      info.componentStack,
    );
  }

  handleReload = () => window.location.reload();

  handleReset = () => this.setState({ error: null, componentStack: null });

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[200px] p-6 flex flex-col gap-4 bg-destructive/5 border border-destructive/30 rounded">
        <div>
          <p className="text-sm font-semibold text-destructive uppercase tracking-wider mb-1">
            {this.props.label ? `${this.props.label} — ` : ""}Render error
          </p>
          <p className="text-sm text-foreground font-mono break-words">{error.message}</p>
        </div>

        {componentStack && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Component stack</summary>
            <pre className="mt-2 overflow-auto max-h-48 text-[11px] leading-relaxed whitespace-pre-wrap">
              {componentStack}
            </pre>
          </details>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={this.handleReset}
            className="px-3 py-1.5 text-xs border border-border bg-background hover:bg-muted transition-colors rounded"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={this.handleReload}
            className="px-3 py-1.5 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors rounded"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
