#!/bin/bash
cd ~/.claude/projects/-mnt-d-workspace-linkedin-automation/ || exit 1
for f in *.jsonl; do
  role=$(head -3 "$f" | grep -oE "You are the [A-Za-z]+ (agent|for)" | head -1)
  ts=$(stat -c %y "$f" | cut -d. -f1)
  echo "[$ts] $f -> ${role:-UNKNOWN}"
done
