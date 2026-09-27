/* ==============================================
   Chatbot — POST /api/chat
   Body: { messages: [{ role: 'user' | 'model', text }] }
   Gemini (key in Vercel env var GEMINI_API_KEY) answers ordering
   questions and can search the catalog / track a package.
   Product links only come from the catalog: the model refers to
   products as [[p:ID]] and the server turns them into cards.
============================================== */

const { getCatalog, searchProducts } = require('./_lib/catalog');
const { lookup, cleanNumber, isValidNumber } = require('./_lib/track17');

const MODEL        = 'gemini-3.8-flash';
const API_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const MAX_HISTORY  = 12;   // messages sent to the model
const MAX_CHARS    = 500;  // per user message
const MAX_TOOL_ROUNDS = 3;

// Best-effort per-IP limit (per serverless instance)
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX       = 25;
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_MAX;
}

const SYSTEM_PROMPT = `You are the shopping assistant of LovegoFinds (lovegofinds.com), a curated catalog of clothes, sneakers and football jerseys sold through the Chinese purchasing agent Lovegobuy. You help visitors find items and place their order.

Reply in the visitor's language. Be short, friendly and concrete: 1 to 4 sentences, plain text, no markdown headings. Only discuss LovegoFinds, Lovegobuy, ordering, shipping, sizing and the catalog; politely decline anything else.

PRODUCTS
- To find items, always call search_products. Never invent products, prices or links, and never write URLs yourself.
- To show a product, write its tag [[p:ID]] on its own line (ID from the search results). Show at most 4.
- If nothing relevant is found, say so and suggest browsing the site or asking on Discord.

BUTTONS (write the tag on its own line, never the URL)
- [[signup]]: Lovegobuy sign-up with the 500€ shipping coupons. Suggest it when someone asks how to start or about the bonus.
- [[discord]]: the LovegoFinds Discord, for anything you can't answer.

HOW TO ORDER
1. Create a Lovegobuy account with our link ([[signup]]) to unlock 500€ in shipping coupons. Without our link there is no bonus. Tip: a new account for each big order gives fresh coupons.
2. Find the item on LovegoFinds (browse, search or filter by category).
3. Click it to open its page on Lovegobuy, choose size, colour and quantity, add to cart.
4. Pay for the item. The seller ships it to the Lovegobuy warehouse, usually in 2 to 5 days.
5. When everything is in the warehouse, choose a shipping line and apply the coupons. About 10 days depending on the line.
6. Track the package: call track_package with the tracking number, or use the tracker on the How to order page.

KEY FACTS
- Football jerseys: minimum 4 jerseys per order. A jersey weighs 200 to 250 g.
- Shipping is charged by weight, around 9€/kg, so aim for at least 1 kg (4 to 5 jerseys) for it to be worth it.
- To pay less shipping, select the "Rehearsal" option (about 15 CNY / 2€): Lovegobuy reweighs the parcel, which usually lowers the price.
- Delivery: 2 to 5 days to the warehouse, plus 1 to 2 weeks with a name/number/patch, then 1 to 2 weeks to the door.
- Jersey customisation on the Lovegobuy product page: Back (name and number), Front (number), Right Sleeve and Chest (patches).
- Sizing: football jerseys use European sizing, order your usual size. Chinese sizing (sizes starting at M up to 3XL/4XL+) runs small: size up when in doubt; the FAQ page has a height/weight table.
- Photos may have logos removed by sellers to avoid bans; the received item has them.
- Most items are not official licensed products; quality is good and they look as pictured. QC photos are sent before shipping.
- Customs: Lovegobuy routes parcels to limit customs risk; with shipping insurance a seized parcel is reimbursed. Problems with an order are handled by Lovegobuy support.
- Items not on the site: use the camera (image search) on the Lovegobuy homepage.
- Prices shown on LovegoFinds are item prices; shipping is paid separately at step 5.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'search_products',
      description: 'Search the LovegoFinds catalog. Returns up to 6 matching products with id, name, price and gender section.',
      parameters: {
        type: 'object',
        properties: {
          query:     { type: 'string', description: 'Keywords in English or French, e.g. "PSG home jersey", "Moncler puffer", "sac Goyard".' },
          gender:    { type: 'string', enum: ['men', 'women', 'any'], description: 'Catalog section. Use "any" unless the visitor specifies.' },
          max_price: { type: 'number', description: 'Maximum price in euros, only if the visitor gives a budget.' },
        },
        required: ['query'],
      },
    },
    {
      name: 'track_package',
      description: 'Get the delivery status and latest events of a package from its tracking number.',
      parameters: {
        type: 'object',
        properties: {
          tracking_number: { type: 'string', description: 'The tracking number, e.g. "LB123456789CN".' },
        },
        required: ['tracking_number'],
      },
    },
  ],
}];

async function runTool(call, found) {
  const args = call.args || {};
  if (call.name === 'search_products') {
    const products = searchProducts(await getCatalog(), {
      query: String(args.query || '').slice(0, 100),
      gender: args.gender,
      maxPrice: Number(args.max_price) || undefined,
    });
    products.forEach(p => found.set(p.id, p));
    return { results: products.map(p => ({ id: p.id, name: p.name, brand: p.brand, price: p.price, section: p.gender, best_seller: p.bestSeller })) };
  }
  if (call.name === 'track_package') {
    const number = cleanNumber(args.tracking_number);
    if (!isValidNumber(number)) return { error: 'Invalid tracking number format.' };
    const r = await lookup(number);
    if (r.state === 'tracking') return { status: r.status, carrier: r.carrier, latest_events: r.events.slice(0, 5) };
    return { state: r.state, message: r.message };
  }
  return { error: 'Unknown tool.' };
}

async function callGemini(contents) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      tools: TOOLS,
      generationConfig: { maxOutputTokens: 800, thinkingConfig: { thinkingLevel: 'low' } },
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error((data.error && data.error.message) || `Gemini HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  return data;
}

// Turn the model text into { text, products, buttons } with only catalog links
function buildReply(text, found) {
  const products = [];
  const buttons = [];
  const clean = text
    .replace(/\[\[p:([a-z0-9]+)\]\]/gi, (_, id) => {
      const p = found.get(id);
      if (p && !products.includes(p) && products.length < 4) products.push(p);
      return '';
    })
    .replace(/\[\[(signup|discord)\]\]/gi, (_, b) => {
      const key = b.toLowerCase();
      if (!buttons.includes(key)) buttons.push(key);
      return '';
    })
    .replace(/https?:\/\/\S+/g, '')           // never pass through raw URLs
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    text: clean,
    products: products.map(p => ({ id: p.id, name: p.name, price: p.price, image: p.image, link: p.link })),
    buttons,
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Chat is not configured yet.' });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) return res.status(429).json({ error: 'Too many messages. Please wait a few minutes.' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const history = Array.isArray(body.messages) ? body.messages.slice(-MAX_HISTORY) : [];
  const contents = history
    .filter(m => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string' && m.text.trim())
    .map(m => ({ role: m.role, parts: [{ text: m.text.slice(0, m.role === 'user' ? MAX_CHARS : 2000) }] }));

  if (!contents.length || contents[contents.length - 1].role !== 'user') {
    return res.status(400).json({ error: 'Missing message.' });
  }

  const found = new Map();
  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const data = await callGemini(contents);
      const content = data.candidates && data.candidates[0] && data.candidates[0].content;
      const parts = (content && content.parts) || [];
      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

      if (!calls.length || round === MAX_TOOL_ROUNDS) {
        const text = parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim();
        const reply = buildReply(text || "Sorry, I couldn't answer that. You can ask on our Discord.", found);
        if (!reply.text && !reply.products.length) reply.text = "Sorry, I couldn't answer that. You can ask on our Discord.";
        return res.status(200).json(reply);
      }

      // Keep the model turn as-is (it carries the thought signatures), then answer every call
      contents.push(content);
      const responses = await Promise.all(calls.map(async call => ({
        functionResponse: { name: call.name, response: await runTool(call, found).catch(() => ({ error: 'Tool failed.' })) },
      })));
      contents.push({ role: 'user', parts: responses });
    }
  } catch (err) {
    const busy = err.status === 429 || err.status === 503;
    return res.status(busy ? 503 : 502).json({
      error: busy ? 'The assistant is busy right now. Please try again in a minute.' : 'The assistant is unavailable right now. Please try again later.',
      ...(req.query && req.query.debug === '1' ? { detail: err.message } : {}),
    });
  }
};
