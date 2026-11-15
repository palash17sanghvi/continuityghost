"""Offline regression tests; only disposable fixture credentials are used."""
import contextlib
import io
import os
from pathlib import Path
import runpy
import shutil
import stat
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name('configure-gemini.py')


class ConfigureGeminiTests(unittest.TestCase):
    def setUp(self):
        scratch = Path.home() / '.hermes/cache/scratch'
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch)
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.script = self.root / 'scripts/configure-gemini.py'
        self.script.parent.mkdir()
        shutil.copyfile(SOURCE, self.script)
        self.target = self.root / '.env.local'
        self.output = io.StringIO()

    def run_setup(self, key='offline-fixture-key'):
        with patch('getpass.getpass', return_value=key) as prompt, contextlib.redirect_stdout(self.output), contextlib.redirect_stderr(self.output):
            runpy.run_path(str(self.script), run_name='__main__')
        self.assertEqual(prompt.call_count, 1)
        self.assertNotIn(key, self.output.getvalue())

    def test_creates_private_file_without_printing_key(self):
        self.run_setup()
        self.assertIn('GEMINI_API_KEY=offline-fixture-key\n', self.target.read_text())
        self.assertIn('ALLOW_PAID_ANALYSIS=false\n', self.target.read_text())
        self.assertIn('GEMINI_MODEL=gemini-3.6-flash\n', self.target.read_text())
        if os.name == 'posix':
            self.assertEqual(stat.S_IMODE(self.target.stat().st_mode), 0o600)

    def test_existing_file_is_unchanged_without_prompt(self):
        self.target.write_text('existing-fixture')
        with patch('getpass.getpass') as prompt, self.assertRaises(SystemExit):
            runpy.run_path(str(self.script), run_name='__main__')
        prompt.assert_not_called()
        self.assertEqual(self.target.read_text(), 'existing-fixture')

    def test_existing_env_is_not_shadowed_or_read(self):
        existing = self.root / '.env'
        existing.write_text('existing-private-fixture')
        with patch('getpass.getpass') as prompt, self.assertRaises(SystemExit):
            runpy.run_path(str(self.script), run_name='__main__')
        prompt.assert_not_called()
        self.assertEqual(existing.read_text(), 'existing-private-fixture')
        self.assertFalse(self.target.exists())

    def test_file_created_after_precheck_is_not_overwritten(self):
        def raced_prompt(_):
            self.target.write_text('race-fixture')
            return 'offline-fixture-key'
        with patch('getpass.getpass', side_effect=raced_prompt), self.assertRaises((SystemExit, FileExistsError)):
            runpy.run_path(str(self.script), run_name='__main__')
        self.assertEqual(self.target.read_text(), 'race-fixture')

    @unittest.skipUnless(os.name == 'posix', 'symlink requires POSIX')
    def test_dangling_symlink_is_not_followed(self):
        other = self.root / 'untouched'
        self.target.symlink_to(other)
        with patch('getpass.getpass', return_value='offline-fixture-key'), self.assertRaises((SystemExit, FileExistsError)):
            runpy.run_path(str(self.script), run_name='__main__')
        self.assertFalse(other.exists())

    def test_invalid_key_creates_no_file(self):
        for key in ['', 'two words', 'line\nbreak', 'key#comment', 'key$expand', 'key\\escape', 'key"quote', "key'quote", 'key`tick', 'key\x00control']:
            with self.subTest(case=bool(key)), self.assertRaises(SystemExit):
                self.run_setup(key)
            self.assertFalse(self.target.exists())


if __name__ == '__main__':
    unittest.main()
