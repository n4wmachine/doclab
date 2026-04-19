const DEFAULTS = {
  subfolder: "doclab",
  defaultFormat: "md",
  includeMeta: true
};

const $ = id => document.getElementById(id);

async function load() {
  const s = await chrome.storage.sync.get(DEFAULTS);
  $("subfolder").value = s.subfolder ?? DEFAULTS.subfolder;
  $("defaultFormat").value = s.defaultFormat ?? DEFAULTS.defaultFormat;
  $("includeMeta").checked = Boolean(s.includeMeta);
}

async function save() {
  const subfolder = ($("subfolder").value || "").trim() || DEFAULTS.subfolder;
  await chrome.storage.sync.set({
    subfolder,
    defaultFormat: $("defaultFormat").value,
    includeMeta: $("includeMeta").checked
  });
  const status = $("status");
  status.textContent = "Saved";
  setTimeout(() => (status.textContent = ""), 1500);
}

document.addEventListener("DOMContentLoaded", load);
$("save").addEventListener("click", save);
