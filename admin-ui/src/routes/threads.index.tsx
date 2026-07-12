import { createFileRoute } from '@tanstack/react-router';
import { ThreadsPage } from '../pages/ThreadsPage';

export const Route = createFileRoute('/threads/')({ component: ThreadsPage });
