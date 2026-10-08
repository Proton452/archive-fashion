/* ==============================================
   Chatbot — POST /api/chat
   Body: { messages: [{ role: 'user' | 'model', text }] }
   Gemini (key in Vercel env var Chatbot_gemini_key) answers ordering
   questions and can search the catalog / track a package.
   Product links only come from the catalog: the model refers to
   products as [[p:ID]] and the server turns them into cards.
   The reply is streamed (NDJSON, one event per line) so it shows up
   while Gemini writes it: { t: 'blocks', blocks } as it grows, then
   { t: 'done', blocks, text } or { t: 'error', error }.
   If CHAT_LOG_URL is set, questions are logged anonymously
   (emails, phone and tracking numbers masked).
============================================== */

const { getCatalog, searchProducts } = require('./_lib/catalog');
const Prices = require('../js/prices.js');
const { lookup, cleanNumber, isValidNumber } = require('./_lib/track17');

const MODEL        = 'gemini-3.8-flash';
const API_URL      = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`;
const MAX_HISTORY  = 12;   // messages sent to the model
const MAX_CHARS    = 500;  // per user message
const MAX_TOOL_ROUNDS = 3;

// The key was saved in Vercel as Chatbot_gemini_key; GEMINI_API_KEY also accepted
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.Chatbot_gemini_key;

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

Reply in the visitor's language. Be short, friendly and concrete: 1 to 4 sentences, plain text, no markdown headings. When explaining a process (how to order, how it works, shipping steps), use a numbered list "1. 2. 3." with one short line per step. Only discuss LovegoFinds, Lovegobuy, ordering, shipping, sizing and the catalog; politely decline anything else.

PRODUCTS
- To find items, always call search_products. Never invent products, prices or links, and never write URLs yourself.
- To show a product, write its tag [[p:ID]] on its own line (ID from the search results). Show at most 4.
- If nothing relevant is found, say so and suggest browsing the site or asking on Discord.

BUTTONS (write the tag on its own line, never the URL; each at most once)
- [[signup]]: Lovegobuy sign-up with the 500€ shipping coupons. Suggest it when someone asks how to start, how to order or about the bonus. When your answer has a numbered list, put it at the very end of the message, never inside the list.
- [[howto]]: the full How to order guide on the site. Add it after a step-by-step or shipping explanation, for more details.
- [[faq]]: the FAQ page. Add it after answering a question the FAQ covers (quality, sizing, delivery times, customs, customisation, shipping cost).
- [[discord]]: the LovegoFinds Discord, for general questions you can't answer (not for problems with a specific order: those go to a Lovegobuy ticket).
Always answer the question yourself first; the page buttons are only for more details. Use at most 2 buttons per message.

HOW TO ORDER
1. Create a Lovegobuy account with our sign-up link to unlock 500€ in shipping coupons. Without our link there is no bonus. Tip: a new account for each big order gives fresh coupons.
2. Find the item on LovegoFinds (browse, search or filter by category).
3. Click it to open its page on Lovegobuy, choose size, colour and quantity, add to cart.
4. Pay for the item. The seller ships it to the Lovegobuy warehouse, usually in 2 to 5 days.
5. When everything is in the warehouse, choose a shipping line and apply the coupons. About 10 days depending on the line.
6. Track the package: call track_package with the tracking number, or use the tracker on the How to order page.

KEY FACTS
- Football items: minimum spend of 15€ per order (the VISITOR section gives it in their currency). A jersey weighs 200 to 250 g.
- Shipping is charged by weight, around 9€/kg, so aim for at least 1 kg (4 to 5 jerseys) for it to be worth it.
- To pay less shipping, select the "Rehearsal" option (about 15 CNY / 2€): Lovegobuy reweighs the parcel, which usually lowers the price.
- Delivery: 2 to 5 days to the warehouse, plus 1 to 2 weeks with a name/number/patch, then 1 to 2 weeks to the door.
- Jersey customisation on the Lovegobuy product page: Back (name and number), Front (number), Right Sleeve and Chest (patches).
- Sizing: football jerseys use European sizing, order your usual size. Chinese sizing (sizes starting at M up to 3XL/4XL+) runs small: size up when in doubt; the FAQ page has a height/weight table.
- Photos may have logos removed by sellers to avoid bans; the received item has them.
- If asked who made or built the website, or whether AI or a specific tool (Claude, ChatGPT, etc.) was used to create it: don't discuss how the site was made. Say you're the LovegoFinds shopping assistant and don't have details about how the site was built, then offer to help find items or explain how to order. Never confirm or deny it.
- If asked whether LovegoFinds is legal, legit or safe: say LovegoFinds is a discovery engine, not a marketplace. It does not sell any product and never takes payment: it only helps people find items and links to their page on Lovegobuy, where the purchase happens.
- Lovegobuy is a legal purchasing and shipping agent used by millions of people: it buys items from Chinese marketplaces (Taobao, Weidian, 1688) on your behalf, checks them in its warehouse and ships them to you.
- If asked whether items are real, authentic or fake: answer warmly and positively. Say the items come from independent sellers in China, selected for the best quality-to-price ratio, that the quality is very good and that QC photos are sent before shipping so the buyer can check everything. Do not use the words "fake", "replica", "counterfeit" or "not official". Never claim or suggest an item is authentic, original or official. If the visitor insists on that point, invite them to read the FAQ ([[faq]]).
- Customs: Lovegobuy routes parcels to limit customs risk; with shipping insurance a seized parcel is reimbursed. Problems with an order are handled by Lovegobuy support.
- Items not on the site: use the camera (image search) on the Lovegobuy homepage.
- Prices shown on LovegoFinds are item prices in the visitor's currency (Lovegobuy's own conversion rate, rounded down); shipping is paid separately at step 5.

ORDER PROBLEMS AND TECHNICAL QUESTIONS
If the question is about a specific order or account (payment issue, missing or wrong item, refund, return, stuck parcel, warehouse, QC photos of their order) or is too technical to answer with the facts above, don't guess. Tell them to open a ticket with Lovegobuy support, as a short numbered list:
1. On Lovegobuy, go to your Profile.
2. Open "Service ticket" and click "Create".
3. Explain the problem (add the order number and screenshots if possible).
Lovegobuy support replies within 24 business hours at most.`;

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
          max_price: { type: 'number', description: "Maximum price in the visitor's currency (see VISITOR), only if the visitor gives a budget." },
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

async function runTool(call, found, currency) {
  const args = call.args || {};
  if (call.name === 'search_products') {
    const products = searchProducts(await getCatalog(), {
      query: String(args.query || '').slice(0, 100),
      gender: args.gender,
      maxCny: Number(args.max_price) ? Prices.toCny(Number(args.max_price), currency) : undefined,
    });
    products.forEach(p => found.set(p.id, p));
    return { results: products.map(p => ({ id: p.id, name: p.name, brand: p.brand, price: Prices.format(p.cny, currency), section: p.gender, best_seller: p.bestSeller })) };
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

// Streams one model turn: onText gets each new piece of visible text.
// Returns every part of the turn as received (thought signatures included).
async function streamGemini(contents, systemText, onText) {
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents,
      tools: TOOLS,
      generationConfig: { maxOutputTokens: 800, thinkingConfig: { thinkingLevel: 'low' } },
    }),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    const err = new Error((data.error && data.error.message) || `Gemini HTTP ${r.status}`);
    err.status = r.status;
    throw err;
  }
  const parts = [];
  const decoder = new TextDecoder();
  let buffer = '';
  const onLine = line => {
    if (!line.startsWith('data:')) return;
    let data;
    try { data = JSON.parse(line.slice(5)); } catch (e) { return; }
    const content = data.candidates && data.candidates[0] && data.candidates[0].content;
    ((content && content.parts) || []).forEach(p => {
      parts.push(p);
      if (typeof p.text === 'string' && p.text && !p.thought) onText(p.text);
    });
  };
  for await (const chunk of r.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(l => onLine(l.trim()));
  }
  onLine(buffer.trim());
  return parts;
}

// Text that can be shown while it is still being written: a tag or a
// **bold** that isn't finished yet waits for the next piece
function settledText(text) {
  text = text.replace(/\[\[?[a-z0-9:]*\]?$/i, '');
  if ((text.match(/\*\*/g) || []).length % 2) text = text.slice(0, text.lastIndexOf('**'));
  return text.replace(/\*$/, '');
}

// Turn the model text into ordered blocks, keeping products and buttons where the
// model placed them. Only catalog links survive: raw URLs are dropped.
function buildReply(rawText, found) {
  const blocks = [];
  const shown = new Set();
  let productCount = 0;

  const pushText = t => {
    t = t.replace(/https?:\/\/\S+/g, '').replace(/\n{3,}/g, '\n\n').trim();
    if (t) blocks.push({ type: 'text', text: t });
  };

  const re = /\[\[(p:[a-z0-9]+|signup|discord|faq|howto)\]\]/gi;
  let last = 0, m;
  while ((m = re.exec(rawText))) {
    pushText(rawText.slice(last, m.index));
    last = re.lastIndex;
    const tag = m[1].toLowerCase();
    if (tag.startsWith('p:')) {
      const p = found.get(tag.slice(2));
      if (!p || shown.has(p.id) || productCount >= 4) continue;
      shown.add(p.id);
      productCount++;
      const item = { id: p.id, name: p.name, cny: p.cny, image: p.image, link: p.link };
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'products') prev.items.push(item);
      else blocks.push({ type: 'products', items: [item] });
    } else if (!blocks.some(b => b.type === 'button' && b.kind === tag)) {
      blocks.push({ type: 'button', kind: tag });
    }
  }
  pushText(rawText.slice(last));

  const text = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
  const products = blocks.filter(b => b.type === 'products').flatMap(b => b.items);
  return { blocks, text, products };
}

// ─── Anonymous question log (optional, Vercel env var CHAT_LOG_URL) ───
function anonymize(str) {
  return String(str || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\b(?=[A-Z0-9]*\d)[A-Z0-9]{8,30}\b/gi, '[number]')
    .replace(/\+?\d[\d\s.-]{7,}\d/g, '[phone]');
}

async function logQuestion(question, reply) {
  const url = process.env.CHAT_LOG_URL;
  if (!url) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        question: anonymize(question).slice(0, 500),
        products: reply.products.map(p => p.name).join(', '),
        reply: anonymize(reply.text).slice(0, 500),
      }),
      signal: controller.signal,
    });
  } catch (e) { /* logging must never break the chat */ }
  clearTimeout(timer);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!GEMINI_KEY) return res.status(500).json({ error: 'Chat is not configured yet.' });

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

  // Site settings of the visitor (language + currency picker)
  const currency = Prices.RATES[body.currency] ? body.currency : Prices.DEFAULT;
  const LANG_NAMES = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', de: 'German', it: 'Italian', nl: 'Dutch', ar: 'Arabic' };
  const siteLang = LANG_NAMES[body.lang] || 'English';
  const systemText = SYSTEM_PROMPT + `

VISITOR
- Site language: ${siteLang}. Reply in the language the visitor writes in; if unclear, use ${siteLang}.
- Currency: ${currency} (${Prices.CURRENCIES[currency].symbol}). search_products returns prices in ${currency}: quote them as given, never convert them. max_price is in ${currency}.
- Football minimum spend in ${currency}: ${Prices.formatMinimum(Prices.FOOTBALL_MIN_EUR, currency)} per order.`;

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
  });
  const send = event => res.write(JSON.stringify(event) + '\n');

  const found = new Map();
  let text = '';        // every round's text, as the visitor sees it
  let sent = '';        // last blocks sent
  let newRound = false;
  const onText = piece => {
    if (newRound && text.trim()) text += '\n\n';
    newRound = false;
    text += piece;
    const blocks = buildReply(settledText(text), found).blocks;
    const json = JSON.stringify(blocks);
    if (blocks.length && json !== sent) {
      sent = json;
      send({ t: 'blocks', blocks });
    }
  };

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      newRound = true;
      const parts = await streamGemini(contents, systemText, onText);
      const calls = parts.filter(p => p.functionCall).map(p => p.functionCall);

      if (!calls.length || round === MAX_TOOL_ROUNDS) {
        let reply = buildReply(text.trim(), found);
        if (!reply.blocks.length) reply = buildReply("Sorry, I couldn't answer that. You can ask on our Discord.\n[[discord]]", found);
        send({ t: 'done', blocks: reply.blocks, text: reply.text });
        // The visitor already has the answer: the log no longer makes them wait
        await logQuestion(contents.filter(c => c.role === 'user' && c.parts[0].text).pop().parts[0].text, reply);
        return res.end();
      }

      // Keep the model turn as-is (it carries the thought signatures), then answer every call
      contents.push({ role: 'model', parts });
      const responses = await Promise.all(calls.map(async call => ({
        functionResponse: { name: call.name, response: await runTool(call, found, currency).catch(() => ({ error: 'Tool failed.' })) },
      })));
      contents.push({ role: 'user', parts: responses });
    }
  } catch (err) {
    const busy = err.status === 429 || err.status === 503;
    send({
      t: 'error',
      error: busy ? 'The assistant is busy right now. Please try again in a minute.' : 'The assistant is unavailable right now. Please try again later.',
    });
    res.end();
  }
};
