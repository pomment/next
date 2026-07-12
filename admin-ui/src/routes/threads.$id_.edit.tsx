import { createFileRoute } from '@tanstack/react-router';
import { ThreadEditPage } from '../pages/ThreadEditPage';

export const Route = createFileRoute('/threads/$id_/edit')({ component: ThreadEditPage });
