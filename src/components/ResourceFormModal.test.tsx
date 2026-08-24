import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizationUser } from '../data/types';
import { ResourceFormModal, type ResourceFormValues } from './ResourceFormModal';

const owners: OrganizationUser[] = [
  { id: 'user-1', displayName: '当前用户', email: 'self@example.com', department: '产品部', jobTitle: '工程师', role: 'employee', isActive: true, approvalStatus: 'approved', createdAt: '2026-08-01T00:00:00Z', projectIds: [] },
  { id: 'user-2', displayName: '候选负责人', email: 'owner@example.com', department: '运营部', jobTitle: '主管', role: 'management', isActive: true, approvalStatus: 'approved', createdAt: '2026-08-01T00:00:00Z', projectIds: [] },
];

function values(overrides: Partial<ResourceFormValues> = {}): ResourceFormValues {
  return {
    name: 'Tool', category: 'tools', resourceKind: 'durable', description: '', location: 'Workshop',
    purchaseDate: '', purchaseVendor: '', purchaseReference: '', quantity: '1', unit: 'set', usageNotes: '', manualUrl: '',
    attachmentFile: null, status: 'available', ownerId: 'user-1', ...overrides,
  };
}

describe('ResourceFormModal owner selection', () => {
  it('defaults to the supplied owner and submits a newly selected eligible owner', async () => {
    const onSubmit = vi.fn();
    render(
      <ResourceFormModal
        title="添加资源"
        mode="create"
        initial={values()}
        ownerOptions={owners}
        ownersLoading={false}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );

    const ownerSelect = screen.getByLabelText(/负责人/);
    expect(ownerSelect).toHaveValue('user-1');
    expect(screen.getByRole('option', { name: '候选负责人' })).toBeVisible();

    await userEvent.selectOptions(ownerSelect, 'user-2');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'user-2' }));
  });

  it.each([
    ['owners are loading', owners, true],
    ['no eligible owners are available', [], false],
  ])('disables create submission when %s', (_label, ownerOptions, ownersLoading) => {
    render(
      <ResourceFormModal
        title="添加资源"
        mode="create"
        initial={values()}
        ownerOptions={ownerOptions}
        ownersLoading={ownersLoading}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  });

  it('does not refocus the resource name when upload progress rerenders and locks create fields while active', () => {
    const { rerender } = render(
      <>
        <button type="button">Keep focus</button>
        <ResourceFormModal
          title="添加资源"
          mode="create"
          initial={values()}
          ownerOptions={owners}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    const focusTarget = screen.getByRole('button', { name: 'Keep focus' });
    focusTarget.focus();

    rerender(
      <>
        <button type="button">Keep focus</button>
        <ResourceFormModal
          title="添加资源"
          mode="create"
          initial={values()}
          ownerOptions={owners}
          submitting
          attachmentProgress={<p>服务器校验中</p>}
          onSubmit={vi.fn()}
          onClose={vi.fn()}
        />
      </>,
    );

    expect(focusTarget).toHaveFocus();
    expect(screen.getByLabelText(/资源名称/)).toBeDisabled();
    expect(screen.getByLabelText(/负责人/)).toBeDisabled();
    expect(screen.getByLabelText(/分类/)).toBeDisabled();
    expect(screen.getByLabelText(/位置/)).toBeDisabled();
    expect(screen.getByLabelText(/使用说明附件/)).toBeDisabled();
  });
});
