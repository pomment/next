import type { Post } from '../../core/domain/post';
import type { Thread } from '../../core/domain/thread';

export interface ThreadRow {
  id: string;
  url: string;
  title: string;
  first_post_at: number;
  latest_post_at: number;
  amount: number;
  locked: number;
}

export interface PostRow {
  id: string;
  thread_id: string;
  name: string;
  email: string;
  email_hashed: string;
  website: string;
  parent: string;
  content: string;
  hidden: number;
  by_admin: number;
  receive_email: number;
  edit_key: string;
  created_at: number;
  updated_at: number;
  orig_content: string;
  avatar: string;
  rating: number;
}

export function threadFromRow(row: ThreadRow): Thread {
  return {
    id: row.id,
    url: row.url,
    title: row.title,
    firstPostAt: row.first_post_at,
    latestPostAt: row.latest_post_at,
    amount: row.amount,
    locked: row.locked === 1,
  };
}

export function postFromRow(row: PostRow): Post {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    emailHashed: row.email_hashed,
    website: row.website,
    parent: row.parent,
    content: row.content,
    hidden: row.hidden === 1,
    byAdmin: row.by_admin === 1,
    receiveEmail: row.receive_email === 1,
    editKey: row.edit_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    origContent: row.orig_content,
    avatar: row.avatar,
    rating: row.rating,
  };
}
