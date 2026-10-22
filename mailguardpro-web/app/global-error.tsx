"use client";

export default function GlobalError({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            background: "#f2f4ef",
            color: "#1b1f1c",
            fontFamily: '"Archivo", "Segoe UI", system-ui, -apple-system, sans-serif',
          }}
        >
          <div style={{ maxWidth: "420px", textAlign: "center" }}>
            <p
              style={{
                margin: "0 0 8px",
                fontFamily: '"Spline Sans Mono", Consolas, monospace',
                fontSize: "10px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#6b7069",
              }}
            >
              System / critical error
            </p>
            <h2 style={{ margin: "0 0 8px", fontSize: "24px", fontWeight: 600 }}>
              Something went wrong
            </h2>
            <p style={{ margin: "0 0 24px", fontSize: "13px", color: "#4d534d" }}>
              A critical error occurred. Please try again.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "10px 16px",
                background: "#e05a2b",
                color: "#ffffff",
                border: "1px solid #e05a2b",
                borderRadius: "2px",
                fontFamily: "inherit",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
