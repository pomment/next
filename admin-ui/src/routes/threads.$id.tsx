import { createFileRoute } from '@tanstack/react-router';
import { ThreadPage } from '../pages/ThreadPage';

export const Route = createFileRoute('/threads/$id')({ component: ThreadPage });
