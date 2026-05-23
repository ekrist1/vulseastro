import { defineCollection, z } from 'astro:content'
import { vulseLoader } from 'vulse/loader'

export const collections = {
  page: defineCollection({
    loader: vulseLoader({ collection: 'page' }),
    schema: z.object({
      title: z.string(),
      slug: z.string(),
      body: z.any().optional(),
      id: z.string().optional(),
      status: z.enum(['draft', 'published']).optional(),
      publishedAt: z.string().nullable().optional(),
      updatedAt: z.string().optional(),
    }),
  }),
}
