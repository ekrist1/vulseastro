import { describe, expect, it, beforeEach } from 'vitest'
import { definePlugin } from '../../src/index'
import { __testResetVulsePlugins, getVulsePlugins, setVulsePlugins } from '../../src/server/plugins'

describe('Vulse plugins', () => {
  beforeEach(() => { __testResetVulsePlugins() })

  it('accepts valid plugin definitions', () => {
    const plugin = definePlugin({ id: 'crm-sync', version: '0.1.0' })
    expect(plugin.id).toBe('crm-sync')
  })

  it('rejects invalid plugin ids', () => {
    expect(() => definePlugin({ id: 'CRM Sync' })).toThrow(/id must/)
  })

  it('rejects duplicate registrations', () => {
    const first = definePlugin({ id: 'dup' })
    const second = definePlugin({ id: 'dup' })
    expect(() => setVulsePlugins([first, second])).toThrow(/registered more than once/)
  })

  it('validates raw plugin ids during registration', () => {
    expect(() => setVulsePlugins([{ id: 'Bad Plugin' }])).toThrow(/id must/)
  })

  it('orders by descending priority and then registration order', () => {
    setVulsePlugins([
      definePlugin({ id: 'default-a' }),
      definePlugin({ id: 'early', priority: 10 }),
      definePlugin({ id: 'default-b' }),
    ])

    expect(getVulsePlugins().map((plugin) => plugin.id)).toEqual([
      'early',
      'default-a',
      'default-b',
    ])
  })
})
