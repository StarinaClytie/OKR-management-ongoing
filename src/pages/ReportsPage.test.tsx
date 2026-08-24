import { render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle, useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import type { OkrRepository } from '../data/types';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { createReportNotificationOpenRegistry, ReportNotificationOpenContext } from '../layout/AppShell';
import { ReportsPage } from './ReportsPage';

vi.mock('./DailyReportsPage', () => ({
  DailyReportsPage: forwardRef(function DailyReportsPageStub(_props, ref) {
    const [openedReportId, setOpenedReportId] = useState<string>();
    useImperativeHandle(ref, () => ({
      async openReportDetail(reportId: string) {
        setOpenedReportId(reportId);
      },
    }));
    return <p>{openedReportId ? `opened:${openedReportId}` : 'daily-reports-ready'}</p>;
  }),
}));

describe('ReportsPage notification bridge', () => {
  it('registers the daily report page handle and consumes a queued open once', async () => {
    const registry = createReportNotificationOpenRegistry();
    await registry.request('report-from-notification');

    render(
      <AuthProvider>
        <ReportNotificationOpenContext.Provider value={{ register: registry.register }}>
          <LocaleProvider repository={{ mode: 'supabase' } as OkrRepository}>
            <MemoryRouter initialEntries={['/reports?tab=daily']}><ReportsPage /></MemoryRouter>
          </LocaleProvider>
        </ReportNotificationOpenContext.Provider>
      </AuthProvider>,
    );

    expect(await screen.findByText('opened:report-from-notification')).toBeVisible();

    const replacement = vi.fn(async () => undefined);
    registry.register(replacement);
    await waitFor(() => expect(replacement).not.toHaveBeenCalled());
  });
});
