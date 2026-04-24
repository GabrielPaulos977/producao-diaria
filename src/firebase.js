import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, onValue, push, remove, update } from 'firebase/database';

// ⚠️ SUBSTITUIR com suas credenciais do Firebase (ver GUIA.md)
const firebaseConfig = {
  apiKey: "AIzaSyDvZjziLSryOmYnqe8nd3M3V_jC3MyRgfg",
  authDomain: "producao-diaria-bf7e8.firebaseapp.com",
  databaseURL: "https://producao-diaria-bf7e8-default-rtdb.firebaseio.com",
  projectId: "producao-diaria-bf7e8",
  storageBucket: "producao-diaria-bf7e8.firebasestorage.app",
  messagingSenderId: "997726325170",
  appId: "1:997726325170:web:1eeed03c145f18a2c1fcab"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db, ref, set, get, onValue, push, remove, update };
