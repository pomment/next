import type { Thread } from './thread';

export interface Post {
  id: number;
  name: string;
  email: string;
  emailHashed: string;
  website: string;
  parent: number;
  content: string;
  hidden: boolean;
  byAdmin: boolean;
  receiveEmail: boolean;
  editKey: string;
  createdAt: number;
  updatedAt: number;
  origContent: string;
  avatar: string;
  rating: number;
}

export interface PublicPost {
  id: number;
  name: string;
  emailHashed: string;
  website: string;
  parent: number;
  content: string;
  hidden: boolean;
  byAdmin: boolean;
  createdAt: number;
  updatedAt: number;
  avatar: string;
}

export interface CreateUserPostInput {
  url: string;
  title: string;
  parent?: number;
  name: string;
  email: string;
  website?: string;
  content: string;
  receiveEmail?: boolean;
  challengeResponse?: string;
}

export interface CreateAdminPostInput {
  threadId: number;
  name: string;
  email: string;
  parent?: number;
  content: string;
}

export interface EditPostInput {
  threadId: number;
  post: Post;
  alterEditTime?: boolean;
}

export interface PostListResult {
  meta: Thread;
  post: PublicPost[];
}

export interface LegacyPostInput {
  name: string;
  email: string;
  emailHashed: string;
  website?: string;
  avatar?: string;
  parent?: number;
  content: string;
  origContent?: string;
  hidden?: boolean;
  rating?: number;
  byAdmin?: boolean;
  receiveEmail?: boolean;
  editKey?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ImportThreadInput {
  thread: Thread;
  posts: LegacyPostInput[];
}

export interface ImportThreadResult {
  thread: Thread;
  postCount: number;
}
