import { auth, db } from "./firebase.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const fallbackPhoto = "image/profile.png";
const fallbackCover = "image/homepagec.png";
const form = document.getElementById("profile-form");
const errorBox = document.getElementById("profile-error");
const status = document.getElementById("save-status");
const readImage = file => new Promise((resolve, reject) => {
  if (!file) return resolve("");
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("Unable to read that image."));
  reader.readAsDataURL(file);
});
const setPreview = (input, target) => {
  input.addEventListener("change", async () => {
    if (input.files[0]) target.src = await readImage(input.files[0]);
  });
};
const setValue = (id, value) => { document.getElementById(id).value = value || ""; };

auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = "login.html"; return; }
  const profileRef = ref(db, `users/${user.uid}/profile`);
  try {
    const snapshot = await get(profileRef);
    const profile = snapshot.exists() ? snapshot.val() : {};
    document.getElementById("profile-preview").src = profile.photo || fallbackPhoto;
    document.getElementById("cover-preview").src = profile.cover || fallbackCover;
    document.getElementById("profile-display-name").textContent = profile.name || "Your profile";
    document.getElementById("profile-email").textContent = user.email || "";
    setValue("profile-name", profile.name);
    setValue("profile-bio", profile.bio);
    setValue("profile-location", profile.location);
    setValue("profile-birthday", profile.birthday);
    setValue("profile-website", profile.website);
    document.getElementById("show-online").checked = profile.showOnline !== false;
    document.getElementById("show-birthday").checked = profile.showBirthday === true;
    document.getElementById("allow-requests").checked = profile.allowRequests !== false;
    document.getElementById("bio-count").textContent = `${(profile.bio || "").length}/160`;
  } catch (loadError) {
    errorBox.textContent = `Unable to load your profile: ${loadError.message}`;
  }

  const profileImage = document.getElementById("profile-preview");
  const coverImage = document.getElementById("cover-preview");
  setPreview(document.getElementById("profile-file"), profileImage);
  setPreview(document.getElementById("cover-file"), coverImage);
  document.getElementById("profile-name").addEventListener("input", event => {
    document.getElementById("profile-display-name").textContent = event.target.value.trim() || "Your profile";
  });
  document.getElementById("profile-bio").addEventListener("input", event => {
    document.getElementById("bio-count").textContent = `${event.target.value.length}/160`;
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const name = document.getElementById("profile-name").value.trim();
    if (name.length < 2) {
      errorBox.textContent = "Please enter a name with at least 2 characters.";
      return;
    }
    const website = document.getElementById("profile-website").value.trim();
    if (website && !/^https?:\/\//i.test(website)) {
      errorBox.textContent = "Website must start with http:// or https://.";
      return;
    }
    const saveButton = document.getElementById("profile-save");
    saveButton.disabled = true;
    errorBox.textContent = "";
    status.textContent = "Saving...";
    try {
      const photo = await readImage(document.getElementById("profile-file").files[0]) || profileImage.src;
      const cover = await readImage(document.getElementById("cover-file").files[0]) || coverImage.src;
      await update(profileRef, {
        name,
        photo,
        cover,
        bio: document.getElementById("profile-bio").value.trim(),
        location: document.getElementById("profile-location").value.trim(),
        birthday: document.getElementById("profile-birthday").value,
        website,
        showOnline: document.getElementById("show-online").checked,
        showBirthday: document.getElementById("show-birthday").checked,
        allowRequests: document.getElementById("allow-requests").checked,
        updatedAt: Date.now()
      });
      await update(ref(db, `users/${user.uid}`), {
        online: document.getElementById("show-online").checked
      });
      status.textContent = "Saved";
      setTimeout(() => { window.location.href = "home.html"; }, 500);
    } catch (saveError) {
      status.textContent = "";
      errorBox.textContent = `Unable to save profile: ${saveError.message}`;
      saveButton.disabled = false;
    }
  });
});
