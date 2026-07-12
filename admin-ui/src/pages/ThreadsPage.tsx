import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { RefreshIcon, SearchIcon } from 'tdesign-icons-react';
import { Button, Card, Empty, Input, Loading, MessagePlugin, Switch, Tag } from 'tdesign-react';
import { api } from '../api';
import { ErrorState } from '../components/ErrorState';
import { PageHeader } from '../components/PageHeader';
import { queryClient, queryKeys } from '../lib/query';
import { errorText, formatDate } from '../lib/utils';

const THREAD_SORT_KEY = 'pomment-admin-thread-sort';

export function ThreadsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [latestFirst, setLatestFirst] = useState(() => localStorage.getItem(THREAD_SORT_KEY) !== 'oldest');
  const threadsQuery = useQuery({ queryKey: queryKeys.threads, queryFn: api.listThreads });
  const refresh = useMutation({
    mutationFn: api.refreshThreads,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.threads });
      void MessagePlugin.success('全部讨论元数据已刷新');
    },
    onError: (error) => void MessagePlugin.error(errorText(error, '元数据刷新失败')),
  });
  const threads = threadsQuery.data ?? [];
  const visible = threads
    .filter((thread) => `${thread.title} ${thread.url}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => (latestFirst ? b.latestPostAt - a.latestPostAt : a.latestPostAt - b.latestPostAt));
  const totalComments = threads.reduce((sum, thread) => sum + thread.amount, 0);

  function changeSort(value: boolean) {
    setLatestFirst(value);
    localStorage.setItem(THREAD_SORT_KEY, value ? 'latest' : 'oldest');
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="DISCUSSIONS"
        title="讨论管理"
        detail="查看站点中的全部讨论串和评论动态。"
        action={
          <>
            <Button variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              <RefreshIcon /> 刷新全部元数据
            </Button>
            <Button variant="text" loading={threadsQuery.isFetching} onClick={() => void threadsQuery.refetch()}>
              重新加载
            </Button>
          </>
        }
      />
      <section className="stats-grid">
        <Card bordered={false}>
          <span>讨论串</span>
          <strong>{threads.length}</strong>
          <small>全部页面</small>
        </Card>
        <Card bordered={false}>
          <span>可见评论</span>
          <strong>{totalComments}</strong>
          <small>来自当前线程元数据</small>
        </Card>
        <Card bordered={false}>
          <span>已锁定</span>
          <strong>{threads.filter((item) => item.locked).length}</strong>
          <small>暂停新回复</small>
        </Card>
      </section>
      <Card className="data-card" bordered={false}>
        <div className="table-tools">
          <div>
            <h2>全部讨论串</h2>
            <span>{visible.length} 条记录</span>
          </div>
          <div className="tool-controls">
            <div className="switch-label">
              最近活动优先 <Switch size="small" value={latestFirst} onChange={changeSort} />
            </div>
            <Input
              prefixIcon={<SearchIcon />}
              value={search}
              onChange={setSearch}
              clearable
              placeholder="搜索标题或 URL"
            />
          </div>
        </div>
        {threadsQuery.isError && !threadsQuery.isFetching ? (
          <ErrorState
            message={errorText(threadsQuery.error, '讨论列表加载失败')}
            retry={() => void threadsQuery.refetch()}
          />
        ) : (
          <Loading loading={threadsQuery.isPending} showOverlay>
            {visible.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>讨论</th>
                      <th>状态</th>
                      <th>评论</th>
                      <th>最近活动</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((thread) => (
                      <tr
                        key={thread.id}
                        onClick={() => void navigate({ to: '/threads/$id', params: { id: String(thread.id) } })}
                      >
                        <td>
                          <strong>{thread.title || '未命名讨论'}</strong>
                          <a
                            href={thread.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {thread.url}
                          </a>
                        </td>
                        <td>
                          <Tag theme={thread.locked ? 'warning' : 'success'} variant="light">
                            {thread.locked ? '已锁定' : '进行中'}
                          </Tag>
                        </td>
                        <td>
                          <span className="count-pill">{thread.amount}</span>
                        </td>
                        <td>{formatDate(thread.latestPostAt)}</td>
                        <td>
                          <Button variant="text" theme="primary">
                            查看评论
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              !threadsQuery.isPending && (
                <Empty
                  title={search ? '没有匹配的讨论串' : '还没有讨论串'}
                  description={search ? '请尝试其他关键词。' : '收到第一条评论后会显示在这里。'}
                />
              )
            )}
          </Loading>
        )}
      </Card>
    </div>
  );
}
