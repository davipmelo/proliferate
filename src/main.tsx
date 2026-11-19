import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';
import './styles/mobile.css';
import './styles/print.css';
import App from './App.tsx';
import { StoreProvider } from './state/store.tsx';
import { UiLayer } from './state/ui.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
      <UiLayer />
    </StoreProvider>
  </StrictMode>,
);
