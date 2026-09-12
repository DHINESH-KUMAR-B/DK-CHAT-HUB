const progress = document.querySelector('.progress');
const loadingBar = document.querySelector('.loading-bar');
let load = 0;
const startTime = Date.now();
const redirectDelay = 1400;

const setLoading = percent => {
  if (progress) progress.style.width = `${percent}%`;
  if (loadingBar) loadingBar.setAttribute('aria-valuenow', String(percent));
};

const animateAndRedirect = () => {
  load = Math.min(100, Math.round(((Date.now() - startTime) / redirectDelay) * 100));
  setLoading(load);
  if (load >= 100) {
    window.location.replace("login.html");
    return;
  }
  window.requestAnimationFrame(animateAndRedirect);
};

window.requestAnimationFrame(animateAndRedirect); before starting
