import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'tdesign-react/es/_util/react-19-adapter';
import 'tdesign-react/es/style/index.css';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <BrowserRouter basename="/admin">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
