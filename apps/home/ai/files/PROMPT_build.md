0a. Study `specs/*` with up to 500 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md for durable architectural notes and open design questions (it is NOT a task list — see 0d).
0c. For reference, the application source code is in `src/*`.
0d. **GitHub Issues are the source of truth for progress and task tracking.** Run `gh issue list --state open` (and `gh issue view <n>` for detail) to see what's outstanding — start from the "Wayfinder" epic issue if one exists and follow its linked sub-issues. Do not maintain a parallel task list in a markdown file.

1. Your task is to implement functionality per the specifications using parallel subagents. Pick the most important open issue to address (respect any dependency notes in the epic issue). Before making changes, search the codebase (don't assume not implemented) using Sonnet subagents. You may use up to 500 parallel Sonnet subagents for searches/reads and only 1 Sonnet subagent for build/tests. Use Opus subagents when complex reasoning is needed (debugging, architectural decisions).
2. After implementing functionality or resolving problems, run the tests for that unit of code that was improved. If functionality is missing then it's your job to add it as per the application specifications. Ultrathink.
3. When you discover issues, file them as new GitHub issues (`gh issue create`) or comment on the relevant existing one — don't track them in a markdown file.
4. When the tests pass: `gh issue comment <n>` on the issue(s) you closed out, summarizing what changed and why (reference the commit); `gh issue close <n>` if the issue's scope is now fully done, or leave it open with a comment describing what remains if only partially done. Then `git add -A`, `git commit` with a message describing the changes, and `git push`.

99999. Important: When authoring documentation, capture the why — tests and implementation importance.
999999. Important: Single sources of truth, no migrations/adapters. If tests unrelated to your work fail, resolve them as part of the increment.
9999999. As soon as there are no build or test errors create a git tag. If there are no git tags start at 0.0.0 and increment patch by 1 for example 0.0.1  if 0.0.0 does not exist.
99999999. You may add extra logging if required to debug issues.
999999999. Keep @IMPLEMENTATION_PLAN.md current with durable architectural learnings using a subagent (gotchas, design decisions, cross-cutting notes) — but progress/status belongs on GitHub Issues, not here.
9999999999. When you learn something new about how to run the application, update @AGENTS.md using a subagent but keep it brief. For example if you run commands multiple times before learning the correct command then that file should be updated.
99999999999. For any bugs you notice, file or comment on a GitHub issue even if it is unrelated to the current piece of work.
999999999999. Implement functionality completely. Placeholders and stubs waste efforts and time redoing the same work.
99999999999999. If you find inconsistencies in the specs/* then use an Opus 4.6 subagent with 'ultrathink' requested to update the specs.
999999999999999. IMPORTANT: Keep @AGENTS.md operational only — status updates and progress notes belong on GitHub Issues, not in any markdown file in this repo.