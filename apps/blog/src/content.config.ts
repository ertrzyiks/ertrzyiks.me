import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const blog = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
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
