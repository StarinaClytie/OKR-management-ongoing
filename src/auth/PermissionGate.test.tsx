import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { documents } from '../mocks/security';
import { AuthProvider, useAuth } from './AuthContext';
import { PermissionGate } from './PermissionGate';
import { ProtectedRoute } from './ProtectedRoute';

const confidentialDocument = documents.find((document) => document.id === 'document-nova-metric-contract')!;

describe('permission components', () => {
  it('exposes nine selectable mock roles and updates the current user', async () => {
    const user = userEvent.setup();

    function AuthProbe() {
      const { currentUser, selectableUsers, selectUser } = useAuth();
      return (
        <>
          <span>{`可选角色 ${selectableUsers.length}`}</span>
          <span>{currentUser?.name}</span>
          <button type="button" onClick={() => selectUser('user-hr')}>切换 HR</button>
        </>
      );
    }

    render(
      <AuthProvider initialUserId="user-administrator">
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByText('可选角色 9')).toBeInTheDocument();
    expect(screen.getByText('陈安')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '切换 HR' }));

    expect(screen.getByText('孙悦')).toBeInTheDocument();
  });

  it('renders only the fallback when access is denied', () => {
    render(
      <AuthProvider initialUserId="user-administrator">
        <PermissionGate
          action="document.read_body"
          resource={confidentialDocument}
          fallback={<span>受限内容</span>}
        >
          <span>机密正文</span>
        </PermissionGate>
      </AuthProvider>,
    );

    expect(screen.getByText('受限内容')).toBeInTheDocument();
    expect(screen.queryByText('机密正文')).not.toBeInTheDocument();
  });

  it('redirects a denied protected route to access denied', () => {
    render(
      <AuthProvider initialUserId="user-administrator">
        <MemoryRouter initialEntries={['/document']}>
          <Routes>
            <Route
              path="/document"
              element={(
                <ProtectedRoute action="document.read_body" resource={confidentialDocument}>
                  <span>机密正文</span>
                </ProtectedRoute>
              )}
            />
            <Route path="/access-denied" element={<span>访问被拒绝</span>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    expect(screen.getByText('访问被拒绝')).toBeInTheDocument();
    expect(screen.queryByText('机密正文')).not.toBeInTheDocument();
  });
});
