/* ============================================================
   ResumeIQ AI Agent — Order Taking & Order Query Assistant
   ------------------------------------------------------------
   Self-contained: no backend, no API key needed. Works on
   static hosting (GitHub Pages). Orders are stored in the
   visitor's browser (localStorage) and sent to you via the
   WhatsApp confirmation link.

   ➜ EDIT THE CONFIG BLOCK BELOW to match your business.
   ============================================================ */

const AGENT_CONFIG = {
  businessName: "ResumeIQ",
  agentName: "IQ",

  // ➜ Put your WhatsApp number here (country code + number, digits only)
  whatsapp: "919999999999",

  // ➜ Your support email
  email: "support@resumeiq.in",

  // ➜ Your UPI ID shown at payment step (set to "" to hide)
  upiId: "resumeiq@upi",

  // ➜ Your calling-agent phone number, e.g. "+1 415 555 0123"
  //    When set, a "Call our AI agent" button appears on the site.
  //    Leave "" to hide it.
  agentPhone: "",

  // ➜ URL of the calling-agent server (call-agent/), e.g.
  //    "https://resumeiq-agent.onrender.com". When set, chat orders
  //    are also saved on that server (visible in its /orders board).
  apiBase: "",

  // ➜ EDIT YOUR SERVICES & PRICES HERE
  services: [
    { id: "resume-writing",  name: "Professional Resume Writing",    price: 499,  delivery: "24–48 hours", icon: "📝" },
    { id: "resume-review",   name: "Resume Review & Score Report",   price: 299,  delivery: "12–24 hours", icon: "🔍" },
    { id: "linkedin",        name: "LinkedIn Profile Makeover",      price: 699,  delivery: "24–48 hours", icon: "💼" },
    { id: "cover-letter",    name: "Cover Letter Writing",           price: 349,  delivery: "24 hours",    icon: "✉️" },
    { id: "job-post",        name: "Premium Job Posting (30 days)",  price: 999,  delivery: "Live in 2 hours", icon: "📢" },
    { id: "career-call",     name: "1:1 Career Guidance Call (30m)", price: 799,  delivery: "Slot in 24 hours", icon: "🎯" },
  ],

  refundPolicy:
    "Full refund if we haven't started your order. Once work has begun, 50% is refundable. After delivery, no refund — but we'll fix issues free within 7 days.",
};

/* ================= Internals (no need to edit below) ================= */

(function () {
  "use strict";
  const C = AGENT_CONFIG;
  const LS_ORDERS = "riq_orders";
  const LS_CHAT = "riq_chat";

  /* ---------- storage ---------- */
  function getOrders() {
    try { return JSON.parse(localStorage.getItem(LS_ORDERS)) || []; }
    catch (e) { return []; }
  }
  function saveOrder(o) {
    const all = getOrders();
    all.push(o);
    try { localStorage.setItem(LS_ORDERS, JSON.stringify(all)); } catch (e) {}
    // Sync to the calling-agent server if configured (fire & forget)
    if (C.apiBase) {
      try {
        fetch(C.apiBase.replace(/\/$/, "") + "/api/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "website",
            orderId: o.id,
            serviceId: o.serviceId,
            customerName: o.name,
            phone: o.contact,
            notes: o.notes || "",
          }),
        }).catch(function () {});
      } catch (e) {}
    }
    return o;
  }
  function findOrder(id) {
    id = String(id).trim().toUpperCase();
    return getOrders().find(o => o.id === id) || null;
  }

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }
  function fmtINR(n) { return "₹" + Number(n).toLocaleString("en-IN"); }
  function newOrderId() {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return "RIQ-" + s;
  }
  function waLink(text) {
    return "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(text);
  }
  function orderStatus(o) {
    const ageH = (Date.now() - o.placedAt) / 36e5;
    if (o.cancelled) return { label: "❌ Cancelled", note: "This order was cancelled. Refund (if applicable) takes 3–5 business days." };
    if (ageH < 2)  return { label: "🕐 Order received", note: "Our team has your order and will confirm on WhatsApp/email shortly." };
    if (ageH < 24) return { label: "⚙️ In progress", note: "Work on your order has started. You'll get the delivery on email/WhatsApp." };
    return { label: "✅ Delivered", note: "This order was delivered. Check your email/WhatsApp — if anything is missing, tap the support options below." };
  }
  function orderCard(o) {
    const st = orderStatus(o);
    const svc = C.services.find(s => s.id === o.serviceId) || { name: o.serviceId, icon: "🧾" };
    return (
      `<div class="riq-card">` +
      `<div class="riq-card-head">${svc.icon} <strong>${esc(svc.name || "Service")}</strong></div>` +
      `<div class="riq-row"><span>Order ID</span><b>${esc(o.id)}</b></div>` +
      `<div class="riq-row"><span>Placed</span><b>${new Date(o.placedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</b></div>` +
      `<div class="riq-row"><span>Amount</span><b>${fmtINR(o.price)}</b></div>` +
      `<div class="riq-row"><span>Status</span><b>${st.label}</b></div>` +
      `<div class="riq-note">${esc(st.note)}</div>` +
      `</div>`
    );
  }

  /* ---------- build UI ---------- */
  const style = document.createElement("style");
  style.textContent = `
  #riq-fab{position:fixed;right:20px;bottom:20px;z-index:9999;width:60px;height:60px;border-radius:50%;
    background:linear-gradient(135deg,#0f2680,#1a3faa 55%,#2563eb);border:none;cursor:pointer;
    box-shadow:0 8px 24px rgba(15,38,128,.45);display:flex;align-items:center;justify-content:center;
    transition:transform .2s;}
  #riq-fab:hover{transform:scale(1.07)}
  #riq-call{position:fixed;right:20px;bottom:92px;z-index:9998;display:flex;align-items:center;gap:8px;
    background:#fff;border:2px solid #4ade80;color:#111827;text-decoration:none;padding:10px 16px;
    border-radius:30px;font-family:'DM Sans',system-ui,sans-serif;font-size:13.5px;font-weight:600;
    box-shadow:0 8px 24px rgba(17,24,39,.18);transition:transform .2s}
  #riq-call:hover{transform:scale(1.05)}
  #riq-call .riq-call-dot{width:9px;height:9px;border-radius:50%;background:#22c55e;animation:riqpulse 1.4s infinite}
  @keyframes riqpulse{0%,100%{opacity:1}50%{opacity:.3}}
  @media (max-width:480px){#riq-call{right:12px;bottom:86px}}
  #riq-fab svg{width:30px;height:30px;fill:#fff}
  #riq-fab .riq-dot{position:absolute;top:4px;right:4px;width:12px;height:12px;border-radius:50%;
    background:#f97316;border:2px solid #fff}
  #riq-panel{position:fixed;right:20px;bottom:92px;z-index:9999;width:370px;max-width:calc(100vw - 24px);
    height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;overflow:hidden;
    display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(17,24,39,.28);
    opacity:0;pointer-events:none;transform:translateY(14px);transition:opacity .22s,transform .22s;
    font-family:'DM Sans',system-ui,sans-serif;}
  #riq-panel.open{opacity:1;pointer-events:auto;transform:translateY(0)}
  .riq-head{background:linear-gradient(135deg,#0f2680,#1a3faa 60%,#2563eb);color:#fff;padding:14px 16px;
    display:flex;align-items:center;gap:11px}
  .riq-avatar{width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;
    align-items:center;justify-content:center;font-size:19px;flex:none}
  .riq-head h3{margin:0;font-family:'Syne',sans-serif;font-size:16px;font-weight:700}
  .riq-head p{margin:1px 0 0;font-size:11.5px;opacity:.8}
  .riq-head .riq-online{display:inline-block;width:7px;height:7px;border-radius:50%;background:#4ade80;margin-right:4px}
  .riq-close{margin-left:auto;background:rgba(255,255,255,.14);border:none;color:#fff;width:28px;height:28px;
    border-radius:8px;cursor:pointer;font-size:15px;line-height:1}
  .riq-body{flex:1;overflow-y:auto;padding:14px 12px;background:#f7f8fc;display:flex;flex-direction:column;gap:10px}
  .riq-msg{max-width:86%;padding:9px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}
  .riq-msg.bot{background:#fff;border:1px solid rgba(0,0,0,.08);border-bottom-left-radius:4px;align-self:flex-start;
    box-shadow:0 1px 3px rgba(0,0,0,.05)}
  .riq-msg.user{background:#1a3faa;color:#fff;border-bottom-right-radius:4px;align-self:flex-end}
  .riq-msg a{color:#1a3faa;font-weight:600;text-decoration:underline}
  .riq-msg.user a{color:#ffe4cf}
  .riq-chips{display:flex;flex-wrap:wrap;gap:7px;align-self:flex-start;max-width:96%}
  .riq-chip{background:#fff;border:1.5px solid #1a3faa;color:#1a3faa;font-size:12.5px;font-weight:600;
    padding:7px 13px;border-radius:20px;cursor:pointer;transition:all .15s;font-family:inherit}
  .riq-chip:hover{background:#1a3faa;color:#fff}
  .riq-chip.accent{border-color:#f97316;color:#f97316}
  .riq-chip.accent:hover{background:#f97316;color:#fff}
  .riq-card{background:#fff;border:1px solid rgba(0,0,0,.09);border-radius:12px;padding:12px;margin-top:6px}
  .riq-card-head{font-size:14px;margin-bottom:8px}
  .riq-row{display:flex;justify-content:space-between;font-size:12.5px;color:#6b7280;padding:3px 0}
  .riq-row b{color:#111827;font-weight:600}
  .riq-note{font-size:12px;color:#6b7280;margin-top:8px;line-height:1.45;border-top:1px dashed rgba(0,0,0,.1);padding-top:8px}
  .riq-input-row{display:flex;gap:8px;padding:11px 12px;background:#fff;border-top:1px solid rgba(0,0,0,.08)}
  .riq-input-row input{flex:1;border:1.5px solid rgba(0,0,0,.12);border-radius:10px;padding:10px 13px;
    font-size:13.5px;font-family:inherit;outline:none}
  .riq-input-row input:focus{border-color:#1a3faa}
  .riq-send{background:#f97316;border:none;color:#fff;width:42px;border-radius:10px;cursor:pointer;font-size:16px;flex:none}
  .riq-send:hover{background:#ea6a0c}
  .riq-typing{align-self:flex-start;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:14px;
    border-bottom-left-radius:4px;padding:10px 14px;display:flex;gap:4px}
  .riq-typing span{width:6px;height:6px;border-radius:50%;background:#9ca3af;animation:riqblink 1.2s infinite}
  .riq-typing span:nth-child(2){animation-delay:.2s}.riq-typing span:nth-child(3){animation-delay:.4s}
  @keyframes riqblink{0%,80%,100%{opacity:.25}40%{opacity:1}}
  @media (max-width:480px){#riq-panel{right:12px;bottom:86px;height:70vh}}
  `;
  document.head.appendChild(style);

  const fab = document.createElement("button");
  fab.id = "riq-fab";
  fab.setAttribute("aria-label", "Chat with " + C.agentName);
  fab.innerHTML =
    `<svg viewBox="0 0 24 24"><path d="M12 2a9.5 9.5 0 0 0-9.5 9.5c0 1.7.45 3.3 1.24 4.68L2.5 21.5l5.5-1.4A9.46 9.46 0 0 0 12 21.5 9.5 9.5 0 0 0 12 2zm-4 8h8v1.8H8V10zm0-3h8v1.8H8V7z"/></svg><span class="riq-dot"></span>`;

  let callPill = null;
  if (C.agentPhone) {
    callPill = document.createElement("a");
    callPill.id = "riq-call";
    callPill.href = "tel:" + C.agentPhone.replace(/[^\d+]/g, "");
    callPill.innerHTML = `<span class="riq-call-dot"></span>📞 Call our AI agent <b style="color:#1a3faa">${esc(C.agentPhone)}</b>`;
    document.body.appendChild(callPill);
  }

  const panel = document.createElement("div");
  panel.id = "riq-panel";
  panel.innerHTML =
    `<div class="riq-head">
       <div class="riq-avatar">🤖</div>
       <div>
         <h3>${esc(C.agentName)} — ${esc(C.businessName)} Assistant</h3>
         <p><span class="riq-online"></span>Online · orders &amp; order queries</p>
       </div>
       <button class="riq-close" id="riq-close" aria-label="Close">✕</button>
     </div>
     <div class="riq-body" id="riq-body"></div>
     <div class="riq-input-row">
       <input id="riq-input" type="text" placeholder="Type a message…" autocomplete="off" />
       <button class="riq-send" id="riq-send" aria-label="Send">➤</button>
     </div>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const body = panel.querySelector("#riq-body");
  const input = panel.querySelector("#riq-input");

  let opened = false;
  let greeted = false;
  let flow = null;          // active conversation flow
  let draft = {};           // order draft

  fab.addEventListener("click", toggle);
  panel.querySelector("#riq-close").addEventListener("click", toggle);
  panel.querySelector("#riq-send").addEventListener("click", submit);
  input.addEventListener("keydown", e => { if (e.key === "Enter") submit(); });

  function toggle() {
    opened = !opened;
    panel.classList.toggle("open", opened);
    if (callPill) callPill.style.display = opened ? "none" : "flex";
    if (opened) {
      input.focus();
      if (!greeted) { greeted = true; greet(); }
    }
  }

  /* ---------- rendering ---------- */
  function addMsg(text, who) {
    const d = document.createElement("div");
    d.className = "riq-msg " + who;
    d.innerHTML = text;   // text is already escaped / built by us
    body.appendChild(d);
    scrollDown();
  }
  function addChips(chips) {
    const row = document.createElement("div");
    row.className = "riq-chips";
    chips.forEach(c => {
      const b = document.createElement("button");
      b.className = "riq-chip" + (c.accent ? " accent" : "");
      b.textContent = c.label;
      b.onclick = () => { row.remove(); onUser(c.label); handle(c.value != null ? c.value : c.label); };
      row.appendChild(b);
    });
    body.appendChild(row);
    scrollDown();
  }
  function showTyping(ms, done) {
    const t = document.createElement("div");
    t.className = "riq-typing";
    t.innerHTML = "<span></span><span></span><span></span>";
    body.appendChild(t);
    scrollDown();
    setTimeout(() => { t.remove(); done(); }, ms);
  }
  function bot(text, chips, delay) {
    showTyping(delay == null ? 420 : delay, () => {
      addMsg(text, "bot");
      if (chips) addChips(chips);
    });
  }
  function scrollDown() { body.scrollTop = body.scrollHeight; }

  function onUser(text) { addMsg(esc(text), "user"); }
  function submit() {
    const t = input.value.trim();
    if (!t) return;
    input.value = "";
    onUser(t);
    handle(t);
  }

  /* ---------- flows ---------- */
  function greet() {
    bot(
      `Hi! 👋 I'm <b>${esc(C.agentName)}</b>, the ${esc(C.businessName)} assistant.<br>I can take new orders, track existing ones, and answer questions about pricing, delivery &amp; refunds.` +
      (C.agentPhone ? `<br>📞 Prefer talking? Call me at <a href="tel:${esc(C.agentPhone.replace(/[^\d+]/g, ""))}">${esc(C.agentPhone)}</a> — I speak Telugu too!` : "") +
      `<br><br>How can I help you today?`,
      [
        { label: "🛒 Place an order", value: "ORDER" },
        { label: "🔎 Track my order", value: "TRACK" },
        { label: "💰 Pricing", value: "PRICE" },
        { label: "🧾 My orders", value: "MYORDERS" },
        { label: "🙋 Talk to support", value: "HUMAN", accent: true },
      ],
      500
    );
  }

  const mainChips = () => [
    { label: "🛒 Place an order", value: "ORDER" },
    { label: "🔎 Track an order", value: "TRACK" },
    { label: "🙋 Support", value: "HUMAN", accent: true },
  ];

  function startOrder() {
    flow = { step: "service" };
    draft = {};
    const svcChips = C.services.map(s => ({
      label: `${s.icon} ${s.name} — ${fmtINR(s.price)}`,
      value: "SVC:" + s.id,
    }));
    svcChips.push({ label: "↩ Cancel", value: "CANCEL", accent: true });
    bot("Great! Which service would you like to order? 👇", svcChips);
  }

  function humanLinks(extraText) {
    const wa = waLink((extraText || "Hi ResumeIQ, I need help with my order.") );
    return (
      `You can reach a real human here:<br>` +
      `• <a href="${wa}" target="_blank" rel="noopener">WhatsApp us</a> (fastest ⚡)<br>` +
      `• Email: <a href="mailto:${esc(C.email)}">${esc(C.email)}</a><br>` +
      `We usually reply within 2–4 hours (9am–9pm IST).`
    );
  }

  function handle(raw) {
    const text = String(raw).trim();
    const low = text.toLowerCase();

    /* ----- active flow handling ----- */
    if (flow) {
      if (/^(cancel|↩ cancel|quit|exit|nevermind)$/i.test(low)) {
        flow = null; draft = {};
        bot("No problem, order cancelled. Anything else I can help with? 😊", mainChips());
        return;
      }
      if (flow.step === "service" && text.indexOf("SVC:") === 0) {
        const svc = C.services.find(s => s.id === text.slice(4));
        if (svc) {
          draft.service = svc;
          flow.step = "name";
          bot(
            `Nice choice! ${svc.icon} <b>${esc(svc.name)}</b> — <b>${fmtINR(svc.price)}</b> (delivered in ${esc(svc.delivery)}).<br><br>What's your full name?`,
            null, 380
          );
          return;
        }
      }
      if (flow.step === "name") {
        if (text.length < 2) { bot("That name looks too short — mind typing your full name?"); return; }
        draft.name = text;
        flow.step = "contact";
        bot(`Thanks ${esc(draft.name.split(" ")[0])}! 📱 What's your <b>WhatsApp number or email</b> for delivery updates?`, null, 380);
        return;
      }
      if (flow.step === "contact") {
        const isPhone = /^[+]?[\d\s-]{10,14}$/.test(text);
        const isEmail = /\S+@\S+\.\S+/.test(text);
        if (!isPhone && !isEmail) {
          bot("Hmm, that doesn't look like a phone number or email. Could you double-check and send it again?");
          return;
        }
        draft.contact = text;
        flow.step = "notes";
        bot(
          `Got it ✅ Any notes for our team?<br><i>(target role, company, deadline… or type <b>skip</b>)</i>`,
          null, 380
        );
        return;
      }
      if (flow.step === "notes") {
        draft.notes = /^skip$/i.test(low) ? "" : text;
        flow.step = "confirm";
        const s = draft.service;
        bot(
          `<div class="riq-card">` +
            `<div class="riq-card-head">${s.icon} <strong>${esc(s.name)}</strong></div>` +
            `<div class="riq-row"><span>Name</span><b>${esc(draft.name)}</b></div>` +
            `<div class="riq-row"><span>Contact</span><b>${esc(draft.contact)}</b></div>` +
            (draft.notes ? `<div class="riq-row"><span>Notes</span><b>${esc(draft.notes)}</b></div>` : "") +
            `<div class="riq-row"><span>Total</span><b>${fmtINR(s.price)}</b></div>` +
          `</div>Shall I confirm this order?`,
          [
            { label: "✅ Confirm order", value: "CONFIRM" },
            { label: "✏️ Start over", value: "CANCEL" },
          ]
        );
        return;
      }
      if (flow.step === "confirm") {
        if (/^(confirm|✅ confirm order|yes|y|haa(n)?|ok|okay)$/i.test(low)) {
          placeOrder();
          return;
        }
        bot("Just to be sure — confirm the order or start over? 👇", [
          { label: "✅ Confirm order", value: "CONFIRM" },
          { label: "✏️ Start over", value: "CANCEL" },
        ]);
        return;
      }
    }

    /* ----- special commands ----- */
    if (text === "ORDER") { startOrder(); return; }
    if (text === "CONFIRM") { return; } // only valid inside flow
    if (text === "CANCEL") {
      bot("No worries! What else can I help with?", mainChips());
      return;
    }
    if (text === "TRACK") { trackAsk(); return; }
    if (text === "MYORDERS") { myOrders(); return; }
    if (text === "PRICE") { pricing(); return; }
    if (text === "HUMAN") { bot(humanLinks(), mainChips()); return; }

    if (text.indexOf("SVC:") === 0) { // stray service chip
      startOrder(); return;
    }

    /* ----- order ID anywhere in the message ----- */
    const idMatch = text.toUpperCase().match(/RIQ-[A-Z0-9]{4,8}/);
    if (idMatch) { trackShow(idMatch[0]); return; }

    /* ----- intent matching ----- */
    if (/(order|buy|book|purchase|kharid|chahiye|new service|place)/.test(low) && !/(where|status|track|refund|cancel)/.test(low)) {
      startOrder(); return;
    }
    if (/(track|status|where.*(order)|order.*(where|status)|kaha|deliver.*(my|order)|my order)/.test(low)) {
      trackAsk(); return;
    }
    if (/(refund|money back|paisa wapas|cancel.*order|return)/.test(low)) {
      bot(
        `Here's our refund policy 🤝<br><br>${esc(C.refundPolicy)}<br><br>To cancel an order, send me its order ID (like <b>RIQ-AB12CD</b>) or tap support below.`,
        [{ label: "🔎 Track / cancel an order", value: "TRACK" }, { label: "🙋 Support", value: "HUMAN", accent: true }]
      );
      return;
    }
    if (/(price|pricing|cost|rate|fees|charge|kitna|how much)/.test(low)) { pricing(); return; }
    if (/(deliver|how long|time (taken|to)|kab tak|when.*(get|receive))/i.test(low)) {
      bot(
        `⏱️ Typical delivery times:<br><br>` +
        C.services.map(s => `${s.icon} <b>${esc(s.name)}</b> — ${esc(s.delivery)}`).join("<br>") +
        `<br><br>You'll receive your delivery on WhatsApp/email. Track anytime with your order ID!`,
        [{ label: "🛒 Place an order", value: "ORDER" }]
      );
      return;
    }
    if (/(pay|payment|upi|gpay|phonepe|paytm|card|cash)/.test(low)) {
      bot(
        `💳 After you place an order here, payment is collected via <b>UPI / WhatsApp</b> — no advance payment needed to book.` +
        (C.upiId ? `<br><br>Our UPI ID: <b>${esc(C.upiId)}</b>` : "") +
        `<br><br>Prefer to pay another way? Tap support and we'll sort it out.` ,
        [{ label: "🛒 Place an order", value: "ORDER" }, { label: "🙋 Support", value: "HUMAN", accent: true }]
      );
      return;
    }
    if (/(human|agent|support|contact|help me|call|whatsapp|talk)/.test(low)) {
      bot(humanLinks(), mainChips());
      return;
    }
    if (/(job|naukri|hiring|apply|vacancy)/.test(low)) {
      bot(
        `For jobs, you're in the right place! 🎯<br>• Browse <a href="index.html#jobs">all jobs</a><br>• <a href="fresher-jobs.html">Fresher jobs</a><br>• <a href="experience-jobs.html">Jobs by experience</a><br>• Employers: <a href="post-job.html">post a job</a><br><br>Anything else — like ordering a service?`,
        mainChips()
      );
      return;
    }
    if (/(resume|cv|biodata)/.test(low) && /(make|build|create|banau|kaise)/.test(low)) {
      bot(`You can build a resume free right now with our <a href="resume-builder.html">Resume Builder</a> ✨ — or order a <b>Professional Resume Writing</b> service and our experts write it for you.`, [{ label: "🛒 Order resume writing", value: "SVC:resume-writing" }]);
      return;
    }
    if (/^(hi|hello|hey|namaste|hii+|good (morning|afternoon|evening))\b/.test(low)) {
      greet(); return;
    }
    if (/(thank|thanks|shukriya|dhanyavad)/.test(low)) {
      bot(`You're most welcome! 🙌 Anything else?`, mainChips());
      return;
    }
    if (/^(bye|goodbye|see you|ok bye)/.test(low)) {
      bot(`Bye! 👋 Your orders are saved on this device — come back anytime with your order ID.`, null);
      return;
    }

    /* ----- fallback ----- */
    bot(
      `I didn't fully catch that 🤔 I'm best at:<br>• 🛒 Taking new orders<br>• 🔎 Tracking orders (paste your <b>RIQ-…</b> order ID)<br>• 💰 Pricing, delivery &amp; refund questions<br><br>Or tap one of these:`,
      mainChips()
    );
  }

  /* ---------- order placement ---------- */
  function placeOrder() {
    const s = draft.service;
    const order = {
      id: newOrderId(),
      serviceId: s.id,
      serviceName: s.name,
      price: s.price,
      name: draft.name,
      contact: draft.contact,
      notes: draft.notes || "",
      placedAt: Date.now(),
      cancelled: false,
    };
    saveOrder(order);
    flow = null;
    draft = {};

    const waText =
      `Hi ${C.businessName}! I just placed an order.\n` +
      `Order ID: ${order.id}\nService: ${s.name}\nAmount: ${fmtINR(s.price)}\n` +
      `Name: ${order.name}\nContact: ${order.contact}` +
      (order.notes ? `\nNotes: ${order.notes}` : "") +
      `\nPlease confirm & share payment details.`;

    bot(
      `🎉 <b>Order confirmed!</b>` +
      `<div class="riq-card">` +
        `<div class="riq-row"><span>Order ID</span><b>${order.id}</b></div>` +
        `<div class="riq-row"><span>Service</span><b>${esc(s.name)}</b></div>` +
        `<div class="riq-row"><span>Amount</span><b>${fmtINR(s.price)}</b></div>` +
        `<div class="riq-row"><span>Delivery</span><b>${esc(s.delivery)}</b></div>` +
      `</div>` +
      `Save your order ID: <b>${order.id}</b>.<br><br>` +
      `To lock it in, confirm on WhatsApp and our team will share payment details 👇<br>` +
      `<a href="${waLink(waText)}" target="_blank" rel="noopener">✅ Confirm on WhatsApp</a>`,
      [
        { label: "🛒 Order another service", value: "ORDER" },
        { label: "🧾 My orders", value: "MYORDERS" },
        { label: "🏠 Done", value: "DONE" },
      ],
      600
    );
  }

  /* ---------- tracking ---------- */
  function trackAsk() {
    const orders = getOrders();
    if (orders.length) {
      bot(
        `Sure! Here are the orders placed from this device 👇 Or paste any order ID (like <b>RIQ-AB12CD</b>).`,
        orders.slice(-3).reverse().map(o => ({ label: `${o.id} · ${fmtINR(o.price)}`, value: o.id }))
          .concat([{ label: "↩ Back", value: "DONE", accent: true }])
      );
    } else {
      bot(`Sure! Please paste your order ID — it looks like <b>RIQ-AB12CD</b> and was shown when you ordered.<br><br>Lost it? Tap support and we'll find it for you.`,
        [{ label: "🙋 Support", value: "HUMAN", accent: true }]);
    }
  }
  function trackShow(id) {
    const o = findOrder(id);
    if (!o) {
      bot(
        `I couldn't find order <b>${esc(id)}</b> on this device 🤔<br><br>` +
        `• Orders placed on a different phone/browser won't show here.<br>` +
        `• Double-check the ID for typos.<br>` +
        `• Still stuck? Our team can find it via WhatsApp:`,
        [{ label: "🙋 Support on WhatsApp", value: "HUMAN", accent: true }]
      );
      return;
    }
    const waText = `Hi ${C.businessName}, I have a query about order ${o.id} (${o.serviceName}).`;
    bot(
      orderCard(o) +
      `<div style="margin-top:8px;font-size:13px">Need changes or cancellation on this order? ` +
      `<a href="${waLink(waText)}" target="_blank" rel="noopener">Message us on WhatsApp</a>.</div>`,
      [
        { label: "🔎 Track another order", value: "TRACK" },
        { label: "🛒 Place an order", value: "ORDER" },
      ]
    );
  }
  function myOrders() {
    const orders = getOrders();
    if (!orders.length) {
      bot(`You haven't placed any orders from this device yet. Want to start one? 😊`, [{ label: "🛒 Place an order", value: "ORDER" }]);
      return;
    }
    bot(
      `Here are your orders on this device 🧾<br><br>` +
      orders.slice(-4).reverse().map(orderCard).join(""),
      [{ label: "🛒 Place an order", value: "ORDER" }]
    );
  }
  function pricing() {
    bot(
      `Here's our full menu 💰<br><br>` +
      C.services.map(s => `${s.icon} <b>${esc(s.name)}</b> — ${fmtINR(s.price)} <i style="color:#6b7280">(${esc(s.delivery)})</i>`).join("<br>") +
      `<br><br>Tap a service to order it 👇`,
      C.services.map(s => ({ label: `${s.icon} ${fmtINR(s.price)} Order`, value: "SVC:" + s.id }))
        .concat([{ label: "↩ Back", value: "DONE", accent: true }])
    );
  }

  /* DONE chip = back to menu */
  const _origHandle = handle;
  handle = function (raw) {
    if (raw === "DONE") { greet(); return; }
    _origHandle(raw);
  };
})();
