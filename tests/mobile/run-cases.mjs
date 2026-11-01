import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const windows = process.platform === 'win32';
const venv = join(root, '.venv', windows ? 'Scripts/python.exe' : 'bin/python');
const python = existsSync(venv) ? venv : windows ? 'py' : 'python3';
const args = ['-m', 'pytest', '-c', 'tests/mobile/cases/pytest.ini',
  'tests/mobile/cases/tests', ...process.argv.slice(2)];
const result = spawnSync(python, args, { cwd: root, stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`Could not start ${python}: ${result.error.message}. See tests/mobile/cases/README.md.`);
}
process.exit(result.status ?? 1);
