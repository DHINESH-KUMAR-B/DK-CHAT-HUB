import { auth, db } from "./firebase.js";
import { onValue, ref, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const list = document.getElementById("chat-list");
const search = document.getElementById("chat-search");
let filter = "all";
let currentUser;
let profiles = {};
let chats = {};
let groups = {};
let preferences = {};

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));
const latestMessage = messages => Object.entries(messages || {})
  .sort(([, first], [, second]) => (Number(second.time) || 0) - (Number(first.time) || 0))[0];
const relativeTime = time => {
  if (!time) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - Number(time)) / 1000));
  if (seconds < 60) return "now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(time).toLocaleDateString();
};

const buildItems = () => {
  const items = [];
  Object.entries(chats).forEach(([chatId, chat]) => {
    const friendUid = chatId.split("_").find(uid => uid !== currentUser.uid);
    if (!friendUid) return;
    const [messageId, message] = latestMessage(chat.messages);
    if (!message) return;
    const unread = Object.entries(chat.messages || {}).filter(([, item]) =>
      item.from === friendUid && (!item.readBy || !item.readBy[currentUser.uid])).length;
    const profile = profiles[friendUid] || {};
    items.push({
      id: chatId, kind: "private", name: profile.name || "Friend", photo: profile.photo || "image/profile.png",
      preview: message.text || "Sent an image", time: Number(message.time) || 0, unread,
      online: Boolean(profiles[friendUid]?.online), pinned: Boolean(preferences[chatId]?.pinned),
      url: `charts.html?friend=${encodeURIComponent(friendUid)}#message-${messageId}`
    });
  });
  Object.entries(groups).forEach(([groupId, group]) => {
    if (!group.members?.[currentUser.uid]) return;
    const [messageId, message] = latestMessage(group.messages);
    const historyEntry = latestMessage(group.history);
    const history = historyEntry?.[1];
    const latest = message && (!history || message.time >= history.time) ? message : history;
    const time = Number(latest?.time || group.createdAt) || 0;
    if (!time) return;
    const unread = Object.values(group.messages || {}).filter(item =>
      item.from !== currentUser.uid && (!item.readBy || !item.readBy[currentUser.uid])).length;
    items.push({
      id: groupId, kind: "groups", name: group.name || "Group", photo: group.photo || "image/group.png",
      preview: latest?.text || "Group activity", time, unread,
      pinned: Boolean(preferences[`group-${groupId}`]?.pinned),
      url: `groupchat.html#group-${groupId}`
    });
  });
  return items.sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.time - a.time);
};

const render = () => {
  const query = search.value.trim().toLowerCase();
  const all = buildItems();
  const items = all.filter(item =>
    (filter === "all" || (filter === "unread" && item.unread) ||
      (filter === "groups" && item.kind === "groups") ||
      (filter === "pinned" && item.pinned)) &&
    (!query || `${item.name} ${item.preview}`.toLowerCase().includes(query)));
  const unread = all.reduce((total, item) => total + item.unread, 0);
  document.getElementById("chat-summary").textContent =
    `${all.length} conversation${all.length === 1 ? "" : "s"} · ${unread} unread`;
  list.innerHTML = items.length ? items.map(item => `
    <article class="chat-row ${item.unread ? "unread" : ""}">
      <a class="chat-open" href="${escapeHtml(item.url)}">
        <span class="chat-avatar"><img src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.name)}">${item.online ? '<i class="online-dot"></i>' : ""}</span>
        <span class="chat-details"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.preview)}</span>
          <small>${item.kind === "groups" ? "Group" : "Private chat"} · ${escapeHtml(relativeTime(item.time))}</small></span>
        <span class="chat-side">${item.pinned ? '<i class="bi bi-pin-fill pinned"></i>' : ""}${item.unread ? `<b>${item.unread > 99 ? "99+" : item.unread}</b>` : ""}</span>
      </a>
      <button class="chat-menu" type="button" data-chat="${escapeHtml(item.id)}" data-kind="${item.kind}" aria-label="Chat options"><i class="bi bi-three-dots-vertical"></i></button>
    </article>`).join("") : "<p class='chat-empty'>No conversations match your search.</p>";
};

auth.onAuthStateChanged(user => {
  if (!user) { window.location.href = "login.html"; return; }
  currentUser = user;
  onValue(ref(db, "users"), snapshot => {
    profiles = {};
    if (snapshot.exists()) Object.entries(snapshot.val()).forEach(([uid, data]) => { profiles[uid] = { ...(data.profile || {}), online: data.online }; });
    render();
  });
  onValue(ref(db, "chats"), snapshot => { chats = snapshot.exists() ? snapshot.val() : {}; render(); });
  onValue(ref(db, "groups"), snapshot => { groups = snapshot.exists() ? snapshot.val() : {}; render(); });
  onValue(ref(db, `users/${user.uid}/chatPreferences`), snapshot => { preferences = snapshot.exists() ? snapshot.val() : {}; render(); });
  search.addEventListener("input", render);
  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
    render();
  }));
  list.addEventListener("click", async event => {
    const button = event.target.closest("[data-chat]");
    if (!button) return;
    event.preventDefault();
    const key = button.dataset.kind === "groups" ? `group-${button.dataset.chat}` : button.dataset.chat;
    const pinned = Boolean(preferences[key]?.pinned);
    await update(ref(db, `users/${user.uid}/chatPreferences/${key}`), { pinned: !pinned });
  });
});
