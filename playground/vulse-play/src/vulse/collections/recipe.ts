import { defineCollection, z, blocks } from 'vulse'

export default defineCollection({
  name: 'recipe',
  label: 'Recipe',
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    body: blocks(),
  }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
  preview: { path: '/recipes/{slug}' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' && !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
