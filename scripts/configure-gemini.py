"""Run locally. Never print or overwrite a credential."""
import getpass
from pathlib import Path

path = Path(__file__).resolve().parents[1] / '.env.local'
if path.exists():
    raise SystemExit('.env.local exists. Edit it locally; this script refuses to overwrite it.')
key = getpass.getpass('Gemini API key (hidden): ').strip()
if not key or any(c.isspace() for c in key):
    raise SystemExit('Key must be nonempty and contain no whitespace.')
with path.open('x', opener=lambda name, flags: __import__('os').open(name, flags, 0o600)) as file:
    file.write('GEMINI_API_KEY=' + key + '\nGEMINI_MODEL=gemini-2.5-flash\nALLOW_PAID_ANALYSIS=false\nALLOW_SUPERMEMORY=false\nALLOW_DATABASE=false\n')
print('Saved private .env.local. Paid analysis remains disabled. Restart Next.js.')
