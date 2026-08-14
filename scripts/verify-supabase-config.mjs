import { readFileSync } from 'node:fs';

const mode = process.env.VITE_APP_MODE ?? 'demo';
const url = process.env.VITE_SUPABASE_URL ?? '';
const key = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const productionVerification = process.argv.includes('--production');
const failures = [];

if (!['demo', 'supabase'].includes(mode)) failures.push('VITE_APP_MODE 必须是 demo 或 supabase');
if (mode === 'supabase') {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) failures.push('VITE_SUPABASE_URL 必须是有效的 HTTPS Supabase 项目 URL');
  if (!key) failures.push('Supabase 模式缺少 VITE_SUPABASE_ANON_KEY');
}
if (productionVerification && mode !== 'supabase') failures.push('生产验证要求 VITE_APP_MODE=supabase');
for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_PASSWORD', 'DATABASE_URL']) {
  if (process.env[forbidden]) failures.push(`前端环境不得包含 ${forbidden}`);
}

const trackedText = ['README.md', '.env.example'].map((file) => { try { return readFileSync(file, 'utf8'); } catch { return ''; } }).join('\n');
if (/service_role\s*=|postgres(?:ql)?:\/\/[^\s]+:[^\s]+@/i.test(trackedText)) failures.push('文档或示例疑似包含高权限密钥/数据库连接串');

const guideChecks = [
  /probability/i,
  /impact/i,
  /riskScore = probability × impact/,
  /1×3=3/,
  /most severe|最严重/iu,
  /employee|员工/iu,
  /project leader|项目负责人/iu,
  /KR progress|KR 进度/iu,
  /中文|Chinese/iu,
  /English|英文/iu,
];

for (const guidePath of ['docs/user-guide.zh-CN.md', 'docs/user-guide.en.md']) {
  let guide = '';
  try {
    guide = readFileSync(guidePath, 'utf8');
  } catch {
    failures.push(`缺少用户指南：${guidePath}`);
    continue;
  }
  if (!guideChecks.every((pattern) => pattern.test(guide))) {
    failures.push(`用户指南缺少必需的风险、权限或语言切换说明：${guidePath}`);
  }
}

if (failures.length) {
  console.error(`配置检查失败（${failures.length} 项）：`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exitCode = 1;
} else {
  console.log(`配置检查通过：模式=${mode}；未输出或读取任何密钥值。`);
}
