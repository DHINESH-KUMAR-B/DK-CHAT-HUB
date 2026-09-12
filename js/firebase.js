// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyD8wbQ3A3nCSK9-MHesr9fhuHhlftHsI1Y",
  authDomain: "chatting-app-b50c3.firebaseapp.com",
  databaseURL: "https://chatting-app-b50c3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "chatting-app-b50c3",
  messagingSenderId: "317838528642",
  appId: "1:317838528642:web:f0e5779b68be16583ee49b",
  measurementId: "G-GHQ4C8HS9R"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export Auth + DB
export const auth = getAuth(app);
export const db = getDatabase(app);