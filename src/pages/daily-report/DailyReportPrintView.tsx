import type { DailyReportDetail } from '../../domain/types';

const statusLabels = {
  draft: '草稿',
  submitted: '已提交',
  returned: '已退回',
  confirmed: '已确认',
} as const;

function escapeHtml(value: string | number) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]!);
}

function attachmentMetadata(kind: string, classification: string, uploadState: string) {
  return [kind === 'file' ? '文件' : '链接', classification, uploadState].join(' · ');
}

export function renderDailyReportPrintView(detail: DailyReportDetail) {
  const entries = detail.blocks.map((block, index) => {
    const keyResults = block.keyResults.map((keyResult) => keyResult.title).join('、') || block.keyResultId;
    const attachments = block.evidenceItems?.length
      ? `<ul>${block.evidenceItems.map((item) => `<li>${escapeHtml(item.label)}（${escapeHtml(attachmentMetadata(item.kind, item.classification, item.uploadState ?? 'unknown'))}）</li>`).join('')}</ul>`
      : '';
    return `<article class="daily-report-print__entry"><h3>事项 ${index + 1}</h3><p><strong>当日 O：</strong>${escapeHtml(block.dailyObjective)}</p><p><strong>关联季度 KR：</strong>${escapeHtml(keyResults)}</p>${block.workDescription ? `<p><strong>工作描述：</strong>${escapeHtml(block.workDescription)}</p>` : ''}<p><strong>结果 / 数据：</strong>${escapeHtml(block.result)}</p><p><strong>工时：</strong>${escapeHtml(block.hours)} 小时</p>${attachments}</article>`;
  }).join('');
  const comments = detail.comments.length
    ? `<ol>${detail.comments.map((comment) => `<li><strong>${escapeHtml(comment.authorName)}</strong> · ${escapeHtml(comment.createdAt)}<br>${escapeHtml(comment.body)}</li>`).join('')}</ol>`
    : '<p>暂无评论</p>';

  return `<main class="daily-report-print"><header><h1>日报</h1><p>请在系统打印窗口中选择“另存为 PDF”。</p></header><dl class="daily-report-print__meta"><div><dt>姓名</dt><dd>${escapeHtml(detail.authorName)}</dd></div><div><dt>日期</dt><dd>${escapeHtml(detail.date)}</dd></div><div><dt>状态</dt><dd>${escapeHtml(statusLabels[detail.status])}</dd></div><div><dt>工时</dt><dd>${escapeHtml(detail.hours)} 小时</dd></div></dl><section><h2>日报事项</h2>${entries}</section><section><h2>评论</h2>${comments}</section></main>`;
}
