export interface Thread {
  title: string;
  firstPostAt: number;
  latestPostAt: number;
  amount: number;
  id: string;
  locked: boolean;
  url: string;
}

export interface ThreadMapItem {
  id: string;
  url: string;
}
