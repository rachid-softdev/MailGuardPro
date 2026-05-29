import { Resend } from "resend";

if (!process.env.RESEND_API_KEY) {
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY is required in production");
  }
  console.warn("RESEND_API_KEY is not defined — email sending will fail");
}

export const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}) {
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || "noreply@mailguard.pro",
      to,
      subject,
      html,
      text,
    });
    return { success: true, data };
  } catch (error) {
    console.error("Failed to send email:", error);
    return { success: false, error };
  }
}

// Templates d'email
export const EMAIL_TEMPLATES = {
  welcome: (name?: string) => ({
    subject: "Bienvenue sur MailGuard Pro",
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #00A36C; margin: 0;">MailGuard Pro</h1>
          </div>
          <p>Bonjour${name ? ` ${name}` : ""},</p>
          <p>Merci d'avoir rejoint MailGuard Pro !</p>
          <p>Vous disposez de <strong>100 crédits gratuits</strong> pour commencer à valider vos adresses email.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/validate" style="background: #00A36C; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
              Commencer maintenant
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            Avec MailGuard Pro, vous pouvez :
          </p>
          <ul style="color: #666;">
            <li>Obtenir un score de qualité 0-100 pour chaque email</li>
            <li>Valider des milliers d'emails en bulk</li>
            <li>Exporter vos résultats en CSV, JSON, XLSX ou PDF</li>
          </ul>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px; text-align: center;">
            © 2026 MailGuard Pro. Tous droits réservés.
          </p>
        </body>
      </html>
    `,
  }),

  bulkCompleted: (filename: string, total: number, valid: number) => ({
    subject: `Traitement terminé : ${filename}`,
    html: `
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
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/bulk">Voir les résultats</a>
        </body>
      </html>
    `,
  }),
};

export default resend;
