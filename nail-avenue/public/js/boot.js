document.documentElement.classList.add("js");
// If a logo/icon image file is missing, hide it quietly instead of showing broken text.
document.addEventListener("error", e => { const t = e.target; if (t && t.tagName === "IMG" && /\/assets\//.test(t.src)) t.style.display = "none"; }, true);
