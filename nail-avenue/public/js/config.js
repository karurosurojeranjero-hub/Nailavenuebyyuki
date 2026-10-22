/* =====================================================================
   EDIT ME — everything customers see (prices, policies, links) lives here
   ===================================================================== */
const CONFIG = {
  // The local Node server (server.js) answers at /api. Leave as is.
  API_URL: "/api",

  // Editable social links. Leave "" to hide a button.
  FACEBOOK_URL: "",
  INSTAGRAM_URL: "",

  DAYS_AHEAD: 60,          // how far ahead customers can book
  CANCEL_HOURS: 24,        // must cancel at least this many hours before the appointment

  SLOTS: [
    { key: "10:00", label: "10:00 AM" },
    { key: "12:00", label: "12:00 PM" },
    { key: "15:00", label: "3:00 PM"  },
    { key: "18:00", label: "6:00 PM"  },
    { key: "21:00", label: "9:00 PM"  }
  ],

  SERVICES: [
    { category: "Gel Manicure", items: [
      { id: "gm-plain",   name: "Gel Manicure (Plain)",          price: 350 },
      { id: "gm-minimal", name: "Gel Manicure (Minimal Design)", price: 400 },
      { id: "gm-full",    name: "Gel Manicure (Full Design)",    price: 450 } ]},
    { category: "Hard Gel Overlay", items: [
      { id: "hg-plain",   name: "Hard Gel (Plain)",       price: 400 },
      { id: "hg-minimal", name: "Hard Gel (Minimal)",     price: 450 },
      { id: "hg-full",    name: "Hard Gel (Full Design)", price: 500 } ]},
    { category: "Nail Extensions", items: [
      { id: "ne-plain",   name: "Nail Extensions (Plain)",          price: 450 },
      { id: "ne-minimal", name: "Nail Extensions (Minimal Design)", price: 550 },
      { id: "ne-full",    name: "Nail Extensions (Full Design)",    price: 700 } ]},
    { category: "Gel Pedicure", items: [
      { id: "gp-basic", name: "Gel Pedicure",                price: 300 },
      { id: "gp-barbie", name: "Barbie Toe Nails (Pedicure)", price: 400 } ]},
    { category: "Removal Services", items: [
      { id: "rm-gel",  name: "Gel Removal",                       price: 50  },
      { id: "rm-mine", name: "Extension Removal (My Work)",       price: 100 },
      { id: "rm-other",name: "Extension Removal (Not My Work)",   price: 150 } ]}
  ],

  // Add an `img: "photos/spanish-latte.jpg"` to any drink to show a photo on its card.
  DRINKS: [
    { name: "Iced Spanish Latte", emoji: "🥛" },
    { name: "Iced Americano",     emoji: "🧊" },
    { name: "Iced Matcha Latte",  emoji: "🍵" },
    { name: "Dalgona Coffee",     emoji: "☕" }
  ],

  POLICIES: [
    "Nail Avenue by Yuki is a home-based nail studio.",
    "The studio has a simple home-based setup and does not offer the same ambiance as a commercial salon.",
    "The studio uses an electric fan instead of air conditioning.",
    "No male companions are allowed.",
    "Only one female companion or one child is allowed per client.",
    "Pets are not allowed.",
    "Food and drinks are allowed.",
    "Cancellations are allowed only at least 24 hours before your appointment time. Appointments within 24 hours can no longer be cancelled.",
    "Customers must provide accurate contact and appointment information.",
    "Appointment requests are not automatically confirmed. Customers must wait for the owner’s confirmation."
  ],

  // "Pick Your Look" photos. Swap the files in /photos or change the paths.
  GALLERY: [
    { label: "Plain Nails",     desc: "Clean, glossy and effortless.",  src: "photos/plain.jpg"   },
    { label: "Minimal Designs", desc: "A little something extra.",      src: "photos/minimal.jpg" },
    { label: "Full Designs",    desc: "Statement sets, every detail.",  src: "photos/full.jpg"    }
  ]
};
