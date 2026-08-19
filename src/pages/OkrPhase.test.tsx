import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from '../app/routes';

function renderOkrRoute(userId: string, path: string) {
  return render(
    <AuthProvider initialUserId={userId}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('OKR objective detail', () => {
  it('shows an objective leader its Key Results, assignments, and progress history', async () => {
    const user = userEvent.setup();
    renderOkrRoute('user-zhang-san', '/okrs/objective-spectrometer');

    expect(await screen.findByRole('heading', { name: '下一代光谱仪研发' })).toBeVisible();
    expect(screen.getByRole('button', { name: '添加 Key Result' })).toBeEnabled();

    await user.click(screen.getByRole('tab', { name: 'Key Results' }));

    expect(screen.getByText('将检测信噪比提升至 ≥35 dB')).toBeVisible();
    expect(screen.getByText('9月15日前完成光路设计并通过技术评审')).toBeVisible();
    expect(screen.getByText('完成首轮标定。')).toBeVisible();
    expect(screen.getAllByText('负责人：').length).toBeGreaterThan(0);
    expect(screen.getAllByText('协作人：').length).toBeGreaterThan(0);
  });
});

describe('OKR employee contributions', () => {
  it('shows a multi-objective employee their owned and collaborated KRs without inventing personal objectives', async () => {
    renderOkrRoute('user-wang-fang', '/okrs');

    expect(await screen.findByRole('heading', { name: '我的工作' })).toBeVisible();
    expect(screen.getAllByText('将检测信噪比提升至 ≥35 dB').length).toBeGreaterThan(0);
    expect(screen.getAllByText('完成缺陷样本数据集标注（≥5000张）').length).toBeGreaterThan(0);
    expect(screen.getByText('协作')).toBeVisible();
  });
});
