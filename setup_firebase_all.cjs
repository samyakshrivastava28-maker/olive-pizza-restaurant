const fs = require('fs');
const path = require('path');

const envContent = `# Olive Pizza Production Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyAqkcY-WQrW3WoZWRrv8oo7MTAI_nVrLw4
VITE_FIREBASE_AUTH_DOMAIN=olive-pizza-08.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=olive-pizza-08
VITE_FIREBASE_STORAGE_BUCKET=olive-pizza-08.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1017239455106
VITE_FIREBASE_APP_ID=1:1017239455106:web:ea5dd73d10722020007b9b
VITE_FIREBASE_VAPID_KEY=BDfxvZSqSw6Es3dvXz4VZMwjNFKMCCfRSgdCVty3rfqqBZ6AAWFlZ2EwWQR8ltp6DRMTUKOmH9Rlu0fjCziOKDk

# Backend API Endpoint
VITE_API_BASE_URL=http://localhost:5175
`;

const firebaseJsonManager = `{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
`;

const firebaseJsonDelivery = `{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
`;

const targets = [
  {
    dir: 'c:\\Users\\RYZEN\\Downloads\\Olive Pizza restaurant manager',
    isManager: true
  },
  {
    dir: 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-restaurant-management',
    isManager: true
  },
  {
    dir: 'C:\\Users\\RYZEN\\Downloads\\olive-pizza-delivery',
    isManager: false
  },
  {
    dir: 'C:\\Users\\RYZEN\\Downloads\\olive pizza delivery app',
    isManager: false
  }
];

targets.forEach(({ dir, isManager }) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 1. .env and .env.local
  fs.writeFileSync(path.join(dir, '.env'), envContent.trim(), 'utf8');
  fs.writeFileSync(path.join(dir, '.env.production'), envContent.trim(), 'utf8');

  // 2. firebase.json
  fs.writeFileSync(path.join(dir, 'firebase.json'), (isManager ? firebaseJsonManager : firebaseJsonDelivery).trim(), 'utf8');

  // 3. Update src/lib/firebase.ts
  const fbPath = path.join(dir, 'src', 'lib', 'firebase.ts');
  if (fs.existsSync(fbPath)) {
    const fbCode = `import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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

export async function getCurrentAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}
`;
    fs.writeFileSync(fbPath, fbCode.trim(), 'utf8');
  }

  console.log(`Configured Firebase setup in ${dir}`);
});
console.log('Firebase full setup completed for all apps');
