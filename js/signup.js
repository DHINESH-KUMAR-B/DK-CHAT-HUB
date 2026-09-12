// js/signup.js
import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

document.getElementById("login").addEventListener("click", () => {
  const email = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  createUserWithEmailAndPassword(auth, email, password)
    .then(userCredential => {
      const user = userCredential.user;

      // Save user data under UID
      set(ref(db, 'users/' + user.uid), {
        email: user.email,
        createdAt: new Date().toISOString(),
        profile: {
          name: "New User",
          photo: "",
          friends: 0,
          groups: 0,
          events: 0,
          location: "Unknown",
          joined: new Date().toISOString()
        }
      });

      alert("Signup successful!");
      window.location.href = "login.html";
    })
    .catch(error => alert("Error: " + error.message));
});
const passwordField = document.getElementById("password");
const toggleEye = document.getElementById("toggleEye");

if (toggleEye) {
  toggleEye.addEventListener("click", () => {
    if (!passwordField) return;
    const isHidden = passwordField.type === "password";
    passwordField.type = isHidden ? "text" : "password";

    // Toggle icon between eye and eye-slash
    toggleEye.classList.toggle("bi-eye", !isHidden);
    toggleEye.classList.toggle("bi-eye-slash", isHidden);
  });
}

