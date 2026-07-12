import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useState } from 'react';
import { ChevronLeftIcon } from 'tdesign-icons-react';
import { Button, Card, Empty, Form, Input, Loading, MessagePlugin, Switch } from 'tdesign-react';
import { api } from '../api';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { queryClient, queryKeys } from '../lib/query';
import { errorText, positiveInteger, validHttpUrl } from '../lib/utils';
import type { Thread } from '../types';

export function ThreadEditPage() {
  const { id } = useParams({ from: '/threads/$id_/edit' });
  const threadId = positiveInteger(id);
  const resolvedThreadId = threadId ?? 0;
  const threadQuery = useQuery({
    queryKey: queryKeys.thread(resolvedThreadId),
    queryFn: () => api.getThread(resolvedThreadId),
    enabled: threadId !== null,
  });

  if (threadId === null)
    return (
      <div className="page narrow-page">
        <Empty title="无效的讨论 ID" description="讨论 ID 必须是正整数。" />
      </div>
    );

  return (
    <div className="page narrow-page">
      {threadQuery.isError ? (
        <ErrorState message={errorText(threadQuery.error, '元数据加载失败')} retry={() => void threadQuery.refetch()} />
      ) : (
        <Loading loading={threadQuery.isPending} showOverlay>
          {threadQuery.data && <ThreadEditor key={threadQuery.data.id} thread={threadQuery.data} />}
        </Loading>
      )}
    </div>
  );
}

function ThreadEditor({ thread: initialThread }: { thread: Thread }) {
  const navigate = useNavigate();
  const [thread, setThread] = useState(initialThread);
  const save = useMutation({
    mutationFn: () => api.updateThread(thread),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.thread(thread.id), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.threads });
      void MessagePlugin.success('讨论元数据已更新');
      await navigate({ to: '/threads/$id', params: { id: String(thread.id) } });
    },
    onError: (cause) => void MessagePlugin.error(errorText(cause, '保存失败')),
  });

  function submit() {
    if (!thread.title.trim()) return void MessagePlugin.warning('标题不能为空');
    if (!validHttpUrl(thread.url)) return void MessagePlugin.warning('URL 必须以 http:// 或 https:// 开头');
    save.mutate();
  }

  return (
    <>
      <Button
        variant="text"
        className="back-button"
        onClick={() => void navigate({ to: '/threads/$id', params: { id: String(thread.id) } })}
      >
        <ChevronLeftIcon /> 返回讨论详情
      </Button>
      <PageHeader eyebrow={`THREAD / ${thread.id}`} title="编辑讨论元数据" detail="评论统计和活动时间由服务端维护。" />
      <Card className="form-card" bordered={false}>
        <Form layout="vertical">
          <Form.FormItem label="标题">
            <Input value={thread.title} onChange={(title) => setThread({ ...thread, title })} />
          </Form.FormItem>
          <Form.FormItem label="页面 URL">
            <Input
              value={thread.url}
              onChange={(url) => setThread({ ...thread, url })}
              placeholder="https://example.com/article"
            />
          </Form.FormItem>
          <div className="locked-row">
            <span>
              <strong>锁定讨论</strong>
              <small>阻止公开页面提交新评论</small>
            </span>
            <Switch value={thread.locked} onChange={(locked) => setThread({ ...thread, locked })} />
          </div>
          <div className="form-actions">
            <Button
              variant="outline"
              onClick={() => void navigate({ to: '/threads/$id', params: { id: String(thread.id) } })}
            >
              取消
            </Button>
            <Button theme="primary" loading={save.isPending} onClick={submit}>
              保存元数据
            </Button>
          </div>
        </Form>
      </Card>
    </>
  );
}
