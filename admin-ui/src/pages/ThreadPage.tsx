import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeftIcon, EditIcon, LinkIcon, RefreshIcon } from 'tdesign-icons-react';
import { Button, Card, Dialog, Empty, Loading, MessagePlugin, Switch, Tag, Textarea } from 'tdesign-react';
import { api } from '../api';
import { CommentCard } from '../components/CommentCard';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { readIdentity } from '../lib/identity';
import { orderPostTree, postChainMarkdown } from '../lib/posts';
import { queryClient, queryKeys } from '../lib/query';
import { errorText, formatDate, positiveInteger } from '../lib/utils';
import type { Post, Thread } from '../types';

const POST_SORT_KEY = 'pomment-admin-post-sort';

export function ThreadPage() {
  const { id } = useParams({ from: '/threads/$id' });
  const navigate = useNavigate();
  const threadId = positiveInteger(id);
  const resolvedThreadId = threadId ?? 0;
  const [view, setView] = useState<'chronological' | 'tree'>('chronological');
  const [ascending, setAscending] = useState(() => localStorage.getItem(POST_SORT_KEY) === 'ascending');
  const [replying, setReplying] = useState<Post | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [topContent, setTopContent] = useState('');
  const threadQuery = useQuery({
    queryKey: queryKeys.thread(resolvedThreadId),
    queryFn: () => api.getThread(resolvedThreadId),
    enabled: threadId !== null,
  });
  const postsQuery = useQuery({
    queryKey: queryKeys.posts(resolvedThreadId),
    queryFn: () => api.listPosts(resolvedThreadId),
    enabled: threadId !== null,
  });
  const thread = threadQuery.data;
  const posts = postsQuery.data ?? [];
  const loading = threadQuery.isPending || postsQuery.isPending;
  const error = threadQuery.error ?? postsQuery.error;

  const updatePost = useMutation({
    mutationFn: (post: Post) => api.updatePost(resolvedThreadId, post),
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.thread(resolvedThreadId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.posts(resolvedThreadId) }),
      ]);
    },
    onSuccess: (updated, previous) => {
      queryClient.setQueryData<Post[]>(queryKeys.posts(resolvedThreadId), (items = []) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (updated.hidden !== previous.hidden)
        queryClient.setQueryData<Thread>(queryKeys.thread(resolvedThreadId), (current) =>
          current ? { ...current, amount: Math.max(0, current.amount + (updated.hidden ? -1 : 1)) } : current,
        );
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads, exact: true });
      void MessagePlugin.success(updated.hidden ? '评论已隐藏' : '评论已恢复显示');
    },
    onError: (cause) => void MessagePlugin.error(errorText(cause, '操作失败')),
  });
  const createPost = useMutation({
    mutationFn: ({ parent, content }: { parent: number; content: string }) => {
      const identity = readIdentity();
      if (!identity.name || !identity.email) throw new Error('IDENTITY_REQUIRED');
      if (!content.trim()) throw new Error('CONTENT_REQUIRED');
      return api.createPost(resolvedThreadId, parent, content.trim(), identity);
    },
    onMutate: async () => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: queryKeys.thread(resolvedThreadId) }),
        queryClient.cancelQueries({ queryKey: queryKeys.posts(resolvedThreadId) }),
      ]);
    },
    onSuccess: (created, variables) => {
      queryClient.setQueryData<Post[]>(queryKeys.posts(resolvedThreadId), (items = []) => [...items, created]);
      queryClient.setQueryData<Thread>(queryKeys.thread(resolvedThreadId), (current) =>
        current ? { ...current, amount: current.amount + 1, latestPostAt: created.createdAt } : current,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.threads, exact: true });
      setReplying(null);
      setReplyContent('');
      setTopContent('');
      void MessagePlugin.success(variables.parent ? '管理员回复已发布' : '管理员评论已发布');
    },
    onError: (cause) => {
      if (cause instanceof Error && cause.message === 'IDENTITY_REQUIRED')
        void MessagePlugin.warning('请先在左侧设置管理员姓名和邮箱');
      else if (cause instanceof Error && cause.message === 'CONTENT_REQUIRED')
        void MessagePlugin.warning('评论内容不能为空');
      else void MessagePlugin.error(errorText(cause, '发布失败'));
    },
  });

  function reload() {
    void Promise.all([threadQuery.refetch(), postsQuery.refetch()]);
  }

  function jumpToParent(parent: number) {
    const target = document.getElementById(`post-${parent}`);
    if (!target) return void MessagePlugin.warning(`未找到父评论 #${parent}`);
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('is-highlighted');
    window.setTimeout(() => target.classList.remove('is-highlighted'), 1600);
  }

  async function copyChain(post: Post) {
    try {
      await navigator.clipboard.writeText(postChainMarkdown(posts, post));
      void MessagePlugin.success('评论链已复制');
    } catch {
      void MessagePlugin.error('浏览器拒绝了剪贴板访问');
    }
  }

  if (threadId === null)
    return (
      <div className="page">
        <Button variant="text" className="back-button" onClick={() => void navigate({ to: '/threads' })}>
          <ChevronLeftIcon /> 返回讨论列表
        </Button>
        <Empty title="无效的讨论 ID" description="讨论 ID 必须是正整数。" />
      </div>
    );

  const ordered =
    view === 'tree'
      ? orderPostTree(posts, ascending)
      : [...posts]
          .sort((a, b) => (ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt))
          .map((post) => ({ post, depth: 0 }));

  return (
    <div className="page">
      <Button variant="text" className="back-button" onClick={() => void navigate({ to: '/threads' })}>
        <ChevronLeftIcon /> 返回讨论列表
      </Button>
      <PageHeader
        eyebrow={`THREAD / ${threadId}`}
        title={thread?.title || '讨论详情'}
        detail={thread?.url || '加载讨论元数据中...'}
        action={
          thread && (
            <>
              <Button variant="outline" onClick={() => void navigate({ to: '/threads/$id/edit', params: { id } })}>
                <EditIcon /> 编辑元数据
              </Button>
              <Button
                theme="primary"
                variant="outline"
                onClick={() => window.open(thread.url, '_blank', 'noopener,noreferrer')}
              >
                <LinkIcon /> 在线查看
              </Button>
            </>
          )
        }
      />
      {error && !loading ? (
        <ErrorState message={errorText(error, '讨论加载失败')} retry={reload} />
      ) : (
        <Loading loading={loading} showOverlay>
          {thread && (
            <>
              <div className="thread-strip">
                <Tag theme={thread.locked ? 'warning' : 'success'} variant="light">
                  {thread.locked ? '已锁定' : '进行中'}
                </Tag>
                <span>{thread.amount} 条可见评论</span>
                <span>创建于 {formatDate(thread.firstPostAt)}</span>
                <Button size="small" variant="text" onClick={reload}>
                  <RefreshIcon /> 刷新
                </Button>
              </div>
              <Card className="admin-compose" bordered={false}>
                <div>
                  <strong>发布顶层管理员评论</strong>
                  <span>使用本机保存的管理员身份</span>
                </div>
                <Textarea
                  value={topContent}
                  onChange={setTopContent}
                  autosize={{ minRows: 3, maxRows: 8 }}
                  placeholder="输入新评论..."
                />
                <Button
                  theme="primary"
                  loading={createPost.isPending}
                  disabled={!topContent.trim()}
                  onClick={() => createPost.mutate({ parent: 0, content: topContent })}
                >
                  发布评论
                </Button>
              </Card>
              <div className="post-toolbar">
                <div className="view-tabs">
                  <button
                    type="button"
                    className={view === 'chronological' ? 'active' : ''}
                    onClick={() => setView('chronological')}
                  >
                    时间顺序
                  </button>
                  <button type="button" className={view === 'tree' ? 'active' : ''} onClick={() => setView('tree')}>
                    回复树
                  </button>
                </div>
                <div className="switch-label">
                  升序{' '}
                  <Switch
                    size="small"
                    value={ascending}
                    onChange={(value) => {
                      setAscending(value);
                      localStorage.setItem(POST_SORT_KEY, value ? 'ascending' : 'descending');
                    }}
                  />
                </div>
              </div>
              <section className="comments-list">
                {ordered.map(({ post, depth }) => (
                  <CommentCard
                    key={post.id}
                    post={post}
                    depth={depth}
                    onReply={() => {
                      setReplying(post);
                      setReplyContent('');
                    }}
                    onEdit={() =>
                      void navigate({ to: '/threads/$id/posts/$postId/edit', params: { id, postId: String(post.id) } })
                    }
                    onJumpToParent={() => jumpToParent(post.parent)}
                    onCopyChain={() => void copyChain(post)}
                    onToggleHidden={(hidden) => updatePost.mutate({ ...post, hidden })}
                  />
                ))}
                {!posts.length && <Empty title="这里还没有评论" description="可以发布第一条管理员评论。" />}
              </section>
            </>
          )}
        </Loading>
      )}
      <Dialog
        header={`回复 ${replying?.name ?? ''}`}
        visible={Boolean(replying)}
        onClose={() => setReplying(null)}
        onConfirm={() => replying && createPost.mutate({ parent: replying.id, content: replyContent })}
        confirmLoading={createPost.isPending}
        confirmBtn="发布回复"
      >
        {replying && <blockquote className="reply-quote">{replying.content}</blockquote>}
        <Textarea
          value={replyContent}
          onChange={setReplyContent}
          autosize={{ minRows: 5, maxRows: 12 }}
          placeholder="输入管理员回复..."
        />
      </Dialog>
    </div>
  );
}
