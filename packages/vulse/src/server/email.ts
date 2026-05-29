export interface EmailEnv {
  /** Cloudflare Email Routing send binding — declared as `[[send_email]]` in wrangler.toml. */
  SEND_EMAIL?: SendEmail
  /** The "From" address used on outgoing emails, e.g. `noreply@yourdomain.com`. */
  EMAIL_FROM?: string
}

export async function sendEmail(
  env: EmailEnv,
  input: { to: string; subject: string; text: string },
): Promise<'sent' | 'logged'> {
  if (!env.SEND_EMAIL || !env.EMAIL_FROM) {
    console.log(`[vulse-email] to=${input.to} subject=${input.subject}\n${input.text}`)
    return 'logged'
  }
  await env.SEND_EMAIL.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    text: input.text,
  })
  return 'sent'
}
