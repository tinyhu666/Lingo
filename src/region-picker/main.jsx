import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import RegionPicker from './RegionPicker';
import '../index.css';
import './picker.css';

const container = document.getElementById('region-picker-root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <RegionPicker />
    </StrictMode>,
  );
}
