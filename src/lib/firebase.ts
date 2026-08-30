import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAqkcY-WQrW3WoZWRrv8oo7MTAI_nVrLw4",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "olive-pizza-08.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "olive-pizza-08",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "olive-pizza-08.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1017239455106",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1017239455106:web:ea5dd73d10722020007b9b"
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function getCurrentAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
