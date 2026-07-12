import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
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
  ChatAddIcon,
  ChatIcon,
  ChevronLeftIcon,
  CopyIcon,
  EditIcon,
  JumpIcon,
  LinkIcon,
  LogoutIcon,
  RefreshIcon,
  SearchIcon,
  SettingIcon,
  UserCircleIcon,
} from 'tdesign-icons-react';
import { ApiError, api, setUnauthorizedHandler } from './api';
import type { AdminIdentity, Post, Thread } from './types';

const IDENTITY_KEY = 'pomment-admin-identity';
const THREAD_SORT_KEY = 'pomment-admin-thread-sort';
const POST_SORT_KEY = 'pomment-admin-post-sort';

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

function errorText(error: unknown, fallback = '请求失败'): string {
  if (error instanceof ApiError) return error.status === 404 ? '目标不存在或已被删除' : `${fallback}（HTTP ${error.status}）`;
  return error instanceof Error ? error.message : fallback;
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function LoginPage({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!password) return void MessagePlugin.warning('请输入密码');
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
        <div><span className="eyebrow">POMMENT CONTROL ROOM</span><h1>让每一条讨论<br />都保持清晰。</h1><p>审阅评论、管理可见性，并以管理员身份继续对话。</p></div>
        <div className="login-status is-ready"><span /> Secure session authentication</div>
      </section>
      <section className="login-panel">
        <Card className="login-card" bordered={false}>
          <Tag theme="primary" variant="light">ADMIN ACCESS</Tag><h2>欢迎回来</h2><p className="muted">请输入管理员密码以创建安全会话。</p>
          <Form layout="vertical" onSubmit={() => void submit()}>
            <Form.FormItem label="密码"><Input type="password" value={password} onChange={setPassword} placeholder="请输入密码" size="large" /></Form.FormItem>
            <Button theme="primary" size="large" block loading={loading} onClick={() => void submit()}>进入管理台</Button>
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
    if (!draft.name.trim() || !draft.email.trim()) return void MessagePlugin.warning('姓名和邮箱都不能为空');
    const next = { name: draft.name.trim(), email: draft.email.trim() };
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
    setIdentity(next);
    setDraft(next);
    setIdentityOpen(false);
    void MessagePlugin.success('管理员身份已保存在本机');
  }

  return (
    <Layout className="admin-layout">
      <Layout.Aside className="sidebar" width="248px">
        <div className="sidebar-brand"><div className="brand-mark small">P</div><div><strong>Pomment</strong><span>Admin</span></div></div>
        <nav>
          <button type="button" className={location.pathname.startsWith('/threads') ? 'nav-item active' : 'nav-item'} onClick={() => navigate('/threads')}><ChatIcon /> 讨论管理</button>
          <button type="button" className="nav-item" onClick={() => { setDraft(identity); setIdentityOpen(true); }}><SettingIcon /> 管理员身份</button>
        </nav>
        <div className="identity-card">
          <Avatar size="36px"><UserCircleIcon /></Avatar><div><strong>{identity.name || '未设置身份'}</strong><span>{identity.email || '回复前需要设置'}</span></div>
          <Button shape="square" variant="text" onClick={() => { setDraft(identity); setIdentityOpen(true); }}><EditIcon /></Button>
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
  return <header className="page-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{detail}</p></div>{action && <div className="header-actions">{action}</div>}</header>;
}

function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <Card className="state-card" bordered={false}><Empty title="加载失败" description={message} />{retry && <Button theme="primary" variant="outline" onClick={retry}>重新加载</Button>}</Card>;
}

function ThreadsPage() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[]>([]);
  const [query, setQuery] = useState('');
  const [latestFirst, setLatestFirst] = useState(() => localStorage.getItem(THREAD_SORT_KEY) !== 'oldest');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try { setThreads(await api.listThreads()); } catch (cause) { setError(errorText(cause, '讨论列表加载失败')); } finally { setLoading(false); }
  }

  async function refreshMetadata() {
    setRefreshing(true);
    try {
      await api.refreshThreads();
      await load();
      void MessagePlugin.success('全部讨论元数据已刷新');
    } catch (cause) {
      void MessagePlugin.error(errorText(cause, '元数据刷新失败'));
    } finally { setRefreshing(false); }
  }

  useEffect(() => { void load(); }, []);
  const visible = threads
    .filter(thread => `${thread.title} ${thread.url}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => latestFirst ? b.latestPostAt - a.latestPostAt : a.latestPostAt - b.latestPostAt);
  const totalComments = threads.reduce((sum, thread) => sum + thread.amount, 0);

  function changeSort(value: boolean) {
    setLatestFirst(value);
    localStorage.setItem(THREAD_SORT_KEY, value ? 'latest' : 'oldest');
  }

  return (
    <div className="page">
      <PageHeader eyebrow="DISCUSSIONS" title="讨论管理" detail="查看站点中的全部讨论串和评论动态。" action={<><Button variant="outline" loading={refreshing} onClick={() => void refreshMetadata()}><RefreshIcon /> 刷新全部元数据</Button><Button variant="text" onClick={() => void load()}>重新加载</Button></>} />
      <section className="stats-grid">
        <Card bordered={false}><span>讨论串</span><strong>{threads.length}</strong><small>全部页面</small></Card>
        <Card bordered={false}><span>可见评论</span><strong>{totalComments}</strong><small>来自当前线程元数据</small></Card>
        <Card bordered={false}><span>已锁定</span><strong>{threads.filter(item => item.locked).length}</strong><small>暂停新回复</small></Card>
      </section>
      <Card className="data-card" bordered={false}>
        <div className="table-tools">
          <div><h2>全部讨论串</h2><span>{visible.length} 条记录</span></div>
          <div className="tool-controls"><label className="switch-label">最近活动优先 <Switch size="small" value={latestFirst} onChange={changeSort} /></label><Input prefixIcon={<SearchIcon />} value={query} onChange={setQuery} clearable placeholder="搜索标题或 URL" /></div>
        </div>
        {error && !loading ? <ErrorState message={error} retry={() => void load()} /> : <Loading loading={loading} showOverlay>
          {visible.length ? <div className="table-wrap"><table><thead><tr><th>讨论</th><th>状态</th><th>评论</th><th>最近活动</th><th /></tr></thead><tbody>
            {visible.map(thread => <tr key={thread.id} onClick={() => navigate(`/threads/${thread.id}`)}>
              <td><strong>{thread.title || '未命名讨论'}</strong><a href={thread.url} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>{thread.url}</a></td>
              <td><Tag theme={thread.locked ? 'warning' : 'success'} variant="light">{thread.locked ? '已锁定' : '进行中'}</Tag></td>
              <td><span className="count-pill">{thread.amount}</span></td><td>{formatDate(thread.latestPostAt)}</td><td><Button variant="text" theme="primary">查看评论</Button></td>
            </tr>)}
          </tbody></table></div> : !loading && <Empty title={query ? '没有匹配的讨论串' : '还没有讨论串'} description={query ? '请尝试其他关键词。' : '收到第一条评论后会显示在这里。'} />}
        </Loading>}
      </Card>
    </div>
  );
}

function PostAvatar({ post }: { post: Post }) {
  const [failed, setFailed] = useState(false);
  const fallback = (post.name.trim()[0] || '?').toUpperCase();
  const source = post.avatar || (post.emailHashed ? `https://www.gravatar.com/avatar/${post.emailHashed}?d=identicon` : '');
  return <div className="post-avatar">{source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : fallback}</div>;
}

function orderTree(posts: Post[], ascending: boolean): Array<{ post: Post; depth: number }> {
  const ids = new Set(posts.map(post => post.id));
  const children = new Map<number, Post[]>();
  for (const post of posts) {
    const parent = ids.has(post.parent) ? post.parent : 0;
    children.set(parent, [...(children.get(parent) ?? []), post]);
  }
  const result: Array<{ post: Post; depth: number }> = [];
  const visited = new Set<number>();
  const visit = (post: Post, depth: number) => {
    if (visited.has(post.id)) return;
    visited.add(post.id);
    result.push({ post, depth });
    const replies = [...(children.get(post.id) ?? [])].sort((a, b) => ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt);
    replies.forEach(reply => { visit(reply, depth + 1); });
  };
  [...(children.get(0) ?? [])].sort((a, b) => ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt).forEach(post => { visit(post, 0); });
  posts.filter(post => !visited.has(post.id)).forEach(post => { visit(post, 0); });
  return result;
}

function ThreadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const threadId = Number(id);
  const validThreadId = Number.isSafeInteger(threadId) && threadId > 0;
  const [thread, setThread] = useState<Thread | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'chronological' | 'tree'>('chronological');
  const [ascending, setAscending] = useState(() => localStorage.getItem(POST_SORT_KEY) === 'ascending');
  const [replying, setReplying] = useState<Post | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [topContent, setTopContent] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!validThreadId) return setLoading(false);
    setLoading(true);
    setError('');
    try {
      const [meta, postList] = await Promise.all([api.getThread(threadId), api.listPosts(threadId)]);
      setThread(meta);
      setPosts(postList);
    } catch (cause) { setError(errorText(cause, '讨论加载失败')); } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [threadId, validThreadId]);

  function replacePost(updated: Post) {
    setPosts(items => items.map(item => item.id === updated.id ? { ...item, ...updated } : item));
  }

  async function toggleHidden(post: Post, hidden: boolean) {
    try {
      const updated = await api.updatePost(threadId, { ...post, hidden });
      replacePost(updated);
      setThread(current => current ? { ...current, amount: Math.max(0, current.amount + (hidden ? -1 : 1)) } : current);
      void MessagePlugin.success(hidden ? '评论已隐藏' : '评论已恢复显示');
    } catch (cause) { void MessagePlugin.error(errorText(cause, '操作失败')); }
  }

  async function createPost(parent: number, content: string) {
    if (!content.trim()) return;
    const identity = readIdentity();
    if (!identity.name || !identity.email) return void MessagePlugin.warning('请先在左侧设置管理员姓名和邮箱');
    setSaving(true);
    try {
      const created = await api.createPost(threadId, parent, content.trim(), identity);
      setPosts(items => [...items, created]);
      setThread(current => current ? { ...current, amount: current.amount + 1, latestPostAt: created.createdAt } : current);
      setReplying(null);
      setReplyContent('');
      setTopContent('');
      void MessagePlugin.success(parent ? '管理员回复已发布' : '管理员评论已发布');
    } catch (cause) { void MessagePlugin.error(errorText(cause, '发布失败')); } finally { setSaving(false); }
  }

  function jumpToParent(parent: number) {
    const target = document.getElementById(`post-${parent}`);
    if (!target) return void MessagePlugin.warning(`未找到父评论 #${parent}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('is-highlighted');
    window.setTimeout(() => target.classList.remove('is-highlighted'), 1600);
  }

  async function copyChain(post: Post) {
    const byId = new Map(posts.map(item => [item.id, item]));
    const chain: Post[] = [];
    const seen = new Set<number>();
    let current: Post | undefined = post;
    while (current && !seen.has(current.id)) {
      chain.unshift(current);
      seen.add(current.id);
      current = current.parent ? byId.get(current.parent) : undefined;
    }
    const markdown = chain.map(item => `> **${item.name}** (#${item.id})\n>\n${item.content.split('\n').map(line => `> ${line}`).join('\n')}`).join('\n\n');
    try { await navigator.clipboard.writeText(markdown); void MessagePlugin.success(`已复制 ${chain.length} 层评论链`); } catch { void MessagePlugin.error('浏览器拒绝了剪贴板访问'); }
  }

  if (!validThreadId) return <div className="page"><Button variant="text" className="back-button" onClick={() => navigate('/threads')}><ChevronLeftIcon /> 返回讨论列表</Button><Empty title="无效的讨论 ID" description="讨论 ID 必须是正整数。" /></div>;

  const ordered = view === 'tree'
    ? orderTree(posts, ascending)
    : [...posts].sort((a, b) => ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt).map(post => ({ post, depth: 0 }));

  return (
    <div className="page">
      <Button variant="text" className="back-button" onClick={() => navigate('/threads')}><ChevronLeftIcon /> 返回讨论列表</Button>
      <PageHeader eyebrow={`THREAD / ${threadId}`} title={thread?.title || '讨论详情'} detail={thread?.url || '加载讨论元数据中...'} action={thread && <><Button variant="outline" onClick={() => navigate(`/threads/${threadId}/edit`)}><EditIcon /> 编辑元数据</Button><Button theme="primary" variant="outline" onClick={() => window.open(thread.url, '_blank', 'noopener,noreferrer')}><LinkIcon /> 在线查看</Button></>} />
      {error && !loading ? <ErrorState message={error} retry={() => void load()} /> : <Loading loading={loading} showOverlay>
        {thread && <>
          <div className="thread-strip"><Tag theme={thread.locked ? 'warning' : 'success'} variant="light">{thread.locked ? '已锁定' : '进行中'}</Tag><span>{thread.amount} 条可见评论</span><span>创建于 {formatDate(thread.firstPostAt)}</span><Button size="small" variant="text" onClick={() => void load()}><RefreshIcon /> 刷新</Button></div>
          <Card className="admin-compose" bordered={false}><div><strong>发布顶层管理员评论</strong><span>使用本机保存的管理员身份</span></div><Textarea value={topContent} onChange={setTopContent} autosize={{ minRows: 3, maxRows: 8 }} placeholder="输入新评论..." /><Button theme="primary" loading={saving} disabled={!topContent.trim()} onClick={() => void createPost(0, topContent)}>发布评论</Button></Card>
          <div className="post-toolbar">
            <div className="view-tabs"><button type="button" className={view === 'chronological' ? 'active' : ''} onClick={() => setView('chronological')}>时间顺序</button><button type="button" className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>回复树</button></div>
            <label className="switch-label">升序 <Switch size="small" value={ascending} onChange={value => { setAscending(value); localStorage.setItem(POST_SORT_KEY, value ? 'ascending' : 'descending'); }} /></label>
          </div>
          <section className="comments-list">
            {ordered.map(({ post, depth }) => <article id={`post-${post.id}`} className={`comment-card ${post.hidden ? 'is-hidden' : ''}`} style={{ '--depth': Math.min(depth, 6) } as CSSProperties} key={post.id}>
              <div className="comment-author"><PostAvatar post={post} /><div><strong>{post.name || '匿名'} <span className="inline-tags">{post.byAdmin && <Tag size="small" theme="primary">管理员</Tag>}{post.hidden && <Tag size="small" theme="warning">已隐藏</Tag>}</span></strong><span>{post.email} · #{post.id}{post.parent ? ` · 回复 #${post.parent}` : ''}</span></div><time>{formatDate(post.createdAt)}</time></div>
              <div className="comment-content">{post.content}</div>
              <div className="comment-actions">
                <Space breakLine><Button size="small" variant="text" onClick={() => { setReplying(post); setReplyContent(''); }}><ChatAddIcon /> 回复</Button><Button size="small" variant="text" onClick={() => navigate(`/threads/${threadId}/posts/${post.id}/edit`)}><EditIcon /> 完整编辑</Button>{post.parent > 0 && <Button size="small" variant="text" onClick={() => jumpToParent(post.parent)}><JumpIcon /> 跳到父评论</Button>}<Button size="small" variant="text" onClick={() => void copyChain(post)}><CopyIcon /> 复制祖先链</Button></Space>
                <label><span>{post.hidden ? '已隐藏' : '公开'}</span><Switch size="small" value={!post.hidden} onChange={visible => void toggleHidden(post, !visible)} /></label>
              </div>
            </article>)}
            {!posts.length && <Empty title="这里还没有评论" description="可以发布第一条管理员评论。" />}
          </section>
        </>}
      </Loading>}
      <Dialog header={`回复 ${replying?.name ?? ''}`} visible={Boolean(replying)} onClose={() => setReplying(null)} onConfirm={() => replying && void createPost(replying.id, replyContent)} confirmLoading={saving} confirmBtn="发布回复">
        {replying && <blockquote className="reply-quote">{replying.content}</blockquote>}<Textarea value={replyContent} onChange={setReplyContent} autosize={{ minRows: 5, maxRows: 12 }} placeholder="输入管理员回复..." />
      </Dialog>
    </div>
  );
}

function PostEditPage() {
  const { id, postId } = useParams();
  const navigate = useNavigate();
  const threadId = Number(id);
  const targetId = Number(postId);
  const valid = Number.isSafeInteger(threadId) && threadId > 0 && Number.isSafeInteger(targetId) && targetId > 0;
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!valid) return setLoading(false);
    setLoading(true); setError('');
    try { setPost(await api.getPost(threadId, targetId)); } catch (cause) { setError(errorText(cause, '评论加载失败')); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [threadId, targetId, valid]);

  async function save() {
    if (!post || !post.name.trim() || !post.email.trim() || !post.content.trim()) return void MessagePlugin.warning('姓名、邮箱和内容不能为空');
    setSaving(true);
    try { await api.updatePost(threadId, post); void MessagePlugin.success('评论已更新'); navigate(`/threads/${threadId}`); } catch (cause) { void MessagePlugin.error(errorText(cause, '保存失败')); } finally { setSaving(false); }
  }

  return <div className="page narrow-page"><Button variant="text" className="back-button" onClick={() => navigate(`/threads/${threadId}`)}><ChevronLeftIcon /> 返回讨论详情</Button><PageHeader eyebrow={`POST / ${targetId}`} title="完整编辑评论" detail="可编辑兼容字段，并查看不可修改的技术信息。" />
    {error ? <ErrorState message={error} retry={() => void load()} /> : <Loading loading={loading} showOverlay>{post && <div className="editor-grid">
      <Card className="form-card" bordered={false}><h2>评论字段</h2><Form layout="vertical">
        <div className="form-columns"><Form.FormItem label="姓名"><Input value={post.name} onChange={name => setPost({ ...post, name })} /></Form.FormItem><Form.FormItem label="邮箱"><Input value={post.email} onChange={email => setPost({ ...post, email })} /></Form.FormItem></div>
        <Form.FormItem label="网站"><Input value={post.website} onChange={website => setPost({ ...post, website })} placeholder="https://example.com" /></Form.FormItem>
        <Form.FormItem label="内容"><Textarea value={post.content} onChange={content => setPost({ ...post, content })} autosize={{ minRows: 8, maxRows: 20 }} /></Form.FormItem>
        <div className="toggle-grid"><label>隐藏 <Switch value={post.hidden} onChange={hidden => setPost({ ...post, hidden })} /></label><label>接收邮件 <Switch value={post.receiveEmail} onChange={receiveEmail => setPost({ ...post, receiveEmail })} /></label><label>管理员评论 <Switch value={post.byAdmin} onChange={byAdmin => setPost({ ...post, byAdmin })} /></label></div>
        <div className="form-actions"><Button variant="outline" onClick={() => navigate(`/threads/${threadId}`)}>取消</Button><Button theme="primary" loading={saving} onClick={() => void save()}>保存修改</Button></div>
      </Form></Card>
      <Card className="technical-card" bordered={false}><h2>技术信息</h2><dl><dt>评论 ID</dt><dd>{post.id}</dd><dt>父评论 ID</dt><dd>{post.parent || '-'}</dd><dt>邮箱哈希</dt><dd>{post.emailHashed || '-'}</dd><dt>编辑密钥</dt><dd>{post.editKey || '-'}</dd><dt>头像</dt><dd>{post.avatar || '-'}</dd><dt>评分</dt><dd>{post.rating}</dd><dt>创建时间</dt><dd>{formatDate(post.createdAt)}</dd><dt>更新时间</dt><dd>{formatDate(post.updatedAt)}</dd><dt>原始内容</dt><dd className="pre-value">{post.origContent || '-'}</dd></dl></Card>
    </div>}</Loading>}
  </div>;
}

function ThreadEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const threadId = Number(id);
  const valid = Number.isSafeInteger(threadId) && threadId > 0;
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (!valid) return setLoading(false);
    setLoading(true); setError('');
    try { setThread(await api.getThread(threadId)); } catch (cause) { setError(errorText(cause, '元数据加载失败')); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [threadId, valid]);

  async function save() {
    if (!thread || !thread.title.trim()) return void MessagePlugin.warning('标题不能为空');
    if (!validHttpUrl(thread.url)) return void MessagePlugin.warning('URL 必须以 http:// 或 https:// 开头');
    setSaving(true);
    try { await api.updateThread(thread); void MessagePlugin.success('讨论元数据已更新'); navigate(`/threads/${threadId}`); } catch (cause) { void MessagePlugin.error(errorText(cause, '保存失败')); } finally { setSaving(false); }
  }

  return <div className="page narrow-page"><Button variant="text" className="back-button" onClick={() => navigate(`/threads/${threadId}`)}><ChevronLeftIcon /> 返回讨论详情</Button><PageHeader eyebrow={`THREAD / ${threadId}`} title="编辑讨论元数据" detail="评论统计和活动时间由服务端维护。" />
    {error ? <ErrorState message={error} retry={() => void load()} /> : <Loading loading={loading} showOverlay>{thread && <Card className="form-card" bordered={false}><Form layout="vertical">
      <Form.FormItem label="标题"><Input value={thread.title} onChange={title => setThread({ ...thread, title })} /></Form.FormItem>
      <Form.FormItem label="页面 URL"><Input value={thread.url} onChange={url => setThread({ ...thread, url })} placeholder="https://example.com/article" /></Form.FormItem>
      <label className="locked-row"><span><strong>锁定讨论</strong><small>阻止公开页面提交新评论</small></span><Switch value={thread.locked} onChange={locked => setThread({ ...thread, locked })} /></label>
      <div className="form-actions"><Button variant="outline" onClick={() => navigate(`/threads/${threadId}`)}>取消</Button><Button theme="primary" loading={saving} onClick={() => void save()}>保存元数据</Button></div>
    </Form></Card>}</Loading>}
  </div>;
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'authenticated' | 'anonymous' | 'unavailable'>('checking');
  async function checkSession() {
    setAuthState('checking');
    try { await api.health(); setAuthState('authenticated'); } catch (error) { setAuthState(error instanceof ApiError && error.status === 401 ? 'anonymous' : 'unavailable'); }
  }
  useEffect(() => {
    setUnauthorizedHandler(() => { void api.health().catch(error => { if (error instanceof ApiError && error.status === 401) setAuthState('anonymous'); }); });
    void checkSession();
    return () => setUnauthorizedHandler(undefined);
  }, []);

  if (authState === 'checking') return <main className="auth-state"><Loading loading><span>正在验证管理会话...</span></Loading></main>;
  if (authState === 'unavailable') return <main className="auth-state"><Card bordered={false}><h2>管理服务暂时不可用</h2><p className="muted">认证存储或服务配置当前不可用，请稍后重试。</p><Button theme="primary" onClick={() => void checkSession()}>重试</Button></Card></main>;
  if (authState === 'anonymous') return <LoginPage onLogin={async password => { await api.login(password); setAuthState('authenticated'); }} />;

  return <AdminShell onLogout={async () => {
    try { await api.logout(); setAuthState('anonymous'); } catch (error) { if (error instanceof ApiError && error.status === 401) setAuthState('anonymous'); else void MessagePlugin.error('注销失败，请稍后重试'); }
  }}><Routes>
    <Route path="/threads" element={<ThreadsPage />} />
    <Route path="/threads/:id" element={<ThreadPage />} />
    <Route path="/threads/:id/edit" element={<ThreadEditPage />} />
    <Route path="/threads/:id/posts/:postId/edit" element={<PostEditPage />} />
    <Route path="*" element={<Navigate to="/threads" replace />} />
  </Routes></AdminShell>;
}
