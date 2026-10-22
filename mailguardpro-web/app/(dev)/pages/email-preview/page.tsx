import { notFound } from "next/navigation";
import { DevBadge } from "@/components/dev/DevBadge";
import { PagePreview } from "@/components/dev/PagePreview";

const WELCOME_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1b1f1c; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #E05A2B; margin: 0;">MailGuard Pro</h1>
    </div>
    <p>Bonjour Alex,</p>
    <p>Merci d'avoir rejoint MailGuard Pro !</p>
    <p>Vous disposez de <strong>100 crédits gratuits</strong> pour commencer à valider vos adresses email.</p>
    <div style="text-align: center; margin: 30px 0;">
      <a href="#" style="background: #E05A2B; color: white; padding: 12px 24px; border-radius: 2px; text-decoration: none; display: inline-block;">
        Commencer maintenant
      </a>
    </div>
    <p style="color: #4d534d; font-size: 14px;">
      Avec MailGuard Pro, vous pouvez :
    </p>
    <ul style="color: #4d534d;">
      <li>Obtenir un score de qualité 0-100 pour chaque email</li>
      <li>Valider des milliers d'emails en bulk</li>
      <li>Exporter vos résultats en CSV, JSON, XLSX ou PDF</li>
    </ul>
    <hr style="border: none; border-top: 1px solid #dfe3da; margin: 30px 0;">
    <p style="color: #6b7069; font-size: 12px; text-align: center;">
      © 2026 MailGuard Pro. Tous droits réservés.
    </p>
  </body>
</html>
`;

function buildBulkCompletedHtml(filename: string, total: number, valid: number): string {
  return `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 20px;">
    <h2>✅ Traitement terminé</h2>
    <p>Votre fichier <strong>${filename}</strong> a été traité.</p>
    <ul>
      <li>Total des emails : ${total}</li>
      <li>Emails valides : ${valid}</li>
      <li>Taux de délivrabilité : ${Math.round((valid / total) * 100)}%</li>
    </ul>
    <a href="#" style="color: #E05A2B;">Voir les résultats</a>
  </body>
</html>
`;
}

const BULK_COMPLETED_HTML = buildBulkCompletedHtml("contacts-2026.csv", 1247, 1189);

export default function EmailPreviewPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-10 border-b border-[var(--line)] pb-5">
        <div className="flex items-center gap-3">
          <p className="label-mono flex items-center gap-2">
            <span className="h-1.5 w-1.5 bg-[var(--accent)]" aria-hidden="true" />
            Internal / email
          </p>
          <DevBadge />
        </div>
        <h1 className="mt-2 font-display text-[clamp(1.9rem,3.2vw,2.6rem)] font-semibold leading-none tracking-[-0.04em] text-[var(--ink)]">
          Email Previews.
        </h1>
        <p className="mt-2 text-[13px] text-[var(--ink-2)]">
          Preview email templates from{" "}
          <code className="border border-[var(--line)] bg-[var(--surface-2)] px-1.5 py-0.5 font-mono text-[11px]">
            lib/resend.ts
          </code>
        </p>
      </header>

      <div className="space-y-10">
        <section>
          <h2 className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Welcome Email
          </h2>
          <p className="mb-4 text-[12px] text-[var(--ink-3)]">
            Sent when a new user signs up. Subject: &ldquo;Bienvenue sur MailGuard Pro&rdquo;
          </p>
          <PagePreview html={WELCOME_HTML} title="welcome-email.html" height={520} />
        </section>

        <section>
          <h2 className="mb-1 font-display text-lg font-semibold tracking-[-0.02em] text-[var(--ink)]">
            Bulk Completed Email
          </h2>
          <p className="mb-4 text-[12px] text-[var(--ink-3)]">
            Sent when bulk validation finishes. Subject: &ldquo;Traitement terminé :
            contacts-2026.csv&rdquo;
          </p>
          <PagePreview html={BULK_COMPLETED_HTML} title="bulk-completed-email.html" height={320} />
        </section>
      </div>
    </div>
  );
}
