// Dunkelmodus ein/aus. Gilt nur für dieses Gerät (wird nicht synchronisiert); Standard ist dunkel.
import { ui, saveUi } from './store.js';
import { $ } from './ui.js';

const COLOR = { dark: '#0c0e11', light: '#f5f5f2' };
export const theme = () => (ui.theme === 'light' ? 'light' : 'dark');

export function applyTheme() {
  const t = theme();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]').content = COLOR[t];
  document.querySelector('meta[name=color-scheme]').content = t;
  $('themeSwitch').setAttribute('aria-checked', String(t === 'dark'));
}

export function initTheme() {
  applyTheme();
  $('themeSwitch').onclick = () => { ui.theme = theme() === 'dark' ? 'light' : 'dark'; saveUi(); applyTheme(); };
}
