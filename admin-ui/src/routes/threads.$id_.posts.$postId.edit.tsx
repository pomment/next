import { createFileRoute } from '@tanstack/react-router';
import { PostEditPage } from '../pages/PostEditPage';

export const Route = createFileRoute('/threads/$id_/posts/$postId/edit')({ component: PostEditPage });
