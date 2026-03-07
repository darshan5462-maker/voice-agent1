// ═══════════════════════════════════════════════════════════════
// VoiceAgent — Backend Proxy Server
// Your OpenAI API key lives HERE only. Users never see it.
// ═══════════════════════════════════════════════════════════════
/*require('dotenv').config();
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
});*/


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error('❌  Missing OPENAI_API_KEY environment variable.');
  process.exit(1);
}

app.use(express.static(path.join(__dirname, 'public')));

// ── Business Data ──────────────────────────────
const BUSINESS_DB = {
  hours:         "Monday–Friday: 9 AM – 6 PM | Saturday: 10 AM – 4 PM | Sunday: Closed",
  location:      "123 Innovation Drive, Suite 400, San Francisco, CA 94105",
  contact:       "Phone: (415) 555-0192 | Email: hello@voiceagent.ai | Live chat: 24/7",
  services:      "Consulting, Technical Support, Product Demos, Enterprise Onboarding, Custom Integrations",
  pricing:       "Starter: $49/mo | Professional: $149/mo | Enterprise: Custom. 14-day free trial on all plans.",
  refund_policy: "30-day full money-back guarantee. No questions asked. Cancel anytime."
};

const appointments = [];

// ── App URL Map ────────────────────────────────
const APP_URLS = {
  youtube:      'https://www.youtube.com',
  whatsapp:     'https://web.whatsapp.com',
  calculator:   'https://calculator.net',
  google:       'https://www.google.com',
  gmail:        'https://mail.google.com',
  maps:         'https://maps.google.com',
  googlemaps:   'https://maps.google.com',
  facebook:     'https://www.facebook.com',
  instagram:    'https://www.instagram.com',
  twitter:      'https://www.twitter.com',
  x:            'https://www.x.com',
  netflix:      'https://www.netflix.com',
  spotify:      'https://open.spotify.com',
  linkedin:     'https://www.linkedin.com',
  github:       'https://www.github.com',
  zoom:         'https://zoom.us',
  notion:       'https://www.notion.so',
  translate:    'https://translate.google.com',
  googletranslate: 'https://translate.google.com',
  weather:      'https://weather.com',
  amazon:       'https://www.amazon.com',
  flipkart:     'https://www.flipkart.com',
  paytm:        'https://www.paytm.com',
  googledrive:  'https://drive.google.com',
  drive:        'https://drive.google.com',
  docs:         'https://docs.google.com',
  googledocs:   'https://docs.google.com',
  sheets:       'https://sheets.google.com',
  googlesheets: 'https://sheets.google.com',
  meet:         'https://meet.google.com',
  googlemeet:   'https://meet.google.com',
  reddit:       'https://www.reddit.com',
  chatgpt:      'https://chat.openai.com',
  openai:       'https://chat.openai.com',
  wikipedia:    'https://www.wikipedia.org',
  stack:        'https://stackoverflow.com',
  stackoverflow:'https://stackoverflow.com',
  news:         'https://news.google.com',
  googlenews:   'https://news.google.com',
  photos:       'https://photos.google.com',
  googlephotos: 'https://photos.google.com',
  calendar:     'https://calendar.google.com',
  googlecalendar:'https://calendar.google.com',
  pinterest:    'https://www.pinterest.com',
  snapchat:     'https://web.snapchat.com',
  telegram:     'https://web.telegram.org',
  discord:      'https://discord.com/app',
  twitch:       'https://www.twitch.tv',
  tiktok:       'https://www.tiktok.com',
};

// ── Tool Execution ─────────────────────────────
function executeTool(name, args) {
  if (name === 'get_business_info') {
    const t = args.info_type;
    if (t === 'all') return Object.entries(BUSINESS_DB).map(([k,v]) => `${k}: ${v}`).join(' | ');
    return BUSINESS_DB[t] || 'Information not available.';
  }

  if (name === 'book_appointment') {
    const ref = 'APT-' + Math.floor(Math.random() * 90000 + 10000);
    appointments.push({ ref, ...args, bookedAt: new Date().toISOString() });
    return `Appointment confirmed! Ref: ${ref} | Name: ${args.name} | Service: ${args.service} | Time: ${args.preferred_time}.`;
  }

  if (name === 'escalate_to_human') {
    return `Escalating now. Reason: ${args.reason}. Avg wait: 3 minutes.`;
  }

  if (name === 'open_application') {
    const key = args.app_name.toLowerCase().replace(/\s+/g, '');
    const url = APP_URLS[key] || `https://www.google.com/search?q=${encodeURIComponent(args.app_name)}`;
    return JSON.stringify({ action: 'open_url', url, app_name: args.app_name });
  }

  return 'Done.';
}

// ── OpenAI Functions ───────────────────────────
const FUNCTIONS = [
  {
    name: 'get_business_info',
    description: 'Get business info: hours, location, contact, services, pricing, refund_policy.',
    parameters: {
      type: 'object',
      properties: {
        info_type: { type: 'string', enum: ['hours','location','contact','services','pricing','refund_policy','all'] }
      },
      required: ['info_type']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book an appointment.',
    parameters: {
      type: 'object',
      properties: {
        name:           { type: 'string' },
        service:        { type: 'string' },
        preferred_time: { type: 'string' }
      },
      required: ['name','service','preferred_time']
    }
  },
  {
    name: 'escalate_to_human',
    description: 'Escalate to a human agent.',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string' } },
      required: ['reason']
    }
  },
  {
    name: 'open_application',
    description: 'Open any website or app in the browser. Use when user says open, launch, go to, show me, or start + any app/website name like YouTube, WhatsApp, Calculator, Google, Gmail, Maps, Instagram, Netflix, Spotify, etc.',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Name of the app or website, e.g. YouTube, WhatsApp, Calculator' }
      },
      required: ['app_name']
    }
  }
];

const SYSTEM_PROMPT = `You are a smart, friendly AI voice assistant for VoiceAgent Inc.

You can:
1. Answer business FAQs using get_business_info.
2. Book appointments using book_appointment (collect name, service, time).
3. Escalate to human using escalate_to_human.
4. Open any app or website using open_application — call this whenever user says "open", "launch", "go to", "show me", "start", or "take me to" followed by any app or website name.

Voice response rules:
- Keep responses SHORT — 1 to 2 sentences only.
- No bullet points or markdown — speak naturally.
- When opening an app say: "Opening [app] for you now!"
- After every response offer to help with something else.
- Be warm, human and conversational.`;

// ── Main Chat Endpoint ─────────────────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });

  try {
    let history = [...messages];
    let finalText = '';
    let actions = [];

    while (true) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          functions: FUNCTIONS,
          function_call: 'auto',
          max_tokens: 256,
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
        let args = {};
        try { args = JSON.parse(msg.function_call.arguments); } catch(e) {}
        const result = executeTool(msg.function_call.name, args);

        // Capture open_url actions
        try {
          const parsed = JSON.parse(result);
          if (parsed.action === 'open_url') actions.push(parsed);
        } catch(e) {}

        history.push({ role: 'function', name: msg.function_call.name, content: result });
        continue;
      }

      finalText = msg.content || '';
      break;
    }

    res.json({ reply: finalText, actions, messages: history.filter(m => m.role !== 'system') });

  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', model: 'gpt-4o' }));
app.get('/api/appointments', (req, res) => res.json(appointments));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  VoiceAgent server running at http://localhost:${PORT}`);
  console.log(`🔑  API key loaded: ${OPENAI_API_KEY.slice(0,8)}...`);
});


