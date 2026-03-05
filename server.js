// ═══════════════════════════════════════════════════════════════
// VoiceAgent — Backend Proxy Server
// Your OpenAI API key lives HERE only. Users never see it.
// ═══════════════════════════════════════════════════════════════
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// ── API KEY: set via environment variable (never hardcode!) ──
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌  Missing OPENAI_API_KEY environment variable.');
  console.error('    Run: export OPENAI_API_KEY=sk-... then restart.');
  process.exit(1);
}

// ── Serve frontend static files ──
app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════════════
// BUSINESS DATA (your real data goes here)
// ═══════════════════════════════════════════════════════════════
const BUSINESS_DB = {
  hours:         "Monday–Friday: 9 AM – 6 PM | Saturday: 10 AM – 4 PM | Sunday: Closed",
  location:      "123 Innovation Drive, Suite 400, San Francisco, CA 94105",
  contact:       "Phone: (415) 555-0192 | Email: hello@voiceagent.ai | Live chat: 24/7",
  services:      "Consulting, Technical Support, Product Demos, Enterprise Onboarding, Custom Integrations",
  pricing:       "Starter: $49/mo | Professional: $149/mo | Enterprise: Custom. 14-day free trial on all plans.",
  refund_policy: "30-day full money-back guarantee. No questions asked. Cancel anytime."
};

const appointments = []; // in-memory store (swap for DB in production)

// ═══════════════════════════════════════════════════════════════
// TOOL EXECUTION
// ═══════════════════════════════════════════════════════════════
function executeTool(name, args) {
  if (name === 'get_business_info') {
    const t = args.info_type;
    if (t === 'all') return Object.entries(BUSINESS_DB).map(([k,v]) => `${k}: ${v}`).join(' | ');
    return BUSINESS_DB[t] || 'Information not available.';
  }

  if (name === 'book_appointment') {
    const ref = 'APT-' + Math.floor(Math.random() * 90000 + 10000);
    const appt = { ref, ...args, bookedAt: new Date().toISOString() };
    appointments.push(appt);
    console.log('[BOOKING]', appt);
    return `Appointment confirmed! Ref: ${ref} | Name: ${args.name} | Service: ${args.service} | Time: ${args.preferred_time}. Confirmation sent to email.`;
  }

  if (name === 'escalate_to_human') {
    console.log('[ESCALATION]', args.reason);
    return `Escalating now. Reason: ${args.reason}. Avg wait: 3 minutes. A team member will reach out shortly.`;
  }

  return 'Action completed.';
}

// ═══════════════════════════════════════════════════════════════
// OPENAI FUNCTION DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const FUNCTIONS = [
  {
    name: 'get_business_info',
    description: 'Get business details: hours, location, contact, services, pricing, or refund policy.',
    parameters: {
      type: 'object',
      properties: {
        info_type: {
          type: 'string',
          enum: ['hours', 'location', 'contact', 'services', 'pricing', 'refund_policy', 'all']
        }
      },
      required: ['info_type']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment for the customer.',
    parameters: {
      type: 'object',
      properties: {
        name:           { type: 'string', description: "Customer's full name" },
        service:        { type: 'string', description: 'Service to book' },
        preferred_time: { type: 'string', description: 'Preferred date and time' }
      },
      required: ['name', 'service', 'preferred_time']
    }
  },
  {
    name: 'escalate_to_human',
    description: 'Escalate to a human agent when requested or issue is too complex.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for escalation' }
      },
      required: ['reason']
    }
  }
];

const SYSTEM_PROMPT = `You are a professional, warm AI voice receptionist for VoiceAgent Inc.

Your job:
1. Answer questions using get_business_info when needed.
2. Book appointments with book_appointment — collect name, service, preferred time conversationally.
3. Escalate with escalate_to_human when user asks for a human or issue is complex.

Voice rules:
- Short, natural responses (2-3 sentences). No markdown or bullet points.
- Weave tool results into natural speech.
- Always confirm actions taken.
- Offer further help after each response.`;

// ═══════════════════════════════════════════════════════════════
// MAIN CHAT ENDPOINT — agentic loop runs server-side
// ═══════════════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    let history = [...messages];
    let finalText = '';
    let toolsUsed = [];

    // Agentic loop — runs entirely on the server
    while (true) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`   // ← key never leaves server
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          functions: FUNCTIONS,
          function_call: 'auto',
          max_tokens: 512,
          temperature: 0.6
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || `OpenAI error ${response.status}`);
      }

      const data = await response.json();
      const msg = data.choices[0].message;
      history.push(msg);

      if (msg.function_call) {
        // Execute tool server-side
        let args = {};
        try { args = JSON.parse(msg.function_call.arguments); } catch(e) {}
        const result = executeTool(msg.function_call.name, args);
        toolsUsed.push({ tool: msg.function_call.name, args, result });
        console.log(`[TOOL] ${msg.function_call.name}`, args, '->', result);

        history.push({ role: 'function', name: msg.function_call.name, content: result });
        continue; // loop again with tool result
      }

      // Final text response
      finalText = msg.content || '';
      break;
    }

    res.json({
      reply: finalText,
      toolsUsed,
      // Return updated history so frontend can send it next turn
      messages: history.filter(m => m.role !== 'system')
    });

  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', model: 'gpt-4o' }));

// View bookings (admin only — add auth middleware in production)
app.get('/api/appointments', (req, res) => res.json(appointments));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VoiceAgent server running at http://localhost:${PORT}`);
  console.log(`🔑  API key loaded: ${OPENAI_API_KEY.slice(0,8)}...`);
});
