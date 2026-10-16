#!/bin/sh
set -eu

cd "$(dirname "$0")"
git add -A

if ! git diff --cached --quiet; then
  git commit -m "Update Vraj Naturals website"
else
  echo "No changes to commit."
fi
