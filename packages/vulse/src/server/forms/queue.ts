export interface FormProcessMessage {
  type: 'process_submission'
  submissionId: string
}

const pending = new Set<string>()

export async function enqueueFormProcess(queue: Queue | undefined, submissionId: string): Promise<void> {
  const msg: FormProcessMessage = { type: 'process_submission', submissionId }
  if (queue) {
    await queue.send(msg)
    return
  }
  pending.add(submissionId)
}

export function drainPendingProcess(): string[] {
  const ids = [...pending]
  pending.clear()
  return ids
}

export function __testResetPending(): void {
  pending.clear()
}
