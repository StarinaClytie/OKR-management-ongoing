import { describe, expect, it } from 'vitest';
import { getDashboardConfig } from './dashboardRegistry';

describe('role dashboard registry', () => {
  it('gives every business role its primary work widget', () => {
    expect(getDashboardConfig('management').widgetIds).toEqual(['company-health', 'project-visualizations']);
    expect(getDashboardConfig('project_leader').widgetIds).toEqual([
      'today-focus',
      'my-key-results',
      'report-review',
      'project-visualizations',
    ]);
    expect(getDashboardConfig('employee').widgetIds).toEqual([
      'today-focus',
      'my-key-results',
      'project-visualizations',
    ]);
    expect(getDashboardConfig('hr').widgetIds).toEqual(['hr-summary', 'project-visualizations']);
  });

  it('keeps administrators on a governance-only dashboard', () => {
    const adminWidgets = getDashboardConfig('administrator').widgetIds;

    expect(adminWidgets).toEqual(['admin-system']);
    expect(adminWidgets).not.toContain('confidential-business-content');
    expect(adminWidgets).not.toContain('my-key-results');
  });

  it('fails closed for an unknown role', () => {
    expect(() => getDashboardConfig('unknown-role' as never)).toThrow('未知角色');
  });
});
