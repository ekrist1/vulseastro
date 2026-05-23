import type { Plugin } from 'vite'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const VIRTUAL_ID = 'virtual:vulse-blueprints'
const RESOLVED_ID = '\0' + VIRTUAL_ID

export function vulseBlueprintsPlugin(root: string): Plugin {
  return {
    name: 'vulse-blueprints',
    resolveId(id: string) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id: string) {
      if (id !== RESOLVED_ID) return
      const dir = resolve(root, 'src/vulse/collections')
      let files: string[] = []
      try {
        files = readdirSync(dir)
          .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
          .map((f) => join(dir, f))
          .sort()
      } catch {
        files = []
      }
      if (!files.length) return 'export default []'
      const imports = files.map((f, i) => `import bp${i} from ${JSON.stringify(f)}`).join('\n')
      const items = files.map((_, i) => `bp${i}`).join(', ')
      return `${imports}\nexport default [${items}]\n`
    },
  }
}
