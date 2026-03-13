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


/*require('dotenv').config();
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
});*/



/*require('dotenv').config();
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

// ═══════════════════════════════════════════════════════════════
// KARNATAKA HOSPITAL DATABASE
// Covers all major districts across Karnataka
// ═══════════════════════════════════════════════════════════════
const HOSPITALS_DB = {

  bangalore: [
    { name: "Manipal Hospital", area: "HAL Airport Road", speciality: "Multi-specialty", phone: "080-25024444", emergency: true },
    { name: "Fortis Hospital", area: "Bannerghatta Road", speciality: "Multi-specialty, Cardiac", phone: "080-66214444", emergency: true },
    { name: "Apollo Hospital", area: "Bannerghatta Road", speciality: "Multi-specialty", phone: "080-26304050", emergency: true },
    { name: "Narayana Health City", area: "Bommasandra", speciality: "Cardiac, Cancer, Multi-specialty", phone: "080-71222222", emergency: true },
    { name: "Victoria Hospital", area: "City Market", speciality: "Government, General", phone: "080-26703600", emergency: true },
    { name: "Bowring & Lady Curzon Hospital", area: "Shivajinagar", speciality: "Government, General", phone: "080-25573000", emergency: true },
    { name: "St. John's Medical College Hospital", area: "Koramangala", speciality: "Multi-specialty, Teaching", phone: "080-22065000", emergency: true },
    { name: "Sakra World Hospital", area: "Marathahalli", speciality: "Multi-specialty", phone: "080-49690000", emergency: true },
  ],

  mysuru: [
    { name: "JSS Hospital", area: "MG Road, Mysuru", speciality: "Multi-specialty, Teaching", phone: "0821-2548335", emergency: true },
    { name: "Apollo BGS Hospital", area: "Adichunchanagiri Road", speciality: "Multi-specialty", phone: "0821-2568888", emergency: true },
    { name: "K.R. Hospital (Government)", area: "Irwin Road, Mysuru", speciality: "Government, General", phone: "0821-2423201", emergency: true },
    { name: "Columbia Asia Hospital", area: "Vijayanagar, Mysuru", speciality: "Multi-specialty", phone: "0821-3989999", emergency: true },
    { name: "Cheluvamba Hospital", area: "Mysuru", speciality: "Government, Women & Children", phone: "0821-2440283", emergency: true },
  ],

  davanagere: [
    { name: "SSIMS & RC (SS Institute of Medical Sciences)", area: "NH-48, Davanagere", speciality: "Multi-specialty, Teaching", phone: "08192-208888", emergency: true },
    { name: "Bapuji Hospital", area: "MCC B Block, Davanagere", speciality: "Multi-specialty, Teaching", phone: "08192-231471", emergency: true },
    { name: "Chigateri District Hospital", area: "P.J. Extension, Davanagere", speciality: "Government, General", phone: "08192-230660", emergency: true },
    { name: "Navodaya Medical College Hospital", area: "Mantralayam Road, Raichur (affiliated)", speciality: "Multi-specialty", phone: "08532-220400", emergency: true },
    { name: "Karnataka Institute of Medical Sciences (KIMS)", area: "Hubli Road, Davanagere", speciality: "Government Teaching", phone: "08192-225533", emergency: false },
  ],

  hubli_dharwad: [
    { name: "KIMS Hospital (Karnataka Institute of Medical Sciences)", area: "Vidyanagar, Hubli", speciality: "Government, Multi-specialty, Teaching", phone: "0836-2370550", emergency: true },
    { name: "SDM Hospital", area: "Sattur, Dharwad", speciality: "Multi-specialty, Teaching", phone: "0836-2467100", emergency: true },
    { name: "District Hospital Dharwad", area: "Dharwad", speciality: "Government, General", phone: "0836-2440100", emergency: true },
    { name: "Sushruta Hospital", area: "Hubli", speciality: "Private, Multi-specialty", phone: "0836-2369999", emergency: true },
  ],

  belagavi: [
    { name: "JNMC Hospital (KLE)", area: "Nehru Nagar, Belagavi", speciality: "Multi-specialty, Teaching", phone: "0831-2470012", emergency: true },
    { name: "District Hospital Belagavi", area: "Fort Road, Belagavi", speciality: "Government, General", phone: "0831-2420300", emergency: true },
    { name: "KLE Dr. Prabhakar Kore Hospital", area: "Belagavi", speciality: "Multi-specialty", phone: "0831-2520300", emergency: true },
  ],

  mangaluru: [
    { name: "Kasturba Medical College Hospital", area: "Attavar, Mangaluru", speciality: "Multi-specialty, Teaching", phone: "0824-2445858", emergency: true },
    { name: "A.J. Hospital & Research Centre", area: "Kuntikana, Mangaluru", speciality: "Multi-specialty", phone: "0824-2225533", emergency: true },
    { name: "Government Wenlock Hospital", area: "Hampankatta, Mangaluru", speciality: "Government, General", phone: "0824-2440066", emergency: true },
    { name: "Father Muller Medical College Hospital", area: "Kankanady, Mangaluru", speciality: "Multi-specialty, Teaching", phone: "0824-2238000", emergency: true },
  ],

  shivamogga: [
    { name: "McGann District Hospital", area: "Shivamogga", speciality: "Government, General", phone: "08182-225000", emergency: true },
    { name: "Shivamogga Institute of Medical Sciences (SIMS)", area: "Sagar Road, Shivamogga", speciality: "Government Teaching", phone: "08182-228996", emergency: true },
    { name: "Manipal Hospital Shivamogga", area: "Shivamogga", speciality: "Private, Multi-specialty", phone: "08182-402222", emergency: true },
  ],

  tumakuru: [
    { name: "Siddaganga Hospital & Research Centre", area: "Tumakuru", speciality: "Multi-specialty", phone: "0816-2277282", emergency: true },
    { name: "District Hospital Tumakuru", area: "B.H. Road, Tumakuru", speciality: "Government, General", phone: "0816-2272046", emergency: true },
  ],

  kalaburagi: [
    { name: "ESIC Medical College Hospital", area: "Sedam Road, Kalaburagi", speciality: "Multi-specialty, Teaching", phone: "08472-263000", emergency: true },
    { name: "District Hospital Kalaburagi", area: "Super Market, Kalaburagi", speciality: "Government, General", phone: "08472-224444", emergency: true },
  ],

  raichur: [
    { name: "RIMS (Raichur Institute of Medical Sciences)", area: "Raichur", speciality: "Government Teaching", phone: "08532-235444", emergency: true },
    { name: "District Hospital Raichur", area: "Station Road, Raichur", speciality: "Government, General", phone: "08532-220100", emergency: true },
  ],

  ballari: [
    { name: "VIMS (Vijayanagara Institute of Medical Sciences)", area: "Cantonment, Ballari", speciality: "Government Teaching", phone: "08392-255000", emergency: true },
    { name: "District Hospital Ballari", area: "Ballari", speciality: "Government, General", phone: "08392-271500", emergency: true },
  ],

  hassan: [
    { name: "Hassan Institute of Medical Sciences (HIMS)", area: "Hassan", speciality: "Government Teaching", phone: "08172-268900", emergency: true },
    { name: "District Hospital Hassan", area: "Hassan", speciality: "Government, General", phone: "08172-268200", emergency: true },
  ],

  udupi: [
    { name: "Kasturba Hospital Manipal", area: "Manipal, Udupi", speciality: "Multi-specialty, Teaching", phone: "0820-2922392", emergency: true },
    { name: "District Hospital Udupi", area: "Court Road, Udupi", speciality: "Government, General", phone: "0820-2520227", emergency: true },
  ],

  kodagu: [
    { name: "Kodagu Institute of Medical Sciences (KIMS)", area: "Madikeri", speciality: "Government Teaching", phone: "08272-221444", emergency: true },
    { name: "District Hospital Madikeri", area: "Madikeri, Kodagu", speciality: "Government, General", phone: "08272-221100", emergency: true },
  ],

  bidar: [
    { name: "BRIMS (Bidar Institute of Medical Sciences)", area: "Bidar", speciality: "Government Teaching", phone: "08482-225222", emergency: true },
    { name: "District Hospital Bidar", area: "Bidar", speciality: "Government, General", phone: "08482-226100", emergency: true },
  ],

  vijayapura: [
    { name: "BLDE University Hospital", area: "Vijayapura", speciality: "Multi-specialty, Teaching", phone: "08352-262770", emergency: true },
    { name: "District Hospital Vijayapura", area: "Vijayapura", speciality: "Government, General", phone: "08352-250200", emergency: true },
  ],

  general: {
    emergency_number: "108 (Karnataka Ambulance — Free, 24/7)",
    health_helpline: "104 (Karnataka Health Helpline — Free)",
    blood_bank: "1910 (National Blood Bank Helpline)",
    women_helpline: "181 (Women Helpline Karnataka)",
    covid_helpline: "14410 (Karnataka COVID Helpline)",
    ayushman_bharat: "14555 (Ayushman Bharat PM-JAY Helpline)",
    description: "Karnataka has excellent government and private hospitals across all 31 districts. Government hospitals provide free or subsidised treatment. Ayushman Bharat scheme covers up to ₹5 lakh treatment free for eligible families."
  }
};

const appointments = [];

// ── App URL Map ────────────────────────────────
const APP_URLS = {
  youtube:'https://www.youtube.com', whatsapp:'https://web.whatsapp.com',
  calculator:'https://calculator.net', google:'https://www.google.com',
  gmail:'https://mail.google.com', maps:'https://maps.google.com',
  googlemaps:'https://maps.google.com', facebook:'https://www.facebook.com',
  instagram:'https://www.instagram.com', twitter:'https://www.twitter.com',
  x:'https://www.x.com', netflix:'https://www.netflix.com',
  spotify:'https://open.spotify.com', linkedin:'https://www.linkedin.com',
  github:'https://www.github.com', zoom:'https://zoom.us',
  notion:'https://www.notion.so', translate:'https://translate.google.com',
  googletranslate:'https://translate.google.com', weather:'https://weather.com',
  amazon:'https://www.amazon.com', flipkart:'https://www.flipkart.com',
  paytm:'https://www.paytm.com', googledrive:'https://drive.google.com',
  drive:'https://drive.google.com', docs:'https://docs.google.com',
  sheets:'https://sheets.google.com', meet:'https://meet.google.com',
  googlemeet:'https://meet.google.com', reddit:'https://www.reddit.com',
  chatgpt:'https://chat.openai.com', wikipedia:'https://www.wikipedia.org',
  stackoverflow:'https://stackoverflow.com', news:'https://news.google.com',
  calendar:'https://calendar.google.com', telegram:'https://web.telegram.org',
  discord:'https://discord.com/app', twitch:'https://www.twitch.tv',
  tiktok:'https://www.tiktok.com', snapchat:'https://web.snapchat.com',
};

// ── Tool Execution ─────────────────────────────
function executeTool(name, args) {

  if (name === 'find_hospital') {
    const city = (args.city || '').toLowerCase().replace(/\s+/g,'_');
    const speciality = (args.speciality || '').toLowerCase();
    const emergency = args.emergency_only || false;

    // Find matching city
    let cityKey = null;
    if (city.includes('bangalore') || city.includes('bengaluru')) cityKey = 'bangalore';
    else if (city.includes('mysore') || city.includes('mysuru')) cityKey = 'mysuru';
    else if (city.includes('davangere') || city.includes('davanagere')) cityKey = 'davanagere';
    else if (city.includes('hubli') || city.includes('dharwad')) cityKey = 'hubli_dharwad';
    else if (city.includes('belagavi') || city.includes('belgaum')) cityKey = 'belagavi';
    else if (city.includes('mangalore') || city.includes('mangaluru')) cityKey = 'mangaluru';
    else if (city.includes('shivamogga') || city.includes('shimoga')) cityKey = 'shivamogga';
    else if (city.includes('tumkur') || city.includes('tumakuru')) cityKey = 'tumakuru';
    else if (city.includes('kalaburagi') || city.includes('gulbarga')) cityKey = 'kalaburagi';
    else if (city.includes('raichur')) cityKey = 'raichur';
    else if (city.includes('ballari') || city.includes('bellary')) cityKey = 'ballari';
    else if (city.includes('hassan')) cityKey = 'hassan';
    else if (city.includes('udupi') || city.includes('manipal')) cityKey = 'udupi';
    else if (city.includes('kodagu') || city.includes('coorg') || city.includes('madikeri')) cityKey = 'kodagu';
    else if (city.includes('bidar')) cityKey = 'bidar';
    else if (city.includes('vijayapura') || city.includes('bijapur')) cityKey = 'vijayapura';

    if (!cityKey) {
      return `I can help you find hospitals across Karnataka. Please tell me your city or district. I cover Bangalore, Mysuru, Davanagere, Hubli-Dharwad, Belagavi, Mangaluru, Shivamogga, Tumakuru, Kalaburagi, Raichur, Ballari, Hassan, Udupi, Kodagu, Bidar, Vijayapura and more.`;
    }

    let hospitals = HOSPITALS_DB[cityKey] || [];
    if (emergency) hospitals = hospitals.filter(h => h.emergency);
    if (speciality && speciality !== 'any') {
      hospitals = hospitals.filter(h => h.speciality.toLowerCase().includes(speciality));
      if (hospitals.length === 0) hospitals = HOSPITALS_DB[cityKey]; // fallback to all
    }

    if (hospitals.length === 0) return `No hospitals found matching your criteria in ${args.city}.`;

    const list = hospitals.slice(0, 3).map(h =>
      `${h.name} (${h.area}) — ${h.speciality} — Phone: ${h.phone}`
    ).join(' | ');

    return `Top hospitals in ${args.city}: ${list}. Emergency: ${HOSPITALS_DB.general.emergency_number}`;
  }

  if (name === 'get_health_info') {
    const type = args.info_type;
    const g = HOSPITALS_DB.general;
    if (type === 'emergency') return `Karnataka Emergency Ambulance: ${g.emergency_number}. Free 24/7 service across all districts.`;
    if (type === 'helpline') return `Karnataka Health Helpline: ${g.health_helpline} (Free). COVID: ${g.covid_helpline}. Women: ${g.women_helpline}. Blood Bank: ${g.blood_bank}.`;
    if (type === 'ayushman') return `Ayushman Bharat Helpline: ${g.ayushman_bharat}. Covers up to ₹5 lakh free treatment for eligible BPL families at empanelled hospitals across Karnataka.`;
    if (type === 'scheme') return `Karnataka health schemes: Ayushman Bharat (₹5L free treatment), Arogya Karnataka (free treatment at government hospitals for all residents), Pradhan Mantri Jan Arogya Yojana (PMJAY) for BPL families.`;
    return g.description;
  }

  if (name === 'book_appointment') {
    const ref = 'HOSP-' + Math.floor(Math.random() * 90000 + 10000);
    appointments.push({ ref, ...args, bookedAt: new Date().toISOString() });
    return `Appointment request registered! Ref: ${ref} | Patient: ${args.name} | Hospital: ${args.hospital} | Department: ${args.department} | Preferred Time: ${args.preferred_time}. Please call the hospital to confirm. Emergency: dial 108.`;
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
    name: 'find_hospital',
    description: 'Find hospitals in any Karnataka city or district. Use when user asks about hospitals, doctors, medical care, clinics, emergency services in any Karnataka location.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City or district in Karnataka, e.g. Bangalore, Mysuru, Davanagere, Hubli, Mangaluru' },
        speciality: { type: 'string', description: 'Medical speciality needed e.g. cardiac, cancer, ortho, general. Use "any" if not specified.' },
        emergency_only: { type: 'boolean', description: 'True if user needs emergency/24x7 hospital only' }
      },
      required: ['city']
    }
  },
  {
    name: 'get_health_info',
    description: 'Get Karnataka health helplines, emergency numbers, government health schemes like Ayushman Bharat, Arogya Karnataka.',
    parameters: {
      type: 'object',
      properties: {
        info_type: { type: 'string', enum: ['emergency', 'helpline', 'ayushman', 'scheme', 'general'] }
      },
      required: ['info_type']
    }
  },
  {
    name: 'book_appointment',
    description: 'Register a hospital appointment request for a patient.',
    parameters: {
      type: 'object',
      properties: {
        name:           { type: 'string', description: 'Patient full name' },
        hospital:       { type: 'string', description: 'Hospital name' },
        department:     { type: 'string', description: 'Department or speciality needed' },
        preferred_time: { type: 'string', description: 'Preferred date and time' }
      },
      required: ['name', 'hospital', 'department', 'preferred_time']
    }
  },
  {
    name: 'open_application',
    description: 'Open any website or app in the browser when user says open, launch, go to, show me.',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'App or website name to open' }
      },
      required: ['app_name']
    }
  }
];

const SYSTEM_PROMPT = `You are AROGYAM, a friendly AI voice assistant for Karnataka State Hospital Information System. You help people across all of Karnataka find hospitals, get health information, and book appointments.

You can:
1. Find hospitals in ANY Karnataka city or district using find_hospital.
2. Provide health helplines and government schemes using get_health_info.
3. Register appointment requests using book_appointment.
4. Open apps or websites using open_application.

Important rules:
- You serve ALL of Karnataka — not just one city.
- Always ask for the user's city/district before searching for hospitals.
- Mention government schemes like Ayushman Bharat and Arogya Karnataka when relevant.
- For emergencies always say: "Call 108 immediately for free ambulance anywhere in Karnataka."
- Keep responses SHORT — 2 to 3 sentences. No bullet points. Speak naturally.
- Respond in English but if user speaks Kannada, respond in simple Kannada.
- After every response offer to help further.`;

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
          max_tokens: 400,
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
  console.log(`✅  AROGYAM Karnataka Hospital Assistant running at http://localhost:${PORT}`);
  console.log(`🔑  API key loaded: ${OPENAI_API_KEY.slice(0,8)}...`);
});*/



/*require('dotenv').config();
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

// ── App URL Map ────────────────────────────────
const APP_URLS = {
  youtube:'https://www.youtube.com', whatsapp:'https://web.whatsapp.com',
  calculator:'https://calculator.net', google:'https://www.google.com',
  gmail:'https://mail.google.com', maps:'https://maps.google.com',
  googlemaps:'https://maps.google.com', facebook:'https://www.facebook.com',
  instagram:'https://www.instagram.com', twitter:'https://www.twitter.com',
  x:'https://www.x.com', netflix:'https://www.netflix.com',
  spotify:'https://open.spotify.com', linkedin:'https://www.linkedin.com',
  github:'https://www.github.com', zoom:'https://zoom.us',
  notion:'https://www.notion.so', translate:'https://translate.google.com',
  googletranslate:'https://translate.google.com', weather:'https://weather.com',
  amazon:'https://www.amazon.com', flipkart:'https://www.flipkart.com',
  paytm:'https://www.paytm.com', googledrive:'https://drive.google.com',
  drive:'https://drive.google.com', docs:'https://docs.google.com',
  sheets:'https://sheets.google.com', meet:'https://meet.google.com',
  googlemeet:'https://meet.google.com', reddit:'https://www.reddit.com',
  chatgpt:'https://chat.openai.com', wikipedia:'https://www.wikipedia.org',
  stackoverflow:'https://stackoverflow.com', news:'https://news.google.com',
  calendar:'https://calendar.google.com', telegram:'https://web.telegram.org',
  discord:'https://discord.com/app', twitch:'https://www.twitch.tv',
  tiktok:'https://www.tiktok.com', snapchat:'https://web.snapchat.com',
  pinterest:'https://www.pinterest.com', zomato:'https://www.zomato.com',
  swiggy:'https://www.swiggy.com', makemytrip:'https://www.makemytrip.com',
  irctc:'https://www.irctc.co.in', ola:'https://www.olacabs.com',
  uber:'https://www.uber.com', phonepe:'https://www.phonepe.com',
  gpay:'https://pay.google.com',
};

// ── Tool Execution ─────────────────────────────
function executeTool(name, args) {

  // Web search — returns a Google search URL for the frontend to show
  if (name === 'web_search') {
    const query = args.query;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    // We return the search results as a message to GPT to answer from its knowledge
    // For best hospitals/hotels, GPT already knows — this gives it context
    return `Search query: "${query}". Please answer this from your knowledge about ${query}. Include top 3-5 specific recommendations with names, locations, and brief descriptions. Be specific and helpful.`;
  }

  // Open any app or website
  if (name === 'open_application') {
    const key = args.app_name.toLowerCase().replace(/\s+/g, '');
    const url = APP_URLS[key] || `https://www.google.com/search?q=${encodeURIComponent(args.app_name)}`;
    return JSON.stringify({ action: 'open_url', url, app_name: args.app_name });
  }

  // Get weather
  if (name === 'get_weather') {
    const city = args.city;
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=3`;
    return JSON.stringify({ action: 'open_url', url: `https://weather.com/weather/today/l/${encodeURIComponent(city)}`, app_name: `Weather for ${city}`, weather_city: city });
  }

  // Set reminder (simulated)
  if (name === 'set_reminder') {
    return `Reminder set! I'll remind you: "${args.message}" at ${args.time}. (Note: browser reminders work while this tab is open)`;
  }

  // Calculate
  if (name === 'calculate') {
    try {
      // Safe eval for basic math
      const result = Function('"use strict"; return (' + args.expression.replace(/[^0-9+\-().% ]/g, '') + ')')();
      return `The result of ${args.expression} is ${result}`;
    } catch(e) {
      return `Could not calculate: ${args.expression}`;
    }
  }

  return 'Done.';
}

// ── OpenAI Functions ───────────────────────────
const FUNCTIONS = [
  {
    name: 'web_search',
    description: 'Search for any real-world information the user asks about — hospitals, hotels, restaurants, tourist places, shops, businesses, news, sports scores, any facts. Use this when user asks about best places, recommendations, current info, or anything location-specific.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query, e.g. "best hospitals in Mysuru Karnataka" or "top hotels in Goa"' }
      },
      required: ['query']
    }
  },
  {
    name: 'open_application',
    description: 'Open any website or app in the browser when user says open, launch, go to, show me, take me to.',
    parameters: {
      type: 'object',
      properties: {
        app_name: { type: 'string', description: 'Name of the app or website to open' }
      },
      required: ['app_name']
    }
  },
  {
    name: 'get_weather',
    description: 'Get weather information for any city when user asks about weather, temperature, rain forecast.',
    parameters: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name to get weather for' }
      },
      required: ['city']
    }
  },
  {
    name: 'calculate',
    description: 'Perform mathematical calculations when user asks to calculate, compute, or solve math problems.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Mathematical expression to evaluate, e.g. "25 * 4 + 100"' }
      },
      required: ['expression']
    }
  },
  {
    name: 'set_reminder',
    description: 'Set a reminder for the user when they ask to be reminded about something.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'What to remind the user about' },
        time: { type: 'string', description: 'When to remind — time or duration mentioned by user' }
      },
      required: ['message', 'time']
    }
  }
];

// ── System Prompt ──────────────────────────────
const SYSTEM_PROMPT = `You are ShadowQuant, a powerful, intelligent and futuristic AI voice assistant. You are like a smarter version of Siri and Google Assistant combined.

You can help with ANYTHING the user asks:
- Find best hospitals, hotels, restaurants, tourist places in any city in India or worldwide
- Answer general knowledge questions
- Give news, sports, tech updates
- Help with math, science, history, geography
- Open any app or website
- Give weather information
- Tell jokes, stories, fun facts
- Help with studies, coding, writing
- Give health tips, fitness advice
- Travel recommendations
- Movie, music, book recommendations

When user asks about best hospitals, hotels, restaurants or any place:
- Use web_search tool to get context
- Then give a helpful answer with TOP 3-5 specific recommendations
- Include name, location, and why it is good
- Always be specific — never say "I don't know" — give your best answer

Personality:
- You are futuristic, cool, confident and friendly
- Speak like a smart AI assistant — not robotic, not too formal
- Short responses — 2 to 4 sentences max when speaking
- For lists (hospitals, hotels etc) give names clearly one by one
- Always end by offering more help
- Address the user as "friend" sometimes to be friendly
- Never say you cannot help — always try your best

Important: You serve users from ANYWHERE in India and worldwide. Always ask for city if location is needed.`;

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
          max_tokens: 600,
          temperature: 0.7
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

app.get('/api/health', (req, res) => res.json({ status: 'ok', agent: 'ShadowQuant', model: 'gpt-4o' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  ShadowQuant running at http://localhost:${PORT}`);
  console.log(`🔑  API key: ${OPENAI_API_KEY.slice(0,8)}...`);
});*/


require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;       // your sheet ID
const GOOGLE_SERVICE_ACCOUNT = process.env.GOOGLE_SERVICE_ACCOUNT; // JSON string of service account

if (!OPENAI_API_KEY) { console.error('❌ Missing OPENAI_API_KEY'); process.exit(1); }

app.use(express.static(path.join(__dirname, 'public')));

// ═══════════════════════════════════════════════════════
// CLINIC BUSINESS LOGIC
// ═══════════════════════════════════════════════════════
const CLINIC = {
  name: "ShadowQuant MediCare Clinic",
  schedule: {
    monday:    { open: true,  slots: ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00","16:30"] },
    tuesday:   { open: true,  slots: ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00","16:30"] },
    wednesday: { open: true,  slots: ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00","16:30"] },
    thursday:  { open: true,  slots: ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00","15:30","16:00","16:30"] },
    friday:    { open: true,  slots: ["09:00","09:30","10:00","10:30","11:00","11:30","14:00","14:30","15:00"] },
    saturday:  { open: true,  slots: ["10:00","10:30","11:00","11:30","12:00"] },
    sunday:    { open: false, slots: [] }
  },
  doctors: {
    general:    "Dr. Priya Sharma",
    dental:     "Dr. Rajan Mehta",
    cardiology: "Dr. Suresh Nair",
    pediatric:  "Dr. Kavitha Rao",
    orthopedic: "Dr. Arun Iyer",
    emergency:  "Dr. On-Call"
  },
  emergencyNumber: "108",
  address: "12 Health Street, MG Road, Bangalore - 560001",
  phone: "+91-80-4567-8900"
};

// In-memory bookings (shown live, also written to Google Sheets)
const bookings = [];
const incidents = []; // escalations

// ═══════════════════════════════════════════════════════
// GOOGLE SHEETS INTEGRATION
// ═══════════════════════════════════════════════════════
async function writeToGoogleSheets(rowData) {
  if (!GOOGLE_SHEETS_ID || !GOOGLE_SERVICE_ACCOUNT) {
    console.log('[Sheets] Skipping — credentials not configured');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const { google } = require('googleapis');
    const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    const sheets = google.sheets({ version: 'v4', auth });
    await sheets.spreadsheets.values.append({
      spreadsheetId: GOOGLE_SHEETS_ID,
      range: 'Sheet1!A:H',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          rowData.ref,
          rowData.patient_name,
          rowData.phone,
          rowData.day,
          rowData.time,
          rowData.doctor,
          rowData.reason,
          new Date().toLocaleString('en-IN')
        ]]
      }
    });
    console.log('[Sheets] ✅ Written:', rowData.ref);
    return { success: true };
  } catch (err) {
    console.error('[Sheets] Error:', err.message);
    return { success: false, reason: err.message };
  }
}

// ═══════════════════════════════════════════════════════
// TOOL EXECUTION — THE AGENTIC CORE
// ═══════════════════════════════════════════════════════
async function executeTool(name, args) {

  // ── 1. CHECK AVAILABILITY ──────────────────────────
  if (name === 'check_availability') {
    const day = (args.day || '').toLowerCase();
    const schedule = CLINIC.schedule[day];

    if (!schedule) {
      return { status: 'error', message: `I don't recognise "${args.day}" as a valid day. Please say a day of the week like Monday or Tuesday.` };
    }

    if (!schedule.open) {
      // Smart suggestion — find next open day
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const idx = days.indexOf(day);
      let nextDay = null;
      for (let i = 1; i <= 7; i++) {
        const candidate = days[(idx + i) % 7];
        if (CLINIC.schedule[candidate].open) { nextDay = candidate; break; }
      }
      return {
        status: 'closed',
        message: `We are closed on ${args.day}. The next available day is ${nextDay}. Would you like to book on ${nextDay} instead?`
      };
    }

    // Filter out already-booked slots
    const bookedSlots = bookings
      .filter(b => b.day.toLowerCase() === day)
      .map(b => b.time);
    const available = schedule.slots.filter(s => !bookedSlots.includes(s));

    if (available.length === 0) {
      return { status: 'full', message: `${args.day} is fully booked. Shall I check another day?` };
    }

    // Return first 4 available slots
    const shown = available.slice(0, 4);
    return {
      status: 'available',
      day: args.day,
      slots: shown,
      message: `${args.day} has slots available at ${shown.join(', ')}. Which time works best for you?`
    };
  }

  // ── 2. BOOK APPOINTMENT ───────────────────────────
  if (name === 'book_appointment') {
    const day = (args.day || '').toLowerCase();
    const time = args.time;
    const schedule = CLINIC.schedule[day];

    // Validate day
    if (!schedule || !schedule.open) {
      return { status: 'error', message: `We are closed on ${args.day}. Please choose another day.` };
    }

    // Validate time slot exists
    if (!schedule.slots.includes(time)) {
      return { status: 'error', message: `${time} is not a valid slot on ${args.day}. Available slots are ${schedule.slots.slice(0,4).join(', ')}.` };
    }

    // Check double booking
    const conflict = bookings.find(b => b.day.toLowerCase() === day && b.time === time);
    if (conflict) {
      const available = schedule.slots.filter(s => !bookings.some(b => b.day.toLowerCase()===day && b.time===s));
      const next = available[0];
      return {
        status: 'conflict',
        message: `Sorry, ${time} on ${args.day} is already taken. The next available slot is ${next}. Shall I book that instead?`
      };
    }

    // Determine doctor based on reason
    let doctor = CLINIC.doctors.general;
    const reason = (args.reason || '').toLowerCase();
    if (reason.includes('teeth') || reason.includes('dental') || reason.includes('tooth')) doctor = CLINIC.doctors.dental;
    else if (reason.includes('heart') || reason.includes('chest') || reason.includes('cardio')) doctor = CLINIC.doctors.cardiology;
    else if (reason.includes('child') || reason.includes('kid') || reason.includes('baby')) doctor = CLINIC.doctors.pediatric;
    else if (reason.includes('bone') || reason.includes('joint') || reason.includes('ortho')) doctor = CLINIC.doctors.orthopedic;

    // Generate reference
    const ref = 'CLN-' + Date.now().toString(36).toUpperCase().slice(-6);

    const booking = {
      ref,
      patient_name: args.patient_name,
      phone: args.phone || 'Not provided',
      day: args.day,
      time: args.time,
      doctor,
      reason: args.reason,
      urgency: args.urgency || 'normal',
      bookedAt: new Date().toISOString()
    };

    bookings.push(booking);

    // Write to Google Sheets (real state change)
    const sheetsResult = await writeToGoogleSheets(booking);

    return {
      status: 'success',
      ref,
      doctor,
      day: args.day,
      time: args.time,
      sheets_written: sheetsResult.success,
      message: `Appointment confirmed! Reference ${ref}. ${args.patient_name} is booked with ${doctor} on ${args.day} at ${args.time}. ${sheetsResult.success ? 'This has been saved to our records.' : ''}`
    };
  }

  // ── 3. ASSESS URGENCY ────────────────────────────
  if (name === 'assess_urgency') {
    const symptoms = (args.symptoms || '').toLowerCase();

    const CRITICAL = ['chest pain','heart attack','stroke','unconscious','not breathing','severe bleeding','accident','poisoning','suicidal'];
    const HIGH = ['high fever','difficulty breathing','severe pain','fracture','vomiting blood','dizzy','fainted'];
    const MEDIUM = ['fever','infection','pain','swelling','rash','headache','cough'];

    let level = 'low';
    let action = 'regular_booking';
    let message = '';

    if (CRITICAL.some(k => symptoms.includes(k))) {
      level = 'critical';
      action = 'emergency_escalate';
      message = `This sounds like a medical emergency. Please call ${CLINIC.emergencyNumber} immediately or go to the nearest emergency room. Do not wait for an appointment.`;
    } else if (HIGH.some(k => symptoms.includes(k))) {
      level = 'high';
      action = 'priority_booking';
      message = `Your symptoms need prompt attention. I'll book you a priority same-day appointment if available.`;
    } else if (MEDIUM.some(k => symptoms.includes(k))) {
      level = 'medium';
      action = 'regular_booking';
      message = `Your symptoms sound manageable. Let me find you a convenient appointment slot.`;
    } else {
      level = 'low';
      action = 'regular_booking';
      message = `This sounds like a routine visit. Let me help you schedule an appointment.`;
    }

    // Log escalations
    if (level === 'critical') {
      incidents.push({ symptoms: args.symptoms, level, timestamp: new Date().toISOString() });
    }

    return { status: 'assessed', urgency: level, action, message };
  }

  // ── 4. RESCHEDULE APPOINTMENT ────────────────────
  if (name === 'reschedule_appointment') {
    const ref = args.ref;
    const idx = bookings.findIndex(b => b.ref === ref);

    if (idx === -1) {
      return { status: 'error', message: `I couldn't find a booking with reference ${ref}. Please check and try again.` };
    }

    const old = bookings[idx];
    const newDay = (args.new_day || '').toLowerCase();
    const schedule = CLINIC.schedule[newDay];

    if (!schedule || !schedule.open) {
      return { status: 'error', message: `We are closed on ${args.new_day}. Please choose another day.` };
    }

    const conflict = bookings.find((b,i) => i!==idx && b.day.toLowerCase()===newDay && b.time===args.new_time);
    if (conflict) {
      return { status: 'conflict', message: `${args.new_time} on ${args.new_day} is already taken. Please choose another slot.` };
    }

    bookings[idx] = { ...old, day: args.new_day, time: args.new_time, rescheduledAt: new Date().toISOString() };

    return {
      status: 'success',
      ref,
      message: `Done! Your appointment ${ref} has been rescheduled from ${old.day} at ${old.time} to ${args.new_day} at ${args.new_time}. Same doctor: ${old.doctor}.`
    };
  }

  // ── 5. CANCEL APPOINTMENT ────────────────────────
  if (name === 'cancel_appointment') {
    const ref = args.ref;
    const idx = bookings.findIndex(b => b.ref === ref);
    if (idx === -1) {
      return { status: 'error', message: `No booking found with reference ${ref}.` };
    }
    const cancelled = bookings.splice(idx, 1)[0];
    return {
      status: 'success',
      message: `Appointment ${ref} for ${cancelled.patient_name} on ${cancelled.day} at ${cancelled.time} has been cancelled. We hope to see you again soon.`
    };
  }

  // ── 6. GET CLINIC INFO ───────────────────────────
  if (name === 'get_clinic_info') {
    const t = args.info_type;
    if (t === 'hours') return { status: 'success', message: `We are open Monday to Friday 9 AM to 5 PM, Saturday 10 AM to 12 PM, and closed on Sundays.` };
    if (t === 'location') return { status: 'success', message: `We are located at ${CLINIC.address}. Phone: ${CLINIC.phone}.` };
    if (t === 'doctors') return { status: 'success', message: `Our doctors: General — ${CLINIC.doctors.general}, Dental — ${CLINIC.doctors.dental}, Cardiology — ${CLINIC.doctors.cardiology}, Pediatric — ${CLINIC.doctors.pediatric}, Orthopedic — ${CLINIC.doctors.orthopedic}.` };
    if (t === 'emergency') return { status: 'success', message: `For medical emergencies please call ${CLINIC.emergencyNumber} immediately. Our clinic emergency line is ${CLINIC.phone}.` };
    return { status: 'success', message: `${CLINIC.name} — ${CLINIC.address} — ${CLINIC.phone}. Open Mon-Fri 9-5, Sat 10-12, closed Sunday.` };
  }

  return { status: 'error', message: 'Unknown tool.' };
}

// ═══════════════════════════════════════════════════════
// OPENAI FUNCTION DEFINITIONS
// ═══════════════════════════════════════════════════════
const FUNCTIONS = [
  {
    name: 'assess_urgency',
    description: 'ALWAYS call this first when a patient describes any medical symptoms or health concern. Assesses urgency and determines next action.',
    parameters: {
      type: 'object',
      properties: {
        symptoms: { type: 'string', description: 'Symptoms described by the patient in their own words' }
      },
      required: ['symptoms']
    }
  },
  {
    name: 'check_availability',
    description: 'Check available appointment slots for a specific day. Call this when the patient mentions a preferred day.',
    parameters: {
      type: 'object',
      properties: {
        day: { type: 'string', description: 'Day of week e.g. monday, tuesday, saturday' }
      },
      required: ['day']
    }
  },
  {
    name: 'book_appointment',
    description: 'Book a confirmed appointment. Only call this after you have: patient name, preferred day, preferred time, and reason for visit.',
    parameters: {
      type: 'object',
      properties: {
        patient_name:  { type: 'string', description: 'Full name of the patient' },
        phone:         { type: 'string', description: 'Patient phone number if provided' },
        day:           { type: 'string', description: 'Day of the appointment e.g. monday' },
        time:          { type: 'string', description: 'Time slot e.g. 09:00 or 14:30' },
        reason:        { type: 'string', description: 'Reason for the visit or symptoms' },
        urgency:       { type: 'string', enum: ['low','medium','high','critical'], description: 'Urgency level from assess_urgency' }
      },
      required: ['patient_name', 'day', 'time', 'reason']
    }
  },
  {
    name: 'reschedule_appointment',
    description: 'Reschedule an existing appointment to a new day and time. Requires the booking reference number.',
    parameters: {
      type: 'object',
      properties: {
        ref:      { type: 'string', description: 'Booking reference e.g. CLN-ABC123' },
        new_day:  { type: 'string', description: 'New preferred day' },
        new_time: { type: 'string', description: 'New preferred time slot' }
      },
      required: ['ref', 'new_day', 'new_time']
    }
  },
  {
    name: 'cancel_appointment',
    description: 'Cancel an existing appointment using the booking reference number.',
    parameters: {
      type: 'object',
      properties: {
        ref: { type: 'string', description: 'Booking reference number' }
      },
      required: ['ref']
    }
  },
  {
    name: 'get_clinic_info',
    description: 'Get clinic information like hours, location, doctors, or emergency contacts.',
    parameters: {
      type: 'object',
      properties: {
        info_type: { type: 'string', enum: ['hours','location','doctors','emergency','general'] }
      },
      required: ['info_type']
    }
  }
];

// ═══════════════════════════════════════════════════════
// SYSTEM PROMPT — THE BRAIN OF SHADOWQUANT
// ═══════════════════════════════════════════════════════
const SYSTEM_PROMPT = `You are ShadowQuant, the AI voice receptionist for ${CLINIC.name}. You are warm, professional, and efficient — like the best human receptionist but faster and always available.

YOUR AGENTIC WORKFLOW:
1. Greet the patient and ask how you can help.
2. If they describe ANY symptom → immediately call assess_urgency first.
3. If urgency is CRITICAL → tell them to call 108. Do NOT book — this is an emergency.
4. If urgency is HIGH → prioritize same-day slots.
5. If urgency is LOW/MEDIUM → find a convenient slot.
6. Always check_availability before booking.
7. Handle closed-day errors gracefully: "We're closed Sunday, shall I check Monday?"
8. Collect: name, preferred day, preferred time, reason.
9. Confirm all details before booking.
10. After booking → always read the reference number clearly.

STATE MEMORY RULES:
- Remember everything the user says in this conversation.
- If user says "make it 5 PM instead" → update the time, keep everything else.
- If user says "actually Tuesday" → update the day, keep the time.
- Never ask for information you already have.

CONVERSATION RULES:
- Speak in SHORT natural sentences — you are voice, not text.
- NEVER use bullet points or markdown.
- NEVER say you have done something without actually calling a tool first.
- Be warm: "Of course!", "Absolutely!", "Let me check that for you."
- Handle barge-in gracefully — if interrupted, immediately address the new question.
- Always offer to help further after completing a task.

Today is ${new Date().toLocaleDateString('en-IN', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}.`;

// ═══════════════════════════════════════════════════════
// MAIN CHAT ENDPOINT
// ═══════════════════════════════════════════════════════
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages required' });

  try {
    let history = [...messages];
    let finalText = '';
    let toolCalls = [];
    let loopCount = 0;

    while (loopCount < 10) {
      loopCount++;
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...history],
          functions: FUNCTIONS,
          function_call: 'auto',
          max_tokens: 400,
          temperature: 0.5   // lower = more consistent/predictable for a receptionist
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

        console.log(`[Tool] ${msg.function_call.name}(${JSON.stringify(args)})`);
        const result = await executeTool(msg.function_call.name, args);
        console.log(`[Result]`, result);

        toolCalls.push({ tool: msg.function_call.name, args, result });
        history.push({ role: 'function', name: msg.function_call.name, content: JSON.stringify(result) });
        continue;
      }

      finalText = msg.content || '';
      break;
    }

    res.json({
      reply: finalText,
      tool_calls: toolCalls,
      bookings_count: bookings.length,
      messages: history.filter(m => m.role !== 'system')
    });

  } catch (err) {
    console.error('[ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Endpoints ────────────────────────────
app.get('/api/health',       (req, res) => res.json({ status: 'ok', agent: 'ShadowQuant', model: 'gpt-4o', version: '2.0' }));
app.get('/api/bookings',     (req, res) => res.json(bookings));
app.get('/api/slots/:day',   (req, res) => {
  const day = req.params.day.toLowerCase();
  const schedule = CLINIC.schedule[day];
  if (!schedule) return res.status(404).json({ error: 'Invalid day' });
  const booked = bookings.filter(b => b.day.toLowerCase()===day).map(b=>b.time);
  const available = schedule.slots.filter(s => !booked.includes(s));
  res.json({ day, open: schedule.open, available, booked });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅  ShadowQuant Clinic Agent v2.0 — http://localhost:${PORT}`);
  console.log(`📋  Google Sheets: ${GOOGLE_SHEETS_ID ? '✅ Connected' : '⚠️  Not configured (set GOOGLE_SHEETS_ID)'}`);
});


