import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { SupabaseAuthProvider } from '../auth/SupabaseAuthProvider';
import { appMode, repository } from '../lib/supabase';
import { SupabaseOkrRepository } from '../data/supabaseRepository';
import { AppRoutes } from './routes';

export function App() {
  const routes = <BrowserRouter><AppRoutes /></BrowserRouter>;
  if (appMode === 'supabase' && repository instanceof SupabaseOkrRepository) {
    return <SupabaseAuthProvider client={repository.client} repository={repository}>{routes}</SupabaseAuthProvider>;
  }
  return (
    <AuthProvider>
      {routes}
    </AuthProvider>
  );
}
