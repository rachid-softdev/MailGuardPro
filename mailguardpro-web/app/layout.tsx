import type { Metadata } from "next";
import "./globals.css";
import { headers } from "next/headers";
import { ErrorToastProvider } from "@/components/ui/ErrorToastProvider";

export const metadata: Metadata = {
  title: "MailGuard Pro - Email Intelligence Platform",
  description:
    "Validate emails with a quality score 0-100. Bulk processing, exports, and webhooks.",
  keywords: ["email validation", "email verifier", "bulk email validation", "email quality score"],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get("x-csp-nonce") ?? "";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
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
      <body>
        <ErrorToastProvider>{children}</ErrorToastProvider>
      </body>
    </html>
  );
}
