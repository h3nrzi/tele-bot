# 06: Document branch protection setup

**What to build:** Add `docs/ops/branch-protection.md` with step-by-step instructions for enabling GitHub branch protection on `main`. After this ticket, an operator can follow the notes to make `ci` a hard merge gate — no PR can be merged without a green `ci` run — without requiring any code change.

**Blocked by:** 04 (`ci` job must exist so it can be referenced as a required status check in the instructions)

**Status:** done

- [x] `docs/ops/branch-protection.md` is created and committed
- [x] Instructions cover: Settings → Branches → Add branch ruleset → target `main` → require status check → select the `ci` check by name → save
- [x] Instructions note that "Require a pull request before merging" should also be enabled to prevent direct pushes bypassing CI
- [x] A note explains that the `cd` job is intentionally excluded from required checks (it only runs on `main` after merge, not on PRs)
- [x] Document is written for a human operator unfamiliar with GitHub's branch protection UI
