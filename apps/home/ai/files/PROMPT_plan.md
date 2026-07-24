0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) for durable architectural notes and open design questions — it is NOT a task list.
0c. Study `src/lib/*` with up to 250 parallel Sonnet subagents to understand shared utilities & components.
0d. For reference, the application source code is in `src/*`.
0e. **GitHub Issues are the source of truth for progress and task tracking.** Run `gh issue list --state open` (and `gh issue view <n>` for detail) to see what's already tracked before proposing anything new — start from any epic/tracking issue and follow its linked sub-issues.

1. Use up to 500 Sonnet subagents to study existing source code in `src/*` and compare it against `specs/*`. Use an Opus subagent to analyze findings and identify gaps not already covered by an open GitHub issue. Ultrathink. Consider searching for TODO, minimal implementations, placeholders, skipped/flaky tests, and inconsistent patterns. For each genuinely new gap found, file a GitHub issue (`gh issue create`) describing it — link it from the epic/tracking issue if one exists. Do not create or maintain a parallel task list in a markdown file.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first, and confirm it isn't already tracked by an existing issue before filing a new one. Treat `src/lib` as the project's standard library for shared utilities and components. Prefer consolidated, idiomatic implementations there over ad-hoc copies.

ULTIMATE GOAL: We want to achieve [project-specific goal]. Consider missing elements and plan accordingly. If an element is missing, search first to confirm it doesn't exist, then if needed author the specification at specs/FILENAME.md. File a GitHub issue for the implementation work; only touch @IMPLEMENTATION_PLAN.md if the finding is a durable architectural note rather than a task.
