import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBvASzcbKyv3uW7NBzDFDyLsKls3An3UUs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "erpkuryos.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://erpkuryos-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "erpkuryos",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "erpkuryos.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "272752392739",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:272752392739:web:047a6c4aa60145d77f4f96",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firebaseDb = getDatabase(app);
export const firebaseStorage = getStorage(app);
export { app as firebaseApp, firebaseConfig };
