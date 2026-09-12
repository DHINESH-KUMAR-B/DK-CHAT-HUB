import { auth, db } from "./firebase.js";
import { ref, onValue, push, remove } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { notifyUsers } from "./notifications.js";

const popup = document.getElementById("group-popup");
const addBtn = document.getElementById("add-group-btn");
const saveBtn = document.getElementById("save-group");
const closeBtn = document.getElementById("close-popup");
const list = document.getElementById("groups-list");
const membersList = document.getElementById("members-list");
const photoInput = document.getElementById("group-photo-input");
const photoPreview = document.getElementById("group-photo-preview");
const searchInput = document.getElementById("group-search-input");
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

const readImageAsDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error("Unable to read the selected group photo."));
  reader.readAsDataURL(file);
});

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const groupsRef = ref(db, "groups");
  const usersRef = ref(db, "users");
  let groups = {};
  let profiles = {};
  const recentIds = JSON.parse(localStorage.getItem("recentGroupIds") || "[]");
  const latestGroupActivity = group => {
    const messageTimes = Object.values(group.messages || {}).map(message => Number(message.time) || 0);
    const historyTimes = Object.values(group.history || {}).map(activity => Number(activity.time) || 0);
    return Math.max(Number(group.createdAt) || 0, ...messageTimes, ...historyTimes);
  };
  const renderGroups = () => {
    const query = searchInput.value.trim().toLowerCase();
    const matching = Object.entries(groups)
      .filter(([, group]) => String(group.name || "").toLowerCase().includes(query))
      .sort(([, first], [, second]) => latestGroupActivity(second) - latestGroupActivity(first));
    if (!matching.length) {
      list.innerHTML = "<p style='color:#9bacbe;'>No groups found</p>";
      return;
    }
    list.innerHTML = matching.map(([id, group]) => {
      const members = Object.keys(group.members || {});
      const creator = profiles[group.createdByUid] || {};
      return `<article class="group-card">
        <button class="group-open" type="button" data-group="${id}">
          <img src="${escapeHtml(group.photo || "image/group.png")}" alt="${escapeHtml(group.name || "Group")}">
          <div class="group-info"><div class="group-name">${escapeHtml(group.name || "Group")}</div>
          <small>${members.length} member${members.length === 1 ? "" : "s"} · ${escapeHtml(creator.name || group.createdByName || "Group creator")}</small></div>
        </button>
        <div class="group-actions">
          <button type="button" data-action="share" data-group="${id}" aria-label="Share group"><i class="bi bi-share"></i></button>
          ${group.createdByUid === user.uid ? `<button type="button" data-action="delete" data-group="${id}" aria-label="Delete group"><i class="bi bi-trash"></i></button>` : ""}
        </div>
      </article>`;
    }).join("");
    const recent = recentIds.map(id => [id, groups[id]]).filter(([, group]) => group);
    document.getElementById("recent-groups").innerHTML = recent.length
      ? `<h3>Recently opened</h3>${recent.map(([id, group]) => `<button type="button" data-recent="${id}">${escapeHtml(group.name)}</button>`).join("")}`
      : "";
  };

  // 🔹 Show groups in real-time
  onValue(groupsRef, snapshot => { groups = snapshot.exists() ? snapshot.val() : {}; renderGroups(); });
  onValue(usersRef, snapshot => {
    profiles = {};
    if (snapshot.exists()) Object.entries(snapshot.val()).forEach(([uid, data]) => { profiles[uid] = data.profile || {}; });
    renderGroups();
  });
  searchInput.addEventListener("input", renderGroups);
  list.addEventListener("click", async event => {
    const target = event.target.closest("[data-action], .group-open");
    if (!target) return;
    const id = target.dataset.group;
    if (target.dataset.action === "delete") {
      if (groups[id].createdByUid !== user.uid || !confirm("Delete this group and its messages?")) return;
      await remove(ref(db, `groups/${id}`));
    } else if (target.dataset.action === "share") {
      const text = `${groups[id].name}\n${window.location.href}#group-${id}`;
      if (navigator.share) await navigator.share({ title: groups[id].name, text });
      else { await navigator.clipboard.writeText(text); alert("Group link copied."); }
    } else openGroup(id);
  });
  document.getElementById("recent-groups").addEventListener("click", event => {
    if (event.target.dataset.recent) openGroup(event.target.dataset.recent);
  });

  // 🔹 Open popup
  addBtn.addEventListener("click", () => {
    popup.style.display = "flex";
    // Load all users
    onValue(usersRef, snapshot => {
      membersList.innerHTML = "";
      if (snapshot.exists()) {
        const users = snapshot.val();
        Object.keys(users).forEach(uid => {
          const profile = users[uid].profile || {};
          const name = profile.name || "Unknown";
          const photo = profile.photo || "image/profile.png";
          membersList.innerHTML += `
            <div class="member-option">
              <input type="checkbox" id="member-${uid}" value="${uid}">
              <img src="${photo}" alt="${name}">
              <label for="member-${uid}">${name}</label>
            </div>`;
        });
      }
    });
  });

  // 🔹 Preview DP
  photoInput.addEventListener("change", () => {
    if (photoInput.files.length > 0) {
      const file = photoInput.files[0];
      photoPreview.src = URL.createObjectURL(file);
    }
  });

  // 🔹 Close popup
  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  // 🔹 Save group
  saveBtn.addEventListener("click", async () => {
    const name = document.getElementById("group-name").value.trim();
    if (!name) {
      alert("Please enter a group name");
      return;
    }

    saveBtn.disabled = true;
    try {
      const selected = {};
      document.querySelectorAll("#members-list input:checked").forEach(cb => {
        selected[cb.value] = true;
      });
      selected[user.uid] = true; // include creator

      let photoURL = "image/group.png";
      if (photoInput.files.length > 0) {
        photoURL = await readImageAsDataUrl(photoInput.files[0]);
      }

      const groupRef = await push(groupsRef, {
        name,
        photo: photoURL,
        members: selected,
        admins: { [user.uid]: true },
        createdByUid: user.uid,
        createdByName: profiles[user.uid]?.name || user.displayName || "User",
        createdByPhoto: profiles[user.uid]?.photo || "image/group.png",
        createdAt: Date.now(),
        history: { created: { by: user.uid, time: Date.now(), type: "created" } }
      });
      await notifyUsers(Object.keys(selected), {
        text: `${profiles[user.uid]?.name || user.displayName || "Someone"} created the group "${name}"`,
        icon: "bi-people-fill",
        type: "group-created",
        fromUid: user.uid,
        url: `groupchat.html#group-${groupRef.key}`
      }, user.uid);

      alert("Group created!");
      popup.style.display = "none";
      document.getElementById("group-name").value = "";
      photoInput.value = "";
      photoPreview.src = "image/group.png";
    } catch (error) {
      console.error("Unable to create group:", error);
      alert(`Unable to create group: ${error.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  });

  // 🔹 Open group chat
  window.openGroup = function(groupId) {
    const nextRecent = [groupId, ...recentIds.filter(id => id !== groupId)].slice(0, 8);
    localStorage.setItem("recentGroupIds", JSON.stringify(nextRecent));
    localStorage.setItem("chatGroupId", groupId);
    window.location.href = "groupchat.html";
  };
});
