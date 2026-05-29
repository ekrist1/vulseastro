import { sendEmail, type EmailEnv } from '../email.js'

export type FormEmailEnv = EmailEnv

export async function sendFormEmail(
  env: FormEmailEnv,
  input: { to: string; subject: string; text: string },
): Promise<void> {
  const result = await sendEmail(env, input)
  if (result === 'logged') throw new Error('email_not_configured')
}
