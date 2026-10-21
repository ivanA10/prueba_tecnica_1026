import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '@/components/Layout';
import { LoginPage } from '@/features/auth/LoginPage';
import { HomePage } from '@/features/home/HomePage';
import { UsersPage } from '@/features/users/UsersPage';
import { RolesPage } from '@/features/roles/RolesPage';
import { PermissionsPage } from '@/features/roles/PermissionsPage';
import { AuditPage } from '@/features/audit/AuditPage';
import { AgentPage } from '@/features/agent/AgentPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/roles" element={<RolesPage />} />
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/agent" element={<AgentPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
