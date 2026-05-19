import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MailGuard Pro - Email Intelligence Platform",
  description:
    "Validate emails with a quality score 0-100. Bulk processing, exports, and webhooks.",
  keywords: ["email validation", "email verifier", "bulk email validation", "email quality score"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                var t = localStorage.getItem('mg-theme') || 'system';
                var d = t === 'system'
                  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                  : t;
                document.documentElement.setAttribute('data-theme', d);
              })();
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
