// Sends email through Gmail SMTP (nodemailer). If SMTP isn't configured yet, emails are
// printed in the server console instead so you can still test everything locally.
let nodemailer = null;
try { nodemailer = require("nodemailer"); } catch {}

const USER = process.env.SMTP_USER || "";
const PASS = (process.env.SMTP_PASS || "").replace(/\s+/g, "");
const FROM = `"Nail Avenue by Yuki" <${USER || "nailavenuebyyuki@gmail.com"}>`;
const missingConfig = [
  ...(!nodemailer ? ["nodemailer dependency"] : []),
  ...(!USER ? ["SMTP_USER"] : []),
  ...(!PASS ? ["SMTP_PASS"] : [])
];
const live = missingConfig.length === 0;
const transport = live ? nodemailer.createTransport({ service: "gmail", auth: { user: USER, pass: PASS } }) : null;

const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function layout(title, body) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#fbf6ee;padding:24px">
  <div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e7d8c6;border-radius:16px;padding:26px;color:#3a2619">
    <h2 style="margin:0 0 4px;color:#5b3a29;font-family:Georgia,serif">Nail Avenue by Yuki</h2>
    <p style="margin:0 0 18px;color:#8a6350;font-style:italic">When Nails Meet Coffee ☕</p>
    <h3 style="margin:0 0 12px;color:#5b3a29">${esc(title)}</h3>${body}
    <p style="margin-top:24px;font-size:12px;color:#8a6350">This is an automatic message. Please don’t reply to this email.</p>
  </div></div>`;
}
const btn = (href, label, bg) =>
  `<a href="${esc(href)}" style="display:inline-block;margin:6px 8px 6px 0;padding:12px 22px;border-radius:999px;background:${bg};color:#fff;text-decoration:none;font-weight:bold">${esc(label)}</a>`;

async function send(to, subject, html) {
  if (!to) return false;
  if (!live) {
    console.log(`\n📧 [EMAIL NOT SENT — SMTP not set up] To: ${to}\n   Subject: ${subject}\n   ${html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g, "\n   → $2: $1\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim()}\n`);
    return false;
  }
  try { await transport.sendMail({ from: FROM, to, subject, html }); return true; }
  catch (e) { console.error("Email failed:", e.message); return false; }
}

module.exports = { send, layout, btn, esc, live, missingConfig };
