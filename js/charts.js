import { auth, db } from "./firebase.js";
import { ref, onValue, push, set, update, remove } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { showLikeEffect } from "./like-effect.js";
import { notifyUser } from "./notifications.js";

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

const readImageAsDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("Unable to read the image."));
  reader.readAsDataURL(file);
});

const searchBar = document.getElementById("search-bar");
const searchInput = document.getElementById("message-search");
document.getElementById("search-btn").addEventListener("click", () => {
  searchBar.hidden = !searchBar.hidden;
  if (!searchBar.hidden) searchInput.focus();
});

auth.onAuthStateChanged(user => {
  if (user) {
    const friendFromUrl = new URLSearchParams(window.location.search).get("friend");
    const friendUid = friendFromUrl || localStorage.getItem("chatFriendUid");
    if (!friendUid) return;
    localStorage.setItem("chatFriendUid", friendUid);

    const chatId = [user.uid, friendUid].sort().join("_");
    const chatRef = ref(db, 'chats/' + chatId + '/messages');
    const typingRef = ref(db, 'chats/' + chatId + '/typing');
    const friendRef = ref(db, 'users/' + friendUid);

    // Friend profile + last seen
    onValue(friendRef, snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        document.getElementById("friend-name").textContent = data.profile?.name || "Friend";
        document.getElementById("friend-photo").src = data.profile?.photo || "image/profile.png";

        if (data.online) {
          document.getElementById("friend-status").textContent = "Online";
        } else if (data.lastSeen) {
          const lastSeenDate = new Date(data.lastSeen);
          document.getElementById("friend-status").textContent =
            "Last seen: " + lastSeenDate.toLocaleString();
        } else {
          document.getElementById("friend-status").textContent = "Offline";
        }
      }
    });

    // Typing indicator in header
    onValue(typingRef, snapshot => {
      if (snapshot.exists()) {
        const typing = snapshot.val();
        if (typing[friendUid]) {
          document.getElementById("friend-status").textContent = "Typing...";
        }
      }
    });

    const chatBox = document.getElementById("chat-box");
    const input = document.getElementById("chat-input");
    const imageInput = document.getElementById("image-input");
    const emojiPicker = document.getElementById("emoji-picker");
    let messages = {};
    let profiles = {};
    let replyTo = null;

    const renderMessages = () => {
      const query = searchInput.value.trim().toLowerCase();
      chatBox.innerHTML = "";
      Object.entries(messages)
        .filter(([, msg]) => !query || (msg.text || "").toLowerCase().includes(query))
        .forEach(([id, msg]) => {
          const isMe = msg.from === user.uid;
          const likes = Object.keys(msg.likes || {});
          const likeAvatars = likes.map(uid => profiles[uid]).filter(Boolean).map(profile =>
            `<img class="like-avatar" src="${escapeHtml(profile.photo || "image/profile.png")}" alt="${escapeHtml(profile.name || "User")}">`
          ).join("");
          const reply = msg.replyText ? `<div class="reply-preview">${escapeHtml(msg.replyText)}</div>` : "";
          const content = msg.image
            ? `<img class="message-image" src="${msg.image}" alt="Sent image">${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ""}`
            : escapeHtml(msg.text || "");
          const status = isMe && msg.readBy && msg.readBy[friendUid] ? " · Read" : "";
          chatBox.innerHTML += `
            <div class="message ${isMe ? "me" : "friend"}" data-id="${id}">
              ${reply}${content}
              ${likes.length ? `<div class="message-likes"><span>♥ ${likes.length}</span>${likeAvatars}</div>` : ""}
              <div class="message-actions">
                <button type="button" data-action="reply">↩</button>
                <button type="button" data-action="react">♥</button>
                ${isMe ? `<button type="button" data-action="edit">Edit</button><button type="button" data-action="delete">Delete</button>` : ""}
              </div>
              <div class="timestamp">${new Date(msg.time).toLocaleTimeString()}${status}</div>
            </div>`;
        });
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    // Listen for messages
    onValue(chatRef, snapshot => {
      messages = snapshot.exists() ? snapshot.val() : {};
      const unreadUpdates = {};
      Object.entries(messages).forEach(([id, msg]) => {
        if (msg.from === friendUid && (!msg.readBy || !msg.readBy[user.uid])) {
          unreadUpdates[`${id}/readBy/${user.uid}`] = true;
        }
      });
      if (Object.keys(unreadUpdates).length) update(chatRef, unreadUpdates);
      renderMessages();
    });
    onValue(ref(db, "users"), snapshot => {
      profiles = {};
      if (snapshot.exists()) {
        Object.entries(snapshot.val()).forEach(([uid, data]) => {
          profiles[uid] = data.profile || {};
        });
      }
      renderMessages();
    });

    // Send message
    document.getElementById("send-btn").addEventListener("click", async () => {
      const text = input.value.trim();
      const image = imageInput.files[0];
      if (text || image) {
        const message = {
          from: user.uid,
          text: text,
          time: Date.now()
        };
        if (image) message.image = await readImageAsDataUrl(image);
        if (replyTo) message.replyText = replyTo.text || "Image";
        const messageRef = await push(chatRef, message);
        await notifyUser(friendUid, {
          text: `${profiles[user.uid]?.name || "Someone"} sent you a message`,
          icon: "bi-chat-dots",
          type: "message",
          fromUid: user.uid,
          url: `charts.html?friend=${encodeURIComponent(user.uid)}#message-${messageRef.key}`
        });
        input.value = "";
        imageInput.value = "";
        replyTo = null;
        input.placeholder = "Type a message...";
        set(ref(db, 'chats/' + chatId + '/typing/' + user.uid), false);
      }
    });

    // Typing detection
    input.addEventListener("input", () => {
      set(ref(db, 'chats/' + chatId + '/typing/' + user.uid), input.value.length > 0);
    });
    input.addEventListener("blur", () => {
      set(ref(db, 'chats/' + chatId + '/typing/' + user.uid), false);
    });

    searchInput.addEventListener("input", renderMessages);
    document.getElementById("back-btn").addEventListener("click", () => window.history.back());
    document.getElementById("emoji-btn").addEventListener("click", () => {
      emojiPicker.hidden = !emojiPicker.hidden;
    });
    emojiPicker.addEventListener("click", event => {
      if (event.target.tagName !== "BUTTON") return;
      input.value += event.target.textContent;
      input.focus();
      emojiPicker.hidden = true;
    });
    chatBox.addEventListener("click", async event => {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      const messageElement = button.closest(".message");
      const id = messageElement.dataset.id;
      const msg = messages[id];
      const action = button.dataset.action;
      if (action === "reply") {
        replyTo = msg;
        input.placeholder = `Replying to ${msg.text || "image"}...`;
        input.focus();
      } else if (action === "react") {
        const isLiked = Boolean(msg.likes && msg.likes[user.uid]);
        await update(ref(db, `chats/${chatId}/messages/${id}/likes`), {
          [user.uid]: isLiked ? null : true
        });
        if (!isLiked && msg.from !== user.uid) {
          await notifyUser(msg.from, {
            text: `${profiles[user.uid]?.name || "Someone"} liked your message`,
            icon: "bi-heart-fill",
            type: "like",
            fromUid: user.uid,
            url: `charts.html?friend=${encodeURIComponent(user.uid)}#message-${id}`
          });
        }
        if (!isLiked) showLikeEffect();
      } else if (action === "edit" && msg.from === user.uid && msg.text) {
        const edited = prompt("Edit message", msg.text);
        if (edited !== null && edited.trim()) {
          await update(ref(db, `chats/${chatId}/messages/${id}`), { text: edited.trim(), edited: true });
        }
      } else if (action === "delete" && msg.from === user.uid && confirm("Delete this message?")) {
        await remove(ref(db, `chats/${chatId}/messages/${id}`));
      }
    });
  } else {
    window.location.href = "login.html";
  }
});
