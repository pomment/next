export interface Thread {
  id: number;
  url: string;
  title: string;
  firstPostAt: number;
  latestPostAt: number;
  amount: number;
  locked: boolean;
}

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

export interface AdminIdentity {
  name: string;
  email: string;
}
