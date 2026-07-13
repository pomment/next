export interface Thread {
  title: string;
  firstPostAt: number;
  latestPostAt: number;
  amount: number;
  id: number;
  locked: boolean;
  slug: string;
  url: string;
}

export interface UpdateThreadInput {
  id: number;
  title: string;
  slug: string;
  url: string;
  locked: boolean;
}

export interface ThreadMapItem {
  id: number;
  slug: string;
  url: string;
}
