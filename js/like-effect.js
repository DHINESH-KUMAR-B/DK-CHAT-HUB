let effectStylesAdded = false;

const addEffectStyles = () => {
  if (effectStylesAdded) return;
  const style = document.createElement("style");
  style.textContent = `
    .like-effect-overlay {
      position: fixed;
      inset: 0;
      z-index: 2000;
      display: grid;
      place-items: center;
      pointer-events: none;
      background: rgba(0, 6, 20, 0.32);
      animation: like-effect-fade 2s ease forwards;
    }
    .like-effect-heart {
      color: #ff315d;
      font-size: min(35vw, 190px);
      filter: drop-shadow(0 0 18px rgba(255, 49, 93, 0.85));
      animation: like-effect-pop 2s cubic-bezier(.17,.67,.35,1.35) forwards;
    }
    @keyframes like-effect-pop {
      0% { transform: scale(0.2); opacity: 0; }
      18% { transform: scale(1.15); opacity: 1; }
      38% { transform: scale(0.95); }
      65% { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.35); opacity: 0; }
    }
    @keyframes like-effect-fade {
      0%, 70% { opacity: 1; }
      100% { opacity: 0; }
    }
  `;
  document.head.appendChild(style);
  effectStylesAdded = true;
};

export const showLikeEffect = () => {
  addEffectStyles();
  const overlay = document.createElement("div");
  overlay.className = "like-effect-overlay";
  overlay.innerHTML = '<div class="like-effect-heart" aria-hidden="true">♥</div>';
  document.body.appendChild(overlay);
  window.setTimeout(() => overlay.remove(), 2000);
};
