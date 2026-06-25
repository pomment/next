import type { Thread } from './thread';

export interface Post {
  id: string;
  name: string;
  email: string;
  emailHashed: string;
  website: string;
  parent: string;
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
  id: string;
  name: string;
  emailHashed: string;
  website: string;
  parent: string;
  content: string;
  hidden: boolean;
  byAdmin: boolean;
  createdAt: number;
  updatedAt: number;
  avatar: string;
}

export interface CreateUserPostInput {
  id?: string;
  url: string;
  title: string;
  parent?: string;
  name: string;
  email: string;
  website?: string;
  content: string;
  receiveEmail?: boolean;
  challengeResponse?: string;
}

export interface CreateAdminPostInput {
  threadId: string;
  name: string;
  email: string;
  parent?: string;
  content: string;
}

export interface EditPostInput {
  threadId: string;
  post: Post;
  alterEditTime?: boolean;
}

export interface PostListResult {
  meta: Thread;
  post: PublicPost[];
}
