#!/bin/bash
# Restore the 4-agent A4G tmux session by resuming each agent's persisted Claude session.
# Usage:  ~/claude-restore.sh
# After it finishes, attach with:  tmux attach -t a4g

SESSION="a4g"
DIR="/mnt/d/workspace/linkedin-automation"

# Pane -> session-id map (keep in sync with scripts/identify-sessions.sh output)
ORCHESTRATOR="3265ede9-158c-4d2a-9d24-409428897a82"
BACKEND="4f0292ea-b038-4023-870a-6867f2350ea2"
FRONTEND="f950a82d-15f6-493f-943d-ea1d0c70570f"
INTEGRATIONS="f9f93f05-ae88-463b-9381-9937f4a978b1"

if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "Session '$SESSION' already exists. Attach with: tmux attach -t $SESSION"
    exit 0
fi

# Create the session detached, with pane 0 = Orchestrator
tmux new-session -d -s "$SESSION" -c "$DIR" -n "agents"
tmux send-keys -t "$SESSION:0.0" "claude --resume $ORCHESTRATOR" C-m

# Pane 1 = Backend
tmux split-window -h -t "$SESSION:0" -c "$DIR"
tmux send-keys -t "$SESSION:0.1" "claude --resume $BACKEND" C-m

# Pane 2 = Frontend
tmux split-window -h -t "$SESSION:0" -c "$DIR"
tmux send-keys -t "$SESSION:0.2" "claude --resume $FRONTEND" C-m

# Pane 3 = Integrations
tmux split-window -h -t "$SESSION:0" -c "$DIR"
tmux send-keys -t "$SESSION:0.3" "claude --resume $INTEGRATIONS" C-m

tmux select-layout -t "$SESSION:0" even-horizontal
tmux select-pane  -t "$SESSION:0.0"

echo "Session '$SESSION' restored with all 4 agents resuming their prior conversations."
echo "Attach with:  tmux attach -t $SESSION"
