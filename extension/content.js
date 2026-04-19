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

  const TOAST_ID = "doclab-toast-host";

  function showToast(text, ok) {
    let host = document.getElementById(TOAST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_ID;
      host.attachShadow({ mode: "open" });
      document.documentElement.appendChild(host);
    }
    const color = ok ? "#2a8a3a" : "#c53030";
    host.shadowRoot.innerHTML = `
      <div style="
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
        background: ${color}; color: #fff;
        padding: 10px 14px; border-radius: 8px;
        font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        box-shadow: 0 10px 30px rgba(0,0,0,0.25);
        max-width: 360px; word-break: break-word;
      ">${text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}</div>
    `;
    clearTimeout(window.__doclabToastTimer);
    window.__doclabToastTimer = setTimeout(() => host.remove(), 2500);
  }

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === "doclab:open-note") {
      const existing = document.getElementById(HOST_ID);
      if (existing) {
        const ta = existing.shadowRoot?.querySelector(".doclab-body");
        if (ta) ta.focus();
        return;
      }
      buildOverlay(msg.defaultFormat || "md");
    } else if (msg?.type === "doclab:toast") {
      showToast(msg.text || "", msg.ok !== false);
    }
  });
})();
