import { readFileSync } from 'node:fs';

const mode = process.env.VITE_APP_MODE ?? 'demo';
const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const failures = [];

if (!['demo', 'supabase'].includes(mode)) failures.push('VITE_APP_MODE 必须是 demo 或 supabase');
if (mode === 'supabase') {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) failures.push('VITE_SUPABASE_URL 必须是有效的 HTTPS Supabase 项目 URL');
  if (!key) failures.push('Supabase 模式缺少 VITE_SUPABASE_ANON_KEY');
}
for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'DATABASE_URL']) {
  if (process.env[forbidden]) failures.push(`前端环境不得包含 ${forbidden}`);
}

const trackedText = ['README.md', '.env.example'].map((file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } }).join('\n');
if (/service_role\s*=|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i.test(trackedText)) failures.push('文档或示例疑似包含高权限密钥/数据库连接串');

if (failures.length) {
  console.error(`配置检查失败（${failures.length} 项）：`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  console.log(`配置检查通过：模式=${mode}；未输出或读取任何密钥值。`);
}
