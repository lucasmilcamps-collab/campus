// Transactional email through Resend, from our own domain. Templates are ours.
// Sign-in codes are sent by Supabase Auth (point its SMTP at Resend; the
// template text is in supabase/templates/).

import { env } from './env';
import { http } from './http';

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);

function layout(title: string, paragraphs: string[]): string {
  return `<!doctype html><html lang="fr"><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#12151a;max-width:560px;margin:0 auto;padding:24px">
<h1 style="font-size:22px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="font-size:16px;line-height:24px;margin:0 0 12px">${esc(p)}</p>`).join('\n')}
</body></html>`;
}

export function trialEndingEmail(to: string, firstName: string | null, endsOn: string, priceLabel: string): Email {
  const hi = firstName ? `Bonjour ${firstName},` : 'Bonjour,';
  const lines = [
    hi,
    `Ton essai gratuit de l’offre Entraînement se termine le ${endsOn}.`,
    `Si tu continues, ton abonnement démarre automatiquement à ${priceLabel}. Tu n’as rien à faire.`,
    'Si tu préfères arrêter, annule depuis les réglages d’abonnement de ton téléphone (App Store ou Google Play) avant cette date. Ça prend dix secondes, et ton plan gratuit reste disponible.',
    'Bonnes séances !',
  ];
  return { to, subject: `Ton essai se termine le ${endsOn}`, text: lines.join('\n\n'), html: layout('Ton essai se termine bientôt', lines) };
}

/** Sends with Resend; without a key (local, tests) it reports "skipped". */
export async function send(e: Email): Promise<'sent' | 'skipped'> {
  const { RESEND_API_KEY, EMAIL_FROM } = env();
  if (!RESEND_API_KEY) return 'skipped';
  const res = await http('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [e.to], subject: e.subject, text: e.text, html: e.html }),
  });
  if (!res.ok) throw new Error(`resend: HTTP ${res.status}`);
  return 'sent';
}
