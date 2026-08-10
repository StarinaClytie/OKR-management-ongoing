import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext';
import { AppRoutes } from './routes';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
