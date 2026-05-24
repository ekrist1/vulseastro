import { defineCollection, z, blocks } from '@ekrist1/vulse'

export default defineCollection({
  name: 'page',
  label: 'Page',
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    body: blocks(),
  }),
  admin: { titleField: 'title', listColumns: ['title', 'slug'] },
  preview: { path: '/{slug}' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
