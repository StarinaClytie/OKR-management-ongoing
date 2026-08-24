import { Packer } from 'docx';
import type { DailyReportDetail } from '../domain/types';
import { exportDailyReportWord, printDailyReportPdf } from './dailyReportExport';

const toBlob = vi.mocked(Packer.toBlob);

vi.mock('docx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('docx')>();
  return {
    ...actual,
    Packer: { ...actual.Packer, toBlob: vi.fn() },
  };
});

function detail(overrides: Partial<DailyReportDetail> = {}): DailyReportDetail {
  return {
    id: 'report-1',
    authorId: 'author-1',
    authorName: '王芳',
    date: '2026-08-24',
    status: 'submitted',
    hours: 7.5,
    currentRevision: 1,
    blocks: [{
      id: 'block-1',
      dailyObjective: '完成导出功能',
      keyResultId: 'kr-1',
      keyResults: [{ id: 'kr-1', title: '提升交付效率' }],
      workDescription: '实现 Word 导出',
      result: '通过验收',
      hours: 7.5,
      evidenceItems: [{
        id: 'evidence-1',
        attachmentId: 'attachment-1',
        label: '验收记录.pdf',
        kind: 'file',
        classification: 'internal',
        uploadState: 'uploaded',
      }],
    }],
    comments: [{
      id: 'comment-1',
      reportId: 'report-1',
      authorId: 'reviewer-1',
      authorName: '李经理',
      body: '结果清晰。',
      createdAt: '2026-08-24T08:00:00.000Z',
    }],
    canComment: false,
    canConfirm: false,
    ...overrides,
  };
}

function serialisedText(value: unknown) {
  return JSON.stringify(value);
}

describe('daily report exports', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    toBlob.mockResolvedValue(new Blob(['report']));
  });

  it('downloads an authorized report as Word with its visible content but no attachment secret', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:report');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const report = detail();

    await exportDailyReportWord(report);

    expect(click).toHaveBeenCalledOnce();
    const anchor = click.mock.instances[0] as HTMLAnchorElement;
    expect(anchor.download).toBe('日报-王芳-2026-08-24.docx');
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:report');
    const exportedContent = serialisedText(toBlob.mock.calls[0][0]);
    expect(exportedContent).toContain('完成导出功能');
    expect(exportedContent).toContain('提升交付效率');
    expect(exportedContent).toContain('实现 Word 导出');
    expect(exportedContent).toContain('通过验收');
    expect(exportedContent).toContain('7.5');
    expect(exportedContent).toContain('结果清晰。');
    expect(exportedContent).toContain('验收记录.pdf');
    expect(exportedContent).not.toContain('storage.example');
    expect(exportedContent).not.toContain('download-token');
  });

  it('writes escaped authorized content into a correctly titled PDF print view', () => {
    const write = vi.fn();
    const print = vi.fn();
    let onLoad: (() => void) | undefined;
    const popup = {
      document: { open: vi.fn(), write, close: vi.fn(() => onLoad?.()) },
      addEventListener: vi.fn((event: string, listener: () => void) => { if (event === 'load') onLoad = listener; }),
      print,
    } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(popup);

    printDailyReportPdf(detail({ authorName: '<王芳>', blocks: [{
      ...detail().blocks[0], workDescription: '<img src=x onerror=alert(1)>',
    }] }));

    expect(write).toHaveBeenCalledOnce();
    const html = write.mock.calls[0][0] as string;
    expect(html).toContain('<title>日报-王芳-2026-08-24</title>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(print).toHaveBeenCalledOnce();
  });

  it('raises a typed error when the browser blocks the PDF print window', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);

    expect(() => printDailyReportPdf(detail())).toThrow(/popup_blocked/);
    try {
      printDailyReportPdf(detail());
    } catch (error) {
      expect(error).toMatchObject({ code: 'popup_blocked' });
    }
  });
});
