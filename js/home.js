import { auth, db } from "./firebase.js";
import { ref, get, set, onValue, update } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

auth.onAuthStateChanged(user => {
  if (user) {
    const profileRef = ref(db, 'users/' + user.uid + '/profile');
    get(profileRef).then(snapshot => {
      if (snapshot.exists()) {
        const profile = snapshot.val();
        // Show existing profile
        document.getElementById("hellotext").innerText = `Hello, ${profile.name} 👋`;
        document.getElementById("profile-img").src = profile.photo || "image/profile.png";
        document.getElementById("menu-profile-img").src = profile.photo || "image/profile.png";
        document.getElementById("menu-profile-name").textContent = profile.name || "Your profile";
        document.getElementById("menu-profile-email").textContent = user.email || "";
        document.getElementById("menu-profile-bio").textContent = profile.bio || "Welcome to DK Chat Hub";
      } else {
        // First time login → show popup
        document.getElementById("profile-popup").style.display = "flex";
      }
    });

    const profileTrigger = document.getElementById("profile-trigger");
    const profileMenu = document.getElementById("profile-menu");
    const closeProfileMenu = () => {
      profileMenu.hidden = true;
      profileTrigger.setAttribute("aria-expanded", "false");
    };
    profileTrigger.addEventListener("click", event => {
      event.stopPropagation();
      profileMenu.hidden = !profileMenu.hidden;
      profileTrigger.setAttribute("aria-expanded", String(!profileMenu.hidden));
    });
    document.getElementById("profile-menu-close").addEventListener("click", closeProfileMenu);
    document.addEventListener("click", event => {
      if (!profileMenu.hidden && !profileMenu.contains(event.target) && event.target !== profileTrigger) {
        closeProfileMenu();
      }
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeProfileMenu();
    });

    const notificationPanel = document.getElementById("notification-panel");
    const notificationList = document.getElementById("notification-list");
    const bell = document.getElementById("bell");
    let notifications = {};

    const renderNotifications = () => {
      const entries = Object.entries(notifications).sort(([, first], [, second]) =>
        (Number(second.time) || 0) - (Number(first.time) || 0));
      const unread = entries.filter(([, notification]) => !notification.read).length;
      const badge = document.getElementById("bell-badge");
      badge.textContent = unread > 99 ? "99+" : unread ? unread : "";
      badge.style.display = unread ? "block" : "none";
      notificationList.innerHTML = entries.length
        ? entries.map(([id, notification]) => `
          <button class="notification-item ${notification.read ? "" : "unread"}" type="button" data-notification="${escapeHtml(id)}">
            <i class="bi ${escapeHtml(notification.icon || "bi-bell")}"></i>
            <span>${escapeHtml(notification.text || "New notification")}<small>${notification.time ? new Date(notification.time).toLocaleString() : ""}</small></span>
          </button>`).join("")
        : "<p class='notification-empty'>No notifications yet</p>";
    };

    bell.addEventListener("click", () => {
      window.location.href = "notifications.html";
    });

    notificationList.addEventListener("click", async event => {
      const item = event.target.closest("[data-notification]");
      if (!item) return;
      const id = item.dataset.notification;
      const notification = notifications[id];
      if (!notification) return;
      if (!notification.read) {
        await update(ref(db, `users/${user.uid}/notifications/${id}`), { read: true });
      }
      if (notification.url) window.location.href = notification.url;
    });

    document.getElementById("mark-notifications-read").addEventListener("click", async () => {
      const updates = {};
      Object.keys(notifications).forEach(id => {
        updates[`${id}/read`] = true;
      });
      if (Object.keys(updates).length) {
        await update(ref(db, `users/${user.uid}/notifications`), updates);
      }
    });

    const activityList = document.getElementById("recent-activity-list");
      const activitySearch = document.getElementById("activity-search");
      const activitySummary = document.getElementById("activity-summary");
      let activityFilter = "all";
      let profiles = {};
      let activitySources = { chats: {}, groups: {}, events: {}, notifications: {} };

      const relativeTime = time => {
        if (!time) return "Recently";
        const seconds = Math.max(0, Math.floor((Date.now() - Number(time)) / 1000));
        if (seconds < 60) return "Just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
        return new Date(time).toLocaleDateString();
      };
      const activityItems = () => {
        const items = [];
        Object.entries(activitySources.notifications || {}).forEach(([id, item]) => items.push({
          id: `notification-${id}`, type: "notifications", label: "Notification",
          text: item.text || "New notification", icon: item.icon || "bi-bell",
          time: Number(item.time) || 0, unread: !item.read, url: item.url || "notifications.html"
        }));
        Object.entries(activitySources.chats || {}).forEach(([chatId, chat]) => {
          const participants = chatId.split("_");
          const friendUid = participants.find(uid => uid !== user.uid);
          const friend = profiles[friendUid] || {};
          Object.entries(chat.messages || {}).forEach(([id, message]) => items.push({
            id: `chat-${chatId}-${id}`, type: "messages", label: "Private chat",
            text: `${friend.name || "Friend"}: ${message.text || "Sent an image"}`,
            icon: "bi-chat-dots", time: Number(message.time) || 0,
            url: `charts.html?friend=${encodeURIComponent(friendUid || "")}#message-${id}`
          }));
        });
        Object.entries(activitySources.groups || {}).forEach(([groupId, group]) => {
          Object.entries(group.messages || {}).forEach(([id, message]) => items.push({
            id: `group-${groupId}-${id}`, type: "groups", label: group.name || "Group",
            text: `${profiles[message.from]?.name || "Someone"} in ${group.name || "group"}: ${message.text || "Sent an image"}`,
            icon: "bi-people-fill", time: Number(message.time) || 0,
            url: `groupchat.html#group-${groupId}`
          }));
          Object.entries(group.history || {}).forEach(([id, entry]) => items.push({
            id: `history-${groupId}-${id}`, type: "groups", label: group.name || "Group",
            text: entry.text || "Group updated", icon: "bi-activity",
            time: Number(entry.time) || 0, url: `groupchat.html#group-${groupId}`
          }));
        });
        Object.entries(activitySources.events || {}).forEach(([id, event]) => {
          const eventTime = event.createdAt || event.updatedAt || 0;
          items.push({
            id: `event-${id}`, type: "events", label: "Event",
            text: `${event.createdByName || "Someone"} created ${event.title || "an event"}`,
            icon: "bi-calendar-event", time: Number(eventTime) || 0,
            url: `event.html#event-${id}`
          });
          Object.keys(event.likes || {}).forEach(uid => items.push({
            id: `event-like-${id}-${uid}`, type: "events", label: "Event like",
            text: `${profiles[uid]?.name || "Someone"} liked ${event.title || "an event"}`,
            icon: "bi-heart-fill", time: Number(event.updatedAt || eventTime) || 0,
            url: `event.html#event-${id}`
          }));
        });
        return items.sort((first, second) => second.time - first.time).slice(0, 80);
      };
      const safeActivityUrl = url => {
        const value = String(url || "");
        return /^(notifications|charts|groupchat|event)\.html(?:[?#]|$)/.test(value)
          ? value : "notifications.html";
      };
      const renderActivity = () => {
        const query = activitySearch.value.trim().toLowerCase();
        const items = activityItems().filter(item =>
          (activityFilter === "all" || item.type === activityFilter) &&
          (!query || `${item.text} ${item.label}`.toLowerCase().includes(query)));
        const total = activityItems().length;
        activitySummary.textContent = `${total} live activit${total === 1 ? "y" : "ies"} · updated in real time`;
        activityList.innerHTML = items.length ? items.slice(0, 12).map(item => `
          <a class="activity-card ${item.unread ? "unread" : ""}" href="${escapeHtml(safeActivityUrl(item.url))}">
            <span class="activity-icon"><i class="bi ${escapeHtml(item.icon)}"></i></span>
            <span class="activity-content">
              <span class="activity-text">${escapeHtml(item.text)}</span>
              <span class="activity-meta"><span class="activity-type">${escapeHtml(item.label)}</span><span>${escapeHtml(relativeTime(item.time))}</span></span>
            </span>
            <i class="bi bi-chevron-right"></i>
          </a>`).join("") : "<p class='activity-empty'>No activity matches your search.</p>";
      };
      onValue(ref(db, "users"), snapshot => {
        profiles = {};
        if (snapshot.exists()) Object.entries(snapshot.val()).forEach(([uid, data]) => { profiles[uid] = data.profile || {}; });
        renderActivity();
      });
      ["chats", "groups", "events"].forEach(source => onValue(ref(db, source), snapshot => {
        activitySources[source] = snapshot.exists() ? snapshot.val() : {};
        renderActivity();
      }));
      activitySearch.addEventListener("input", renderActivity);
      document.querySelectorAll("[data-activity-filter]").forEach(button => button.addEventListener("click", () => {
        activityFilter = button.dataset.activityFilter;
        document.querySelectorAll("[data-activity-filter]").forEach(item =>
          item.classList.toggle("active", item === button));
        renderActivity();
      }));
    onValue(ref(db, `users/${user.uid}/notifications`), snapshot => {
      notifications = snapshot.exists() ? snapshot.val() : {};
      activitySources.notifications = notifications;
      renderNotifications();
      renderActivity();
    });

    // Handle popup save
    document.getElementById("popup-save").addEventListener("click", () => {
      const name = document.getElementById("popup-name").value || "Guest";
      const fileInput = document.getElementById("popup-file");
      const file = fileInput.files[0];

      if (file) {
        const reader = new FileReader();
        reader.onloadend = function() {
          const base64String = reader.result;
          // Save to Firebase
          set(ref(db, 'users/' + user.uid + '/profile'), {
            name: name,
            photo: base64String
          }).then(() => {
            // Update UI
            document.getElementById("hellotext").innerText = `Hello, ${name} 👋`;
            document.getElementById("profile-img").src = base64String;
            document.getElementById("profile-popup").style.display = "none";
          });
        };
        reader.readAsDataURL(file);
      } else {
        // Save only name if no photo
        set(ref(db, 'users/' + user.uid + '/profile'), {
          name: name,
          photo: ""
        }).then(() => {
          document.getElementById("hellotext").innerText = `Hello, ${name} 👋`;
          document.getElementById("profile-img").src = "image/profile.png";
          document.getElementById("profile-popup").style.display = "none";
        });
      }
    });
  } else {
    window.location.href = "login.html";
  }
});
// Example: check notifications from Firebase

auth.onAuthStateChanged(user => {
  if (user) {
    const notifRef = ref(db, 'users/' + user.uid + '/notifications');
    get(notifRef).then(snapshot => {
      if (snapshot.exists()) {
        const notifications = snapshot.val();
        const hasUnread = Object.values(notifications).some(n => !n.read);
        document.getElementById("bell-badge").style.display = hasUnread ? "block" : "none";
      }
    });
  }
});
