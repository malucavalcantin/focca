import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDCFTntIU6MfiB2TsilkPtAO07nPNHm2TY",
  authDomain: "focca-edu.firebaseapp.com",
  projectId: "focca-edu",
  storageBucket: "focca-edu.firebasestorage.app",
  messagingSenderId: "203608441902",
  appId: "1:203608441902:web:343ec5bdefdb9926e28bbf"
};

// IMPORTANTE:
// Depois do primeiro deploy no focca-edu, substitua pelo Client ID OAuth
// configurado para o domínio oficial do Focca. Enquanto isso, o app continua
// funcionando normalmente; somente "Adicionar ao Google Agenda" exigirá
// concluir essa configuração.
export const GOOGLE_CLIENT_ID = "115877907995-k4iijpbmpgjbnuqsga21t5l210n91gfu.apps.googleusercontent.com";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
