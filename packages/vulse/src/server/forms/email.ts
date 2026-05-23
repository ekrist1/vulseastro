export interface FormEmailEnv {
  EMAIL_FROM?: string
  EMAIL_API_TOKEN?: string
}

export async function sendFormEmail(
  env: FormEmailEnv,
  input: { to: string; subject: string; body: string },
): Promise<void> {
  if (!env.EMAIL_FROM || !env.EMAIL_API_TOKEN) {
    throw new Error('email_not_configured')
  }
  // Placeholder: real Email Workers integration documented in README.
  // Tests mock this module.
  console.log(`[vulse-form-email] to=${input.to} subject=${input.subject}`)
}
