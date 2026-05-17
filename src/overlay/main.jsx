import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Overlay from './Overlay';
import './overlay.css';

const container = document.getElementById('overlay-root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Overlay />
    </StrictMode>,
  );
}
