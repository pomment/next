import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import React from 'react';
import ReactDOM from 'react-dom/client';
import 'tdesign-react/es/_util/react-19-adapter';
import 'tdesign-react/es/style/index.css';
import { queryClient } from './lib/query';
import { router } from './router';
import './styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>,
);
