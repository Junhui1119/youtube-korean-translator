const enabledInput = document.getElementById("enabled");

chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = enabled;
});

enabledInput.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledInput.checked });
});
