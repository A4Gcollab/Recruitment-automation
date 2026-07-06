chrome.storage.sync.get(["dashboardUrl", "syncKey"], (s) => {
  if (s.dashboardUrl) document.getElementById("dashboard-url").value = s.dashboardUrl;
  if (s.syncKey)      document.getElementById("sync-key").value      = s.syncKey;
});

document.getElementById("save-btn").addEventListener("click", () => {
  const dashboardUrl = document.getElementById("dashboard-url").value.trim().replace(/\/$/, "");
  const syncKey      = document.getElementById("sync-key").value.trim();

  chrome.storage.sync.set({ dashboardUrl, syncKey }, () => {
    const msg = document.getElementById("saved-msg");
    msg.style.display = "inline";
    setTimeout(() => { msg.style.display = "none"; }, 2000);
  });
});
