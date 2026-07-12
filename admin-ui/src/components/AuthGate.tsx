import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Card, Loading, MessagePlugin } from 'tdesign-react';
import { ApiError, api } from '../api';
import { clearAdminData, queryClient, queryKeys } from '../lib/query';
import { LoginPage } from '../pages/LoginPage';
import { AdminShell } from './AdminShell';

export function AuthGate() {
  const session = useQuery({ queryKey: queryKeys.session, queryFn: api.health });
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: () => queryClient.setQueryData(queryKeys.session, null),
  });
  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      clearAdminData();
      void queryClient.resetQueries({ queryKey: queryKeys.session });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        clearAdminData();
        void queryClient.resetQueries({ queryKey: queryKeys.session });
      } else void MessagePlugin.error('注销失败，请稍后重试');
    },
  });

  if (session.isPending)
    return (
      <main className="auth-state">
        <Loading loading>
          <span>正在验证管理会话...</span>
        </Loading>
      </main>
    );

  if (session.isError && !(session.error instanceof ApiError && session.error.status === 401))
    return (
      <main className="auth-state">
        <Card bordered={false}>
          <h2>管理服务暂时不可用</h2>
          <p className="muted">认证存储或服务配置当前不可用，请稍后重试。</p>
          <Button theme="primary" onClick={() => void session.refetch()}>
            重试
          </Button>
        </Card>
      </main>
    );

  if (session.isError)
    return (
      <LoginPage
        loading={login.isPending}
        onLogin={async (password) => {
          try {
            await login.mutateAsync(password);
          } catch (error) {
            void MessagePlugin.error(
              error instanceof ApiError && error.status === 401 ? '密码错误' : '登录服务暂时不可用',
            );
          }
        }}
      />
    );

  return <AdminShell loggingOut={logout.isPending} onLogout={() => logout.mutate()} />;
}
