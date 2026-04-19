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
  const filename = `${sanitizeSubfolder(subfolder)}/${base}_${timestamp()}.png`;
  return downloadFile({ filename, url: dataUrl });
}

async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["overlay.css"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
  } catch (e) {
    // Some pages (chrome://, Web Store) disallow injection. Nothing we can do.
    console.warn("doclab: cannot inject into this tab:", e.message);
  }
}

chrome.commands.onCommand.addListener(async command => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "open-note") {
    await ensureContentScript(tab.id);
    const { defaultFormat } = await getSettings();
    chrome.tabs.sendMessage(tab.id, {
      type: "doclab:open-note",
      defaultFormat
    });
  } else if (command === "take-screenshot") {
    try {
      await takeScreenshot(tab);
    } catch (e) {
      console.error("doclab screenshot failed:", e);
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
