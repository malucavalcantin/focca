// Endereço do API Gateway Focca (fachada dos microsserviços).
// Padrão: http://localhost:8080 (docker compose ou "npm start" em microsservicos/).
// Para apontar para outro endereço, defina window.FOCCA_API_URL antes dos módulos
// ou salve no navegador: localStorage.setItem('focca-api-url', 'https://...').
function lerSalvo() { try { return localStorage.getItem('focca-api-url'); } catch { return null; } }

export const API_URL = String(window.FOCCA_API_URL || lerSalvo() || 'http://localhost:8080').replace(/\/+$/, '');

// Client ID OAuth do Google Agenda (o mesmo de firebase-config.js). Fica aqui para a
// interface ligada aos microsserviços não depender do Firebase.
export const GOOGLE_CLIENT_ID = '115877907995-k4iijpbmpgjbnuqsga21t5l210n91gfu.apps.googleusercontent.com';
