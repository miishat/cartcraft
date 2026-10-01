import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { CartCraftDb } from './data/db';
import { AppRoutes } from './ui/App';
import { DbProvider } from './ui/db';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <DbProvider db={new CartCraftDb()}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </DbProvider>
  </StrictMode>,
);
