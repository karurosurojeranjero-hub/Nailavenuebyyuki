# Nail Avenue by Yuki

Node.js + SQLite. HTML, CSS and JavaScript are separate files:

```
public/index.html        page structure
public/css/styles.css    styling
public/js/config.js      prices, services, policies (edit here)
public/js/booking.js     customer booking + "My Booking"
public/js/admin.js       admin dashboard + live calendar
server.js  db.js         server + SQL database (data/nailavenue.db)
```

## Run
1. Install **Node.js LTS** (22.13 or newer) from nodejs.org — once.
2. Double-click **start.bat** → opens http://localhost:3000. (Don't open index.html directly.)
3. Click **🔐 Admin** (top menu) and sign in. Username `YUKI`, password as set in `.env`.

## Share a link
Keep start.bat running, double-click **share.bat**, send the `https://….trycloudflare.com` link it prints.
Your computer must stay on; the link changes each time. Close share.bat (or start.bat) to shut it off.

## Change the admin login
Edit `ADMIN_USER` / `ADMIN_PASS` in `.env`, close and re-run start.bat. All old sessions are signed out.

## Admin
- **Calendar** updates live (every 5 seconds). Tap a day to see every client's schedule for that day, by time slot.
  Confirm, decline, cancel, edit, delete, or add an appointment right from the day view.
- Pending / Upcoming / All lists with search, plus Slots & blocking for rest days.
- Your note on an appointment shows on the client's "My Booking" page. No emails are sent.
- 5 wrong passwords pauses sign-in for 15 minutes.
