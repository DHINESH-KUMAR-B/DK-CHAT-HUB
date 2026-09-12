import { auth, db } from "./firebase.js";
import { ref, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
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

auth.onAuthStateChanged(user => {
  if (user) {
    const groupId = localStorage.getItem("chatGroupId");
    if (!groupId) return;

    const groupRef = ref(db, 'groups/' + groupId);
    const messagesRef = ref(db, 'groups/' + groupId + '/messages');
    const usersRef = ref(db, 'users');
    const input = document.getElementById("chat-input");
    const imageInput = document.getElementById("image-input");
    const emojiPicker = document.getElementById("emoji-picker");
    let messages = {};
    let profiles = {};
    let group = {};
    let history = {};
    const historySearch = document.getElementById("history-search");
    const historyDate = document.getElementById("history-date");

    const renderMessages = () => {
      const chatBox = document.getElementById("chat-box");
      chatBox.innerHTML = "";
      Object.entries(messages).forEach(([id, msg]) => {
        if (historySearch.value && !(msg.text || "").toLowerCase().includes(historySearch.value.toLowerCase())) return;
        if (historyDate.value && new Date(msg.time).toISOString().slice(0, 10) !== historyDate.value) return;
        const isMe = msg.from === user.uid;
        const likes = Object.keys(msg.likes || {});
        const likeAvatars = likes.map(uid => profiles[uid]).filter(Boolean).map(profile =>
          `<img class="like-avatar" src="${escapeHtml(profile.photo || "image/profile.png")}" alt="${escapeHtml(profile.name || "User")}">`
        ).join("");
        chatBox.innerHTML += `
          <div class="message ${isMe ? "me" : "friend"}" data-id="${id}">
            ${msg.image ? `<img class="message-image" src="${escapeHtml(msg.image)}" alt="Sent image">` : ""}
            ${escapeHtml(msg.text || "")}
            ${likes.length ? `<div class="message-likes"><span>♥ ${likes.length}</span>${likeAvatars}</div>` : ""}
            <div class="message-actions"><button type="button" data-action="like">♥</button></div>
            <div class="timestamp">${new Date(msg.time).toLocaleTimeString()}</div>
          </div>`;
      });
      chatBox.scrollTop = chatBox.scrollHeight;
    };

    // Load group info
    onValue(groupRef, snapshot => {
      if (snapshot.exists()) {
        group = snapshot.val();
        history = group.history || {};
        document.getElementById("group-name").textContent = group.name;
        document.getElementById("group-photo").src = group.photo || "image/dp for groups.webp";
        document.getElementById("group-rename-input").value = group.name || "";

        // Show members by name
        const members = Object.keys(group.members || {});
        let names = [];
        members.forEach(uid => {
          const userRef = ref(db, 'users/' + uid + '/profile');
          onValue(userRef, snap => {
            if (snap.exists()) {
              names.push(snap.val().name);
              document.getElementById("group-status").textContent = "💙💙Members💙💙: " + names.join(", ");
            }
          });
        });
      }
    });

    // Load messages
    onValue(messagesRef, snapshot => {
      messages = snapshot.exists() ? snapshot.val() : {};
      renderMessages();
    });
    onValue(usersRef, snapshot => {
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
        await push(messagesRef, message);
        await Promise.all(Object.keys(group.members || {}).filter(uid => uid !== user.uid).map(uid =>
          notifyUser(uid, {
            text: `${profiles[user.uid]?.name || "Someone"} sent a message in ${group.name || "your group"}`,
            icon: "bi-people-fill",
            type: "group-message",
            fromUid: user.uid,
            url: `groupchat.html#group-${groupId}`
          })
        ));
        input.value = "";
        imageInput.value = "";
      }
    });

    document.getElementById("emoji-btn").addEventListener("click", () => {
      emojiPicker.hidden = !emojiPicker.hidden;
    });
    emojiPicker.addEventListener("click", event => {
      if (event.target.tagName !== "BUTTON") return;
      input.value += event.target.textContent;
      input.focus();
      emojiPicker.hidden = true;
    });
    document.getElementById("chat-box").addEventListener("click", async event => {
      const button = event.target.closest("[data-action='like']");
      if (!button) return;
      const id = button.closest(".message").dataset.id;
      const msg = messages[id] || {};
      const isLiked = Boolean(msg.likes && msg.likes[user.uid]);
      await update(ref(db, `groups/${groupId}/messages/${id}/likes`), {
        [user.uid]: isLiked ? null : true
      });
      if (!isLiked && msg.from !== user.uid) {
        await notifyUser(msg.from, {
          text: `${profiles[user.uid]?.name || "Someone"} liked your group message`,
          icon: "bi-heart-fill",
          type: "like",
          fromUid: user.uid,
          url: `groupchat.html#group-${groupId}`
        });
      }
      if (!isLiked) showLikeEffect();
    });
    historySearch.addEventListener("input", renderMessages);
    historyDate.addEventListener("change", renderMessages);
    document.getElementById("activity-btn").addEventListener("click", () => {
      const entries = Object.values(history).sort((a, b) => (b.time || 0) - (a.time || 0));
      document.getElementById("activity-list").innerHTML = entries.length
        ? entries.map(item => `<p>${escapeHtml(item.text || item.type || "Group activity")}<small>${new Date(item.time).toLocaleString()}</small></p>`).join("")
        : "<p>No activity yet.</p>";
      document.getElementById("activity-popup").hidden = false;
    });
    document.getElementById("close-activity").addEventListener("click", () => {
      document.getElementById("activity-popup").hidden = true;
    });

    // Settings button (admins only)
    document.getElementById("settings-btn").addEventListener("click", () => {
      onValue(groupRef, snapshot => {
        if (snapshot.exists()) {
          const group = snapshot.val();
          if (group.admins && group.admins[user.uid]) {
            document.getElementById("group-settings-popup").style.display = "flex";

            // Load all users with checkboxes
            onValue(usersRef, snap => {
              const settingsList = document.getElementById("settings-members-list");
              settingsList.innerHTML = "";
              if (snap.exists()) {
                const users = snap.val();
                Object.keys(users).forEach(uid => {
                  const profile = users[uid].profile || {};
                  const name = profile.name || "Unknown";
                  const photo = profile.photo || "image/profile.png";
                  const checked = group.members && group.members[uid] ? "checked" : "";

                  settingsList.innerHTML += `
                    <div class="member-option">
                      <input type="checkbox" id="member-${uid}" value="${uid}" ${checked}>
                      <img src="${photo}" alt="${name}">
                      <label for="member-${uid}">${name}</label>
                    </div>`;
                });
              }
            });
          } else {
            alert("Only admins can manage members.");
          }
        }
      });
    });

    // Close popup
    document.getElementById("close-settings").addEventListener("click", () => {
      document.getElementById("group-settings-popup").style.display = "none";
    });

    // Save changes
    document.getElementById("save-members").addEventListener("click", () => {
      const selected = {};
      document.querySelectorAll("#settings-members-list input:checked").forEach(cb => {
        selected[cb.value] = true;
      });

      document.getElementById("save-group-details").addEventListener("click", async () => {
        const snapshot = await new Promise(resolve => onValue(groupRef, resolve, { onlyOnce: true }));
        const group = snapshot.val();
        if (!group?.admins?.[user.uid]) return;
        const changes = { name: document.getElementById("group-rename-input").value.trim() };
        const photo = document.getElementById("group-photo-manage").files[0];
        if (!changes.name) return alert("Enter a group name.");
        if (photo) changes.photo = await readImageAsDataUrl(photo);
        await update(groupRef, changes);
        await push(ref(db, `groups/${groupId}/history`), {
          type: "updated",
          text: `${user.uid} updated group details`,
          by: user.uid,
          time: Date.now()
        });
        await Promise.all(Object.keys(group.members || {}).filter(uid => uid !== user.uid).map(uid =>
          notifyUser(uid, {
            text: `${profiles[user.uid]?.name || "An admin"} updated ${group.name || "your group"}`,
            icon: "bi-pencil-square",
            type: "group-updated",
            fromUid: user.uid,
            url: `groupchat.html#group-${groupId}`
          })
        ));
        alert("Group details updated.");
      });

      document.getElementById("leave-group").addEventListener("click", async () => {
        if (!confirm("Leave this group?")) return;
        const snapshot = await new Promise(resolve => onValue(groupRef, resolve, { onlyOnce: true }));
        const group = snapshot.val() || {};
        const members = { ...(group.members || {}) };
        delete members[user.uid];
        await update(groupRef, { members });
        await push(ref(db, `groups/${groupId}/history`), {
          type: "left",
          text: `${user.uid} left the group`,
          by: user.uid,
          time: Date.now()
        });
        await Promise.all(Object.keys(group.admins || {}).filter(uid => uid !== user.uid).map(uid =>
          notifyUser(uid, {
            text: `${profiles[user.uid]?.name || "A member"} left ${group.name || "your group"}`,
            icon: "bi-person-dash-fill",
            type: "group-members",
            fromUid: user.uid,
            url: `groupchat.html#group-${groupId}`
          })
        ));
        localStorage.removeItem("chatGroupId");
        window.location.href = "group.html";
      });

      update(groupRef, { members: selected }).then(async () => {
        const previousMembers = Object.keys(group.members || {});
        const addedMembers = Object.keys(selected).filter(uid => !previousMembers.includes(uid));
        await Promise.all(addedMembers.filter(uid => uid !== user.uid).map(uid =>
          notifyUser(uid, {
            text: `You were added to ${group.name || "a group"}`,
            icon: "bi-person-plus-fill",
            type: "group-members",
            fromUid: user.uid,
            url: `groupchat.html#group-${groupId}`
          })
        ));
        push(ref(db, `groups/${groupId}/history`), {
          type: "members-updated",
          text: `${user.uid} updated group members`,
          by: user.uid,
          time: Date.now()
        });
        alert("Members updated!");
        document.getElementById("group-settings-popup").style.display = "none";
      });
    });

  } else {
    window.location.href = "login.html";
  }
});
