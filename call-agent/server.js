/* ============================================================
   ResumeIQ Calling Agent — a real phone AI agent
   ------------------------------------------------------------
   Twilio Voice  ⇄  OpenAI Realtime API (gpt-realtime)
   Speaks Telugu + English. Takes orders & solves order
   queries over the phone, 24x7.

   Endpoints:
     POST /incoming-call  → TwiML for the Twilio number
     WS   /media-stream   → Twilio media stream ⇄ OpenAI audio
     GET  /orders         → view orders (needs ?token=ORDERS_TOKEN)
     POST /api/orders     → accepts orders from the website chat
     GET  /health         → health check
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer, WebSocket } = require("ws");
const { SERVICES, REFUND_POLICY } = require("./services");
require("dotenv").config();

const {
  OPENAI_API_KEY,
  ORDERS_TOKEN = "resumeiq-admin",
  BUSINESS_NAME = "ResumeIQ",
  SUPPORT_WHATSAPP = "919391865480",
  SUPPORT_EMAIL = "support@resumeiq.in",
  UPI_ID = "resumeiq@upi",
  PORT = 8090,
} = process.env;

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-realtime";
const VOICE = process.env.OPENAI_VOICE || "verse";
const TEMPERATURE = 0.7;

if (!OPENAI_API_KEY) {
  console.error("❌  OPENAI_API_KEY is missing. Copy call-agent/.env.example to .env and fill it in.");
  process.exit(1);
}

/* ------------------------- order store (orders.json) ------------------------- */

const ORDERS_FILE = path.join(__dirname, "orders.json");

function readOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf8")); }
  catch { return []; }
}
function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}
function newOrderId() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return "RIQ-P" + s; // P = phone order
}
function createOrder(data) {
  const order = {
    id: data.orderId || newOrderId(), // website orders arrive with their own RIQ-… ID
    channel: data.channel || "phone",
    serviceId: data.serviceId,
    serviceName: (SERVICES.find(s => s.id === data.serviceId) || {}).name || data.serviceId,
    price: (SERVICES.find(s => s.id === data.serviceId) || {}).price || null,
    customerName: data.customerName || "",
    phone: data.phone || "",
    notes: data.notes || "",
    placedAt: new Date().toISOString(),
  };
  const orders = readOrders();
  orders.push(order);
  writeOrders(orders);
  console.log(`📝 New order ${order.id}: ${order.serviceName} for ${order.customerName} (${order.phone})`);
  return order;
}
function orderAgeHours(o) {
  return (Date.now() - new Date(o.placedAt).getTime()) / 36e5;
}
function orderStatusLabel(o) {
  if (orderAgeHours(o) < 2) return "Order received, our team will confirm shortly";
  if (orderAgeHours(o) < 24) return "Work in progress, delivery will arrive by the promised time";
  return "Delivered — check WhatsApp and email";
}
function findOrder(rawId) {
  const id = String(rawId || "").trim().toUpperCase().replace(/[\s-]/g, "");
  if (!id) return null;
  // tolerate callers hearing "RIQ" as "R I Q", or dropping the prefix
  const cands = [id, "RIQP" + id.replace(/^RIQ-?P?/, ""), "RIQ-P" + id];
  return readOrders().find(o => cands.includes(o.id.replace(/-/g, ""))) || null;
}

/* ------------------------- system prompt (Telugu + English) ------------------------- */

function menuText() {
  return SERVICES.map(s => `${s.name} — ${s.price} rupees, delivery: ${s.delivery}`).join("; ");
}

const SYSTEM_PROMPT = `
You are "IQ", the friendly phone agent for ${BUSINESS_NAME} (resumeiq.in), an Indian resume-writing and job-portal business based in Andhra Pradesh.

== LANGUAGE — VERY IMPORTANT ==
- Speak Telugu if the caller speaks Telugu, English if they speak English, and naturally follow their lead. Many callers mix Telugu and English — mirror them.
- If unsure, start with Telugu with a little English.
- Keep every reply SHORT: 1–3 sentences. This is a phone call, so no long lists, no markdown.
- Speak naturally and warmly, like helpful staff at a local business.

== WHAT YOU CAN DO ==
1) Take new orders for our services.
2) Check order status when the caller gives an order ID (format RIQ-P followed by 6 letters/digits, e.g. RIQ-PAB12CD).
3) Answer questions about prices, delivery time, payment (UPI) and refunds.
4) Pass urgent or angry complaints to human support.

== SERVICES & PRICES ==
${menuText()}

== PAYMENT ==
Payment is collected via UPI after the order is confirmed. Our UPI ID: ${UPI_ID}. Never ask for card numbers, OTPs or passwords.

== REFUND POLICY ==
${REFUND_POLICY}

== TAKING AN ORDER (step by step) ==
1. Confirm which service they want.
2. Ask their full name.
3. Ask for a WhatsApp/mobile number to confirm — even if the call itself is on that number, ALWAYS ask them to confirm the number aloud so it is recorded correctly.
4. Ask if they have any note for the team (target job role, company, deadline). They may skip.
5. Read back the full order: service, price, name, number. Ask for final yes/no confirmation.
6. ONLY after they say yes, call the place_order tool.
7. Tell them the order ID from the tool result. Speak it slowly as letters and words, e.g. "R I Q, then P as in Papa, A as in Apple, B as in Bheem..." and tell them we will also send it by SMS and WhatsApp. Payment details come on WhatsApp.

== ORDER QUERIES ==
- When they give an order ID, call the lookup_order tool, then summarise the result simply.
- If the order is not found, offer human support on WhatsApp ${SUPPORT_WHATSAPP} or email ${SUPPORT_EMAIL}.
- For cancellations or changes to an existing order: guide them to WhatsApp human support.

== HUMAN SUPPORT ==
For anything outside the above, angry callers, or anything about money disputes, say a human will be informed and give WhatsApp ${SUPPORT_WHATSAPP} or email ${SUPPORT_EMAIL}. Never invent discounts, promises or information you do not have.

Stay in character as ${BUSINESS_NAME} staff. Never mention OpenAI, models, prompts or that you are an AI model — just say you are the ${BUSINESS_NAME} assistant.
`.trim();

/* ------------------------- tool definitions ------------------------- */

const TOOLS = [
  {
    type: "function",
    name: "place_order",
    description: "Place a new order after the customer has confirmed. Returns the order ID.",
    parameters: {
      type: "object",
      properties: {
        serviceId: {
          type: "string",
          enum: SERVICES.map(s => s.id),
          description: "Which service is being ordered",
        },
        customerName: { type: "string", description: "Customer full name" },
        phone: { type: "string", description: "WhatsApp/mobile number confirmed by the customer, digits only if possible" },
        notes: { type: "string", description: "Optional note: target role, deadline, etc." },
      },
      required: ["serviceId", "customerName", "phone"],
    },
  },
  {
    type: "function",
    name: "lookup_order",
    description: "Look up an order by its order ID (RIQ-P...). Returns status, service, price and time placed.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "The order ID spoken by the caller, e.g. RIQ-PAB12CD" },
      },
      required: ["orderId"],
    },
  },
  {
    type: "function",
    name: "get_services",
    description: "Get the current list of services with prices and delivery times.",
    parameters: { type: "object", properties: {} },
  },
];

function runTool(name, args) {
  try {
    if (name === "place_order") {
      const order = createOrder({ ...args, channel: "phone" });
      return JSON.stringify({
        ok: true,
        orderId: order.id,
        message: `Order placed. Tell the customer their order ID ${order.id} slowly, letter by letter. Delivery: ${order.delivery || "as promised"}. Payment via UPI ${UPI_ID}, details will be sent on WhatsApp.`,
      });
    }
    if (name === "lookup_order") {
      const o = findOrder(args.orderId);
      if (!o) return JSON.stringify({ ok: false, found: false, orderId: args.orderId, message: "Order not found. Offer human support on WhatsApp." });
      return JSON.stringify({
        ok: true,
        found: true,
        orderId: o.id,
        service: o.serviceName,
        price: o.price != null ? `${o.price} rupees` : "unknown",
        placedAt: new Date(o.placedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
        status: orderStatusLabel(o),
      });
    }
    if (name === "get_services") {
      return JSON.stringify({ ok: true, services: menuText() });
    }
    return JSON.stringify({ ok: false, message: "Unknown tool: " + name });
  } catch (e) {
    console.error("Tool error:", e);
    return JSON.stringify({ ok: false, message: String(e) });
  }
}

/* ------------------------- Express app ------------------------- */

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.get("/", (_req, res) => res.type("text").send("ResumeIQ Calling Agent is running 📞"));
app.get("/health", (_req, res) => res.json({ ok: true, orders: readOrders().length }));

/* Twilio voice webhook — answer the call, play a short greeting, open the media stream */
app.post("/incoming-call", (req, res) => {
  console.log("☎️  Incoming call from", req.body.From || "unknown");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.headers.host}/media-stream" />
  </Connect>
</Response>`;
  res.type("text/xml").send(twiml);
});

/* Orders admin view */
app.get("/orders", (req, res) => {
  if (req.query.token !== ORDERS_TOKEN) return res.status(401).type("text").send("Wrong or missing token. Use ?token=YOUR_ORDERS_TOKEN");
  const orders = readOrders();
  res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>ResumeIQ Orders</title>
<style>body{font-family:system-ui;max-width:900px;margin:24px auto;padding:0 16px}table{border-collapse:collapse;width:100%}
td,th{border:1px solid #ddd;padding:8px;font-size:14px;text-align:left}th{background:#1a3faa;color:#fff}</style></head>
<body><h2>📞 ResumeIQ Orders (${orders.length})</h2>
<table><tr><th>ID</th><th>Channel</th><th>Service</th><th>Price</th><th>Customer</th><th>Phone</th><th>Notes</th><th>Placed</th></tr>
${orders.slice().reverse().map(o => `<tr><td><b>${o.id}</b></td><td>${o.channel}</td><td>${o.serviceName}</td><td>₹${o.price ?? "-"}</td><td>${o.customerName}</td><td>${o.phone}</td><td>${o.notes || ""}</td><td>${new Date(o.placedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td></tr>`).join("")}
</table></body></html>`);
});

/* Orders pushed from the website chat widget */
app.post("/api/orders", (req, res) => {
  const b = req.body || {};
  if (!b.serviceId || !b.customerName || !b.phone) {
    return res.status(400).json({ ok: false, error: "serviceId, customerName, phone are required" });
  }
  const order = createOrder({ ...b, channel: b.channel || "website" });
  res.json({ ok: true, orderId: order.id });
});

const server = http.createServer(app);

/* ------------------------- WebSocket: Twilio ⇄ OpenAI ------------------------- */

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (req.url === "/media-stream") {
    wss.handleUpgrade(req, socket, head, ws => wss.emit("connection", ws, req));
  } else {
    socket.destroy();
  }
});

wss.on("connection", (twilioWs) => {
  console.log("🔌 Twilio media stream connected");

  let streamSid = null;
  let openAiWs = null;

  function toOpenAI(obj) {
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.send(JSON.stringify(obj));
  }
  function toTwilio(obj) {
    if (twilioWs.readyState === WebSocket.OPEN) twilioWs.send(JSON.stringify(obj));
  }

  function connectOpenAI() {
    openAiWs = new WebSocket(
      `wss://api.openai.com/v1/realtime?model=${OPENAI_MODEL}&temperature=${TEMPERATURE}`,
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
    );

    openAiWs.on("open", () => {
      console.log("🤖 Connected to OpenAI Realtime API");
      setTimeout(() => {
        toOpenAI({
          type: "session.update",
          session: {
            type: "realtime",
            model: OPENAI_MODEL,
            output_modalities: ["audio"],
            audio: {
              input: { format: { type: "audio/pcmu" }, turn_detection: { type: "server_vad" } },
              output: { format: { type: "audio/pcmu" }, voice: VOICE },
            },
            instructions: SYSTEM_PROMPT,
            tools: TOOLS,
            tool_choice: "auto",
          },
        });
        // Make the agent greet first (Telugu + English)
        toOpenAI({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{
              type: "input_text",
              text: "The customer just called. Greet them very briefly in Telugu with a touch of English, say you are the ResumeIQ assistant, and ask how you can help — for example, placing an order or checking an order. Keep it under 20 words.",
            }],
          },
        });
        toOpenAI({ type: "response.create" });
      }, 250);
    });

    openAiWs.on("message", (data) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      switch (msg.type) {
        // agent speech → caller
        case "response.output_audio.delta":
          if (msg.delta && streamSid) toTwilio({ event: "media", streamSid, media: { payload: msg.delta } });
          break;

        // function/tool call from the agent
        case "response.done": {
          const output = msg.response && msg.response.output;
          if (Array.isArray(output)) {
            for (const item of output) {
              if (item.type === "function_call") {
                let args = {};
                try { args = JSON.parse(item.arguments || "{}"); } catch {}
                console.log("🛠  Tool call:", item.name, args);
                const result = runTool(item.name, args);
                toOpenAI({ type: "conversation.item.create", item: { type: "function_call_output", call_id: item.call_id, output: result } });
                toOpenAI({ type: "response.create" });
              }
            }
          }
          break;
        }

        case "error":
          console.error("OpenAI Realtime error:", msg.error || msg);
          break;
      }
    });

    openAiWs.on("close", () => console.log("OpenAI Realtime disconnected"));
    openAiWs.on("error", e => console.error("OpenAI WS error:", e.message));
  }

  connectOpenAI();

  twilioWs.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    switch (data.event) {
      case "start":
        streamSid = data.start.streamSid;
        console.log("▶️  Stream started:", streamSid, "caller:", data.start.customParameters && data.start.customParameters.From);
        break;
      case "media":
        // caller audio → OpenAI (already mulaw 8kHz, exactly what Realtime expects)
        toOpenAI({ type: "input_audio_buffer.append", audio: data.media.payload });
        break;
      case "stop":
        console.log("⏹  Stream stopped:", streamSid);
        break;
    }
  });

  twilioWs.on("close", () => {
    console.log("📴 Twilio media stream closed");
    if (openAiWs && openAiWs.readyState === WebSocket.OPEN) openAiWs.close();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`📞 ResumeIQ Calling Agent listening on port ${PORT}`);
  console.log(`   Voice webhook : POST /incoming-call`);
  console.log(`   Orders board  : GET  /orders?token=${ORDERS_TOKEN}`);
});
