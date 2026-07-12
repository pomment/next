import type { Post } from '../types';

export function orderPostTree(posts: Post[], ascending: boolean): Array<{ post: Post; depth: number }> {
  const ids = new Set(posts.map((post) => post.id));
  const children = new Map<number, Post[]>();
  for (const post of posts) {
    const parent = ids.has(post.parent) ? post.parent : 0;
    children.set(parent, [...(children.get(parent) ?? []), post]);
  }
  const result: Array<{ post: Post; depth: number }> = [];
  const visited = new Set<number>();
  const visit = (post: Post, depth: number) => {
    if (visited.has(post.id)) return;
    visited.add(post.id);
    result.push({ post, depth });
    [...(children.get(post.id) ?? [])]
      .sort((a, b) => (ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt))
      .forEach((reply) => {
        visit(reply, depth + 1);
      });
  };
  [...(children.get(0) ?? [])]
    .sort((a, b) => (ascending ? a.createdAt - b.createdAt : b.createdAt - a.createdAt))
    .forEach((post) => {
      visit(post, 0);
    });
  posts
    .filter((post) => !visited.has(post.id))
    .forEach((post) => {
      visit(post, 0);
    });
  return result;
}

export function postChainMarkdown(posts: Post[], post: Post): string {
  const byId = new Map(posts.map((item) => [item.id, item]));
  const chain: Post[] = [];
  const seen = new Set<number>();
  let current: Post | undefined = post;
  while (current && !seen.has(current.id)) {
    chain.unshift(current);
    seen.add(current.id);
    current = current.parent ? byId.get(current.parent) : undefined;
  }
  return chain
    .map(
      (item) =>
        `> **${item.name}** (#${item.id})\n>\n${item.content
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')}`,
    )
    .join('\n\n');
}
