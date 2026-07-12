import { useState } from 'react';
import type { Post } from '../types';

export function PostAvatar({ post }: { post: Post }) {
  const [failed, setFailed] = useState(false);
  const fallback = (post.name.trim()[0] || '?').toUpperCase();
  const source =
    post.avatar || (post.emailHashed ? `https://www.gravatar.com/avatar/${post.emailHashed}?d=identicon` : '');
  return (
    <div className="post-avatar">
      {source && !failed ? <img src={source} alt="" onError={() => setFailed(true)} /> : fallback}
    </div>
  );
}
