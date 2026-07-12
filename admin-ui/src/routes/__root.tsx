import { createRootRoute, Navigate } from '@tanstack/react-router';
import { AuthGate } from '../components/AuthGate';

export const Route = createRootRoute({
  component: AuthGate,
  notFoundComponent: () => <Navigate to="/threads" replace />,
});
