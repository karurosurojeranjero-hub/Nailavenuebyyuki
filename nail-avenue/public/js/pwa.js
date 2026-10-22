/* ============================ PWA ============================ */
let deferredPrompt;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; $("#installBtn").style.display = "inline-block"; });
$("#installBtn").addEventListener("click", async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("#installBtn").style.display = "none"; });
window.addEventListener("appinstalled", () => { $("#installBtn").style.display = "none"; });
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) $("#iosHint").style.display = "block";
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});

/* ============================ init ============================ */
renderStatic();
renderSummary();
try { const l = JSON.parse(localStorage.getItem("nay_last") || "null"); if (l) { $("#lkId").value = l.id; $("#lkPhone").value = l.phone; } } catch {}

/* ============================ friendly helpers ============================ */
if (location.protocol === "file:") $("#fileWarn").hidden = false;
if ("IntersectionObserver" in window) {
  const sb = $("#stickyBook"), hide = new Set();
  const io = new IntersectionObserver(es => { es.forEach(e => e.isIntersecting ? hide.add(e.target.id) : hide.delete(e.target.id)); sb.classList.toggle("off", hide.size > 0); }, { threshold: .05 });
  ["book", "manage", "contact"].forEach(id => { const el = document.getElementById(id); if (el) io.observe(el); });
}
