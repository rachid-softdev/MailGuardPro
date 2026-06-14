import { Metadata } from "next";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

export const metadata: Metadata = {
  title: "MailGuard Pro - Email Validation API | Quality Score 0-100",
  description:
    "Validate email addresses with 99% accuracy. Get a quality score (0-100), detect disposable emails, catch typos, and verify deliverability. Free tier available.",
  keywords: [
    "email validation",
    "email verifier",
    "email checker",
    "bulk email validation",
    "email quality score",
    "deliverability",
  ],
  openGraph: {
    title: "MailGuard Pro - Email Intelligence Platform",
    description:
      "Validate emails with quality scores. Bulk processing, API access, and exports in CSV/JSON/XLSX/PDF.",
    url: "https://mailguard.pro",
    siteName: "MailGuard Pro",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "MailGuard Pro - Email Validation",
    description:
      "Quality scores for your email list. Validate 0-100 with actionable recommendations.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
    </div>
  );
}
