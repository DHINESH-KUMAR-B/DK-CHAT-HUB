import { auth, db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const form = document.getElementById("settings-form");
const status = document.getElementById("save-status");
const controls = [...form.querySelectorAll("[data-key]")];
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "login.html"; return; }
  const settingsRef = ref(db, `users/${user.uid}/settings`);
  const snapshot = await get(settingsRef);
  const settings = snapshot.exists() ? snapshot.val() : {};
  controls.forEach(control => {
    if (control.type === "checkbox") control.checked = settings[control.dataset.key] !== false && (settings[control.dataset.key] === true || control.checked);
    else if (settings[control.dataset.key]) control.value = settings[control.dataset.key];
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const values = {};
    controls.forEach(control => { values[control.dataset.key] = control.type === "checkbox" ? control.checked : control.value; });
    status.textContent = "Saving...";
    try {
      await update(settingsRef, { ...values, updatedAt: Date.now() });
      status.textContent = "Saved";
      setTimeout(() => { status.textContent = ""; }, 1800);
    } catch (error) {
      status.textContent = `Unable to save: ${error.message}`;
    }
  });
});
