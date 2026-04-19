(() => {
  if (window.__doclabInjected) return;
  window.__doclabInjected = true;

  const HOST_ID = "doclab-overlay-host";

  function buildOverlay(defaultFormat) {
    const host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("overlay.css");
    shadow.appendChild(link);

    const wrap = document.createElement("div");
    wrap.className = "doclab-wrap";
    wrap.innerHTML = `
      <div class="doclab-modal" role="dialog" aria-label="doclab quick note">
        <div class="doclab-row doclab-top">
          <input class="doclab-name" type="text" placeholder="filename (without extension)" />
          <select class="doclab-format" aria-label="format">
            <option value="md">.md</option>
            <option value="txt">.txt</option>
          </select>
          <button class="doclab-close" title="Close (Esc)">×</button>
        </div>
        <textarea class="doclab-body" placeholder="Write your note…  (Ctrl/Cmd+Enter to save, Esc to cancel)"></textarea>
        <div class="doclab-row doclab-bottom">
          <span class="doclab-hint">Saves to your configured Downloads subfolder.</span>
          <span class="doclab-status"></span>
          <button class="doclab-save">Save</button>
        </div>
      </div>
    `;
    shadow.appendChild(wrap);

    const nameEl = shadow.querySelector(".doclab-name");
    const fmtEl = shadow.querySelector(".doclab-format");
    const bodyEl = shadow.querySelector(".doclab-body");
    const saveBtn = shadow.querySelector(".doclab-save");
    const closeBtn = shadow.querySelector(".doclab-close");
    const statusEl = shadow.querySelector(".doclab-status");

    fmtEl.value = defaultFormat === "txt" ? "txt" : "md";
    nameEl.value = document.title ? document.title.slice(0, 80) : "note";

    function close() {
      host.remove();
      window.__doclabOpen = false;
    }

    async function save() {
      saveBtn.disabled = true;
      statusEl.textContent = "saving…";
      const payload = {
        content: bodyEl.value,
        format: fmtEl.value,
        suggestedName: nameEl.value,
        pageUrl: location.href,
        pageTitle: document.title
      };
      try {
        const res = await chrome.runtime.sendMessage({
          type: "doclab:save-note",
          payload
        });
        if (res?.ok) {
          statusEl.textContent = "saved ✓";
          setTimeout(close, 500);
        } else {
          statusEl.textContent = "failed: " + (res?.error || "unknown");
          saveBtn.disabled = false;
        }
      } catch (e) {
        statusEl.textContent = "failed: " + e.message;
        saveBtn.disabled = false;
      }
    }

    saveBtn.addEventListener("click", save);
    closeBtn.addEventListener("click", close);

    wrap.addEventListener("keydown", e => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.stopPropagation();
        save();
      }
    });

    wrap.addEventListener("click", e => {
      if (e.target === wrap) close();
    });

    document.documentElement.appendChild(host);
    setTimeout(() => bodyEl.focus(), 0);
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type !== "doclab:open-note") return;
    if (window.__doclabOpen) return;
    window.__doclabOpen = true;
    buildOverlay(msg.defaultFormat || "md");
  });
})();
