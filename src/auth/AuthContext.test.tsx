import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';

function DemoProbe() {
  const auth = useAuth();
  return <output>{`${auth.mode}:${auth.status}:${auth.currentUser?.name ?? 'none'}`}</output>;
}

describe('AuthProvider (demo mode)', () => {
  it('keeps demo mode ready with the default selectable user', () => {
    render(
      <AuthProvider>
        <DemoProbe />
      </AuthProvider>,
    );
    expect(screen.getByText('demo:ready:周琳')).toBeInTheDocument();
  });
});
