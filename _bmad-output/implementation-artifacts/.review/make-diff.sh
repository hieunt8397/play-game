#!/usr/bin/env bash
# Usage: make-diff.sh <E>-<S>   (run from anywhere) — builds .review/diff-<E>-<S>.patch from .changed-<E>-<S>.txt
set -u
ROOT="C:/Users/nguyentrunghieu/Desktop/workspace/play"
ART="$ROOT/_bmad-output/implementation-artifacts"
ID="$1"
OUT="$ART/.review/diff-$ID.patch"
cd "$ROOT" || exit 1
: > "$OUT"
while IFS= read -r f; do
  f=$(printf '%s' "$f" | tr -d '\r')
  [ -n "$f" ] && [ -f "$f" ] && git diff --no-index /dev/null "$f" >> "$OUT" 2>/dev/null
done < "$ART/.changed-$ID.txt"
ls -la "$OUT"
