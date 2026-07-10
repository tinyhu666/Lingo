import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Overlay from './Overlay';
import { I18nProvider } from '../i18n/I18nProvider';
import '../index.css';
import './overlay.css';

const container = document.getElementById('overlay-root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <I18nProvider>
        <Overlay />
      </I18nProvider>
    </StrictMode>,
  );
}
