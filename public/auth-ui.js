import { auth, db } from './firebase-config.js?v=20260825-auth62';
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

const $ = id => document.getElementById(id);

function showToast(message, error=false){
  const toast = $('toast');
  if (!toast) {
    alert(message);
    return;
  }
  toast.textContent = message;
  toast.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.className = 'toast', 4200);
}

function friendlyError(error){
  const map = {
    'auth/invalid-credential': 'E-mail ou senha inválidos.',
    'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/popup-closed-by-user': 'O login com Google foi cancelado.',
    'auth/popup-blocked': 'O navegador bloqueou a janela de login do Google. Libere pop-ups para o Focca e tente novamente.',
    'auth/unauthorized-domain': 'O domínio atual ainda não está autorizado no Firebase Authentication.',
    'auth/operation-not-allowed': 'Este método de login ainda não está habilitado no Firebase Authentication.',
    'auth/network-request-failed': 'Não foi possível acessar o Firebase. Verifique sua conexão.'
  };
  return map[error?.code] || error?.message || 'Não foi possível concluir o login.';
}

async function ensureUserDocument(user, extra={}){
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  const base = {
    email: user.email || '',
    displayName: user.displayName || extra.displayName || 'Estudante',
    photoURL: user.photoURL || null,
    institution: 'UFRPE',
    courseName: 'Computação',
    updatedAt: serverTimestamp()
  };
  if (!snap.exists()) {
    await setDoc(ref, {
      ...base,
      onboardingComplete: false,
      createdAt: serverTimestamp()
    }, { merge: true });
  } else {
    await setDoc(ref, base, { merge: true });
  }
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
      const result = await signInWithEmailAndPassword(
        auth,
        $('loginEmail').value.trim(),
        $('loginPassword').value
      );
      await ensureUserDocument(result.user);
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
      const name = $('registerName').value.trim();
      const result = await createUserWithEmailAndPassword(
        auth,
        $('registerEmail').value.trim(),
        $('registerPassword').value
      );
      if (name) await updateProfile(result.user, { displayName: name });
      await ensureUserDocument(result.user, { displayName: name });
      showToast('Conta criada. Bem-vindo ao Focca!');
    } catch (error) {
      showToast(friendlyError(error), true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  googleBtn?.addEventListener('click', async () => {
    try {
      googleBtn.disabled = true;
      const result = await signInWithPopup(auth, provider);
      await ensureUserDocument(result.user);
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
