import React from 'react';
import ReactDOM from 'react-dom/client';
import { Overlay } from './Overlay';
import '../index.css';

const rootElement = document.getElementById('overlay-root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Overlay />
    </React.StrictMode>
  );
}
