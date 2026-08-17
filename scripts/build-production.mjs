import { spawnSync } from 'node:child_process';
import { loadProductionEnv } from './production-env.mjs';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const productionEnv = await loadProductionEnv();
const commands = [
  [process.execPath, ['scripts/verify-supabase-config.mjs', '--production']],
  [npmCommand, ['run', 'build']],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: productionEnv });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
