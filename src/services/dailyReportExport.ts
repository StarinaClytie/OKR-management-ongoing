import type { DailyReportDetail, ReportStatus } from '../domain/types';
import { renderDailyReportPrintView } from '../pages/daily-report/DailyReportPrintView';

type DocxModule = typeof import('docx');

const statusLabels: Record<ReportStatus, string> = {
  draft: '草稿',
  submitted: '已提交',
  returned: '已退回',
  confirmed: '已确认',
};

export class DailyReportExportError extends Error {
  readonly code: 'popup_blocked';

  constructor(code: 'popup_blocked') {
    super(code);
    this.name = 'DailyReportExportError';
    this.code = code;
  }
}

function textCell(docx: DocxModule, value: string) {
  return new docx.TableCell({ children: [new docx.Paragraph(value)] });
}

function detailsTable(docx: DocxModule, detail: DailyReportDetail) {
  return new docx.Table({
    rows: [
      new docx.TableRow({ children: [textCell(docx, '姓名'), textCell(docx, detail.authorName), textCell(docx, '日期'), textCell(docx, detail.date)] }),
      new docx.TableRow({ children: [textCell(docx, '状态'), textCell(docx, statusLabels[detail.status]), textCell(docx, '工时'), textCell(docx, `${detail.hours} 小时`)] }),
    ],
  });
}

function attachmentMetadata(kind: string, classification: string, uploadState: string) {
  return `${kind === 'file' ? '文件' : '链接'} · ${classification} · ${uploadState}`;
}

function safeFilenamePart(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').trim() || '日报';
}

function documentChildren(docx: DocxModule, detail: DailyReportDetail) {
  return [
    new docx.Paragraph({ text: '日报', heading: docx.HeadingLevel.HEADING_1 }),
    detailsTable(docx, detail),
    new docx.Paragraph({ text: '日报事项', heading: docx.HeadingLevel.HEADING_2 }),
    ...detail.blocks.flatMap((block, index) => [
      new docx.Paragraph({ text: `事项 ${index + 1}`, heading: docx.HeadingLevel.HEADING_3 }),
      new docx.Paragraph(`当日 O：${block.dailyObjective}`),
      new docx.Paragraph(`关联季度 KR：${block.keyResults.map((keyResult) => keyResult.title).join('、') || block.keyResultId}`),
      ...(block.workDescription ? [new docx.Paragraph(`工作描述：${block.workDescription}`)] : []),
      new docx.Paragraph(`结果 / 数据：${block.result}`),
      new docx.Paragraph(`工时：${block.hours} 小时`),
      ...(block.evidenceItems?.map((item) => new docx.Paragraph(`附件：${item.label}（${attachmentMetadata(item.kind, item.classification, item.uploadState ?? 'unknown')}）`)) ?? []),
    ]),
    new docx.Paragraph({ text: '评论', heading: docx.HeadingLevel.HEADING_2 }),
    ...(detail.comments.length
      ? detail.comments.map((comment) => new docx.Paragraph(`${comment.authorName} · ${comment.createdAt}\n${comment.body}`))
      : [new docx.Paragraph('暂无评论')]),
  ];
}

export async function exportDailyReportWord(detail: DailyReportDetail): Promise<void> {
  const docx = await import('docx');
  const wordDocument = new docx.Document({ sections: [{ children: documentChildren(docx, detail) }] });
  const blob = await docx.Packer.toBlob(wordDocument);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = documentCreateAnchor(objectUrl, `日报-${safeFilenamePart(detail.authorName)}-${detail.date}.docx`);

  try {
    window.document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

function documentCreateAnchor(href: string, filename: string) {
  const anchor = window.document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.style.display = 'none';
  return anchor;
}

function printDocument(title: string, body: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title><style>
    body { color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif; line-height: 1.55; margin: 32px; }
    h1, h2, h3 { color: #0f172a; } .daily-report-print__meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .daily-report-print__meta div, .daily-report-print__entry { border: 1px solid #d1d5db; padding: 12px; margin-bottom: 12px; } dt { font-weight: 700; } dd { margin: 4px 0 0; }
    @media print { .daily-report-print header p { display: none; } body { margin: 0; } }
  </style></head><body>${body}</body></html>`;
}

export function printDailyReportPdf(detail: DailyReportDetail): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new DailyReportExportError('popup_blocked');

  const title = `日报-${safeFilenamePart(detail.authorName)}-${detail.date}`;
  popup.addEventListener('load', () => popup.print(), { once: true });
  popup.document.open();
  popup.document.write(printDocument(title, renderDailyReportPrintView(detail)));
  popup.document.close();
}
