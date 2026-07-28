#!/bin/bash
# Builds the web app and publishes dist/ to the gh-pages branch, which GitHub
# Pages serves at https://junghaku.github.io/NoteMaxx/.
#
# This uses a branch rather than a Pages Actions workflow because pushing
# .github/workflows/ requires the `workflow` OAuth scope. To switch to
# auto-deploy on push instead, run `gh auth refresh -s workflow`, then restore
# the workflow file and set Pages' source back to GitHub Actions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
WORKTREE="$(mktemp -d)"

cd "$ROOT"
npm run build

# .nojekyll stops Pages from running Jekyll, which would drop any file or
# directory whose name begins with an underscore.
touch dist/.nojekyll

cleanup() {
  git -C "$ROOT" worktree remove --force "$WORKTREE" 2>/dev/null || true
  rm -rf "$WORKTREE"
}
trap cleanup EXIT

# An orphan worktree keeps gh-pages free of source history.
if git -C "$ROOT" show-ref --verify --quiet refs/heads/gh-pages; then
  git -C "$ROOT" worktree add --force "$WORKTREE" gh-pages
else
  git -C "$ROOT" worktree add --force --detach "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan gh-pages
fi

find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R dist/. "$WORKTREE"/

cd "$WORKTREE"
git add -A
if git diff --cached --quiet; then
  echo "No changes to deploy."
else
  git commit -qm "Deploy $(git -C "$ROOT" rev-parse --short HEAD)"
fi
git push -q --force "$REMOTE" gh-pages

echo "Deployed to gh-pages -> https://junghaku.github.io/NoteMaxx/"
