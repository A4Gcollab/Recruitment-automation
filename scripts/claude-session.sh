#!/bin/bash
SESSION="${1:-claude-work}"
PANES="${2:-2}"
DIR="/mnt/d/workspace/linkedin-automation"
if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux attach -t "$SESSION"
    exit 0
fi
tmux new-session -d -s "$SESSION" -c "$DIR"
tmux send-keys -t "$SESSION:0.0" 'claude' C-m
for ((i=1; i<PANES; i++)); do
    tmux split-window -h -t "$SESSION" -c "$DIR"
    tmux send-keys -t "$SESSION:0.$i" 'claude' C-m
done
tmux select-layout -t "$SESSION" even-horizontal
tmux attach -t "$SESSION"
