import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './styles/core/tokens.css';
import './styles/core/base.css';
import './styles/core/tailwind-theme-overrides.css';
import './styles/components/ui.css';
import './styles/components/auth.css';
import './styles/components/dashboard.css';
import './styles/components/layout.css';
import './styles/components/notifications.css';
import './styles/components/profile-settings.css';
import './i18n';
import { initializeTheme } from './utils/theme';

initializeTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
