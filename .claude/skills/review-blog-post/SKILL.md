---
name: review-blog-post
description: Review of a blog post in apps/blog before/after publishing — validates frontmatter against the content collection schema, file placement, permalink format/uniqueness, cover image existence, the <!-- more --> excerpt marker, and does a raw grammar/typo sanity pass (obvious misspellings, misplaced/missing commas, stray punctuation, wrong verb tense). Use when the user wants a blog post draft or a merged post reviewed, checked, or sanity-checked. This is a mechanical check only — structure plus surface-level grammar — never a rewrite of style, tone, or meaning.
---

Checks a single post in `apps/blog/src/content/blog/` against the conventions this blog actually
enforces (schema, file layout, image paths), plus a raw grammar/typo sanity pass. Report a short
pass/fail checklist at the end — don't write an essay.

**Hard boundary, applies to the whole skill, no exceptions:** never change semantics, style, word
choice, or tone. This is a sanity check for mechanical mistakes only — typos, misplaced commas,
stray punctuation, wrong tense within a sentence. If a sentence is grammatically valid but could
merely read better, that is not a finding — leave it untouched. The author writes conversationally
and sometimes dictates posts; when in doubt whether something is a genuine mechanical error or
just informal/spoken voice, skip it rather than flag it. Never apply a fix without the user
confirming it first — this skill reports, it doesn't silently rewrite prose.

## Process

### 1. Identify the target post

Use the path the user gave. If none, use the most recently modified file under
`apps/blog/src/content/blog/**/*.md` (`git log -1 --diff-filter=A` or `ls -t` across the tree).
If still ambiguous, ask.

### 2. Read the schema fresh

Read `apps/blog/src/content.config.ts` — don't rely on memory of its shape, it can change.
At the time of writing it requires `title` (string), `permalink` (string), `date` (coercible
date), and allows optional `tags` (string array), `updated` (coercible date), `featured_image`
(string), `comment_id` (number).

### 3. Checklist

Run through each item and record pass/fail with a one-line reason on any fail:

- **Required fields present** — every non-optional field from the schema is set and non-empty.
- **File placement** — post lives at `src/content/blog/<year>/<slug>.md`, and `<year>` matches
  the year in the post's own `date` field.
- **Permalink format** — kebab-case, trailing slash (e.g. `some-title/`), and matches the
  filename slug.
- **Permalink uniqueness** — grep `permalink:` across every post in the collection; the value
  must not collide with any other post's.
- **Cover image, if `featured_image` is set** — path follows the `/content/<year>/<slug>.<ext>`
  convention used elsewhere in the collection, and the referenced file actually exists under
  `apps/blog/public/content/<year>/`.
- **`<!-- more -->` marker** — present in the body. `astro.config.mjs` uses it to derive the
  excerpt/description via `astro-remark-description`; a post missing it silently gets no excerpt.
- **Date sanity** — `date` (and `updated`, if present) parse as valid dates, and `updated` is not
  earlier than `date`.

### 4. Grammar & typo sanity pass

Read the body prose and flag only mechanical mistakes, nothing else:

- **Typos** — obvious misspellings.
- **Comma mistakes** — missing comma before a coordinating conjunction joining two independent
  clauses, comma splices, or a comma dropped/added in a spot that changes parsing.
- **Stray or redundant punctuation** — doubled periods, a comma immediately followed by a period,
  a leftover punctuation mark from an edit.
- **Wrong tense** — a verb whose tense breaks agreement with the rest of its own sentence (e.g.
  switches from past to present mid-sentence with no reason to).

Do not flag: word choice, phrasing, sentence length, repetition, tone, or anything that is a
legitimate stylistic choice rather than an error. Do not flag informal/spoken constructions just
because they're informal — this blog's voice is conversational and partly dictated.

List findings as `line N: "<short quote>" — <what's wrong> → <minimal fix>`. The fix must be the
smallest possible mechanical correction — never a rephrase. If nothing is found, say so in one
line.

### 5. Report

Post the structural checklist as ✅/❌ lines (one-line fix per fail), followed by the grammar
findings list (or "none found"). If everything passes, say so in one line — don't pad it out. Do
not apply any fix, structural or grammatical, unless the user asks you to.
