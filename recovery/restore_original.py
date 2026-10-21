#!/usr/bin/env python3
"""Restore the original Sites repository or its binary assets, entirely offline."""
from pathlib import Path, PurePosixPath
import argparse
import base64
import hashlib
import json
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / 'manifest.json').read_text(encoding='utf-8'))


def checked_path(root, relative):
    item = PurePosixPath(relative)
    if item.is_absolute() or '..' in item.parts:
        raise ValueError('Unsafe manifest path')
    result = (root / relative).resolve()
    if not result.is_relative_to(root.resolve()):
        raise ValueError('Path escapes destination')
    return result


def digest(data):
    return hashlib.sha256(data).hexdigest()


def bundle_bytes():
    parts = []
    for part in MANIFEST['bundle']['parts']:
        raw = checked_path(HERE, part['path']).read_bytes()
        if digest(raw) != part['sha256']:
            raise ValueError('Bundle part checksum mismatch: ' + part['path'])
        parts.append(raw.strip())
    data = base64.b64decode(b''.join(parts), validate=True)
    if len(data) != MANIFEST['bundle']['size_bytes'] or digest(data) != MANIFEST['bundle']['sha256']:
        raise ValueError('Original Git bundle checksum mismatch')
    return data


def git(directory, *args):
    return subprocess.check_output(['git', '-C', str(directory), *args], stderr=subprocess.PIPE)


def verify(directory):
    for item in MANIFEST['files']:
        path = checked_path(directory, item['path'])
        raw = path.read_bytes()
        if len(raw) != item['size_bytes'] or digest(raw) != item['sha256']:
            raise ValueError('Original file checksum mismatch: ' + item['path'])
    print(f"Verified {len(MANIFEST['files'])} original files byte for byte.")


def restore(args):
    data = bundle_bytes()
    if args.bundle_output:
        output = Path(args.bundle_output).resolve()
        if output.exists():
            raise ValueError('Bundle output already exists; choose a new path')
        output.write_bytes(data)
        print('Wrote verified original Git bundle: ' + str(output))
        return
    with tempfile.TemporaryDirectory(prefix='ri-v12-8-') as temp:
        temporary = Path(temp)
        bundle = temporary / 'original.bundle'
        bundle.write_bytes(data)
        checkout = Path(args.checkout).resolve() if args.checkout else temporary / 'checkout'
        if checkout.exists() and any(checkout.iterdir()):
            raise ValueError('Checkout destination must be empty; no existing files are overwritten')
        checkout.mkdir(parents=True, exist_ok=True)
        git(checkout, 'init', '--initial-branch', 'recovery/v12.8')
        git(checkout, 'bundle', 'verify', str(bundle))
        git(checkout, 'fetch', str(bundle), MANIFEST['source_ref'])
        commit = git(checkout, 'rev-parse', 'FETCH_HEAD').decode().strip()
        if commit != MANIFEST['source_commit']:
            raise ValueError('Original commit mismatch')
        git(checkout, 'checkout', '-B', 'recovery/v12.8', 'FETCH_HEAD')
        tree = git(checkout, 'rev-parse', 'HEAD^{tree}').decode().strip()
        if tree != MANIFEST['source_tree']:
            raise ValueError('Original source tree mismatch')
        git(checkout, 'fsck', '--full')
        if int(git(checkout, 'rev-list', '--count', 'HEAD')) != MANIFEST['original_commits']:
            raise ValueError('Original history is incomplete')
        verify(checkout)
        if args.assets_only:
            site = HERE.parent / 'site'
            for item in MANIFEST['files']:
                if item['stored_as'] != 'git-bundle':
                    continue
                source = checked_path(checkout, item['path'])
                target = checked_path(site, item['path'])
                raw = source.read_bytes()
                if target.exists() and target.read_bytes() != raw:
                    raise ValueError('Existing binary differs; preserve it first: ' + item['path'])
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
                target.chmod(int(item['mode'], 8) & 0o777)
            verify(site)
            print('Restored the three original binary assets into site/.')
        else:
            print(f"Restored {MANIFEST['original_commits']} commits at {commit} into {checkout}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--checkout', metavar='EMPTY_DIRECTORY', help='Restore the exact original Git repository and history')
    group.add_argument('--assets-only', action='store_true', help='Restore original fonts/XLSX into site/ and verify all source files')
    group.add_argument('--bundle-output', metavar='NEW_FILE', help='Write the self-contained native Git bundle')
    restore(parser.parse_args())
