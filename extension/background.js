const DEFAULTS = {
  subfolder: "doclab",
  defaultFormat: "md",
  includeMeta: true
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

function sanitizeSegment(s) {
  return (s || "")
    .replace(/[\\/:*?"<>|\n\r\t]+/g, "_")
    .replace(/^\.+/, "_")
    .trim()
    .slice(0, 120);
}

function sanitizeSubfolder(s) {
  return (s || "")
    .split("/")
    .map(sanitizeSegment)
    .filter(Boolean)
    .join("/");
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

function textToDataUrl(text, mime) {
  const utf8 = new TextEncoder().encode(text);
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return `data:${mime};base64,${btoa(bin)}`;
}

async function downloadFile({ filename, url }) {
  const id = await chrome.downloads.download({
    url,
    filename,
    conflictAction: "uniquify",
    saveAs: false
  });
  return id;
}

async function saveNote({ content, format, suggestedName, pageUrl, pageTitle }) {
  const { subfolder, includeMeta } = await getSettings();
  const ext = format === "txt" ? "txt" : "md";
  const mime = ext === "md" ? "text/markdown" : "text/plain";

  const base = sanitizeSegment(suggestedName) || sanitizeSegment(pageTitle) || "note";
  const filename = `${sanitizeSubfolder(subfolder)}/${base}_${timestamp()}.${ext}`;

  let body = content ?? "";
  if (includeMeta && ext === "md") {
    const header =
      `---\n` +
      `title: ${pageTitle || ""}\n` +
      `url: ${pageUrl || ""}\n` +
      `saved: ${new Date().toISOString()}\n` +
      `---\n\n`;
    body = header + body;
  }

  const url = textToDataUrl(body, mime);
  return downloadFile({ filename, url });
}

async function takeScreenshot(tab) {
  const { subfolder } = await getSettings();
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
    format: "png"
  });
  const base = sanitizeSegment(tab.title) || "screenshot";
  const filename = `${sanitizeSubfolder(subfolder) || "doclab"}/${base}_${timestamp()}.png`;
  return downloadFile({ filename, url: dataUrl });
}

function flashBadge(ok) {
  chrome.action.setBadgeText({ text: ok ? "✓" : "!" });
  chrome.action.setBadgeBackgroundColor({ color: ok ? "#2a8a3a" : "#c53030" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 1800);
}

async function toast(tabId, text, ok) {
  flashBadge(ok);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    await chrome.tabs.sendMessage(tabId, { type: "doclab:toast", text, ok });
  } catch (_) {
    // restricted page (chrome://, Web Store, etc.) — badge is our only channel
  }
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });
}

async function openNote(tab) {
  const { defaultFormat } = await getSettings();
  try {
    await ensureContentScript(tab.id);
  } catch (e) {
    console.warn("doclab: cannot inject into this tab:", e?.message || e);
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "doclab:open-note",
      defaultFormat
    });
  } catch (e) {
    console.warn("doclab: open-note message failed:", e?.message || e);
  }
}

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "open-note") {
    await openNote(tab);
  } else if (command === "take-screenshot") {
    try {
      await takeScreenshot(tab);
      await toast(tab.id, "Screenshot saved", true);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error("doclab screenshot failed:", e);
      await toast(tab.id, "Screenshot failed: " + msg, false);
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "doclab:save-note") return;
  saveNote(msg.payload)
    .then(id => sendResponse({ ok: true, id }))
    .catch(err => sendResponse({ ok: false, error: String(err) }));
  return true;
});
