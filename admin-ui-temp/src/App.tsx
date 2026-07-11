import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Avatar,
  Button,
  Card,
  Dialog,
  Empty,
  Form,
  Input,
  Layout,
  Loading,
  MessagePlugin,
  Space,
  Switch,
  Tag,
  Textarea,
} from 'tdesign-react';
import {
  ChatIcon,
  ChevronLeftIcon,
  EditIcon,
  LogoutIcon,
  RefreshIcon,
  ChatAddIcon,
  SearchIcon,
  SettingIcon,
  UserCircleIcon,
} from 'tdesign-icons-react';
import { ApiError, api, setUnauthorizedHandler } from './api';
import type { AdminIdentity, Post, Thread } from './types';

const IDENTITY_KEY = 'pomment-admin-identity';

function readIdentity(): AdminIdentity {
  try {
    return JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? '') as AdminIdentity;
  } catch {
    return { name: '', email: '' };
  }
}

function formatDate(value: number): string {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value) : '-';
}

function LoginPage({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password) {
      void MessagePlugin.warning('请输入密码');
      return;
    }
    setLoading(true);
    try {
      await onLogin(password);
    } catch (error) {
      void MessagePlugin.error(error instanceof ApiError && error.status === 401 ? '密码错误' : '登录服务暂时不可用');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-intro">
        <div className="brand-mark">P</div>
        <div>
          <span className="eyebrow">POMMENT CONTROL ROOM</span>
          <h1>让每一条讨论<br />都保持清晰。</h1>
          <p>审阅评论、管理可见性，并以管理员身份继续对话。</p>
        </div>
        <div className="login-status is-ready"><span /> Secure session authentication</div>
      </section>
      <section className="login-panel">
        <Card className="login-card" bordered={false}>
          <Tag theme="primary" variant="light">ADMIN ACCESS</Tag>
          <h2>欢迎回来</h2>
          <p className="muted">请输入管理员密码以创建安全会话。</p>
          <Form layout="vertical" onSubmit={() => undefined}>
            <Form.FormItem label="密码">
              <Input type="password" value={password} onChange={setPassword} placeholder="请输入密码" size="large" />
            </Form.FormItem>
            <Button theme="primary" size="large" block loading={loading} onClick={submit}>进入管理台</Button>
          </Form>
        </Card>
      </section>
    </main>
  );
}

function AdminShell({ children, onLogout }: { children: ReactNode; onLogout: () => Promise<void> }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [identityOpen, setIdentityOpen] = useState(false);
  const [identity, setIdentity] = useState(readIdentity);
  const [draft, setDraft] = useState(identity);

  function saveIdentity() {
    if (!draft.name.trim() || !draft.email.trim()) {
      void MessagePlugin.warning('姓名和邮箱都不能为空');
      return;
    }
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(draft));
    setIdentity(draft);
    setIdentityOpen(false);
    void MessagePlugin.success('管理员身份已保存在本机');
  }

  return (
    <Layout className="admin-layout">
      <Layout.Aside className="sidebar" width="248px">
        <div className="sidebar-brand"><div className="brand-mark small">P</div><div><strong>Pomment</strong><span>Admin</span></div></div>
        <nav>
          <button className={location.pathname.startsWith('/threads') ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/threads')}>
            <ChatIcon /> 讨论管理
          </button>
          <button className="nav-item" onClick={() => setIdentityOpen(true)}><SettingIcon /> 管理员身份</button>
        </nav>
        <div className="identity-card">
          <Avatar size="36px"><UserCircleIcon /></Avatar>
          <div><strong>{identity.name || '未设置身份'}</strong><span>{identity.email || '回复前需要设置'}</span></div>
          <Button shape="square" variant="text" onClick={() => setIdentityOpen(true)}><EditIcon /></Button>
        </div>
        <Button variant="text" className="logout" onClick={() => void onLogout()}><LogoutIcon /> 退出登录</Button>
      </Layout.Aside>
      <Layout.Content className="main-content">{children}</Layout.Content>
      <Dialog header="管理员回复身份" visible={identityOpen} onClose={() => setIdentityOpen(false)} onConfirm={saveIdentity} confirmBtn="保存到本机">
        <p className="dialog-hint">姓名和邮箱仅保存在当前浏览器的 localStorage 中。</p>
        <Form layout="vertical">
          <Form.FormItem label="管理员姓名"><Input value={draft.name} onChange={name => setDraft({ ...draft, name })} placeholder="Pomment Admin" /></Form.FormItem>
          <Form.FormItem label="管理员邮箱"><Input value={draft.email} onChange={email => setDraft({ ...draft, email })} placeholder="admin@example.com" /></Form.FormItem>
        </Form>
      </Dialog>
    </Layout>
  );
}

function PageHeader({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action}</header>;
}

function ThreadsPage() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setThreads(await api.listThreads());
    } catch (error) {
      void MessagePlugin.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const visible = threads.filter(thread => `${thread.title} ${thread.url}`.toLowerCase().includes(query.toLowerCase()));
  const totalComments = threads.reduce((sum, thread) => sum + thread.amount, 0);

  return (
    <div className="page">
      <PageHeader eyebrow="DISCUSSIONS" title="讨论管理" detail="查看站点中的全部讨论串和评论动态。" action={<Button variant="outline" onClick={load}><RefreshIcon /> 刷新</Button>} />
      <section className="stats-grid">
        <Card bordered={false}><span>讨论串</span><strong>{threads.length}</strong><small>全部页面</small></Card>
        <Card bordered={false}><span>可见评论</span><strong>{totalComments}</strong><small>来自当前线程元数据</small></Card>
        <Card bordered={false}><span>已锁定</span><strong>{threads.filter(item => item.locked).length}</strong><small>暂停新回复</small></Card>
      </section>
      <Card className="data-card" bordered={false}>
        <div className="table-tools"><div><h2>全部讨论串</h2><span>{visible.length} 条记录</span></div><Input prefixIcon={<SearchIcon />} value={query} onChange={setQuery} clearable placeholder="搜索标题或 URL" /></div>
        <Loading loading={loading} showOverlay>
          {visible.length ? <div className="table-wrap"><table><thead><tr><th>讨论</th><th>状态</th><th>评论</th><th>最近活动</th><th /></tr></thead><tbody>
            {visible.map(thread => <tr key={thread.id} onClick={() => navigate(`/threads/${thread.id}`)}>
              <td><strong>{thread.title}</strong><a href={thread.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{thread.url}</a></td>
              <td><Tag theme={thread.locked ? 'warning' : 'success'} variant="light">{thread.locked ? '已锁定' : '进行中'}</Tag></td>
              <td><span className="count-pill">{thread.amount}</span></td><td>{formatDate(thread.latestPostAt)}</td>
              <td><Button variant="text" theme="primary">查看评论</Button></td>
            </tr>)}
          </tbody></table></div> : !loading && <Empty title="还没有讨论串" description="收到第一条评论后会显示在这里。" />}
        </Loading>
      </Card>
    </div>
  );
}

function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const threadId = Number(id);
  const validThreadId = Number.isSafeInteger(threadId) && threadId > 0;
  const [thread, setThread] = useState<Thread | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState('');
  const [replying, setReplying] = useState<Post | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!validThreadId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [meta, postList] = await Promise.all([api.getThread(threadId), api.listPosts(threadId)]);
      setThread(meta);
      setPosts(postList);
    } catch (error) {
      void MessagePlugin.error(error instanceof Error ? error.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [threadId, validThreadId]);

  async function toggleHidden(post: Post, hidden: boolean) {
    try {
      const updated = await api.updatePost(threadId, { ...post, hidden });
      setPosts(items => items.map(item => item.id === updated.id ? updated : item));
      setThread(current => current ? { ...current, amount: current.amount + (hidden ? -1 : 1) } : current);
      void MessagePlugin.success(hidden ? '评论已隐藏' : '评论已恢复显示');
    } catch (error) {
      void MessagePlugin.error(error instanceof Error ? error.message : '操作失败');
    }
  }

  async function saveEdit() {
    if (!editing || !editContent.trim()) return;
    setSaving(true);
    try {
      const updated = await api.updatePost(threadId, { ...editing, content: editContent });
      setPosts(items => items.map(item => item.id === updated.id ? updated : item));
      setEditing(null);
      void MessagePlugin.success('评论已更新');
    } catch (error) {
      void MessagePlugin.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function sendReply() {
    if (!replying || !replyContent.trim()) return;
    const identity = readIdentity();
    if (!identity.name || !identity.email) {
      void MessagePlugin.warning('请先在左侧设置管理员姓名和邮箱');
      return;
    }
    setSaving(true);
    try {
      const created = await api.reply(threadId, replying.id, replyContent, identity);
      setPosts(items => [...items, created]);
      setThread(current => current ? { ...current, amount: current.amount + 1 } : current);
      setReplying(null);
      setReplyContent('');
      void MessagePlugin.success('管理员回复已发布');
    } catch (error) {
      void MessagePlugin.error(error instanceof Error ? error.message : '回复失败');
    } finally {
      setSaving(false);
    }
  }

  if (!validThreadId) {
    return <div className="page"><Button variant="text" className="back-button" onClick={() => navigate('/threads')}><ChevronLeftIcon /> 返回讨论列表</Button><Empty title="无效的讨论 ID" description="讨论 ID 必须是正整数。" /></div>;
  }

  return (
    <div className="page">
      <Button variant="text" className="back-button" onClick={() => navigate('/threads')}><ChevronLeftIcon /> 返回讨论列表</Button>
      <PageHeader eyebrow={`THREAD / ${threadId}`} title={thread?.title || '讨论详情'} detail={thread?.url || '加载讨论元数据中...'} action={<Button variant="outline" onClick={load}><RefreshIcon /> 刷新</Button>} />
      {thread && <div className="thread-strip"><Tag theme={thread.locked ? 'warning' : 'success'} variant="light">{thread.locked ? '已锁定' : '进行中'}</Tag><span>{thread.amount} 条可见评论</span><span>创建于 {formatDate(thread.firstPostAt)}</span></div>}
      <Loading loading={loading} showOverlay>
        <section className="comments-list">
          {posts.map(post => <article className={`comment-card ${post.hidden ? 'is-hidden' : ''}`} key={post.id}>
            <div className="comment-author"><Avatar size="42px">{post.name.slice(0, 1).toUpperCase()}</Avatar><div><strong>{post.name} {post.byAdmin && <Tag size="small" theme="primary">管理员</Tag>}</strong><span>{post.email} · #{post.id}{post.parent ? ` · 回复 #${post.parent}` : ''}</span></div><time>{formatDate(post.createdAt)}</time></div>
            <div className="comment-content">{post.content}</div>
            <div className="comment-actions">
              <Space><Button size="small" variant="text" onClick={() => { setReplying(post); setReplyContent(''); }}><ChatAddIcon /> 回复</Button><Button size="small" variant="text" onClick={() => { setEditing(post); setEditContent(post.content); }}><EditIcon /> 编辑</Button></Space>
              <label><span>{post.hidden ? '已隐藏' : '公开'}</span><Switch size="small" value={!post.hidden} onChange={visible => void toggleHidden(post, !visible)} /></label>
            </div>
          </article>)}
          {!loading && !posts.length && <Empty title="这里还没有评论" />}
        </section>
      </Loading>
      <Dialog header={`编辑评论 #${editing?.id ?? ''}`} visible={Boolean(editing)} onClose={() => setEditing(null)} onConfirm={saveEdit} confirmLoading={saving}>
        <Textarea value={editContent} onChange={setEditContent} autosize={{ minRows: 5, maxRows: 12 }} placeholder="评论内容" />
      </Dialog>
      <Dialog header={`回复 ${replying?.name ?? ''}`} visible={Boolean(replying)} onClose={() => setReplying(null)} onConfirm={sendReply} confirmLoading={saving} confirmBtn="发布回复">
        {replying && <blockquote className="reply-quote">{replying.content}</blockquote>}
        <Textarea value={replyContent} onChange={setReplyContent} autosize={{ minRows: 5, maxRows: 12 }} placeholder="输入管理员回复..." />
      </Dialog>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'anonymous' | 'unavailable'>('checking');

  async function checkSession() {
    setAuthState('checking');
    try {
      await api.health();
      setAuthState('authenticated');
    } catch (error) {
      setAuthState(error instanceof ApiError && error.status === 401 ? 'anonymous' : 'unavailable');
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void api.health().catch(error => {
        if (error instanceof ApiError && error.status === 401) {
          setAuthState('anonymous');
        }
      });
    });
    void checkSession();
    return () => setUnauthorizedHandler(undefined);
  }, []);

  if (authState === 'checking') {
    return <main className="auth-state"><Loading loading><span>正在验证管理会话...</span></Loading></main>;
  }
  if (authState === 'unavailable') {
    return <main className="auth-state"><Card bordered={false}><h2>管理服务暂时不可用</h2><p className="muted">认证存储或服务配置当前不可用，请稍后重试。</p><Button theme="primary" onClick={() => void checkSession()}>重试</Button></Card></main>;
  }
  if (authState === 'anonymous') {
    return <LoginPage onLogin={async password => { await api.login(password); setAuthState('authenticated'); }} />;
  }

  return (
    <AdminShell onLogout={async () => {
      try {
        await api.logout();
        setAuthState('anonymous');
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          setAuthState('anonymous');
        } else {
          void MessagePlugin.error('注销失败，请稍后重试');
        }
      }
    }}>
      <Routes>
        <Route path="/threads" element={<ThreadsPage />} />
        <Route path="/threads/:id" element={<ThreadPage />} />
        <Route path="*" element={<Navigate to="/threads" replace />} />
      </Routes>
    </AdminShell>
  );
}
