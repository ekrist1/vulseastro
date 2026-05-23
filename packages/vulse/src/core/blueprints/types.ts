import type { z } from 'astro/zod'

export type Role = 'admin' | 'editor' | 'member'

export interface AuthContext {
  user: { id: string; role: Role; email: string } | null
}

export interface AccessArgs<T = unknown> extends AuthContext {
  entry?: { id: string; status: 'draft' | 'published'; createdBy: string | null; content: T }
}

export type AccessFn<T = unknown> = (args: AccessArgs<T>) => boolean | Promise<boolean>

export interface AdminConfig {
  titleField: string
  listColumns?: string[]
}

export interface BlueprintAccess<T = unknown> {
  read?: AccessFn<T>
  create?: AccessFn<T>
  update?: AccessFn<T>
  delete?: AccessFn<T>
}

export interface Blueprint<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string
  label: string
  schema: S
  admin: AdminConfig
  access?: BlueprintAccess<z.infer<S>>
}
