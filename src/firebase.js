import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDghk4KhqcxtMKMZUmOc3aFCctDgU7qFX4",
  authDomain: "controle-de-frota-c2b3c.firebaseapp.com",
  databaseURL: "https://controle-de-frota-c2b3c-default-rtdb.firebaseio.com",
  projectId: "controle-de-frota-c2b3c",
  storageBucket: "controle-de-frota-c2b3c.firebasestorage.app",
  messagingSenderId: "442990220933",
  appId: "1:442990220933:web:cf40593bf0fa9d234b3bec",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
