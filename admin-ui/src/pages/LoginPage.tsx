import { useState } from 'react';
import { Button, Card, Form, Input, MessagePlugin, Tag } from 'tdesign-react';

export function LoginPage({ onLogin, loading }: { onLogin: (password: string) => Promise<void>; loading: boolean }) {
  const [password, setPassword] = useState('');

  async function submit() {
    if (!password) return void MessagePlugin.warning('请输入密码');
    await onLogin(password);
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">P</div>
        <div>
          <span className="eyebrow">POMMENT CONTROL ROOM</span>
          <h1>
            让每一条讨论
            <br />
            都保持清晰。
          </h1>
          <p>审阅评论、管理可见性，并以管理员身份继续对话。</p>
        </div>
        <div className="login-status is-ready">
          <span /> Secure session authentication
        </div>
      </section>
      <section className="login-panel">
        <Card className="login-card" bordered={false}>
          <Tag theme="primary" variant="light">
            ADMIN ACCESS
          </Tag>
          <h2>欢迎回来</h2>
          <p className="muted">请输入管理员密码以创建安全会话。</p>
          <Form layout="vertical" onSubmit={() => void submit()}>
            <Form.FormItem label="密码">
              <Input type="password" value={password} onChange={setPassword} placeholder="请输入密码" size="large" />
            </Form.FormItem>
            <Button theme="primary" size="large" block loading={loading} onClick={() => void submit()}>
              进入管理台
            </Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}
