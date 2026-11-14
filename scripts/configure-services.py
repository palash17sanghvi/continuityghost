"""Offline credential setup. Never contacts a service or prints secret values."""
import argparse
import fcntl
import getpass
import os
from pathlib import Path
import re
from urllib.parse import quote, urlsplit, urlunsplit

ENV = Path(__file__).resolve().parents[1] / '.env.local'
FLAGS = ('ALLOW_PAID_ANALYSIS', 'ALLOW_SUPERMEMORY', 'ALLOW_DATABASE')


def assignments(text):
    values = {}
    for key, raw in re.findall(r'^\s*(?:export\s+)?([A-Z_]+)\s*=\s*([^\r\n]*)$', text, re.M):
        raw = raw.strip()
        if raw.startswith(('"', "'", '`')):
            closing = raw.find(raw[0], 1)
            value = raw[1:closing] if closing >= 1 else raw
        else:
            value = raw.split('#', 1)[0].strip()
        values[key] = value
    return values


def append_credentials(path, values):
    # Lock existing inode, append only, and roll back our append on write failure.
    # Never truncate, replace, follow symlinks, or rewrite existing credential bytes.
    fd = os.open(path, os.O_RDWR | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0))
    with os.fdopen(fd, 'r+b') as file:
        fcntl.flock(file, fcntl.LOCK_EX)
        original = file.read()
        current = assignments(original.decode('utf-8'))
        if any(k in current and current[k] != 'false' for k in FLAGS):
            raise ValueError('Service flags must remain disabled during setup.')
        if any(k in current for k in values):
            raise ValueError('Credential variable already exists; refusing to replace it.')
        for key, value in values.items():
            if key not in ('SUPERMEMORY_API_KEY', 'DATABASE_URL', 'BACKEND_API_TOKEN') or not value or any(c in value for c in '\r\n\0'):
                raise ValueError('Invalid credential input.')
            if any(c in value for c in ('"', '\\', '$')):
                raise ValueError('Credential must be dotenv-safe; URL-encode connection components.')
        def encode(value):
            return '"' + value.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$') + '"'
        addition = ('' if not original or original.endswith(b'\n') else '\n')
        addition += ''.join(k + '=' + encode(v) + '\n' for k, v in values.items())
        addition += ''.join(k + '=false\n' for k in FLAGS if k not in current)
        os.fchmod(file.fileno(), 0o600)
        try:
            file.write(addition.encode('utf-8'))
            file.flush()
            os.fsync(file.fileno())
        except BaseException:
            file.truncate(len(original))
            file.flush()
            os.fsync(file.fileno())
            raise


def tiger_url(text):
    # Prefer explicit fields: avoids ambiguity from passwords in unescaped URLs.
    fields = {k.strip().lower(): v.strip() for k, v in re.findall(r'^\s*([A-Za-z][A-Za-z _-]*)\s*[:=]\s*(.*?)\s*$', text, re.M)}
    host = fields.get('host') or fields.get('service url')
    user = fields.get('username') or fields.get('user')
    password = fields.get('password')
    database = fields.get('database name') or fields.get('dbname')
    port = fields.get('port', '5432')
    if host and user and password and database:
        if not re.fullmatch(r'[A-Za-z0-9.-]+', host) or not port.isdigit() or not 1 <= int(port) <= 65535:
            raise ValueError('Invalid database host or port.')
        netloc = quote(user, safe='') + ':' + quote(password, safe='') + '@' + host + ':' + port
        return urlunsplit(('postgresql', netloc, '/' + quote(database, safe=''), 'sslmode=verify-full', ''))
    urls = re.findall(r'postgres(?:ql)?://[^\s\"\']+', text)
    if len(set(urls)) != 1:
        raise ValueError('Expected complete connection fields or one PostgreSQL URL.')
    url = urlsplit(urls[0])
    if not url.hostname or not url.username or not url.password or not url.path.strip('/') or url.fragment:
        raise ValueError('Incomplete PostgreSQL URL.')
    return urlunsplit((url.scheme, url.netloc, url.path, 'sslmode=verify-full', ''))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('service', choices=['supermemory', 'tiger', 'auth', 'status'])
    args = parser.parse_args()
    try:
        if args.service == 'status':
            values = assignments(ENV.read_text())
            for key in ('GEMINI_API_KEY', 'SUPERMEMORY_API_KEY', 'DATABASE_URL'):
                print(key + ': ' + ('configured' if values.get(key, '').strip().strip('"\'') else 'missing'))
            for key in FLAGS:
                print(key + ': ' + ('ENABLED' if values.get(key, '').strip().strip('"\'') == 'true' else 'disabled'))
            return
        if args.service == 'auth':
            import secrets
            append_credentials(ENV, {'BACKEND_API_TOKEN': secrets.token_urlsafe(48)})
        elif args.service == 'supermemory':
            # Abort instead of getpass's non-TTY fallback, which can echo secrets.
            import sys
            if not sys.stdin.isatty():
                raise ValueError('Run in an interactive terminal for hidden input.')
            key = getpass.getpass('Supermemory API key from Apple Passwords (hidden): ').strip()
            if not key or any(c.isspace() for c in key):
                raise ValueError('Key must be nonempty without whitespace.')
            append_credentials(ENV, {'SUPERMEMORY_API_KEY': key})
        else:
            answer = input('Read ~/Downloads/tiger-cloud-continuityghost-db-credentials.txt locally? Type READ to allow: ')
            if answer != 'READ':
                raise ValueError('File read cancelled.')
            source = Path.home() / 'Downloads/tiger-cloud-continuityghost-db-credentials.txt'
            append_credentials(ENV, {'DATABASE_URL': tiger_url(source.read_text())})
        print('Credential saved privately. Existing credentials preserved. Service flags remain disabled. No network calls made.')
    except (OSError, ValueError, UnicodeError):
        raise SystemExit('Setup stopped safely. Check file access, input format, existing variable names and disabled flags locally. No secret values displayed.') from None


if __name__ == '__main__':
    main()
