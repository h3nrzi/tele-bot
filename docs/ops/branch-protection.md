# GitHub Branch Protection Setup

This document provides step-by-step instructions for repository operators to configure branch protection on the `main` branch in GitHub.

Following these instructions makes the automated `ci` job a hard merge gate: no pull request can be merged into `main` without a passing CI run, preventing broken code, format regressions, or failing tests from entering production.

---

## Overview

Our CI/CD pipeline (`.github/workflows/ci-cd.yml`) defines two jobs:

- **`ci` (CI)**: Runs format checks (`prettier`), type checks (`tsc`), and the integration test suite (`vitest`) against PostgreSQL. This runs on every PR targeting `main` and every push to `main`.
- **`cd` (CD)**: Automated deployment to the production VPS. This runs **only** on push to `main` after `ci` succeeds.

Branch protection enforces two essential rules:

1. Direct pushes to `main` are blocked (all changes must go through a pull request).
2. The pull request cannot be merged unless the `ci` check has passed.

---

## Prerequisites

- You must have **Admin** or **Maintainer** permissions on the GitHub repository.
- The GitHub Actions workflow must have run at least once on GitHub so that the `CI` check name is registered in GitHub's check index.

---

## Step-by-Step Configuration

GitHub provides two interfaces for managing branch rules:

- **Method 1: Branch Rulesets (Modern / Recommended)**
- **Method 2: Classic Branch Protection Rules**

Follow either method below depending on what your repository UI displays.

### Method 1: Using Branch Rulesets (Recommended)

1. **Navigate to Repository Settings**:
   - Open the repository on GitHub.
   - Click the **Settings** tab in the top navigation bar.

2. **Open Rulesets**:
   - In the left sidebar, locate the **Code and automation** section.
   - Click **Rules** → **Rulesets** (or click **Branches**, then click **Add branch ruleset**).

3. **Create a New Ruleset**:
   - Click the green **New ruleset** button in the top right.
   - Select **New branch ruleset**.

4. **Configure Basic Information**:
   - **Ruleset Name**: Enter `Protect main`.
   - **Enforcement status**: Set to **Active**.

5. **Target the `main` Branch**:
   - Scroll down to the **Target branches** section.
   - Click **Add target** → select **Include default branch** (or select **Include by pattern** and enter `main`).

6. **Require a Pull Request**:
   - Under the **Rules** section, check **Require a pull request before merging**.
   - _(Optional)_ Adjust **Required approvals**: set to `0` for solo maintainer repositories, or `1`+ for team workflows.
   - **Why this is necessary**: Without this rule, anyone with write access could run `git push origin main` directly from their terminal, bypassing all CI checks.

7. **Require Status Checks to Pass**:
   - Under the **Rules** section, check **Require status checks to pass before merging**.
   - Click **+ Add checks**.
   - In the search field, type `CI` (the display name of the `ci` job defined in `.github/workflows/ci-cd.yml`).
   - Select `CI` from the search results.
   - _(Recommended)_ Check **Require branches to be up to date before merging** to guarantee that PRs are validated against the current tip of `main`.

8. **Save**:
   - Scroll to the bottom of the page and click **Create** (or **Save changes**).

---

### Method 2: Using Classic Branch Protection Rules

If your repository uses the classic branch protection interface:

1. **Navigate to Repository Settings**:
   - Open the repository on GitHub and click the **Settings** tab.

2. **Open Branches Settings**:
   - In the left sidebar under **Code and automation**, click **Branches**.

3. **Add Protection Rule**:
   - Under the **Branch protection rules** section, click **Add branch protection rule** (or **Add rule**).

4. **Target the `main` Branch**:
   - In the **Branch name pattern** field, type `main`.

5. **Require a Pull Request**:
   - Check **Require a pull request before merging**.
   - Set **Require approvals** according to team policy (e.g. `0` for solo projects, `1` for teams).
   - This prevents direct pushes to `main` that bypass CI.

6. **Require CI Status Check**:
   - Check **Require status checks to pass before merging**.
   - In the search field ("Search for status checks in the last week for this repository"), type `CI`.
   - Select the `CI` status check.
   - _(Recommended)_ Check **Require branches to be up to date before merging**.

7. **Save**:
   - Scroll to the bottom and click **Create** (or **Save changes**). Confirm with your GitHub password or 2FA if prompted.

---

## Critical Note: Exclude the `cd` Job

> [!WARNING]
> **DO NOT add the `cd` (CD) job as a required status check.**

### Why `cd` must NOT be required:

The `cd` deployment job is configured with the following condition in `.github/workflows/ci-cd.yml`:

```yaml
cd:
  name: CD
  needs: [ci]
  if: github.ref == 'refs/heads/main'
```

Because of `if: github.ref == 'refs/heads/main'`, **the `cd` job only runs on the `main` branch after a PR is merged** (or on a direct push to `main`). It **never runs on Pull Request branches**.

If you mark `CD` / `cd` as a required status check:

- GitHub will wait indefinitely for the `CD` job to report a status on the PR.
- Because the job never triggers on PRs, the status will remain "Expected — Waiting for status to be reported".
- **Result: Pull requests will be permanently blocked from merging.**

Only the `CI` check must be marked as required.

---

## Troubleshooting

### `CI` does not appear in the status check search box

GitHub only indexes check names after they have reported a status at least once. If `CI` does not appear:

1. Open a test branch, make a trivial commit, and push it to GitHub.
2. Open a Pull Request targeting `main`.
3. Wait for the GitHub Actions `CI` workflow to finish running.
4. Return to **Settings** → **Rulesets** (or **Branches**), edit the rule, and search for `CI` again.

---

## Verification Checklist

To confirm that branch protection is working as expected:

1. **Test Direct Push Block**:
   - Try to push directly to `main` from your terminal:
     ```bash
     git checkout main
     git commit --allow-empty -m "test: direct push"
     git push origin main
     ```
   - GitHub should reject the push with an error message indicating that `main` is protected and requires a pull request.

2. **Test PR Merge Gate**:
   - Create a feature branch and open a PR targeting `main`.
   - Verify that the PR shows `CI` as a required check.
   - Verify that the **Merge pull request** button is disabled while CI is running or if CI fails.
   - Verify that the PR can only be merged once `CI` turns green.
