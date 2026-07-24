# Issue Tracker: GitHub Issues

Issues for this project live in **GitHub Issues** on the main repository.

## Quick reference

- **Create an issue**: `gh issue create`
- **List issues**: `gh issue list`
- **View an issue**: `gh issue view <number>`
- **Close an issue**: `gh issue close <number>`

## How agent skills use this

Skills like `to-tickets`, `qa`, and `review` read from and write to GitHub Issues. They assume:
- The `gh` CLI is installed and authenticated
- Issues are the system of record for work tracking
- Issue titles and bodies contain specification details

## External PRs as requests

By default, pull requests from outside the repo (forks) are **not** treated as issue requests. To include them, edit this file and set `external_prs_as_requests: true` under the issue tracker frontmatter.
