#!/usr/bin/env bash
# Usage: story.sh start|diff|review|done <E>-<S>
#   start  : snapshot app/ to the job tmp baseline, spec → in-progress, sprint → in-progress (+ epic)
#   diff   : rebuild .review/diff-<id>.patch + .changed-<id>.txt against the snapshot
#   review : spec → in-review
#   done   : spec → done, sprint → review
set -u
ROOT="C:/Users/nguyentrunghieu/Desktop/workspace/play"
ART="$ROOT/_bmad-output/implementation-artifacts"
TMP="C:/Users/nguyentrunghieu/.claude/jobs/0ba395ed/tmp"
CMD="$1"; ID="$2"; EPIC="${ID%%-*}"
SPEC=$(ls "$ART"/spec-"$ID"-*.md | head -1)
SNAP="$TMP/baseline-$ID"
stamp() { sed -i "s/^last_updated: .*/last_updated: $(date +%m-%d-%Y\ %H:%M)/" "$ART/sprint-status.yaml"; }
case "$CMD" in
  start)
    rm -rf "$SNAP"; mkdir -p "$SNAP"
    (cd "$ROOT" && tar --exclude=app/node_modules --exclude=app/dist -cf - app | tar -xf - -C "$SNAP")
    sed -i "s/^status: 'ready-for-dev'/status: 'in-progress'/" "$SPEC"
    sed -i "s/^\(  $ID-[^:]*\): ready-for-dev$/\1: in-progress/; s/^  epic-$EPIC: backlog$/  epic-$EPIC: in-progress/" "$ART/sprint-status.yaml"; stamp ;;
  diff)
    D="$ART/.review/diff-$ID.patch"
    (cd "$ROOT" && git diff --no-index -- "$SNAP/app" app 2>/dev/null | awk '/^diff --git/{skip=($0 ~ /node_modules|\/dist\/|package-lock|__pycache__|\.generated\/|atlases\/.*\.json|\.(png|m4a|blend|webp|pyc)$/)} !skip' > "$D")
    grep "^diff --git" "$D" | sed 's#.* b/##' > "$ART/.changed-$ID.txt"
    echo "diff: $D ($(wc -c < "$D") bytes)"; cat "$ART/.changed-$ID.txt"
    (cd "$ROOT" && git diff --no-index --stat -- "$SNAP/app" app 2>/dev/null | grep -v node_modules | grep -E "Bin|\.(png|m4a|blend|webp)" | tail -15) ;;
  review) sed -i "s/^status: 'in-progress'/status: 'in-review'/" "$SPEC" ;;
  done)
    sed -i "s/^status: 'in-review'/status: 'done'/" "$SPEC"
    sed -i "s/^\(  $ID-[^:]*\): in-progress$/\1: review/" "$ART/sprint-status.yaml"; stamp ;;
esac
echo "$(basename "$SPEC"): $(grep -m1 '^status' "$SPEC") | sprint: $(grep -E "^  $ID-" "$ART/sprint-status.yaml" | sed 's/.*: //')"
