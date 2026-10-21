# 📞 ResumeIQ Calling Agent

A **real phone AI agent** for ResumeIQ. Customers dial your number and talk to "IQ" in **Telugu or English** — it takes orders, checks order status, and answers pricing/delivery/refund questions. Built on **Twilio Voice + OpenAI Realtime API** (`gpt-realtime`), running on a small Node.js server.

```
Customer phone ──▶ Twilio number ──▶ this server ──▶ OpenAI Realtime (gpt-realtime)
                                        │
                                        ├── place_order   → saved to orders.json
                                        ├── lookup_order  → reads orders.json
                                        └── get_services  → prices from services.js
```

## What it costs (roughly)

| Item | Cost |
|---|---|
| Twilio phone number | ~₹100/month ($1.15) |
| Twilio call minutes | ~₹1–2/min |
| OpenAI Realtime (gpt-realtime) | ~₹8–10/min of audio |

A typical 2-minute order call ≈ **₹20–25**. Cheap compared to a missed customer!

---

## Setup (one time, ~30 minutes)

### 1. Get an OpenAI API key
1. Go to https://platform.openai.com/api-keys → create a key.
2. **Top up credits** (Realtime API needs paid tier): https://platform.openai.com/settings → Billing → add ₹500–₹1000 to start.

### 2. Get a Twilio number
1. Sign up at https://www.twilio.com/try (free trial gives ~$15).
2. Console → **Phone Numbers → Buy a Number** → pick a **US number** for testing (voice-enabled, ~$1/mo).
3. Copy your **Account SID** and **Auth Token** (Console home page).

> 🇮🇳 **Getting a +91 Indian number:** Twilio +91 numbers have TRAI compliance requirements (KYC, limited voice availability). For a real +91 number, Indian providers like **Exotel**, **Gupshup** or **Knowlarity** are the practical route — the server architecture stays the same (they support similar call-stream webhooks). Start with the Twilio US number to test today; you can even forward a +91 number to it later.

### 3. Deploy this server (free tier is fine)
The server must be at a **public HTTPS/WSS address** (Twilio needs to reach it).

**Option A — Render (recommended, free):**
1. Push this repo to GitHub (already done if you're reading this there).
2. Go to https://render.com → New → **Web Service** → pick this repo.
3. Set **Root Directory** to `call-agent`, build command `npm install`, start command `npm start`.
4. Environment → add the variables from `.env.example` (`OPENAI_API_KEY`, `ORDERS_TOKEN`, …).
5. Deploy. Note your URL, e.g. `https://resumeiq-agent.onrender.com`.

**Option B — local testing with ngrok:**
```bash
cd call-agent
cp .env.example .env      # fill in OPENAI_API_KEY
npm install
npm start                 # starts on port 8090
# in another terminal:
ngrok http 8090           # gives you https://xxxx.ngrok.app
```

### 4. Point the Twilio number at the server
Twilio Console → Phone Numbers → your number → **Voice & Fax**:
- *A call comes in* → **Webhook**
- URL: `https://YOUR-SERVER/incoming-call` (must be **HTTPS**)
- Method: **HTTP POST** → Save.

### 5. Call it! 🎉
Dial the Twilio number. You should hear the Telugu greeting and can say things like:
- *"నాకు రిజ్యూమ్ రాయించాలి"* (I want a resume written)
- *"RIQ-PAB12CD order status"*
- *"Cover letter price entha?"*

### 6. See the orders
- Admin board: `https://YOUR-SERVER/orders?token=YOUR_ORDERS_TOKEN`
- Every phone order is saved with the caller's details and marked `channel: phone`.

---

## Configure

| File | What you edit |
|---|---|
| `services.js` | Services & prices (the agent reads these automatically) |
| `server.js` → `SYSTEM_PROMPT` | Personality, language rules, policies |
| `.env` | API key, WhatsApp number, UPI ID, admin token |

## Website integration
The chat widget (`ai-agent.js` on the site) can push its orders to this same server — set `apiBase` in `AGENT_CONFIG` to your server URL, and `agentPhone` to show a **"Call our AI agent"** button on the website.

## Notes for India
- Twilio **trial accounts** can only receive calls from verified numbers (add your mobile in Console → Verified Caller IDs). Upgrade ($20, one-time) to accept any caller.
- The agent tells customers payment happens via UPI/WhatsApp **after** the order — no card/OTP details are ever asked.
- Order IDs for phone calls use the prefix **RIQ-P** so you can tell phone orders from website chat orders (**RIQ-**).

## Troubleshooting
| Problem | Fix |
|---|---|
| Silence when calling | Check the webhook URL is HTTPS and returns TwiML: open `https://YOUR-SERVER/` in a browser |
| "Error 12300" in Twilio | Webhook not reachable — check Render/ngrok is running |
| OpenAI auth error | `OPENAI_API_KEY` wrong, or no billing/credits on the OpenAI account |
| Agent answers in English only | It follows the caller; say *"Telugu lo cheppandi"* — language behaviour is in `SYSTEM_PROMPT` |
| Orders missing | They live in `orders.json` on the server's disk. On Render's free tier the disk resets on redeploy — move to a database or Google Sheet sync for production (ask me and I'll wire it up) |
