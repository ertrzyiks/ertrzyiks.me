import { defineCollection, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    permalink: z.string(),
    tags: z.array(z.string()).optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    featured_image: z.string().optional(),
    comment_id: z.number().optional(),
  }),
});

export const collections = { blog };
