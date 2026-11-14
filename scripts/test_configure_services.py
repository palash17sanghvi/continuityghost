import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import subprocess
import json

spec=importlib.util.spec_from_file_location('services',Path(__file__).with_name('configure-services.py'))
assert spec is not None and spec.loader is not None
services=importlib.util.module_from_spec(spec)
spec.loader.exec_module(services)

class ServiceSetupTests(unittest.TestCase):
    def setUp(self):
        root=Path.home()/'.hermes/cache/scratch'
        root.mkdir(parents=True,exist_ok=True)
        self.tmp=tempfile.TemporaryDirectory(dir=root)
        self.addCleanup(self.tmp.cleanup)
        self.path=Path(self.tmp.name)/'.env.local'
        self.original=b'# retain comment\nGEMINI_API_KEY=fixture-gemini\nALLOW_PAID_ANALYSIS=false\n'
        self.path.write_bytes(self.original)

    def test_preserves_existing_bytes(self):
        services.append_credentials(self.path,{'SUPERMEMORY_API_KEY':'fixture-memory'})
        self.assertTrue(self.path.read_bytes().startswith(self.original))
        self.assertEqual(self.path.stat().st_mode & 0o777,0o600)

    def test_refuses_existing_key(self):
        with self.assertRaises(ValueError):
            services.append_credentials(self.path,{'GEMINI_API_KEY':'replacement'})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_refuses_enabled_services(self):
        self.path.write_text('ALLOW_DATABASE=true\n')
        with self.assertRaises(ValueError):
            services.append_credentials(self.path,{'DATABASE_URL':'fixture'})

    def test_rejects_symlink(self):
        link=self.path.parent/'link'
        link.symlink_to(self.path)
        with self.assertRaises((ValueError,OSError)):
            services.append_credentials(link,{'DATABASE_URL':'fixture'})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_tls_url_and_escaping(self):
        url=services.tiger_url('Database name: film\nUsername: user\nPassword: p@ss:/?#$\nService URL: db.example.test\nPort: 5432\n')
        self.assertIn('sslmode=verify-full',url)
        self.assertIn('p%40ss%3A%2F%3F%23%24',url)
        self.assertEqual(services.tiger_url('postgresql://' + 'user:fixture@db.test:5432/film?sslmode=disable').split('?')[1],'sslmode=verify-full')

    def test_rejects_missing_fields(self):
        with self.assertRaises(ValueError):services.tiger_url('Username: u')

    def test_dotenv_special_characters(self):
        with self.assertRaises(ValueError):
            services.append_credentials(self.path,{'SUPERMEMORY_API_KEY':'fixture$#"\\key'})
        self.assertEqual(self.path.read_bytes(),self.original)

    def test_inline_enabled_flags_refused(self):
        for value in ['true # enabled', '"true" # enabled', "'true'", '${OTHER_FLAG}']:
            self.path.write_text('ALLOW_DATABASE='+value+'\n')
            with self.assertRaises(ValueError):
                services.append_credentials(self.path,{'DATABASE_URL':'fixture'})

    def test_actual_next_env_roundtrip(self):
        value='fixture#safe-token'
        services.append_credentials(self.path,{'SUPERMEMORY_API_KEY':value})
        code='const e=require("@next/env");e.loadEnvConfig(process.argv[1],true,{info(){},error(){}});console.log(JSON.stringify({ok:process.env.SUPERMEMORY_API_KEY===process.argv[2],gemini:process.env.GEMINI_API_KEY==="fixture-gemini",disabled:process.env.ALLOW_DATABASE==="false"}));'
        result=subprocess.run(['node','-e',code,str(self.path.parent),value],capture_output=True,text=True,check=True,cwd=str(Path(__file__).resolve().parents[1]))
        self.assertEqual(json.loads(result.stdout),{'ok':True,'gemini':True,'disabled':True})

    def test_missing_newline_is_preserved(self):
        self.path.write_bytes(b'GEMINI_API_KEY=fixture')
        services.append_credentials(self.path,{'DATABASE_URL':'fixture'})
        self.assertTrue(self.path.read_bytes().startswith(b'GEMINI_API_KEY=fixture\nDATABASE_URL='))

if __name__=='__main__':unittest.main()
