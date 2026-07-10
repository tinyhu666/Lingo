import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RegionPicker from './RegionPicker';
import { I18nProvider } from '../i18n/I18nProvider';
import '../index.css';
import './picker.css';

const container = document.getElementById('region-picker-root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <I18nProvider>
        <RegionPicker />
      </I18nProvider>
    </StrictMode>,
  );
}
