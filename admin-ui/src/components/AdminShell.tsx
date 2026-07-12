import { Link, Outlet, useRouterState } from '@tanstack/react-router';
import { useState } from 'react';
import { ChatIcon, EditIcon, LogoutIcon, SettingIcon, UserCircleIcon } from 'tdesign-icons-react';
import { Avatar, Button, Dialog, Form, Input, Layout, MessagePlugin } from 'tdesign-react';
import { readIdentity, writeIdentity } from '../lib/identity';
import type { AdminIdentity } from '../types';

export function AdminShell({ onLogout, loggingOut }: { onLogout: () => void; loggingOut: boolean }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identity, setIdentity] = useState(readIdentity);
  const [draft, setDraft] = useState<AdminIdentity>(identity);

  function openIdentity() {
    setDraft(identity);
    setIdentityOpen(true);
  }

  function saveIdentity() {
    if (!draft.name.trim() || !draft.email.trim()) return void MessagePlugin.warning('姓名和邮箱都不能为空');
    const next = { name: draft.name.trim(), email: draft.email.trim() };
    writeIdentity(next);
    setIdentity(next);
    setDraft(next);
    setIdentityOpen(false);
    void MessagePlugin.success('管理员身份已保存在本机');
  }

  return (
    <Layout className="admin-layout">
      <Layout.Aside className="sidebar" width="248px">
        <div className="sidebar-brand">
          <div className="brand-mark small">P</div>
          <div>
            <strong>Pomment</strong>
            <span>Admin</span>
          </div>
        </div>
        <nav>
          <Link to="/threads" className={pathname.startsWith('/threads') ? 'nav-item active' : 'nav-item'}>
            <ChatIcon /> 讨论管理
          </Link>
          <button type="button" className="nav-item" onClick={openIdentity}>
            <SettingIcon /> 管理员身份
          </button>
        </nav>
        <div className="identity-card">
          <Avatar size="36px">
            <UserCircleIcon />
          </Avatar>
          <div>
            <strong>{identity.name || '未设置身份'}</strong>
            <span>{identity.email || '回复前需要设置'}</span>
          </div>
          <Button shape="square" variant="text" onClick={openIdentity}>
            <EditIcon />
          </Button>
        </div>
        <Button variant="text" className="logout" loading={loggingOut} onClick={onLogout}>
          <LogoutIcon /> 退出登录
        </Button>
      </Layout.Aside>
      <Layout.Content className="main-content">
        <Outlet />
      </Layout.Content>
      <Dialog
        header="管理员回复身份"
        visible={identityOpen}
        onClose={() => setIdentityOpen(false)}
        onConfirm={saveIdentity}
        confirmBtn="保存到本机"
      >
        <p className="dialog-hint">姓名和邮箱仅保存在当前浏览器的 localStorage 中。</p>
        <Form layout="vertical">
          <Form.FormItem label="管理员姓名">
            <Input value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="Pomment Admin" />
          </Form.FormItem>
          <Form.FormItem label="管理员邮箱">
            <Input
              value={draft.email}
              onChange={(email) => setDraft({ ...draft, email })}
              placeholder="admin@example.com"
            />
          </Form.FormItem>
        </Form>
      </Dialog>
    </Layout>
  );
}
