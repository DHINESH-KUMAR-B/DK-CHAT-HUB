import { db } from "./firebase.js";
import { push, ref } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";

export const notifyUser = (uid, notification) => {
  if (!uid) return Promise.resolve();
  return push(ref(db, `users/${uid}/notifications`), {
    text: notification.text || "New activity",
    icon: notification.icon || "bi-bell",
    url: notification.url || "",
    type: notification.type || "activity",
    fromUid: notification.fromUid || "",
    time: Date.now(),
    read: false
  });
};

export const notifyUsers = (uids, notification, excludeUid = "") =>
  Promise.all([...new Set(uids)].filter(uid => uid && uid !== excludeUid)
    .map(uid => notifyUser(uid, notification)));
