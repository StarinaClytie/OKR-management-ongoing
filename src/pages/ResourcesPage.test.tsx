import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '../auth/AuthContext';
import type { OkrRepository, Resource } from '../data/types';
import type { User } from '../domain/types';
import { ResourcesPage } from './ResourcesPage';

const employee: User = { id: 'user-employee', name: '周琳', role: 'employee', clearance: 'internal', title: '产品经理', department: '产品部', projectIds: ['project-orion'] };

function makeResource(overrides: Partial<Resource> = {}): Resource {
  return {
    id: 'resource-1',
    name: 'Lens Set',
    category: 'optics',
    resourceKind: 'durable',
    description: '',
    ownerId: 'user-project-leader',
    ownerName: '李然',
    location: 'Optics Lab / Cabinet A',
    purchaseDate: null,
    purchaseVendor: null,
    purchaseReference: null,
    usageNotes: null,
    manualUrl: null,
    quantity: 1,
    unit: null,
    status: 'available',
    createdAt: '2026-05-12T08:00:00Z',
    updatedAt: '2026-06-02T09:30:00Z',
    archivedAt: null,
    ...overrides,
  };
}

const lensSet = makeResource();
const vacuumPump = makeResource({ id: 'resource-2', name: 'Vacuum Pump A', category: 'vacuum', ownerId: 'user-employee', ownerName: '周琳', status: 'in_use', location: 'Clean Room / Shelf B2' });
const archivedWrench = makeResource({ id: 'resource-3', name: 'Archived Wrench', category: 'tools', status: 'archived', archivedAt: '2026-07-01T00:00:00Z' });

function makeRepository(overrides: Record<string, unknown> = {}): OkrRepository {
  return {
    mode: 'supabase',
    listResources: vi.fn(async () => ({ ok: true, data: [lensSet, vacuumPump, archivedWrench] })),
    createResource: vi.fn(async () => ({ ok: true, data: { id: 'new-resource' } })),
    uploadResourceAttachment: vi.fn(async () => ({ ok: true, data: { id: 'att-new' } })),
    ...overrides,
  } as unknown as OkrRepository;
}

function renderPage(user: User, dataRepository: OkrRepository) {
  const authValue: AuthContextValue = {
    status: 'ready', mode: 'supabase', currentUser: user, selectableUsers: [], selectUser: vi.fn(), signOut: vi.fn(),
  };
  return render(
    <AuthContext.Provider value={authValue}>
      <MemoryRouter><ResourcesPage dataRepository={dataRepository} /></MemoryRouter>
    </AuthContext.Provider>,
  );
}

describe('ResourcesPage list', () => {
  it('groups search and resource controls into separate rows inside a labelled filter region', async () => {
    renderPage(employee, makeRepository());

    await screen.findByText('Lens Set');

    const filterCard = screen.getByRole('region', { name: '资源与耗材' });
    const searchRow = within(filterCard).getByTestId('resources-search-row');
    const controlsRow = within(filterCard).getByTestId('resources-filter-row');

    expect(searchRow).toContainElement(screen.getByRole('searchbox', { name: '搜索资源名称' }));
    expect(controlsRow).toContainElement(screen.getByLabelText('分类'));
    expect(controlsRow).toContainElement(screen.getByLabelText('状态'));
    expect(controlsRow).toContainElement(screen.getByLabelText('负责人'));
    expect(controlsRow).toContainElement(screen.getByRole('button', { name: '显示已归档' }));
  });

  it('renders resources and hides archived ones by default', async () => {
    renderPage(employee, makeRepository());

    expect(await screen.findByText('Lens Set')).toBeVisible();
    expect(screen.getByText('Vacuum Pump A')).toBeVisible();
    expect(screen.queryByText('Archived Wrench')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '显示已归档' }));
    expect(await screen.findByText('Archived Wrench')).toBeVisible();
  });

  it('shows an empty state when there are no resources', async () => {
    renderPage(employee, makeRepository({ listResources: vi.fn(async () => ({ ok: true, data: [] })) }));
    expect(await screen.findByText('当前没有可查看的资源。')).toBeVisible();
  });

  it('shows a loading state while data is pending', () => {
    renderPage(employee, makeRepository({ listResources: vi.fn(() => new Promise(() => undefined)) }));
    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  });

  it('shows a localized error when the list read fails', async () => {
    renderPage(employee, makeRepository({ listResources: vi.fn(async () => ({ ok: false, error: { code: 'network', message: '' } })) }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请求未完成，请稍后重试');
  });

  it('filters by search text', async () => {
    renderPage(employee, makeRepository());
    await screen.findByText('Lens Set');

    await userEvent.type(screen.getByRole('searchbox', { name: '搜索资源名称' }), 'vacuum');
    expect(screen.queryByText('Lens Set')).not.toBeInTheDocument();
    expect(screen.getByText('Vacuum Pump A')).toBeVisible();
  });

  it('filters by status', async () => {
    renderPage(employee, makeRepository());
    await screen.findByText('Lens Set');

    await userEvent.selectOptions(screen.getByLabelText('状态'), 'in_use');
    expect(screen.queryByText('Lens Set')).not.toBeInTheDocument();
    expect(screen.getByText('Vacuum Pump A')).toBeVisible();
  });

  it('filters by responsible person', async () => {
    renderPage(employee, makeRepository());
    await screen.findByText('Lens Set');

    await userEvent.selectOptions(screen.getByLabelText('负责人'), 'user-employee');
    expect(screen.queryByText('Lens Set')).not.toBeInTheDocument();
    expect(screen.getByText('Vacuum Pump A')).toBeVisible();
  });
});

describe('ResourcesPage create', () => {
  it('creates a resource owned by the creator without an ownerId in the payload', async () => {
    const repo = makeRepository();
    renderPage(employee, repo);

    await userEvent.click(await screen.findByRole('button', { name: '添加资源' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByDisplayValue('周琳')).toBeVisible();

    await userEvent.type(within(dialog).getByLabelText(/资源名称/), 'New Lens');
    await userEvent.type(within(dialog).getByLabelText(/位置/), 'Optics Lab / Cabinet C');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    await waitFor(() => expect(repo.createResource).toHaveBeenCalled());
    const payload = (repo.createResource as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.name).toBe('New Lens');
    expect(payload.location).toBe('Optics Lab / Cabinet C');
    expect(payload).not.toHaveProperty('ownerId');
    expect(repo.listResources).toHaveBeenCalledTimes(2);
  });

  it('disables submission when required fields are empty', async () => {
    renderPage(employee, makeRepository());
    await userEvent.click(await screen.findByRole('button', { name: '添加资源' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('disables submission for a negative quantity', async () => {
    renderPage(employee, makeRepository());
    await userEvent.click(await screen.findByRole('button', { name: '添加资源' }));
    const dialog = screen.getByRole('dialog');

    await userEvent.type(within(dialog).getByLabelText(/资源名称/), 'IPA');
    await userEvent.type(within(dialog).getByLabelText(/位置/), 'Store Room');
    fireEvent.change(within(dialog).getByRole('spinbutton'), { target: { value: '-5' } });

    expect(within(dialog).getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('keeps the modal open and shows an error when the server rejects the create', async () => {
    const repo = makeRepository({ createResource: vi.fn(async () => ({ ok: false, error: { code: 'validation', message: '' } })) });
    renderPage(employee, repo);

    await userEvent.click(await screen.findByRole('button', { name: '添加资源' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/资源名称/), 'Fail');
    await userEvent.type(within(dialog).getByLabelText(/位置/), 'Nowhere');
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('提交内容未通过验证');
    expect(screen.getByRole('dialog')).toBeVisible();
  });
});

describe('ResourcesPage create with attachment', () => {
  const manualFile = () => new File(['pdf-bytes'], 'manual.pdf', { type: 'application/pdf' });

  async function openDialogAndFill(repo: OkrRepository, file?: File) {
    renderPage(employee, repo);
    await userEvent.click(await screen.findByRole('button', { name: '添加资源' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/资源名称/), 'New Lens');
    await userEvent.type(within(dialog).getByLabelText(/位置/), 'Optics Lab / Cabinet C');
    if (file) {
      await userEvent.upload(within(dialog).getByLabelText(/使用说明附件/), file);
    }
    await userEvent.click(within(dialog).getByRole('button', { name: '保存' }));
    return dialog;
  }

  it('creates a resource without an attachment and skips the upload', async () => {
    const repo = makeRepository();
    await openDialogAndFill(repo);

    await waitFor(() => expect(repo.createResource).toHaveBeenCalled());
    expect(repo.uploadResourceAttachment).not.toHaveBeenCalled();
  });

  it('uploads the selected attachment after a successful create', async () => {
    const repo = makeRepository();
    const file = manualFile();
    await openDialogAndFill(repo, file);

    await waitFor(() => expect(repo.createResource).toHaveBeenCalled());
    await waitFor(() => expect(repo.uploadResourceAttachment).toHaveBeenCalledWith('new-resource', file));
  });

  it('does not upload the attachment when the create fails', async () => {
    const repo = makeRepository({ createResource: vi.fn(async () => ({ ok: false, error: { code: 'validation', message: '' } })) });
    await openDialogAndFill(repo, manualFile());

    await waitFor(() => expect(repo.createResource).toHaveBeenCalled());
    expect(repo.uploadResourceAttachment).not.toHaveBeenCalled();
  });

  it('keeps the resource and shows a partial-failure notice when the upload fails', async () => {
    const repo = makeRepository({ uploadResourceAttachment: vi.fn(async () => ({ ok: false, error: { code: 'network', message: '' } })) });
    await openDialogAndFill(repo, manualFile());

    await waitFor(() => expect(repo.uploadResourceAttachment).toHaveBeenCalled());
    expect(await screen.findByText('资源已创建，但使用说明附件上传失败，可在资源详情页重新上传。')).toBeVisible();
  });

  it('creates the resource exactly once when the attachment upload fails (no duplicate create)', async () => {
    const repo = makeRepository({ uploadResourceAttachment: vi.fn(async () => ({ ok: false, error: { code: 'network', message: '' } })) });
    await openDialogAndFill(repo, manualFile());

    await waitFor(() => expect(repo.uploadResourceAttachment).toHaveBeenCalled());
    expect(repo.createResource).toHaveBeenCalledTimes(1);
    expect(repo.uploadResourceAttachment).toHaveBeenCalledTimes(1);
  });
});
