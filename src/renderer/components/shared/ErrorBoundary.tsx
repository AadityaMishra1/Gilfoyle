import React from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary] Caught render error:", error, info);
  }

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          width: "100%",
          gap: "20px",
          padding: "32px",
          backgroundColor: "var(--bg-secondary)",
          fontFamily: "'Geist', system-ui, sans-serif",
        }}
      >
        <AlertTriangle
          size={36}
          style={{ color: "var(--accent-primary)", flexShrink: 0 }}
        />

        <h2
          style={{
            margin: 0,
            fontSize: "16px",
            fontWeight: 600,
            color: "var(--text-primary)",
            fontFamily: "'Geist', system-ui, sans-serif",
          }}
        >
          Something went wrong
        </h2>

        {this.state.error !== null && (
          <pre
            style={{
              margin: 0,
              padding: "12px 16px",
              maxWidth: "560px",
              width: "100%",
              overflowX: "auto",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "11px",
              lineHeight: 1.6,
              fontFamily: "'Geist Mono', monospace",
              color: "var(--text-muted)",
              backgroundColor: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
            }}
          >
            {this.state.error.message}
          </pre>
        )}

        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            padding: "7px 18px",
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "'Geist', system-ui, sans-serif",
            color: "var(--accent-primary)",
            backgroundColor: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            cursor: "pointer",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "var(--accent-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor =
              "var(--border)";
          }}
        >
          Reload App
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;
