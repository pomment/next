import type { CSSProperties } from 'react';
import { ChatAddIcon, CopyIcon, EditIcon, JumpIcon } from 'tdesign-icons-react';
import { Button, Space, Switch, Tag } from 'tdesign-react';
import { formatDate } from '../lib/utils';
import type { Post } from '../types';
import { PostAvatar } from './PostAvatar';

export function CommentCard({
  post,
  depth,
  onReply,
  onEdit,
  onJumpToParent,
  onCopyChain,
  onToggleHidden,
}: {
  post: Post;
  depth: number;
  onReply: () => void;
  onEdit: () => void;
  onJumpToParent: () => void;
  onCopyChain: () => void;
  onToggleHidden: (hidden: boolean) => void;
}) {
  return (
    <article
      id={`post-${post.id}`}
      className={`comment-card ${post.hidden ? 'is-hidden' : ''}`}
      style={{ '--depth': Math.min(depth, 6) } as CSSProperties}
    >
      <div className="comment-author">
        <PostAvatar post={post} />
        <div>
          <strong>
            {post.name || '匿名'}{' '}
            <span className="inline-tags">
              {post.byAdmin && (
                <Tag size="small" theme="primary">
                  管理员
                </Tag>
              )}
              {post.hidden && (
                <Tag size="small" theme="warning">
                  已隐藏
                </Tag>
              )}
            </span>
          </strong>
          <span>
            {post.email} · #{post.id}
            {post.parent ? ` · 回复 #${post.parent}` : ''}
          </span>
        </div>
        <time>{formatDate(post.createdAt)}</time>
      </div>
      <div className="comment-content">{post.content}</div>
      <div className="comment-actions">
        <Space breakLine>
          <Button size="small" variant="text" onClick={onReply}>
            <ChatAddIcon /> 回复
          </Button>
          <Button size="small" variant="text" onClick={onEdit}>
            <EditIcon /> 完整编辑
          </Button>
          {post.parent > 0 && (
            <Button size="small" variant="text" onClick={onJumpToParent}>
              <JumpIcon /> 跳到父评论
            </Button>
          )}
          <Button size="small" variant="text" onClick={onCopyChain}>
            <CopyIcon /> 复制祖先链
          </Button>
        </Space>
        <div>
          <span>{post.hidden ? '已隐藏' : '公开'}</span>
          <Switch size="small" value={!post.hidden} onChange={(visible) => onToggleHidden(!visible)} />
        </div>
      </div>
    </article>
  );
}
