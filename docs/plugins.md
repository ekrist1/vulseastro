# Plugins

Vulse plugins are native TypeScript objects registered in `astro.config.mjs`.
They let project code extend Vulse without forking the package or patching
generated routes.

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'
import vulse from '@vulsecms/core/integration'
import { crmSyncPlugin } from './src/vulse/plugins/crm-sync'
import { welcomeEmailPlugin } from './src/vulse/plugins/welcome-email'

export default defineConfig({
  output: 'server',
  integrations: [
    vulse({
      plugins: [
        crmSyncPlugin(),
        welcomeEmailPlugin(),
      ],
    }),
  ],
})
```

This first plugin system is native-only: plugins run in the same server runtime
as Vulse. Sandboxed plugins, marketplace installation, plugin-owned migrations,
and capability enforcement are future additions.

## Create a plugin

Use `definePlugin()` from `vulse`:

```ts
// src/vulse/plugins/example.ts
import { definePlugin } from '@vulsecms/core'

export function examplePlugin() {
  return definePlugin({
    id: 'example',
    version: '0.1.0',
    hooks: {
      'form:afterSubmit': async ({ form, payload }, ctx) => {
        ctx.logger.info(`Received ${form.handle}`, payload)
      },
    },
  })
}
```

Plugin IDs must be lowercase letters, numbers, dots, underscores, or dashes.
Higher `priority` values run earlier. Plugins with the same priority run in the
order they are registered.

```ts
definePlugin({
  id: 'spam-filter',
  priority: 10,
  hooks: {},
})
```

## Hook lifecycle

| Hook | Runs | Use for |
|------|------|---------|
| `form:beforeSubmit` | After Vulse loads the form and parses JSON, before rate limits, validation, storage, and queueing | Spam filters, payload normalization, custom rejection |
| `form:afterSubmit` | After the submission is stored and queued | Lightweight sync side effects |
| `form:beforeProcess` | In the queue consumer before built-in emails/webhooks | Queued CRM, webhook, and Slack work |
| `form:afterProcess` | In the queue consumer after built-in emails/webhooks | Logging and post-processing |
| `auth:userBeforeCreate` | Before Better Auth stores a new user | Registration allow/deny rules or default user data |
| `auth:userAfterCreate` | After Better Auth stores a new user | Welcome email, CRM sync, analytics |

Before hooks abort by default when they throw. After hooks log failures and
continue so a slow CRM or email service does not break the main workflow.

Every hook receives a second `ctx` argument:

```ts
ctx.env        // Cloudflare env bindings and secrets available to Vulse
ctx.logger     // debug/info/warn/error with the plugin id prefix
ctx.email.send // email helper using the SEND_EMAIL binding + EMAIL_FROM var
```

## Spam filter before storage

Use `form:beforeSubmit` when the submission should not be saved at all.

```ts
// src/vulse/plugins/spam-filter.ts
import { definePlugin } from '@vulsecms/core'

const BLOCKED_TERMS = ['casino', 'crypto bonus', 'loan offer']

export function spamFilterPlugin() {
  return definePlugin({
    id: 'spam-filter',
    priority: 20,
    hooks: {
      'form:beforeSubmit': ({ payload }) => {
        const text = Object.values(payload).join(' ').toLowerCase()
        if (BLOCKED_TERMS.some((term) => text.includes(term))) {
          return { action: 'drop', reason: 'blocked-term' }
        }
      },
    },
  })
}
```

`drop` returns the same fake success style as the built-in honeypot and skips
D1 storage, uniqueness checks, queueing, emails, and webhooks.

To show an error to the real user instead:

```ts
return { action: 'reject', message: 'Please remove links and try again.' }
```

## Update a CRM after form submissions

Use queued processing for CRM calls that can be slow or unreliable.

```ts
// src/vulse/plugins/crm-sync.ts
import { definePlugin } from '@vulsecms/core'

export function crmSyncPlugin() {
  return definePlugin({
    id: 'crm-sync',
    hooks: {
      'form:beforeProcess': async ({ form, payload, submission }, ctx) => {
        if (form.handle !== 'contact') return
        const endpoint = ctx.env.CRM_WEBHOOK_URL
        if (typeof endpoint !== 'string') return

        await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            source: 'vulse',
            form: form.handle,
            submissionId: submission.id,
            email: payload.email,
            name: payload.name,
            message: payload.message,
          }),
        })
      },
    },
  })
}
```

Add the secret or variable to `wrangler.toml`:

```toml
[vars]
CRM_WEBHOOK_URL = "https://crm.example.com/hooks/vulse"
```

## Send a welcome email during registration

Use `auth:userAfterCreate` for side effects after a member account is created.

```ts
// src/vulse/plugins/welcome-email.ts
import { definePlugin } from '@vulsecms/core'

export function welcomeEmailPlugin() {
  return definePlugin({
    id: 'welcome-email',
    hooks: {
      'auth:userAfterCreate': async ({ user }, ctx) => {
        if (!user.email) return

        await ctx.email.send({
          to: user.email,
          subject: 'Welcome',
          text: `Hi ${user.name ?? 'there'}, thanks for signing up.`,
        })
      },
    },
  })
}
```

The email helper uses Cloudflare Email Routing — the same binding as Vulse form email and password reset. Add the binding and from-address to `wrangler.toml`:

```toml
[[send_email]]
name = "SEND_EMAIL"

[vars]
EMAIL_FROM = "hello@example.com"
```

See [`configuration.md#email-send_email`](configuration.md#email-send_email) for full setup including local dev simulation.

## Registration allow/deny rule

Use `auth:userBeforeCreate` when the account should not be created.

```ts
// src/vulse/plugins/registration-rules.ts
import { definePlugin } from '@vulsecms/core'

export function registrationRulesPlugin() {
  return definePlugin({
    id: 'registration-rules',
    hooks: {
      'auth:userBeforeCreate': ({ user }) => {
        const email = user.email ?? ''
        if (email.endsWith('@example.invalid')) {
          return { action: 'reject', message: 'Email domain is not allowed.' }
        }
      },
    },
  })
}
```

For simple domain allowlists, prefer **Admin -> Settings -> Auth**. Use a plugin
when the rule needs project-specific logic.
