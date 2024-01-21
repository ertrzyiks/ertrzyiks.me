import { defineConfig } from "astro/config";
import remarkDescription from "astro-remark-description";
import mdx from "@astrojs/mdx";

import sitemap from "@astrojs/sitemap";

// https://astro.build/config
export default defineConfig({
  site: "https://blog.ertrzyiks.me",
  markdown: {
    remarkPlugins: [
      [
        remarkDescription,
        {
          name: "excerpt",
          node: (node, i, parent) => {
            const sibling = parent?.children[i + 1];
            return (
              sibling?.type === "html" && sibling?.value === "<!-- more -->"
            );
          },
        },
      ],
    ],
  },
  integrations: [mdx(), sitemap()],
});
