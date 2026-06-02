# Multi-Claude Session Setup Guide (WSL + tmux)

This guide helps you run multiple Claude Code instances side by side in tmux, save your sessions, and restore them after a reboot.

---

## Prerequisites

- WSL (Windows Subsystem for Linux) installed
- Claude Code CLI installed (`npm i -g @anthropic-ai/claude-code`)
- tmux installed (`sudo apt install tmux`)

---

## Step 1: Install tmux plugins

These plugins allow saving and restoring tmux sessions.

### 1.1 Install TPM (Tmux Plugin Manager)

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

### 1.2 Install tmux-resurrect (manual save/restore)

```bash
git clone https://github.com/tmux-plugins/tmux-resurrect ~/.tmux/plugins/tmux-resurrect
```

### 1.3 Install tmux-continuum (auto save/restore)

```bash
git clone https://github.com/tmux-plugins/tmux-continuum ~/.tmux/plugins/tmux-continuum
```

---

## Step 2: Configure tmux

Create (or replace) the tmux config file:

```bash
cat > ~/.tmux.conf << 'EOF'
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'

# Save/restore pane contents
set -g @resurrect-capture-pane-contents 'on'
set -g @resurrect-processes 'claude'

# Auto-save every 5 minutes + auto-restore on tmux start
set -g @continuum-save-interval '5'
set -g @continuum-restore 'on'

run "$HOME/.tmux/plugins/tpm/tpm"
EOF
```

---

## Step 3: Create the session launcher script

This script creates a tmux session with any number of Claude panes side by side.

```bash
cat > ~/claude-session.sh << 'EOF'
#!/bin/bash
SESSION="${1:-claude-work}"
PANES="${2:-2}"
DIR="/mnt/d/omysha"
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
EOF
chmod +x ~/claude-session.sh
```

> **Note:** Change `DIR="/mnt/d/omysha"` to your own project directory if different.

---

## Step 4: Auto-start tmux when you open the terminal

Add this to the end of your `~/.bashrc`:

```bash
echo '
if command -v tmux &>/dev/null && [ -z "$TMUX" ]; then
    tmux attach 2>/dev/null || tmux new-session -s default
fi' >> ~/.bashrc
```

This makes it so every time you open your WSL terminal, you are automatically inside tmux.

---

## Step 5: Done! How to use it

### Start a multi-Claude session

```bash
~/claude-session.sh myproject 3
```

- `myproject` = session name (use any name you want)
- `3` = number of Claude panes side by side

This opens 3 Claude instances side by side. You can then assign roles to each one (orchestrator, worker, etc.).

### Navigate between panes

| Action | Keys |
|---|---|
| Move to left pane | `Ctrl+b` then `←` |
| Move to right pane | `Ctrl+b` then `→` |
| Move to any pane | `Ctrl+b` then arrow keys |

### Save your session

Press: `Ctrl+b` then `Ctrl+s`

You will see "Tmux environment saved" at the bottom of the screen.

> Sessions also auto-save every 5 minutes.

////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////////////
IMP NOTE FROM ME:
no need to do anything from the below part , as soon as you open the terminal , it will open that session , and also remember that if you open any ubuntu tab , this screen will load , so just exit claude and tmux , to simply use the terminal 

///////////////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////////////////////////




### Detach from session (keeps it running in background)

Press: `Ctrl+b` then `d`

### Reattach to a running session

```bash
tmux attach -t myproject
```

### List all running sessions

```bash
tmux ls
```

### Switch between sessions (when inside tmux)

Press: `Ctrl+b` then `s`

Use arrow keys to pick a session, press Enter.

### Kill a session you no longer need

```bash
tmux kill-session -t myproject
```

---

## After a Reboot

1. Open your WSL terminal — tmux starts automatically
2. Press `Ctrl+b` then `Ctrl+r` — this restores your saved pane layout
3. In each pane, run `claude --continue` to resume your previous conversation

> **Important:** Processes (like Claude) don't survive a reboot. Only the pane layout and working directories are restored. Use `claude --continue` to pick up where you left off.

---

## Quick Reference

| What you want to do | How to do it |
|---|---|
| Create session with N panes | `~/claude-session.sh <name> <number>` |
| Switch panes | `Ctrl+b` + arrow keys |
| Switch sessions | `Ctrl+b` then `s` |
| Save session | `Ctrl+b` then `Ctrl+s` |
| Restore session (after reboot) | `Ctrl+b` then `Ctrl+r` |
| Detach (keep running) | `Ctrl+b` then `d` |
| Reattach | `tmux attach -t <name>` |
| List sessions | `tmux ls` |
| Kill session | `tmux kill-session -t <name>` |
| Resume Claude conversation | `claude --continue` |

---

## Example Workflow

```
# Create 3 Claude panes for your project
~/claude-session.sh trading-bot 3

# In pane 1 (Ctrl+b ←): Tell Claude "You are the orchestrator..."
# In pane 2 (Ctrl+b →): Tell Claude "You are worker agent 1..."
# In pane 3 (Ctrl+b →): Tell Claude "You are worker agent 2..."

# Save when happy: Ctrl+b Ctrl+s
# Detach to do other work: Ctrl+b d
# Come back later: tmux attach -t trading-bot
```
