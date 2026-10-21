#!/usr/bin/env python3
"""Restore missing baseline binaries and run existing checks; never deploy."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def run(command, cwd):
    print('+ ' + ' '.join(map(str, command)), flush=True)
    environment = dict(os.environ)
    environment.pop('OPENAI_API_KEY', None)
    subprocess.run(list(map(str, command)), cwd=cwd, env=environment, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build', action='store_true')
    args = parser.parse_args()
    site = ROOT / 'site'
    manifest = json.loads((ROOT / 'recovery/manifest.json').read_text())
    missing = [item for item in manifest['files']
               if item['stored_as'] == 'git-bundle' and not (site / item['path']).exists()]
    if missing:
        with tempfile.TemporaryDirectory(prefix='ri-assets-') as temporary:
            original = Path(temporary) / 'original'
            run([sys.executable, ROOT / 'recovery/restore_original.py', '--checkout', original], ROOT)
            for item in missing:
                relative = Path(item['path'])
                if relative.is_absolute() or '..' in relative.parts:
                    raise ValueError('Unsafe recovery path')
                target = site / relative
                data = (original / relative).read_bytes()
                if hashlib.sha256(data).hexdigest() != item['sha256']:
                    raise ValueError('Invalid recovered asset')
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open('xb') as output:
                    output.write(data)
                target.chmod(int(item['mode'], 8) & 0o777)
    if not (site / 'node_modules/typescript/bin/tsc').exists():
        raise RuntimeError('Install locked site dependencies with the Sites installer before checks.')
    # Preserve the original PDF suite, including its historical output path.
    # This contains only a synthetic fixture. See docs/DEVELOPMENT.md.
    Path('/workspace/scratch/7a4c868771a2/pdf-qa').mkdir(parents=True, exist_ok=True)
    suites = sorted((site / 'scripts').glob('test-*.ts'))
    if not suites:
        raise RuntimeError('No test suites discovered')
    for suite in suites:
        run(['node', '--import', ROOT / 'recovery/test-loader.mjs', suite], site)
    run(['node', site / 'node_modules/typescript/bin/tsc', '--noEmit', '--incremental', 'false'], site)
    if args.build:
        run(['node', site / 'scripts/run-framework.mjs', 'build'], site)
    print(f'PASS: {len(suites)} suites, TypeScript' + (', production build' if args.build else ''))


if __name__ == '__main__':
    main()
