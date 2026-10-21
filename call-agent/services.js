/* ============================================================
   ResumeIQ shared service catalogue
   Used by BOTH the phone AI agent (call-agent/server.js)
   and optionally by the website chat widget.
   ➜ EDIT SERVICES & PRICES HERE (then also update ai-agent.js
      on the website so chat + phone stay in sync).
   ============================================================ */

const SERVICES = [
  { id: "resume-writing", name: "Professional Resume Writing",   price: 499, delivery: "24 to 48 hours",   icon: "📝" },
  { id: "resume-review",  name: "Resume Review and Score Report", price: 299, delivery: "12 to 24 hours",  icon: "🔍" },
  { id: "linkedin",       name: "LinkedIn Profile Makeover",     price: 699, delivery: "24 to 48 hours",   icon: "💼" },
  { id: "cover-letter",   name: "Cover Letter Writing",          price: 349, delivery: "24 hours",         icon: "✉️" },
  { id: "job-post",       name: "Premium Job Posting for 30 days", price: 999, delivery: "live in 2 hours", icon: "📢" },
  { id: "career-call",    name: "One-on-one Career Guidance Call, 30 minutes", price: 799, delivery: "slot within 24 hours", icon: "🎯" },
];

const REFUND_POLICY =
  "Full refund if work has not started. Once work has begun, 50 percent is refundable. After delivery, no refund, but we fix issues free within 7 days.";

module.exports = { SERVICES, REFUND_POLICY };
