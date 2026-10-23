#!/usr/bin/env python3
"""Strict, dependency-free VSIX release audit. Never uploads or publishes."""
import json
import os
import re
import sys
import zipfile
from pathlib import Path

archive = Path(sys.argv[1] if len(sys.argv) > 1 else 'vscode-gungnir.vsix')
if not archive.is_file():
    raise SystemExit(f'VSIX does not exist: {archive}')
with zipfile.ZipFile(archive) as z:
    invalid = z.testzip()
    assert invalid is None, f'Corrupt ZIP member: {invalid}'
    members = z.namelist()
    assert len(members) == len(set(members)), 'Duplicate archive entries'
    for name in members:
        assert not name.startswith('/') and '..' not in Path(name).parts, f'Unsafe archive entry: {name}'
        assert not re.match(r'^[A-Za-z]:', name), f'Windows path entry: {name}'
        lower = name.lower()
        assert not any(part in lower for part in (
            'node_modules/', '.git/', 'test-fixtures/', 'dist-test/', 'src/',
            '/.env', 'credentials', '.github/', 'coverage/',
        )), f'Development or sensitive file inside VSIX: {name}'
        assert not lower.endswith(('.map', '.vsix', '.exe', '.dll', '.pdb', '.key', '.pem')), f'Unexpected binary/debug material: {name}'
        assert (z.getinfo(name).external_attr >> 16) & 0o170000 != 0o120000, f'Symlink in VSIX: {name}'
    package = json.loads(z.read('extension/package.json'))
    assert package['name'] == 'vscode-gungnir'
    assert package['publisher'] == 'gungnir', 'Publisher must be reviewed before manual publishing'
    assert re.fullmatch(r'\d+\.\d+\.\d+', package['version']), 'Invalid release version'
    assert package['main'] == './dist/extension.js'
    assert package['engines']['vscode'] == '^1.100.0'
    spear = [item for item in package['contributes']['languages'] if item['id'] == 'gungnir-spear']
    assert len(spear) == 1 and spear[0]['extensions'] == ['.spear']
    assert not package['contributes'].get('configurationDefaults', {}).get('[gungnir-spear]')
    assert any(g['language'] == 'gungnir-spear' and g['scopeName'] == 'text.html.spear'
               for g in package['contributes']['grammars'])
    assert package.get('preview') is True, 'Unvalidated native SDK features must remain preview'
    required = [
        'extension.vsixmanifest', 'extension/package.json', 'extension/readme.md',
        'extension/changelog.md', 'extension/LICENSE.txt',
        'extension/dist/extension.js', 'extension/syntaxes/gungnir.tmLanguage.json',
        'extension/snippets/gungnir.code-snippets',
        'extension/language-configuration.json',
        'extension/spear-language-configuration.json',
        'extension/syntaxes/spear.tmLanguage.json',
        'extension/snippets/spear.code-snippets',
        'extension/resources/icons/gungnir-light.svg',
        'extension/resources/icons/gungnir-dark.svg',
    ]
    for name in required:
        assert name in members, f'Missing release asset: {name}'
    assert len(members) < 35, 'Unexpected excessive packaged content'
    assert z.getinfo('extension/dist/extension.js').file_size > 10000
    assert z.getinfo('extension/readme.md').file_size > 1500
    assert not any('publisher-secret' in n for n in members)
print(f'PASS: {archive.name} v{package["version"]}, {len(members)} entries, integrity and metadata verified')
