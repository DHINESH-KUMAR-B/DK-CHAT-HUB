import { auth, db } from "./firebase.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { notifyUser } from "./notifications.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[character]));

const openChat = friendUid => {
  localStorage.setItem("chatFriendUid", friendUid);
  window.location.href = `charts.html?friend=${encodeURIComponent(friendUid)}`;
};

window.openChat = openChat;

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const list = document.getElementById("friends-list");
  const searchInput = document.getElementById("friend-search-input");
  const usersRef = ref(db, "users");
  const chatsRef = ref(db, "chats");
  let users = {};
  let chats = {};
  let social = {};

  const activityTime = value => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.parse(value) || 0;
  };

  const latestActivity = uid => {
    let latest = activityTime(users[uid]?.lastSeen);
    Object.entries(chats).forEach(([chatId, chat]) => {
      if (!chatId.split("_").includes(uid)) return;
      Object.values(chat.messages || {}).forEach(message => {
        if (message.from === uid || message.to === uid) latest = Math.max(latest, activityTime(message.time));
      });
    });
    return latest;
  };

  const renderUsers = () => {
    const query = searchInput.value.trim().toLowerCase();
    const matchingUsers = Object.entries(users).filter(([, data]) => {
      const name = data.profile?.name || "Unknown";
      return name.toLowerCase().includes(query);
    }).sort(([firstUid], [secondUid]) => {
      const first = users[firstUid];
      const second = users[secondUid];
      return Number(Boolean(second.online)) - Number(Boolean(first.online)) ||
        latestActivity(secondUid) - latestActivity(firstUid);
    });

    if (!matchingUsers.length) {
      list.innerHTML = "<p style='color:#9bacbe;'>No users found</p>";
      return;
    }

    list.innerHTML = matchingUsers.map(([uid, data]) => {
      const profile = data.profile || {};
      const name = profile.name || "Unknown";
      const photo = profile.photo || "image/profile.png";
      const likes = social[uid]?.likes || {};
      const followers = social[uid]?.followers || {};
      const liked = Boolean(likes[user.uid]);
      const following = Boolean(social[uid]?.followers?.[user.uid]);
      return `
        <article class="friend-card ${uid === user.uid ? "self-card" : ""}" data-uid="${escapeHtml(uid)}">
          <span class="friend-avatar">
            <img src="${escapeHtml(photo)}" alt="${escapeHtml(name)}">
            <i class="profile-status-dot ${data.online ? "online" : "offline"}" title="${data.online ? "Online" : "Offline"}" aria-label="${data.online ? "Online" : "Offline"}"></i>
          </span>
          <div class="friend-info">
            <div class="friend-name">${escapeHtml(name)}</div>
            <div class="friend-status">${data.online ? "Online" : "Offline"} · ${Object.keys(followers).length} follower${Object.keys(followers).length === 1 ? "" : "s"}</div>
            <div class="friend-social-counts"><span><i class="bi bi-heart-fill"></i> ${Object.keys(likes).length}</span><span><i class="bi bi-person-check"></i> ${Object.keys(social[uid]?.following || {}).length} following</span></div>
          </div>
          ${uid !== user.uid ? `<div class="friend-actions">
            <button type="button" data-action="like" aria-label="${liked ? "Unlike" : "Like"} ${escapeHtml(name)}" class="${liked ? "active" : ""}"><i class="bi bi-heart${liked ? "-fill" : ""}"></i></button>
            <button type="button" data-action="follow" class="${following ? "active follow-active" : ""}"><i class="bi bi-person${following ? "-check-fill" : "-plus"}"></i><span>${following ? "Following" : "Follow"}</span></button>
            <button type="button" data-action="message" aria-label="Message ${escapeHtml(name)}"><i class="bi bi-chat-dots"></i></button>
          </div>` : '<span class="self-label">You</span>'}
        </article>`;
    }).join("");
  };

  searchInput.addEventListener("input", renderUsers);
  list.addEventListener("click", async event => {
    const action = event.target.closest("[data-action]");
    const card = event.target.closest(".friend-card");
    if (!card) return;
    const uid = card.dataset.uid;
    if (action) {
      const type = action.dataset.action;
      const path = `users/${uid}/social`;
      if (type === "message") return openChat(uid);
      if (type === "like") {
        const liked = Boolean(social[uid]?.likes?.[user.uid]);
        await update(ref(db, `${path}/likes`), { [user.uid]: liked ? null : true });
        if (!liked) await notifyUser(uid, { text: `${users[user.uid]?.profile?.name || "Someone"} liked your profile`, icon: "bi-heart-fill", type: "profile-like", fromUid: user.uid, url: "friends.html" });
      }
      if (type === "follow") {
        const following = Boolean(social[uid]?.followers?.[user.uid]);
        const updates = {};
        updates[`users/${uid}/social/followers/${user.uid}`] = following ? null : true;
        updates[`users/${user.uid}/social/following/${uid}`] = following ? null : true;
        await update(ref(db), updates);
        if (!following) await notifyUser(uid, { text: `${users[user.uid]?.profile?.name || "Someone"} started following you`, icon: "bi-person-plus-fill", type: "follow", fromUid: user.uid, url: "friends.html" });
      }
      return;
    }
    if (card && uid !== user.uid) openChat(uid);
  });

  onValue(usersRef, snapshot => {
    users = snapshot.exists() ? snapshot.val() : {};
    renderUsers();
  });
  onValue(chatsRef, snapshot => {
    chats = snapshot.exists() ? snapshot.val() : {};
    renderUsers();
  });
  onValue(ref(db, "users"), snapshot => {
    social = {};
    if (snapshot.exists()) Object.entries(snapshot.val()).forEach(([uid, data]) => { social[uid] = data.social || {}; });
    renderUsers();
  });
});
