"""Scheduler preflight: skip overlap, completed work, or cutoff. No service access."""
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.overnight'
STATE.mkdir(exist_ok=True)
CUTOFF = datetime.fromisoformat('2026-11-15T07:00:00-07:00').timestamp()
LOCK = STATE / 'running.lock'
now = time.time()
reason = None
if now >= CUTOFF - 1200:
    reason = 'Hard cutoff approaching; no new 20-minute pass may start.'
elif (STATE / 'STOP').exists():
    reason = 'Stopped early: completion or serious blocker recorded.'
elif LOCK.exists():
    try:
        lock = json.loads(LOCK.read_text(encoding='utf-8'))
        if now < lock['expires']:
            reason = 'Previous pass still owns execution lease.'
        else:
            # Do not reclaim automatically: interrupted work needs human review.
            reason = 'Expired lease; stop rather than risk overlapping or unverified edits.'
    except (ValueError, KeyError, OSError):
        reason = 'Unreadable execution lease; fail closed.'
if reason:
    print(json.dumps({'wakeAgent': False, 'reason': reason}))
else:
    try:
        fd = os.open(LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as file:
            json.dump({'started': now, 'expires': min(now + 1800, CUTOFF), 'cutoff': CUTOFF}, file)
        print(json.dumps({'wakeAgent': True, 'worktree': str(ROOT), 'deadlineEpoch': min(now + 1200, CUTOFF)}))
    except FileExistsError:
        print(json.dumps({'wakeAgent': False, 'reason': 'Another execution acquired lease.'}))
