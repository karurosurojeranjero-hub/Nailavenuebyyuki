/* ============================ helpers ============================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const peso = n => "₱" + Number(n).toLocaleString("en-PH");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
const fmtDate = d => d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });          // YYYY-MM-DD in PHT
const todayPH = () => fmtDate(new Date());
const apptDate = (date, key) => new Date(`${date}T${key}:00+08:00`);
const prettyDate = date => new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH",
  { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });
const shortDate = date => new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-PH",
  { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric" });
const nowTime = () => new Date().toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
const slotLabel = key => (CONFIG.SLOTS.find(s => s.key === key) || {}).label || key;
const digits = s => String(s || "").replace(/\D/g, "");
const ALL_SERVICES = CONFIG.SERVICES.flatMap(c => c.items);
const ACTIVE = ["Pending", "Confirmed"];

const state = { slot: "", services: new Set(), images: [], submitting: false };

/* ============================ API layer (talks to server.js + SQLite) ============================ */
async function post(body) {
  const r = await fetch(CONFIG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
  return r.json();
}
const api = {
  async slots(date) {
    const r = await fetch(CONFIG.API_URL + "?" + new URLSearchParams({ action: "slots", date, t: Date.now() }));
    return r.json();
  },
  book: p => post({ action: "book", ...p }),
  lookup: (id, phone) => post({ action: "lookup", id, phone }),
  cancel: (id, phone) => post({ action: "cancel", id, phone })
};

/* ============================ render static parts ============================ */
function renderStatic() {
  const G = CONFIG.GALLERY;
  const img = (g, extra = "") => g.src ? `<img src="${esc(g.src)}" alt="${esc(g.label)} — nail design example" loading="lazy" ${extra}>` : `<div class="ph">💅</div>`;

  $("#collage").innerHTML = `<div class="blob"></div>
    ${G[0] ? `<figure class="c-a" data-zoom="${esc(G[0].src)}" data-cap="${esc(G[0].label)}">${img(G[0], 'loading="eager"')}</figure>` : ""}
    ${G[2] ? `<figure class="c-b" data-zoom="${esc(G[2].src)}" data-cap="${esc(G[2].label)}">${img(G[2])}</figure>` : ""}
    ${G[1] ? `<figure class="c-c" data-zoom="${esc(G[1].src)}" data-cap="${esc(G[1].label)}">${img(G[1])}</figure>` : ""}
    <span class="st st1">✦</span><span class="st st2">✦</span><span class="st st3">✦</span>`;

  const words = ["When Nails Meet Coffee", "Gel Manicure", "Hard Gel Overlay", "Nail Extensions", "Gel Pedicure", "Complimentary Coffee", "Open Every Day"];
  $("#track").innerHTML = [...words, ...words].map(w => `<span>${esc(w)}</span>`).join("");

  $("#looksGrid").innerHTML = G.map(g => `
    <article class="look reveal"><figure data-zoom="${esc(g.src)}" data-cap="${esc(g.label)}">${img(g)}</figure>
      <h3>${esc(g.label)}</h3><p>${esc(g.desc || "")}</p>
      <a class="btn btn-soft btn-sm" href="#services">See prices</a></article>`).join("");

  $("#dgrid").innerHTML = CONFIG.DRINKS.map(d => `<div class="dcard"><div class="e">${d.img ? `<img src="${esc(d.img)}" alt="${esc(d.name)}" style="height:48px;margin:0 auto">` : d.emoji}</div><b>${esc(d.name)}</b><span class="free">FREE</span></div>`).join("");

  $("#priceList").innerHTML = CONFIG.SERVICES.map(c => `
    <div class="cat reveal"><h3>${esc(c.category)}</h3>
    ${c.items.map(i => `<div class="row"><div class="nm">${esc(i.name)}</div><div class="pr">${peso(i.price)}</div>
      <button class="btn btn-soft btn-sm" type="button" data-book="${i.id}">Book This Service</button></div>`).join("")}</div>`).join("") +
    `<p class="note">Estimated prices per service. Final total is confirmed by Yuki.</p>`;

  $("#svcPicker").innerHTML = CONFIG.SERVICES.map(c => `
    <div class="svc-group"><h4>${esc(c.category)}</h4>
    ${c.items.map(i => `<label class="chk"><input type="checkbox" data-svc="${i.id}"><span class="t">${esc(i.name)}</span><span class="p">${peso(i.price)}</span></label>`).join("")}</div>`).join("");

  $("#drinks").innerHTML = CONFIG.DRINKS.map(d => `
    <label class="drink"><input type="radio" name="drink" value="${esc(d.name)}">
      <span class="card"><span class="pic">${d.img ? `<img src="${esc(d.img)}" alt="${esc(d.name)}">` : d.emoji}</span>
      <b>${esc(d.name)}</b><span class="free">FREE · COMPLIMENTARY</span></span></label>`).join("");

  $("#rulesList").innerHTML = CONFIG.POLICIES.map(p => `<li>${esc(p)}</li>`).join("");

  const links = [];
  if (CONFIG.FACEBOOK_URL)  links.push(`<a class="btn btn-primary" href="${esc(CONFIG.FACEBOOK_URL)}" target="_blank" rel="noopener">Facebook</a>`);
  if (CONFIG.INSTAGRAM_URL) links.push(`<a class="btn btn-soft" href="${esc(CONFIG.INSTAGRAM_URL)}" target="_blank" rel="noopener">Instagram</a>`);
  $("#socialLinks").innerHTML = links.join("") || `<p class="hint">Find us on Facebook and Instagram — Nail Avenue by Yuki.</p>`;

  const d = $("#date"); d.min = todayPH();
  d.max = fmtDate(new Date(Date.now() + CONFIG.DAYS_AHEAD * 864e5));

  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: .12 });
    $$(".reveal").forEach(el => io.observe(el));
  } else $$(".reveal").forEach(el => el.classList.add("in"));
}

/* lightbox */
document.addEventListener("click", e => {
  const f = e.target.closest("[data-zoom]");
  if (f && f.dataset.zoom) { $("#lbImg").src = f.dataset.zoom; $("#lbImg").alt = f.dataset.cap || ""; $("#lbCap").textContent = f.dataset.cap || ""; $("#lightbox").classList.add("show"); }
});
$("#lightbox").addEventListener("click", () => $("#lightbox").classList.remove("show"));
document.addEventListener("keydown", e => { if (e.key === "Escape") $("#lightbox").classList.remove("show"); });

/* ============================ nav ============================ */
$("#burger").addEventListener("click", () => {
  const o = $("#menu").classList.toggle("open"); $("#burger").setAttribute("aria-expanded", o);
});
$("#menu").addEventListener("click", e => { if (e.target.tagName === "A") $("#menu").classList.remove("open"); });

/* ============================ services + total + summary ============================ */
function syncServices() {
  state.services = new Set($$("[data-svc]:checked").map(x => x.dataset.svc));
  renderSummary();
}
document.addEventListener("change", e => {
  if (e.target.matches("[data-svc]")) { syncServices(); clearErr("services"); }
  if (e.target.matches("[name=wantDrink]")) {
    $("#drinks").classList.toggle("show", e.target.value === "yes");
    if (e.target.value === "no") $$("[name=drink]").forEach(r => r.checked = false);
    clearErr("drink"); renderSummary();
  }
  if (e.target.matches("[name=drink]")) { clearErr("drink"); renderSummary(); }
  if (e.target.matches("[name=ready]")) clearErr("ready");
  if (e.target.id === "agree") clearErr("agree");
  if (e.target.id === "date") { state.slot = ""; clearErr("date"); loadSlots(); renderSummary(); }
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-book]");
  if (b) {
    const cb = $(`[data-svc="${b.dataset.book}"]`); cb.checked = true; syncServices();
    $("#book").scrollIntoView({ behavior: "smooth" });
  }
});
["name","phone","social","clients","design"].forEach(id => $("#" + id).addEventListener("input", () => { clearErr(id); renderSummary(); }));

function total() { return ALL_SERVICES.filter(s => state.services.has(s.id)).reduce((a, s) => a + s.price, 0); }
function drinkChoice() {
  const w = ($("[name=wantDrink]:checked") || {}).value;
  if (w !== "yes") return "No drink";
  return ($("[name=drink]:checked") || {}).value || "";
}
function renderSummary() {
  const sel = ALL_SERVICES.filter(s => state.services.has(s.id));
  const date = $("#date").value, dr = drinkChoice();
  const n = parseInt($("#clients").value, 10) || 1;
  $("#summary").innerHTML = `<h3>Your Appointment Summary</h3><ul>
    <li><span>Selected Service${sel.length > 1 ? "s" : ""}</span><span>${sel.length ? sel.map(s => `${esc(s.name)} — ${peso(s.price)}`).join("<br>") : "—"}</span></li>
    <li><span>Appointment Date</span><span>${date ? prettyDate(date) : "—"}</span></li>
    <li><span>Appointment Time</span><span>${state.slot ? slotLabel(state.slot) + " PHT" : "—"}</span></li>
    <li><span>Number of Clients</span><span>${n}</span></li>
    <li><span>Complimentary Drink</span><span>${dr === "No drink" ? "No, thank you" : (dr ? esc(dr) + " (FREE)" : "—")}</span></li>
    <li class="total"><span>Estimated Total</span><span>${peso(total())}</span></li></ul>
    ${n > 1 ? `<p class="coffee-note">Total shown is for the selected services. Yuki will confirm the final total for ${n} clients.</p>` : ""}
    <p class="coffee-note">Your coffee is on us! 🤎 Enjoy your nail session with a complimentary drink from Nail Avenue by Yuki.</p>`;
}

/* ============================ time slots (live, conflict-safe) ============================ */
function showSlotToast(msg) { const t = $("#slotToast"); t.textContent = msg; t.style.display = msg ? "block" : "none"; }
async function loadSlots(silent) {
  const box = $("#slots"), date = $("#date").value, live = $("#liveNote");
  if (!date) { box.innerHTML = `<p class="hint">Choose a date to see available times.</p>`; live.style.display = "none"; return; }
  if (!silent) box.innerHTML = `<p class="hint">Checking availability…</p>`;
  let un = {};
  try {
    const r = await api.slots(date);
    if (!r.ok) throw new Error(r.error);
    un = r.unavailable || {};
  } catch (e) {
    if (silent) return;
    box.innerHTML = `<p class="hint">Couldn’t load times. <a href="#" id="retrySlots">Tap to retry</a>.</p>`;
    $("#retrySlots").onclick = ev => { ev.preventDefault(); loadSlots(); };
    return;
  }
  if ($("#date").value !== date) return; // user changed date meanwhile
  const wasTaken = state.slot && (un[state.slot] || apptDate(date, state.slot) <= Date.now());
  if (wasTaken) { state.slot = ""; showSlotToast("Heads up: the time you picked was just taken. Please choose another available slot."); renderSummary(); }
  else if (!silent) showSlotToast("");
  box.innerHTML = CONFIG.SLOTS.map(s => {
    const past = apptDate(date, s.key) <= Date.now();
    const st = un[s.key] || (past ? "unavailable" : "");
    const txt = st === "booked" ? "Fully Booked" : st ? "Unavailable" : "Available";
    return `<button type="button" class="slot${state.slot === s.key && !st ? " sel" : ""}" data-slot="${s.key}" ${st ? "disabled" : ""}>${s.label}<small>${txt}</small></button>`;
  }).join("");
  live.textContent = `Live availability · updated ${nowTime()} PHT`; live.style.display = "block";
}
$("#slots").addEventListener("click", e => {
  const b = e.target.closest("[data-slot]"); if (!b || b.disabled) return;
  state.slot = b.dataset.slot; clearErr("slot"); showSlotToast("");
  $$(".slot").forEach(x => x.classList.toggle("sel", x === b)); renderSummary();
});
setInterval(() => { if ($("#date").value && !document.hidden && !state.submitting) loadSlots(true); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && $("#date").value) loadSlots(true); });

/* ============================ image upload ============================ */
$("#pickFiles").addEventListener("click", () => $("#files").click());
$("#files").addEventListener("change", async e => {
  for (const f of [...e.target.files]) {
    if (state.images.length >= 3) break;
    if (!f.type.startsWith("image/")) continue;
    try { state.images.push(await compress(f)); } catch {}
  }
  e.target.value = ""; renderThumbs();
});
function compress(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const max = 1200, sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const url = c.toDataURL("image/jpeg", 0.8);
        res({ name: file.name.replace(/\.[^.]+$/, "") + ".jpg", data: url.split(",")[1], preview: url });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function renderThumbs() {
  $("#thumbs").innerHTML = state.images.map((im, i) => `<div class="thumb"><img src="${im.preview}" alt="Inspiration ${i + 1}"><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></div>`).join("");
}
$("#thumbs").addEventListener("click", e => {
  const b = e.target.closest("[data-rm]"); if (!b) return;
  state.images.splice(+b.dataset.rm, 1); renderThumbs();
});

/* ============================ validation + submit ============================ */
function setErr(f, msg) { const el = $(`[data-f="${f}"]`); if (!el) return; el.classList.add("bad"); if (msg) $(".err", el).textContent = msg; }
function clearErr(f) { const el = $(`[data-f="${f}"]`); if (el) el.classList.remove("bad"); }
function validate() {
  $$(".field.bad").forEach(x => x.classList.remove("bad"));
  const errs = [];
  const v = id => $("#" + id).value.trim();
  if (v("name").length < 2) errs.push("name");
  const dl = digits(v("phone")).length; if (dl < 10 || dl > 13) errs.push("phone");
  if (v("social").length < 2) errs.push("social");
  if (!$("#date").value || $("#date").value < todayPH()) errs.push("date");
  const n = parseInt($("#clients").value, 10); if (!(n >= 1 && n <= 10)) errs.push("clients");
  if (!state.slot) errs.push("slot");
  if (!state.services.size) errs.push("services");
  if (($("[name=wantDrink]:checked") || {}).value === "yes" && !($("[name=drink]:checked"))) errs.push("drink");
  if (!$("#agree").checked) errs.push("agree");
  const rd = ($("[name=ready]:checked") || {}).value;
  if (rd !== "yes") { errs.push("ready"); setErr("ready", rd === "no" ? "No problem — review your details, then choose YES when you’re ready." : "Please select YES to submit your request."); }
  errs.forEach(f => setErr(f));
  return errs;
}
$("#bookForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (state.submitting || $("#website").value) return;
  const errs = validate();
  if (errs.length) { $(`[data-f="${errs[0]}"]`).scrollIntoView({ behavior: "smooth", block: "center" }); return; }

  const sel = ALL_SERVICES.filter(s => state.services.has(s.id));
  const payload = {
    name: $("#name").value.trim(), phone: $("#phone").value.trim(), social: $("#social").value.trim(),
    date: $("#date").value, slot: state.slot, clients: parseInt($("#clients").value, 10),
    services: sel.map(s => ({ name: s.name, price: s.price })), total: total(),
    design: $("#design").value.trim(), drink: drinkChoice(), agreed: true,
    images: state.images.map(i => ({ name: i.name, data: i.data }))
  };
  const btn = $("#submitBtn"), fail = $("#failBox"); fail.style.display = "none";
  state.submitting = true; btn.disabled = true; btn.textContent = "Checking availability…";
  const conflict = async () => {
    state.slot = ""; await loadSlots();
    fail.textContent = "Sorry, that time slot was just taken by another booking. Please choose another available time — your details are still here.";
    fail.style.display = "block"; setErr("slot", "Please choose another available time slot."); renderSummary();
    $('[data-f="slot"]').scrollIntoView({ behavior: "smooth", block: "center" });
  };
  try {
    // 1) fresh availability check right before sending
    const chk = await api.slots(payload.date);
    if (chk.ok && ((chk.unavailable || {})[payload.slot] || apptDate(payload.date, payload.slot) <= Date.now())) { await conflict(); return; }
    btn.textContent = "Sending your request…";
    // 2) the server re-checks inside a lock, so two people can never get the same slot
    const r = await api.book(payload);
    if (!r.ok) {
      if (r.error === "slot_taken") { await conflict(); return; }
      fail.textContent = r.message || "Something went wrong. Please check your details and try again.";
      fail.style.display = "block"; fail.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      try { localStorage.setItem("nay_last", JSON.stringify({ id: r.id, phone: payload.phone })); } catch {}
      $("#thanksId").textContent = r.id; $("#thanks").classList.add("show");
      $("#lkId").value = r.id; $("#lkPhone").value = payload.phone;
      $("#bookForm").reset(); state.slot = ""; state.services.clear(); state.images = []; renderThumbs();
      $("#drinks").classList.remove("show"); $("#slots").innerHTML = `<p class="hint">Choose a date to see available times.</p>`; $("#liveNote").style.display = "none"; renderSummary();
    }
  } catch (err) {
    fail.textContent = "We couldn’t reach the booking system. Please check your connection and try again.";
    fail.style.display = "block";
  } finally {
    state.submitting = false; btn.disabled = false; btn.textContent = "Submit Appointment Request";
  }
});
$("#thanksClose").addEventListener("click", () => { $("#thanks").classList.remove("show"); $("#manage").scrollIntoView({ behavior: "smooth" }); });

/* ============================ check / cancel my booking ============================ */
let lastLookup = null;
$("#lookupForm").addEventListener("submit", async e => {
  e.preventDefault();
  const id = $("#lkId").value.trim().toUpperCase(), ph = $("#lkPhone").value.trim();
  const err = $("#lkErr"), res = $("#lkRes"); err.style.display = "none"; res.style.display = "none";
  if (!id || digits(ph).length < 10) { err.textContent = "Please enter your Booking ID and contact number."; err.style.display = "block"; return; }
  const btn = $("#lkBtn"); btn.disabled = true; btn.textContent = "Searching…";
  try {
    const r = await api.lookup(id, ph);
    if (!r.ok) { err.textContent = "We couldn’t find a booking with those details. Please double-check and try again."; err.style.display = "block"; }
    else { lastLookup = { id, ph }; showBooking(r.booking); }
  } catch { err.textContent = "Couldn’t reach the booking system. Please try again."; err.style.display = "block"; }
  finally { btn.disabled = false; btn.textContent = "Find My Booking"; }
});
function showBooking(b, msg) {
  const res = $("#lkRes");
  const active = ACTIVE.includes(b.status);
  let cancelPart = "";
  if (active) {
    cancelPart = b.canCancel
      ? `<button class="btn btn-ghost" style="width:100%;margin-top:14px" id="cancelBtn" type="button">Cancel This Appointment</button>
         <p class="hint" style="text-align:center">You can cancel until ${CONFIG.CANCEL_HOURS} hours before your appointment.</p>`
      : `<div class="msg info" style="margin-top:14px">⏳ This appointment is within ${CONFIG.CANCEL_HOURS} hours, so it can no longer be cancelled online.</div>`;
  }
  res.innerHTML = `<ul>
    <li><span>Booking ID</span><span><b>${esc(b.id)}</b></span></li>
    <li><span>Status</span><span><span class="status st-${esc(b.status)}">${esc(b.status)}</span></span></li>
    <li><span>Name</span><span>${esc(b.name)}</span></li>
    <li><span>Date</span><span>${prettyDate(b.date)}</span></li>
    <li><span>Time</span><span>${slotLabel(b.slot)} PHT</span></li>
    <li><span>Services</span><span>${b.services.map(s => esc(s.name)).join("<br>")}</span></li>
    <li><span>Complimentary Drink</span><span>${esc(b.drink && b.drink !== "No drink" ? b.drink + " (FREE)" : "No, thank you")}</span></li>
    <li><span>Estimated Total</span><span><b>${peso(b.total)}</b></span></li></ul>
    ${b.status === "Pending" ? `<div class="msg info">Waiting for Yuki’s confirmation. Please don’t consider this officially booked yet.</div>` : ""}
    ${b.status === "Confirmed" ? `<div class="msg ok">✅ Confirmed! See you soon.</div>` : ""}
    ${b.status === "Declined" ? `<div class="msg no">Sorry, this request wasn’t approved. Please book another time slot.</div>` : ""}
    ${b.adminNote ? `<div class="msg info">💬 <b>Message from Yuki:</b> ${esc(b.adminNote)}</div>` : ""}
    ${msg ? `<div class="msg ${msg.type}">${esc(msg.text)}</div>` : ""}
    ${cancelPart}`;
  res.style.display = "block";
  const cb = $("#cancelBtn");
  if (cb) cb.onclick = async () => {
    if (!confirm("Cancel this appointment? This can’t be undone.")) return;
    cb.disabled = true; cb.textContent = "Cancelling…";
    try {
      const r = await api.cancel(lastLookup.id, lastLookup.ph);
      if (r.ok) { const l = await api.lookup(lastLookup.id, lastLookup.ph); showBooking(l.booking, { type: "ok", text: "Your appointment has been cancelled." }); loadSlots(true); }
      else if (r.error === "too_late") { const l = await api.lookup(lastLookup.id, lastLookup.ph); showBooking(l.booking, { type: "no", text: `Sorry, appointments can’t be cancelled within ${CONFIG.CANCEL_HOURS} hours of the scheduled time.` }); }
      else { cb.disabled = false; cb.textContent = "Cancel This Appointment"; alert(r.message || "Couldn’t cancel this booking."); }
    } catch { cb.disabled = false; cb.textContent = "Cancel This Appointment"; alert("Couldn’t reach the booking system. Please try again."); }
  };
}

