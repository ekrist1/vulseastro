export interface EmailEnv {
  EMAIL_FROM?: string
  EMAIL_API_TOKEN?: string
}

export async function sendEmail(
  env: EmailEnv,
  input: { to: string; subject: string; body: string },
): Promise<'sent' | 'logged'> {
  if (!env.EMAIL_FROM || !env.EMAIL_API_TOKEN) {
    console.log(`[vulse-email] to=${input.to} subject=${input.subject}\n${input.body}`)
    return 'logged'
  }
  // Placeholder: real Email Workers integration documented in README.
  console.log(`[vulse-email] to=${input.to} subject=${input.subject}`)
  return 'sent'
}
