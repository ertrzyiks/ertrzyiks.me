# Domain docs — Single-context layout

This repository uses a **single-context** layout: all domain documentation and architectural decisions live together at the repo root.

## Layout

```
repo/
├── CONTEXT.md              ← Domain model, ubiquitous language, architectural decisions
├── docs/adr/               ← Architecture Decision Records (ADRs)
│   ├── 001-example.md
│   └── ...
└── [source code]
```

## How to maintain

- **CONTEXT.md**: Describe the domain model, define core entities and their relationships, list key invariants, and record decisions that shape the code.
- **docs/adr/**: Each significant architectural decision gets an ADR. Number them sequentially (001, 002, ...). See [ADR format](https://github.com/joelparkerhenderson/architecture_decision_record) for the template.

## How agent skills use this

Skills like `domain-modeling`, `code-review`, and `qa` read CONTEXT.md and ADRs to understand:
- What entities and flows the code models
- Why certain architectural decisions exist
- What the code is supposed to do (spec) vs. what it actually does (verification)

The skills use this context to ask better questions and catch bugs that type-checking alone would miss.
