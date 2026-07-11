export interface Thread {
  title: string;
  firstPostAt: number;
  latestPostAt: number;
  amount: number;
  id: number;
  locked: boolean;
  url: string;
}

export interface UpdateThreadInput {
  id: number;
  title: string;
  url: string;
  locked: boolean;
}

export interface ThreadMapItem {
  id: number;
  url: string;
}
