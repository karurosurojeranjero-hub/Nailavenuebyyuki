/* =====================================================================
   ADMIN  (the password is checked on the server — nothing secret lives in this page)
   ===================================================================== */
const adm = { token: "", data: null, tab: "cal", calMonth: "", calDay: "", sig: "", date: "", timer: null, poll: null, lastPending: null, q: "", editing: null, extraSvc: [] };
try { adm.token = sessionStorage.getItem("nay_adm") || ""; } catch {}
const show = (id, on) => { const el = $("#" + id); if (el) el.hidden = !on; };
function atoast(msg, bad) { const t = $("#atoast"); t.textContent = msg; t.className = "atoast" + (bad ? " bad" : ""); t.style.display = "block"; clearTimeout(atoast.t); atoast.t = setTimeout(() => t.style.display = "none", 4200); }
function admView(v) { ["admLogin", "admDash"].forEach(x => show(x, x === v)); show("admOut", v === "admDash");  }
function box(id, kind, text) { const e = $("#" + id); if (!text) { e.style.display = "none"; return; } e.className = "msg " + kind; e.textContent = text; e.style.display = "block"; }

function openAdmin() {
  $("#admin").hidden = false; document.body.style.overflow = "hidden";
  if (adm.token) { admView("admDash"); admLoad(); } else { admView("admLogin"); setTimeout(() => $("#admUser").focus(), 50); }
}
function closeAdmin() { $("#admin").hidden = true; document.body.style.overflow = ""; clearInterval(adm.timer); adm._on = false; clearInterval(adm.poll); if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search); }
function admSignedOut(msg) {
  adm.token = ""; adm.data = null; try { sessionStorage.removeItem("nay_adm"); } catch {}
  clearInterval(adm.timer); adm._on = false; adm.sig = ""; admView("admLogin"); box("admLoginErr", "no", msg || "");
}
function admSignedIn(token) {
  adm.token = token; try { sessionStorage.setItem("nay_adm", token); } catch {}
  $("#admPass").value = ""; box("admLoginErr", "no", ""); admView("admDash"); admLoad();
}
async function admCall(action, body) {
  try {
    const j = await post({ action, token: adm.token, ...(body || {}) });
    if (j.error === "auth") admSignedOut(j.message);
    return j;
  } catch { return { ok: false, error: "network", message: "Can’t reach the server. Check your connection." }; }
}
$$(".js-open-admin").forEach(a => a.addEventListener("click", e => { e.preventDefault(); history.replaceState(null, "", "#admin"); openAdmin(); }));
$("#admClose").addEventListener("click", closeAdmin);
if (location.hash === "#admin") openAdmin();

document.addEventListener("click", e => {
  const s = e.target.closest("[data-show]"); if (!s) return;
  const inp = $("#" + s.dataset.show); const on = inp.type === "password"; inp.type = on ? "text" : "password"; s.textContent = on ? "Hide" : "Show";
});

/* ---------- sign in ---------- */
$("#admLoginForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = $("#admLoginBtn"); box("admLoginErr", "no", "");
  const user = $("#admUser").value.trim(), pass = $("#admPass").value;
  if (!user || !pass) return box("admLoginErr", "no", "Enter your username and password.");
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const j = await post({ action: "adminLogin", user, pass });
    if (j.ok) admSignedIn(j.token);
    else box("admLoginErr", "no", j.message || "Couldn’t sign in.");
  } catch { box("admLoginErr", "no", "Can’t reach the server. Check your connection."); }
  finally { btn.disabled = false; btn.textContent = "Sign in"; }
});
$("#admOut").addEventListener("click", async () => { await admCall("adminLogout"); admSignedOut(); atoast("Signed out."); });

/* ---------- comment prompt (status changes + deletes) ---------- */
function askComment(title, desc, okLabel) {
  return new Promise(res => {
    $("#cmTitle").textContent = title; $("#cmDesc").textContent = desc; $("#cmText").value = ""; $("#cmOk").textContent = okLabel || "Continue";
    const m = $("#cmModal"); m.classList.add("show"); setTimeout(() => $("#cmText").focus(), 50);
    const done = v => { m.classList.remove("show"); $("#cmOk").onclick = $("#cmNo").onclick = null; res(v); };
    $("#cmOk").onclick = () => done($("#cmText").value.trim());
    $("#cmNo").onclick = () => done(null);
  });
}

/* ---------- dashboard ---------- */
async function admLoad(silent) {
  const j = await admCall("adminList");
  if (!j.ok) { if (j.error !== "auth") atoast(j.message || "Couldn’t load bookings.", true); return; }
  const pendingNow = j.bookings.filter(b => b.status === "Pending").length;
  if (silent && adm.lastPending !== null && pendingNow > adm.lastPending) atoast("🔔 New booking request!");
  adm.lastPending = pendingNow;
  const sig = JSON.stringify([j.bookings.map(b => [b.id, b.status, b.date, b.slot, b.name, b.phone, b.total, b.adminNote, b.services.length]), j.blocked]);
  const changed = sig !== adm.sig; adm.sig = sig; adm.data = j;
  $("#admUpdated").innerHTML = `Live · updated ${nowTime()} PHT`;
  if (changed || !silent) admRender();
  if (!adm.timer || !adm._on) { adm._on = true; clearInterval(adm.timer); adm.timer = setInterval(() => { if (!$("#admin").hidden && adm.token) admLoad(true); }, 5000); }
}
const byAppt = (a, b) => apptDate(a.date, a.slot) - apptDate(b.date, b.slot);
function admRender() {
  const d = adm.data; if (!d) return;
  const B = d.bookings, now = Date.now(), today = todayPH();
  const pending = B.filter(b => b.status === "Pending").sort(byAppt);
  const upcoming = B.filter(b => b.status === "Confirmed" && apptDate(b.date, b.slot) >= now - 2 * 36e5).sort(byAppt);
  const todays = B.filter(b => ACTIVE.includes(b.status) && b.date === today).length;
  const conflicts = B.filter(b => b.conflict).length;
  $("#admStats").innerHTML = `
    <div class="stat"><b>${pending.length}</b><span>Pending</span></div>
    <div class="stat"><b>${upcoming.length}</b><span>Confirmed upcoming</span></div>
    <div class="stat"><b>${todays}</b><span>Today</span></div>
    <div class="stat ${conflicts ? "alert" : ""}"><b>${conflicts}</b><span>Conflicts</span></div>`;
  $$("#admTabs .tab").forEach(t => t.classList.toggle("on", t.dataset.tab === adm.tab));
  let html = "";
  if (adm.tab === "cal") html = calHtml();
  else if (adm.tab === "pending") html = pending.length ? pending.map(bkCard).join("") : `<p class="empty">No pending requests 🎉</p>`;
  else if (adm.tab === "upcoming") html = upcoming.length ? upcoming.map(bkCard).join("") : `<p class="empty">No confirmed upcoming appointments yet.</p>`;
  else if (adm.tab === "all") {
    const q = adm.q.toLowerCase();
    const list = B.filter(b => !q || [b.id, b.name, b.phone, b.social].join(" ").toLowerCase().includes(q)).sort(byAppt);
    html = `<div class="field"><input type="text" id="admSearch" placeholder="Search name, number, ID…" value="${esc(adm.q)}"></div>` + (list.length ? list.map(bkCard).join("") : `<p class="empty">No bookings found.</p>`);
  } else html = slotsHtml();
  const active = document.activeElement && document.activeElement.id;
  $("#admContent").innerHTML = html;
  if (active === "admSearch") { const s = $("#admSearch"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
}
function bkCard(b) {
  const phone = esc(b.phone), tel = digits(b.phone);
  let acts = "";
  if (b.status === "Pending") acts = `<button class="btn btn-ok btn-sm" data-act="Confirmed" data-id="${esc(b.id)}">✓ Confirm</button><button class="btn btn-danger btn-sm" data-act="Declined" data-id="${esc(b.id)}">✕ Decline</button>`;
  else if (b.status === "Confirmed") acts = `<button class="btn btn-danger btn-sm" data-act="Cancelled" data-id="${esc(b.id)}">Cancel booking</button><button class="btn btn-soft btn-sm" data-act="Pending" data-id="${esc(b.id)}">Back to pending</button>`;
  else acts = `<button class="btn btn-soft btn-sm" data-act="Pending" data-id="${esc(b.id)}">Restore as pending</button>`;
  acts += `<button class="btn btn-ghost btn-sm" data-edit="${esc(b.id)}">✎ Edit</button><button class="btn btn-danger btn-sm" data-del="${esc(b.id)}">🗑 Delete</button>`;
  return `<article class="bk ${b.conflict ? "conf" : ""}">
    <header><b>${esc(b.id)}</b><span class="status st-${esc(b.status)}">${esc(b.status)}</span>${b.conflict ? `<span class="flag">⚠ Scheduling conflict</span>` : ""}</header>
    <div class="when">📅 ${shortDate(b.date)} · ${slotLabel(b.slot)}</div>
    <div class="ln">👤 <b>${esc(b.name)}</b> · <a href="tel:${esc(tel)}">${phone}</a> · <a href="sms:${esc(tel)}">Text</a> · ${esc(b.social)}</div>
    <div class="ln">💅 ${b.services.map(s => esc(s.name)).join(", ")}</div>
    <div class="ln">₱ <b>${Number(b.total).toLocaleString("en-PH")}</b> · ${esc(b.clients)} client${b.clients > 1 ? "s" : ""} · ☕ ${esc(b.drink && b.drink !== "No drink" ? b.drink : "no drink")}</div>
    ${b.design ? `<div class="ln">📝 ${esc(b.design)}</div>` : ""}
    ${b.photos.length ? `<div class="ln">🖼 ${b.photos.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">Photo ${i + 1}</a>`).join(" · ")}</div>` : ""}
    ${b.adminNote ? `<div class="note">💬 Your note to client: ${esc(b.adminNote)}</div>` : ""}
    <div class="ln hint">Submitted ${esc(b.submitted)}</div>
    <div class="acts">${acts}</div></article>`;
}
/* ---------- live calendar ---------- */
const pretty = d => new Date(d + "T12:00:00+08:00").toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric", year: "numeric" });
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
function calHtml() {
  const d = adm.data, today = todayPH();
  if (!adm.calMonth) adm.calMonth = today.slice(0, 7);
  if (!adm.calDay) adm.calDay = today;
  const [y, m] = adm.calMonth.split("-").map(Number);
  const startDow = new Date(y, m - 1, 1).getDay(), days = new Date(y, m, 0).getDate();
  const by = {}; d.bookings.forEach(b => (by[b.date] = by[b.date] || []).push(b));
  const blockedDays = new Set(d.blocked.filter(b => b.slot === "ALL").map(b => b.date));
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= days; day++) {
    const date = ymd(y, m, day), list = (by[date] || []).filter(b => ACTIVE.includes(b.status)).sort((a, b) => a.slot.localeCompare(b.slot));
    const chips = list.slice(0, 3).map(b => `<span class="chip st-${b.status}${b.conflict ? " bad" : ""}">${slotLabel(b.slot).replace(":00", "").replace(" ", "")} ${esc(b.name.split(" ")[0])}</span>`).join("");
    cells += `<button type="button" class="cal-cell${date === today ? " today" : ""}${date === adm.calDay ? " sel" : ""}${date < today ? " past" : ""}" data-calday="${date}">
      <span class="dn">${day}</span>${list.length ? `<span class="cnt">${list.length}</span>` : ""}${blockedDays.has(date) ? `<span class="blk">🚫</span>` : ""}
      <span class="chips">${chips}${list.length > 3 ? `<span class="more">+${list.length - 3} more</span>` : ""}</span></button>`;
  }
  const dayList = (by[adm.calDay] || []);
  const rows = CONFIG.SLOTS.map(sl => {
    const here = dayList.filter(b => b.slot === sl.key).sort((a, b) => ACTIVE.includes(b.status) - ACTIVE.includes(a.status));
    const bl = d.blocked.find(b => b.date === adm.calDay && (b.slot === sl.key || b.slot === "ALL"));
    const free = !here.some(b => ACTIVE.includes(b.status)) && !bl;
    return `<div class="dayslot"><div class="dt"><b>${sl.label}</b></div><div class="dcards">
      ${here.map(bkCard).join("")}
      ${bl && !here.length ? `<div class="openrow">🚫 Blocked${bl.reason ? " — " + esc(bl.reason) : ""}</div>` : ""}
      ${free && apptDate(adm.calDay, sl.key) > Date.now() ? `<button class="openrow add" type="button" data-newat="${sl.key}">＋ Open — add appointment</button>` : (free && !here.length ? `<div class="openrow">Free (time passed)</div>` : "")}
    </div></div>`;
  }).join("");
  const activeCount = dayList.filter(b => ACTIVE.includes(b.status)).length;
  return `<div class="cal">
    <div class="cal-head"><button class="btn btn-soft btn-sm" type="button" data-calnav="-1">‹</button><h3>${MONTHS[m - 1]} ${y}</h3><button class="btn btn-soft btn-sm" type="button" data-calnav="1">›</button><button class="btn btn-ghost btn-sm" type="button" data-calnav="today">Today</button></div>
    <div class="cal-legend"><span class="chip st-Pending">Pending</span><span class="chip st-Confirmed">Confirmed</span><span class="hint">Tap a day to see every client’s schedule</span></div>
    <div class="cal-grid"><div class="dow">Sun</div><div class="dow">Mon</div><div class="dow">Tue</div><div class="dow">Wed</div><div class="dow">Thu</div><div class="dow">Fri</div><div class="dow">Sat</div>${cells}</div>
    <div class="dayhead"><h3>${pretty(adm.calDay)}</h3><span class="hint">${activeCount} appointment${activeCount === 1 ? "" : "s"}</span></div>
    ${rows}</div>`;
}

function slotsHtml() {
  const d = adm.data, date = adm.date || todayPH();
  const rows = CONFIG.SLOTS.map(s => {
    const bk = d.bookings.find(b => ACTIVE.includes(b.status) && b.date === date && b.slot === s.key);
    const bl = d.blocked.find(b => b.date === date && (b.slot === s.key || b.slot === "ALL"));
    const past = apptDate(date, s.key) <= Date.now();
    let state, btn = "";
    if (bk) { state = `<span class="status st-${bk.status}">${bk.status}</span> ${esc(bk.name)}`; btn = `<button class="btn btn-ghost btn-sm" data-edit="${esc(bk.id)}">✎ Edit</button>`; }
    else if (bl) { state = `🚫 Blocked${bl.reason ? " — " + esc(bl.reason) : ""}${bl.slot === "ALL" ? " (whole day)" : ""}`; if (bl.slot === s.key) btn = `<button class="btn btn-soft btn-sm" data-unblock="${s.key}">Unblock</button>`; }
    else { state = past ? `<span class="hint">Time has passed</span>` : `<span style="color:var(--ok)">✓ Open</span>`; btn = `<button class="btn btn-soft btn-sm" data-newat="${s.key}">＋ Add</button>` + (!past ? `<button class="btn btn-danger btn-sm" data-block="${s.key}">Block</button>` : ""); }
    return `<div class="srow"><div><b>${s.label}</b><br>${state}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${btn}</div></div>`;
  }).join("");
  const wholeBlocked = d.blocked.some(b => b.date === date && b.slot === "ALL");
  const upcomingBlocks = d.blocked.filter(b => b.date >= todayPH()).sort((a, b) => a.date.localeCompare(b.date));
  return `<div class="acard" style="max-width:none;margin:0 0 16px">
    <div class="grid2"><div class="field"><label class="lbl" for="admDate">Date</label><input type="date" id="admDate" value="${date}"></div>
    <div class="field"><label class="lbl" for="admReason">Reason (optional)</label><input type="text" id="admReason" placeholder="Rest day, holiday, personal…" maxlength="100"></div></div>
    ${rows}
    <div class="acts" style="display:flex;gap:8px;margin-top:12px">
      ${wholeBlocked ? `<button class="btn btn-soft btn-sm" data-unblock="ALL">Unblock whole day</button>` : `<button class="btn btn-danger btn-sm" data-block="ALL">Block whole day</button>`}
    </div></div>
    <div class="acard" style="max-width:none;margin:0"><h3 style="font-size:1.3rem">Upcoming blocks</h3>
    ${upcomingBlocks.length ? upcomingBlocks.map(b => `<div class="srow"><div>${shortDate(b.date)} · <b>${b.slot === "ALL" ? "All day" : slotLabel(b.slot)}</b>${b.reason ? `<br><span class="hint">${esc(b.reason)}</span>` : ""}</div><button class="btn btn-soft btn-sm" data-rmblock="${b.date}|${b.slot}">Remove</button></div>`).join("") : `<p class="empty" style="padding:12px">Nothing blocked.</p>`}</div>`;
}

/* ---------- add / edit appointment ---------- */
function openEditor(id, preset) {
  const b = id ? adm.data.bookings.find(x => x.id === id) : null;
  adm.editing = b ? b.id : null;
  $("#apTitle").textContent = b ? `Edit ${b.id}` : "New appointment";
  $("#apSlot").innerHTML = CONFIG.SLOTS.map(s => `<option value="${s.key}">${s.label}</option>`).join("");
  $("#apStatus").innerHTML = ["Pending", "Confirmed", "Declined", "Cancelled"].map(s => `<option>${s}</option>`).join("");
  $("#apDrink").innerHTML = ["No drink", ...CONFIG.DRINKS.map(d => d.name)].map(s => `<option>${esc(s)}</option>`).join("");
  const have = new Set(b ? b.services.map(s => s.name) : []);
  $("#apServices").innerHTML = CONFIG.SERVICES.map(c => `<div class="svc-group"><h4>${esc(c.category)}</h4>${c.items.map(i =>
    `<label class="chk sm"><input type="checkbox" data-apsvc="${i.id}" ${have.has(i.name) ? "checked" : ""}><span class="t">${esc(i.name)}</span><span class="p">${peso(i.price)}</span></label>`).join("")}</div>`).join("");
  adm.extraSvc = b ? b.services.filter(s => !ALL_SERVICES.some(x => x.name === s.name)) : [];
  const v = (k, d = "") => b ? (b[k] == null ? d : b[k]) : d;
  $("#apName").value = v("name"); $("#apPhone").value = v("phone"); $("#apSocial").value = v("social");
  $("#apDate").value = b ? b.date : ((preset && preset.date) || adm.date || todayPH()); $("#apSlot").value = b ? b.slot : ((preset && preset.slot) || CONFIG.SLOTS[0].key);
  $("#apStatus").value = b ? b.status : "Confirmed"; $("#apClients").value = v("clients", 1); $("#apDrink").value = v("drink") || "No drink";
  $("#apTotal").value = ""; $("#apDesign").value = v("design"); $("#apComment").value = "";
  $("#apDelete").hidden = !b; box("apErr", "no", "");
  $("#apptModal").classList.add("show");
}
$("#admNew").addEventListener("click", () => openEditor(null));
$("#apCancel").addEventListener("click", () => $("#apptModal").classList.remove("show"));
$("#apForm").addEventListener("submit", async e => {
  e.preventDefault();
  const services = [...ALL_SERVICES.filter(s => $(`[data-apsvc="${s.id}"]`).checked).map(s => ({ name: s.name, price: s.price })), ...adm.extraSvc];
  if (!services.length) return box("apErr", "no", "Pick at least one service.");
  const payload = { id: adm.editing, name: $("#apName").value, phone: $("#apPhone").value, social: $("#apSocial").value,
    date: $("#apDate").value, slot: $("#apSlot").value, status: $("#apStatus").value, clients: $("#apClients").value, services,
    drink: $("#apDrink").value, total: $("#apTotal").value, design: $("#apDesign").value, comment: $("#apComment").value.trim() };
  const btn = $("#apSave"); btn.disabled = true; btn.textContent = "Saving…";
  const j = await admCall("adminSave", payload);
  btn.disabled = false; btn.textContent = "Save";
  if (j.ok) { $("#apptModal").classList.remove("show"); atoast("Saved ✔"); await admLoad(); }
  else box("apErr", "no", j.message || "Couldn’t save.");
});
async function deleteBooking(id) {
  const b = adm.data.bookings.find(x => x.id === id);
  const c = await askComment("Delete this appointment?", `${b.name} · ${shortDate(b.date)} ${slotLabel(b.slot)}. This can’t be undone.`, "Delete");
  if (c === null) return;
  const j = await admCall("adminDelete", { id });
  if (j.ok) { $("#apptModal").classList.remove("show"); atoast("Deleted."); await admLoad(); } else atoast(j.message || "Couldn’t delete.", true);
}
$("#apDelete").addEventListener("click", () => deleteBooking(adm.editing));

/* ---------- dashboard clicks ---------- */
$("#admin").addEventListener("click", async e => {
  const cd = e.target.closest("[data-calday]");
  if (cd) { adm.calDay = cd.dataset.calday; adm.date = adm.calDay; adm.calMonth = adm.calDay.slice(0, 7); admRender(); const dh = $(".dayhead"); if (dh && window.innerWidth < 900) dh.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const cn = e.target.closest("[data-calnav]");
  if (cn) {
    const v = cn.dataset.calnav, today = todayPH();
    if (v === "today") { adm.calMonth = today.slice(0, 7); adm.calDay = today; }
    else { let [y, m] = adm.calMonth.split("-").map(Number); m += Number(v); if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } adm.calMonth = `${y}-${String(m).padStart(2, "0")}`; }
    adm.date = adm.calDay; admRender(); return;
  }
  const tab = e.target.closest("[data-tab]");
  if (tab) { adm.tab = tab.dataset.tab; admRender(); return; }
  if (e.target.closest("#admRefresh")) { await admLoad(); atoast("Refreshed."); return; }
  const act = e.target.closest("[data-act]");
  if (act) {
    const status = act.dataset.act, b = adm.data.bookings.find(x => x.id === act.dataset.id);
    const c = await askComment(`Mark as ${status}`, `${b.name} · ${shortDate(b.date)} ${slotLabel(b.slot)}." Add an optional note the client will see on their “My Booking” page:"`, `Mark ${status}`);
    if (c === null) return;
    const j = await admCall("adminSetStatus", { id: act.dataset.id, status, comment: c });
    if (j.ok) { atoast(`Marked ${status} ✔`); await admLoad(); } else atoast(j.message || "Couldn’t update.", true);
    return;
  }
  const ed = e.target.closest("[data-edit]"); if (ed) { openEditor(ed.dataset.edit); return; }
  const dl = e.target.closest("[data-del]"); if (dl) { deleteBooking(dl.dataset.del); return; }
  const na = e.target.closest("[data-newat]"); if (na) { openEditor(null, { date: adm.tab === "cal" ? adm.calDay : (adm.date || todayPH()), slot: na.dataset.newat }); return; }
  const blk = e.target.closest("[data-block]");
  if (blk) {
    const j = await admCall("adminBlock", { date: adm.date || todayPH(), slot: blk.dataset.block, reason: ($("#admReason") || {}).value || "" });
    if (j.ok) { atoast(j.existing ? `Blocked. Note: ${j.existing} existing booking(s) in that time are unchanged.` : "Blocked."); await admLoad(); } else atoast(j.message || "Couldn’t block.", true);
    return;
  }
  const ub = e.target.closest("[data-unblock]");
  if (ub) { const j = await admCall("adminUnblock", { date: adm.date || todayPH(), slot: ub.dataset.unblock }); if (j.ok) { atoast("Unblocked."); await admLoad(); } else atoast(j.message || "Couldn’t unblock.", true); return; }
  const rb = e.target.closest("[data-rmblock]");
  if (rb) { const [date, slot] = rb.dataset.rmblock.split("|"); const j = await admCall("adminUnblock", { date, slot }); if (j.ok) { atoast("Removed."); await admLoad(); } else atoast(j.message || "Couldn’t remove.", true); }
});
$("#admin").addEventListener("input", e => { if (e.target.id === "admSearch") { adm.q = e.target.value; admRender(); } });
$("#admin").addEventListener("change", e => { if (e.target.id === "admDate") { adm.date = e.target.value; admRender(); } });
