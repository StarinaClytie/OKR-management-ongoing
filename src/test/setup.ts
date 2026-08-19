import '@testing-library/jest-dom/vitest';
import { configurePermissionSource } from '../auth/permissionService';
import { mockData } from '../mocks/repository';

// Tests exercise the demo permission model: relationship data (project
// membership roles, reporting lines, shares, workloads) is seeded from the demo
// fixtures. Production Supabase mode leaves this empty and trusts server RLS.
configurePermissionSource(mockData);
