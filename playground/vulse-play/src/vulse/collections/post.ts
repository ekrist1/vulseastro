import { defineCollection, z } from '@vulsecms/core'

export default defineCollection({
  name: 'post',
  label: 'Blog post',
  seo: true,
  schema: z.object({
    title: z.string().min(1),
    slug: z.string(),
    main_image: z.media().optional(),
    body: z.string().default(''),
  }),
  admin: {
    titleField: 'title',
    listColumns: ['title', 'slug'],
    seoMapping: { metaDescription: 'body', ogImage: 'main_image' },
  },
  preview: { path: '/post/{slug}' },
  access: {
    read: ({ user, entry }) => entry?.status === 'published' || !!user,
    create: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    update: ({ user }) => user?.role === 'admin' || user?.role === 'editor',
    delete: ({ user }) => user?.role === 'admin',
  },
})
