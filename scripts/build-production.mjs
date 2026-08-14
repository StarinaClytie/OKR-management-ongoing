import { spawnSync } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = [
  [process.execPath, ['scripts/verify-supabase-config.mjs', '--production']],
  [npmCommand, ['run', 'build']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
