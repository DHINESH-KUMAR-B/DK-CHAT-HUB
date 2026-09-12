import { auth, db } from "./firebase.js";
import { ref, onValue, push, update, remove } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { showLikeEffect } from "./like-effect.js";
import { notifyUser, notifyUsers } from "./notifications.js";

const popup = document.getElementById("event-popup");
const addBtn = document.getElementById("add-event-btn");
const saveBtn = document.getElementById("save-event");
const closeBtn = document.getElementById("close-popup");
const list = document.getElementById("events-list");
const pollOptions = document.getElementById("poll-options");
const addPollOptionBtn = document.getElementById("add-poll-option");
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
}[character]));

auth.onAuthStateChanged(user => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const eventsRef = ref(db, "events");
  const usersRef = ref(db, "users");
  let events = {};
  let profiles = {};
  let visibleLikes = {};
  const legacyCreatorName = user.displayName || user.email || user.uid;

  const isEventCreator = event =>
    event.createdByUid === user.uid ||
    (!event.createdByUid && event.createdBy === legacyCreatorName);

  const renderEvents = () => {
    if (!Object.keys(events).length) {
      list.innerHTML = "<p style='color:#9bacbe;'>No events yet</p>";
      return;
    }

    list.innerHTML = Object.entries(events).map(([id, event]) => {
      const likes = Object.keys(event.likes || {});
      const voters = event.poll?.votes || {};
      const pollOptions = event.poll?.options || [];
      const totalVotes = Object.values(voters).reduce((total, optionVotes) =>
        total + Object.keys(optionVotes || {}).length, 0);
      const likedBy = likes.map(uid => profiles[uid]).filter(Boolean);
      const creator = profiles[event.createdByUid] ||
        (isEventCreator(event) ? profiles[user.uid] || {} : {});
      const creatorName = creator.name || event.createdByName || event.createdBy || "User";
      const creatorPhoto = creator.photo || event.createdByPhoto || "image/profile.png";
      const likeProfiles = visibleLikes[id]
        ? `<div class="like-profiles">${likedBy.map(profile =>
          `<img src="${escapeHtml(profile.photo || "image/profile.png")}" title="${escapeHtml(profile.name || "User")}" alt="${escapeHtml(profile.name || "User")}">`
        ).join("")}</div>`
        : "";
      const poll = event.poll && pollOptions.length
        ? `<div class="event-poll">
            <strong>${escapeHtml(event.poll.question)}</strong>
            ${pollOptions.map((option, index) => {
              const count = Object.keys(voters[index] || {}).length;
              const checked = voters[index] && voters[index][user.uid] ? "checked" : "";
              return `<label class="poll-option">
                <input type="radio" name="poll-${id}" data-event="${id}" data-option="${index}" ${checked}>
                <span>${escapeHtml(option)}</span><b>${count}</b>
              </label>`;
            }).join("")}
            <small>${totalVotes} vote${totalVotes === 1 ? "" : "s"}</small>
          </div>`
        : "";

      return `<article class="event-card">
        <div class="event-title">${escapeHtml(event.title)}</div>
        <div class="event-date">${escapeHtml(event.date)} ${escapeHtml(event.time || "")}</div>
        <div class="event-desc">${escapeHtml(event.desc || "")}</div>
        <div class="event-created">
          <img src="${escapeHtml(creatorPhoto)}" alt="${escapeHtml(creatorName)}">
          <span>Created by: ${escapeHtml(creatorName)}</span>
        </div>
        ${poll}
        <div class="event-actions">
          <button type="button" class="event-like ${likes.includes(user.uid) ? "liked" : ""}" data-action="like" data-event="${id}">
            <i class="bi bi-heart${likes.includes(user.uid) ? "-fill" : ""}"></i> ${likes.length}
          </button>
          ${likes.length ? `<button type="button" data-action="view-likes" data-event="${id}">${visibleLikes[id] ? "Hide" : "Who liked"}</button>` : ""}
          <button type="button" data-action="share" data-event="${id}"><i class="bi bi-share"></i> Share</button>
          ${isEventCreator(event) ? `<button type="button" data-action="delete" data-event="${id}"><i class="bi bi-trash"></i> Delete</button>` : ""}
        </div>
        ${likeProfiles}
      </article>`;
    }).join("");
  };

  onValue(eventsRef, snapshot => {
    events = snapshot.exists() ? snapshot.val() : {};
    renderEvents();
  });

  onValue(usersRef, snapshot => {
    profiles = {};
    if (snapshot.exists()) {
      Object.entries(snapshot.val()).forEach(([uid, data]) => {
        profiles[uid] = data.profile || {};
      });
    }
    renderEvents();
  });

  list.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.event;
    if (button.dataset.action === "like") {
      const isLiked = Boolean(events[id].likes && events[id].likes[user.uid]);
      await update(ref(db, `events/${id}/likes`), {
        [user.uid]: isLiked ? null : true
      });
      if (!isLiked && events[id].createdByUid && events[id].createdByUid !== user.uid) {
        await notifyUser(events[id].createdByUid, {
          text: `${profiles[user.uid]?.name || "Someone"} liked your event "${events[id].title}"`,
          icon: "bi-heart-fill",
          type: "event-like",
          fromUid: user.uid,
          url: `event.html#event-${id}`
        });
      }
      if (!isLiked) showLikeEffect();
    } else if (button.dataset.action === "view-likes") {
      visibleLikes[id] = !visibleLikes[id];
      renderEvents();
    } else if (button.dataset.action === "delete") {
      if (!isEventCreator(events[id]) || !confirm("Delete this event?")) return;
      await remove(ref(db, `events/${id}`));
    } else if (button.dataset.action === "share") {
      const sharedEvent = events[id];
      const shareText = `${sharedEvent.title}\n${sharedEvent.date} ${sharedEvent.time || ""}\n${sharedEvent.desc || ""}`.trim();
      const shareData = {
        title: sharedEvent.title,
        text: shareText,
        url: `${window.location.href.split("#")[0]}#event-${id}`
      };

      try {
        if (navigator.share) {
          await navigator.share(shareData);
        } else {
          await navigator.clipboard.writeText(`${shareText}\n${shareData.url}`);
          alert("Event details copied to clipboard.");
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          console.error("Unable to share event:", error);
          alert("Unable to share this event.");
        }
      }
    }
  });

  list.addEventListener("change", async event => {
    const option = event.target.closest("input[data-event][data-option]");
    if (!option) return;
    const id = option.dataset.event;
    const selected = Number(option.dataset.option);
    const voteUpdates = {};
    (events[id].poll?.options || []).forEach((_, index) => {
      voteUpdates[`${index}/${user.uid}`] = index === selected ? true : null;
    });
    await update(ref(db, `events/${id}/poll/votes`), voteUpdates);
    if (events[id].createdByUid && events[id].createdByUid !== user.uid) {
      await notifyUser(events[id].createdByUid, {
        text: `${profiles[user.uid]?.name || "Someone"} voted in your event poll`,
        icon: "bi-bar-chart-fill",
        type: "poll-vote",
        fromUid: user.uid,
        url: `event.html#event-${id}`
      });
    }
  });

  addBtn.addEventListener("click", () => {
    popup.style.display = "flex";
  });

  closeBtn.addEventListener("click", () => {
    popup.style.display = "none";
  });

  addPollOptionBtn.addEventListener("click", () => {
    const optionNumber = pollOptions.querySelectorAll(".poll-option-input").length + 1;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "poll-option-input";
    input.placeholder = `Poll option ${optionNumber}`;
    pollOptions.appendChild(input);
  });

  saveBtn.addEventListener("click", async () => {
    const title = document.getElementById("event-title").value.trim();
    const date = document.getElementById("event-date").value;
    const time = document.getElementById("event-time").value;
    const desc = document.getElementById("event-desc").value.trim();
    const question = document.getElementById("poll-question").value.trim();
    const options = [...pollOptions.querySelectorAll(".poll-option-input")]
      .map(option => option.value.trim())
      .filter(Boolean);

    if (!title || !date) {
      alert("Please enter at least a title and date");
      return;
    }
    if (question && options.length < 2) {
      alert("Add at least two poll options");
      return;
    }

    saveBtn.disabled = true;
    try {
      const eventData = {
        title, date, time, desc,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdByUid: user.uid,
        createdByName: profiles[user.uid]?.name || user.displayName || user.email || "User",
        createdByPhoto: profiles[user.uid]?.photo || "image/profile.png",
        createdBy: user.displayName || user.email || user.uid
      };
      if (question) eventData.poll = { question, options, votes: {} };
      const eventRef = await push(eventsRef, eventData);
      await notifyUsers(Object.keys(profiles), {
        text: `${eventData.createdByName} created a new event: "${title}"`,
        icon: "bi-calendar-event",
        type: "event-created",
        fromUid: user.uid,
        url: `event.html#event-${eventRef.key}`
      }, user.uid);
      alert("Event added!");
      popup.style.display = "none";
      ["event-title", "event-date", "event-time", "event-desc", "poll-question"]
        .forEach(id => { document.getElementById(id).value = ""; });
      pollOptions.innerHTML = `
        <input type="text" class="poll-option-input" placeholder="Poll option 1">
        <input type="text" class="poll-option-input" placeholder="Poll option 2">`;
    } catch (error) {
      console.error("Unable to add event:", error);
      alert(`Unable to add event: ${error.message}`);
    } finally {
      saveBtn.disabled = false;
    }
  });
});
