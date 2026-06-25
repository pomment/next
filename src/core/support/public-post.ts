import type { Post, PublicPost } from '../domain/post';

export function toPublicPost(post: Post): PublicPost {
  return {
    id: post.id,
    name: post.name,
    emailHashed: post.emailHashed,
    website: post.website,
    parent: post.parent,
    content: post.content,
    hidden: post.hidden,
    byAdmin: post.byAdmin,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    avatar: post.avatar,
  };
}
