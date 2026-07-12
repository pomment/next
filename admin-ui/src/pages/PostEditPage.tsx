import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeftIcon } from 'tdesign-icons-react';
import { Button, Card, Empty, Form, Input, Loading, MessagePlugin, Switch, Textarea } from 'tdesign-react';
import { api } from '../api';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { queryClient, queryKeys } from '../lib/query';
import { errorText, formatDate, positiveInteger } from '../lib/utils';
import type { Post } from '../types';

export function PostEditPage() {
  const { id, postId } = useParams({ from: '/threads/$id_/posts/$postId/edit' });
  const threadId = positiveInteger(id);
  const targetId = positiveInteger(postId);
  const valid = threadId !== null && targetId !== null;
  const resolvedThreadId = threadId ?? 0;
  const resolvedTargetId = targetId ?? 0;
  const postQuery = useQuery({
    queryKey: queryKeys.post(resolvedThreadId, resolvedTargetId),
    queryFn: () => api.getPost(resolvedThreadId, resolvedTargetId),
    enabled: valid,
  });

  if (!valid)
    return (
      <div className="page narrow-page">
        <Empty title="无效的评论地址" description="讨论和评论 ID 必须是正整数。" />
      </div>
    );

  return (
    <div className="page narrow-page">
      {postQuery.isError ? (
        <ErrorState message={errorText(postQuery.error, '评论加载失败')} retry={() => void postQuery.refetch()} />
      ) : (
        <Loading loading={postQuery.isPending} showOverlay>
          {postQuery.data && (
            <PostEditor key={postQuery.data.updatedAt} post={postQuery.data} threadId={resolvedThreadId} />
          )}
        </Loading>
      )}
    </div>
  );
}

function PostEditor({ post: initialPost, threadId }: { post: Post; threadId: number }) {
  const navigate = useNavigate();
  const [post, setPost] = useState(initialPost);
  const save = useMutation({
    mutationFn: () => api.updatePost(threadId, post),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.post(threadId, post.id), updated);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.posts(threadId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.thread(threadId), exact: true }),
        queryClient.invalidateQueries({ queryKey: queryKeys.threads, exact: true }),
      ]);
      void MessagePlugin.success('评论已更新');
      await navigate({ to: '/threads/$id', params: { id: String(threadId) } });
    },
    onError: (cause) => void MessagePlugin.error(errorText(cause, '保存失败')),
  });

  function submit() {
    if (!post.name.trim() || !post.email.trim() || !post.content.trim())
      return void MessagePlugin.warning('姓名、邮箱和内容不能为空');
    save.mutate();
  }

  return (
    <>
      <Button
        variant="text"
        className="back-button"
        onClick={() => void navigate({ to: '/threads/$id', params: { id: String(threadId) } })}
      >
        <ChevronLeftIcon /> 返回讨论详情
      </Button>
      <PageHeader
        eyebrow={`POST / ${post.id}`}
        title="完整编辑评论"
        detail="可编辑兼容字段，并查看不可修改的技术信息。"
      />
      <div className="editor-grid">
        <Card className="form-card" bordered={false}>
          <h2>评论字段</h2>
          <Form layout="vertical">
            <div className="form-columns">
              <Form.FormItem label="姓名">
                <Input value={post.name} onChange={(name) => setPost({ ...post, name })} />
              </Form.FormItem>
              <Form.FormItem label="邮箱">
                <Input value={post.email} onChange={(email) => setPost({ ...post, email })} />
              </Form.FormItem>
            </div>
            <Form.FormItem label="网站">
              <Input
                value={post.website}
                onChange={(website) => setPost({ ...post, website })}
                placeholder="https://example.com"
              />
            </Form.FormItem>
            <Form.FormItem label="内容">
              <Textarea
                value={post.content}
                onChange={(content) => setPost({ ...post, content })}
                autosize={{ minRows: 8, maxRows: 20 }}
              />
            </Form.FormItem>
            <div className="toggle-grid">
              <div>
                隐藏 <Switch value={post.hidden} onChange={(hidden) => setPost({ ...post, hidden })} />
              </div>
              <div>
                接收邮件{' '}
                <Switch value={post.receiveEmail} onChange={(receiveEmail) => setPost({ ...post, receiveEmail })} />
              </div>
              <div>
                管理员评论 <Switch value={post.byAdmin} onChange={(byAdmin) => setPost({ ...post, byAdmin })} />
              </div>
            </div>
            <div className="form-actions">
              <Button
                variant="outline"
                onClick={() => void navigate({ to: '/threads/$id', params: { id: String(threadId) } })}
              >
                取消
              </Button>
              <Button theme="primary" loading={save.isPending} onClick={submit}>
                保存修改
              </Button>
            </div>
          </Form>
        </Card>
        <Card className="technical-card" bordered={false}>
          <h2>技术信息</h2>
          <dl>
            <dt>评论 ID</dt>
            <dd>{post.id}</dd>
            <dt>父评论 ID</dt>
            <dd>{post.parent || '-'}</dd>
            <dt>邮箱哈希</dt>
            <dd>{post.emailHashed || '-'}</dd>
            <dt>编辑密钥</dt>
            <dd>{post.editKey || '-'}</dd>
            <dt>头像</dt>
            <dd>{post.avatar || '-'}</dd>
            <dt>评分</dt>
            <dd>{post.rating}</dd>
            <dt>创建时间</dt>
            <dd>{formatDate(post.createdAt)}</dd>
            <dt>更新时间</dt>
            <dd>{formatDate(post.updatedAt)}</dd>
            <dt>原始内容</dt>
            <dd className="pre-value">{post.origContent || '-'}</dd>
          </dl>
        </Card>
      </div>
    </>
  );
}
