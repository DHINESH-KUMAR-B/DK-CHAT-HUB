import { auth, db } from "./firebase.js";
import { onValue, ref, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const list = document.getElementById("notifications-list");
let notifications = {};
let filter = "all";
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "login.html"; return; }
  const render = () => {
    const entries = Object.entries(notifications)
      .filter(([, item]) => filter === "all" || !item.read)
      .sort(([, first], [, second]) => (Number(second.time) || 0) - (Number(first.time) || 0));
    const unread = Object.values(notifications).filter(item => !item.read).length;
    document.getElementById("notification-count").textContent = unread ? `(${unread} unread)` : "";
    list.innerHTML = entries.length ? entries.map(([id, item]) => `
      <button class="notification-card ${item.read ? "" : "unread"}" type="button" data-id="${escapeHtml(id)}">
        <i class="bi ${escapeHtml(item.icon || "bi-bell")}"></i>
        <span>${escapeHtml(item.text || "New notification")}
          <small>${item.time ? new Date(item.time).toLocaleString() : ""}</small>
        </span>
        ${item.read ? "" : '<i class="bi bi-dot"></i>'}
      </button>`).join("") : "<p class='notification-empty'>No notifications here yet.</p>";
  };
  onValue(ref(db, `users/${user.uid}/notifications`), snapshot => {
    notifications = snapshot.exists() ? snapshot.val() : {};
    render();
  });
  list.addEventListener("click", async event => {
    const item = event.target.closest("[data-id]");
    if (!item) return;
    const id = item.dataset.id;
    const notification = notifications[id];
    if (!notification) return;
    if (!notification.read) await update(ref(db, `users/${user.uid}/notifications/${id}`), { read: true });
    if (notification.url) window.location.href = notification.url;
  });
  document.getElementById("mark-all").addEventListener("click", async () => {
    const updates = {};
    Object.keys(notifications).forEach(id => { updates[`${id}/read`] = true; });
    if (Object.keys(updates).length) await update(ref(db, `users/${user.uid}/notifications`), updates);
  });
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
    render();
  }));
});
