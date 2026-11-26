// Tela de login do Focca ligada ao Serviço de Autenticação (pelo API Gateway).
// Criar conta, entrar com e-mail e senha e entrar com conta Google viram
// chamadas a /api/autenticacao/...; o token da sessão fica no api-service.js.
import { loginWithEmail, registerWithEmail, loginWithGoogle } from './api-service.js?v=20261126';

const $ = id => document.getElementById(id);

function showToast(message, error=false){
  const toast = $('toast');
  if (!toast) {
    console.warn(message);
    return;
  }
  toast.textContent = message;
  toast.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.className = 'toast', 4200);
}

function friendlyError(error){
  const map = {
    401: 'E-mail ou senha inválidos.',
    409: 'Este e-mail já está cadastrado.',
    501: 'O login com Google não está configurado no Serviço de Autenticação.',
    503: 'O Serviço de Autenticação está fora do ar no momento.'
  };
  if (error?.status === 400) return error.message;
  return map[error?.status] || error?.message || 'Não foi possível concluir o login.';
}

function openRegister(){
  $('loginFormView')?.classList.add('hidden');
  $('registerFormView')?.classList.remove('hidden');
}

function openLogin(){
  $('registerFormView')?.classList.add('hidden');
  $('loginFormView')?.classList.remove('hidden');
}

function bindAuth(){
  const googleBtn = $('loginBtn');
  const loginForm = $('emailLoginForm');
  const registerForm = $('emailRegisterForm');
  const showRegisterBtn = $('showRegisterBtn');
  const showLoginBtn = $('showLoginBtn');

  showRegisterBtn?.addEventListener('click', openRegister);
  showLoginBtn?.addEventListener('click', openLogin);

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = loginForm.querySelector('button[type="submit"]');
    try {
      if (submit) submit.disabled = true;
      await loginWithEmail($('loginEmail').value.trim(), $('loginPassword').value);
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = registerForm.querySelector('button[type="submit"]');
    try {
      if (submit) submit.disabled = true;
      await registerWithEmail(
        $('registerName').value.trim(),
        $('registerEmail').value.trim(),
        $('registerPassword').value
      );
      showToast('Conta criada. Bem-vindo ao Focca!');
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  // Entrar com conta Google. No docker compose o Serviço de Autenticação está em
  // modo simulado (AUTENTICACAO_GOOGLE=simulado), que aceita "simulado:<email>:<nome>".
  // Usa o e-mail digitado no campo de login (ou um e-mail de demonstração).
  googleBtn?.addEventListener('click', async () => {
    try {
      googleBtn.disabled = true;
      const email = $('loginEmail')?.value.trim() || 'estudante.google@ufrpe.br';
      const nome = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      await loginWithGoogle(`simulado:${email}:${nome}`);
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      googleBtn.disabled = false;
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAuth, { once: true });
} else {
  bindAuth();
}
