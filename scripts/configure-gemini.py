"""Run locally. Never print or overwrite a credential."""
import getpass
import os
from pathlib import Path

path = Path(__file__).resolve().parents[1] / '.env.local'
if path.with_name('.env').exists():
    raise SystemExit('.env exists. Edit Gemini configuration there locally; creating .env.local could shadow existing settings.')
if path.exists():
    raise SystemExit('.env.local exists. Edit it locally; this script refuses to overwrite it.')
key = getpass.getpass('Gemini API key (hidden): ').strip()
if not key or any(c.isspace() or c in "\"'\\$#`" or ord(c) < 32 or ord(c) == 127 for c in key):
    raise SystemExit('Key must be nonempty and contain no whitespace or dotenv-sensitive characters.')
fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as file:
    file.write('GEMINI_API_KEY=' + key + '\nGEMINI_MODEL=gemini-3.6-flash\nALLOW_PAID_ANALYSIS=false\nALLOW_SUPERMEMORY=false\nALLOW_DATABASE=false\n')
print('Saved private .env.local. Paid analysis remains disabled. Restart Next.js.')
