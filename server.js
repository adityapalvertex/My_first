/* CHOMU CHAMELEON - game server.
 * One small Node program: serves index.html AND runs the multiplayer rooms (WebSocket on /ws).
 * Server-authoritative: the secret word / who the Chameleon is never leaves the server except to the right players.
 * Run: npm install && npm start     (PORT env var is honoured, default 3000)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
let WSS;
try { WSS = require('ws').WebSocketServer; } catch (e) { WSS = require(process.env.WS_PATH || 'ws').WebSocketServer; }

const PORT = +process.env.PORT || 3000;
const HTML_PATH = process.env.HTML || path.join(__dirname, 'index.html');

/* ------------------------------------------------------------------ topics */
/* [name, pack(in = desi, gen = general), 16 words, bot hint words] */
const RAW_TOPICS = [
  ['Street Food', 'in', 'Pani Puri|Vada Pav|Samosa|Momos|Pav Bhaji|Jalebi|Dosa|Chole Bhature|Kachori|Bhel Puri|Aloo Tikki|Maggi|Egg Roll|Dabeli|Kulfi|Chai', 'chatpata|thela|tasty|mirchi|bhookh|evening'],
  ['Bollywood Movies', 'in', 'Sholay|3 Idiots|Dangal|Lagaan|DDLJ|Gully Boy|PK|Baahubali|RRR|Jawan|Pathaan|Munna Bhai MBBS|Chak De India|Dhoom|Kabir Singh|Queen', 'hero|gaana|theatre|popcorn|dialogue|hit'],
  ['Bollywood Stars', 'in', 'Shah Rukh Khan|Salman Khan|Aamir Khan|Amitabh Bachchan|Deepika Padukone|Alia Bhatt|Ranveer Singh|Akshay Kumar|Priyanka Chopra|Hrithik Roshan|Katrina Kaif|Ranbir Kapoor|Kareena Kapoor|Varun Dhawan|Kriti Sanon|Ajay Devgn', 'actor|famous|film|dance|poster|fans'],
  ['Cricketers', 'in', 'Virat Kohli|MS Dhoni|Rohit Sharma|Sachin Tendulkar|Jasprit Bumrah|Hardik Pandya|KL Rahul|Rishabh Pant|Virender Sehwag|Kapil Dev|Yuvraj Singh|Ravindra Jadeja|R Ashwin|Shubman Gill|Suryakumar Yadav|Rahul Dravid', 'captain|runs|india|jersey|match|legend'],
  ['Cricket Stuff', 'in', 'Bat|Ball|Stumps|Wicket|Six|Four|Yorker|Umpire|Captain|Over|Century|Pitch|Helmet|Gloves|Pads|IPL', 'maidan|score|team|gali|out|shot'],
  ['Indian Cities', 'in', 'Mumbai|Delhi|Kolkata|Chennai|Bengaluru|Hyderabad|Jaipur|Lucknow|Pune|Ahmedabad|Goa|Varanasi|Amritsar|Shimla|Indore|Patna', 'shehar|traffic|metro|famous|bheed|train'],
  ['Festivals', 'in', 'Diwali|Holi|Eid|Christmas|Navratri|Raksha Bandhan|Pongal|Onam|Lohri|Ganesh Chaturthi|Durga Puja|Baisakhi|Dussehra|Karwa Chauth|Makar Sankranti|New Year', 'chutti|mithai|dhoom|kapde|family|mela'],
  ['Shaadi (Wedding)', 'in', 'Dulha|Dulhan|Baraat|Ghodi|Mehendi|Sangeet|Pheras|Mandap|Pandit|DJ|Lehenga|Sherwani|Haldi|Shagun|Band Baaja|Buffet', 'naach|khana|rishtedaar|shopping|rasam|raat'],
  ['Mithai & Desserts', 'in', 'Rasgulla|Gulab Jamun|Jalebi|Ladoo|Kaju Katli|Halwa|Rabri|Cake|Barfi|Kheer|Pastry|Ice Cream|Kulfi|Peda|Imarti|Chocolate', 'meetha|sugar|dabba|sweet|tasty|shakkar'],
  ['Kitchen Stuff', 'in', 'Tawa|Pressure Cooker|Kadhai|Belan|Mixer|Chimta|Gas Stove|Fridge|Spoon|Knife|Plate|Glass|Tiffin|Ladle|Sieve|Silbatta', 'ghar|mummy|pakana|steel|garam|rasoi'],
  ['School Life', 'in', 'Teacher|Homework|Bench|Blackboard|Tiffin|Exam|Bell|Uniform|Principal|Notebook|Assembly|Pencil Box|Ruler|Bunk|Result|Playground', 'class|padhai|bachpan|dost|bag|marks'],
  ['Famous Places', 'gen', 'Taj Mahal|Red Fort|India Gate|Qutub Minar|Gateway of India|Charminar|Hawa Mahal|Golden Temple|Eiffel Tower|Statue of Liberty|Pyramids|Burj Khalifa|Big Ben|Great Wall|Colosseum|Opera House', 'tourist|photo|old|bada|ticket|famous'],
  ['Chai & Drinks', 'in', 'Chai|Coffee|Lassi|Nimbu Pani|Cola|Juice|Milk|Water|Chaas|Ganne Ka Ras|Nariyal Pani|Shake|Soda|Badam Milk|Thandai|Mojito', 'peena|glass|thanda|garam|pyaas|summer'],
  ['Cartoons', 'in', 'Doraemon|Shinchan|Tom|Jerry|Chhota Bheem|Motu Patlu|Pikachu|Mickey Mouse|Mr Bean|Oggy|Ben 10|Naruto|Popeye|Scooby Doo|Peppa Pig|Minions', 'bachpan|tv|funny|rang|hasna|channel'],
  ['Desi Games', 'in', 'Kabaddi|Football|Hockey|Badminton|Chess|Ludo|Carrom|Kho-Kho|Tennis|Golf|Volleyball|Snakes & Ladders|Gilli Danda|Hide & Seek|Kanche|Kite Flying', 'khel|jeet|team|mazaa|dost|haar'],
  ['Transport', 'in', 'Auto Rickshaw|Metro|Bus|Train|Bike|Cycle|Aeroplane|Helicopter|Ship|Truck|Taxi|Tractor|E-Rickshaw|Scooter|Boat|Tempo', 'safar|road|ticket|horn|tez|travel'],
  ['Around Town', 'in', 'Hospital|School|Temple|Mall|Market|Railway Station|Petrol Pump|Bank|Cinema|Park|Police Station|Post Office|Bus Stand|Library|Gym|Bakery', 'jagah|bheed|shehar|roz|building|line'],
  ['Clothes', 'in', 'Kurta|Saree|Jeans|T-shirt|Cap|Shoes|Chappal|Dupatta|Sweater|Jacket|Socks|Belt|Watch|Sunglasses|Pagdi|Lungi', 'pehenna|fashion|size|rang|shopping|wardrobe'],
  ['Music', 'in', 'Tabla|Sitar|Harmonium|Dholak|Flute|Guitar|Drums|Piano|Violin|Mic|DJ|Headphones|Radio|Speaker|Ghungroo|Trumpet', 'awaaz|gaana|loud|beat|taal|sur'],
  ['Jobs', 'in', 'Doctor|Teacher|Police|Engineer|Pilot|Chef|Farmer|Lawyer|Driver|Tailor|Barber|Cricketer|Singer|YouTuber|Soldier|Shopkeeper', 'kaam|naukri|salary|uniform|office|roz'],
  ['Animals', 'gen', 'Lion|Elephant|Monkey|Peacock|Tiger|Camel|Cow|Dog|Parrot|Snake|Crocodile|Giraffe|Penguin|Dolphin|Eagle|Bear', 'jungle|janwar|zoo|chhota|bada|tail'],
  ['Birds', 'gen', 'Crow|Sparrow|Parrot|Peacock|Pigeon|Owl|Eagle|Hen|Duck|Swan|Crane|Kingfisher|Koel|Vulture|Penguin|Flamingo', 'udna|pankh|aasman|ghonsla|chirp|subah'],
  ['Fruits & Veggies', 'gen', 'Mango|Banana|Apple|Watermelon|Potato|Onion|Tomato|Carrot|Grapes|Papaya|Brinjal|Cauliflower|Lemon|Coconut|Guava|Pineapple', 'sabzi|khana|healthy|mandi|fresh|rang'],
  ['Superheroes', 'gen', 'Spider-Man|Batman|Iron Man|Superman|Thor|Hulk|Joker|Thanos|Shaktimaan|Krrish|Captain America|Wonder Woman|Black Panther|Loki|Deadpool|Flash', 'power|movie|mask|hero|fight|comics'],
  ['Apps & Tech', 'gen', 'WhatsApp|Instagram|YouTube|Google|Paytm|Zomato|Swiggy|Netflix|Snapchat|Facebook|Amazon|Flipkart|Ola|Uber|Telegram|Spotify', 'phone|app|scroll|download|online|notification'],
  ['Space', 'gen', 'Moon|Sun|Mars|Rocket|Satellite|Astronaut|Telescope|Planet|Galaxy|Comet|Black Hole|Chandrayaan|ISRO|Alien|Star|Earth', 'upar|aasman|raat|door|dark|science'],
  ['Nature & Weather', 'gen', 'Rain|Sun|Snow|Wind|Thunder|Rainbow|Fog|Storm|River|Mountain|Forest|Desert|Ocean|Waterfall|Volcano|Lake', 'mausam|bahar|paani|hawa|bada|sundar'],
  ['Countries', 'gen', 'India|USA|Japan|China|Brazil|Russia|Australia|Pakistan|Nepal|UAE|UK|France|Italy|Egypt|Germany|Canada', 'desh|flag|map|visa|door|famous'],
  ['Living Room', 'gen', 'Sofa|TV|Remote|Fan|AC|Curtain|Carpet|Clock|Mirror|Lamp|Table|Almirah|Window|Door|Charger|Wifi Router', 'ghar|baithna|aaram|room|mehmaan|roz'],
  ['Bathroom', 'gen', 'Soap|Shampoo|Towel|Brush|Mirror|Bucket|Mug|Toothpaste|Comb|Razor|Tap|Shower|Geyser|Toilet|Slippers|Perfume', 'subah|paani|safai|roz|ghar|fresh'],
  ['Internet Life', 'gen', 'Meme|Reel|Selfie|Viral|Trend|Emoji|Filter|Hashtag|Subscribe|Like|Comment|Streak|Story|Troll|GIF|Wifi', 'phone|online|funny|scroll|log|post'],
  ['Sports', 'gen', 'Football|Basketball|Tennis|Swimming|Boxing|Wrestling|Archery|Cycling|Running|Golf|Chess|Skating|Hockey|Cricket|Badminton|Gymnastics', 'khel|medal|jeet|team|stadium|fit'],
  ['Things in a Bag', 'gen', 'Phone|Wallet|Keys|Earphones|Charger|Water Bottle|Notebook|Pen|Comb|Sunglasses|Umbrella|Power Bank|Mask|Lunch Box|Powder|Passport', 'saath|roz|bag|zip|zaroori|nikalna']
];
const TOPICS = RAW_TOPICS.map(([n, pack, w, h]) => ({ n, pack, w: w.split('|'), h: h.split('|') }));
TOPICS.forEach(t => { if (t.w.length !== 16 || new Set(t.w).size !== 16) throw new Error('Topic needs 16 unique words: ' + t.n + ' (' + t.w.length + ')'); });

const BOT_NAMES = ['Bholu', 'Pappu', 'Chintu', 'Gudiya', 'Munna', 'Rinku', 'Sonu', 'Bittu', 'Golu', 'Pinky', 'Lallan', 'Babli'];
const BOT_VAGUE = ['mast', 'bada', 'desi', 'purana', 'famous', 'chhota', 'rangeen', 'mehenga', 'sasta', 'fun', 'shor', 'garam', 'thanda', 'tez', 'seedha'];
const BOT_CHAT = ['Hmm... kuch sus lag raha hai 🤔', 'Mera vote pakka hai!', 'Ye clue thoda ajeeb tha', 'Koi to jhooth bol raha hai', 'Chameleon bahut chalaak hai 😏', 'Mujhe pata hai kaun hai!', 'Sabka clue sahi tha yaar'];
const SKINS = ['chomu', 'don', 'alien', 'gold', 'baba', 'mirchi', 'cricket', 'pigeon'];
const COLORS = 12;
const MAXP = 10, MINP = 3;
const LW = 1400, LH = 800; // lobby world size (client uses the same)

const OPTS = {
  target: [3, 5, 7, 10], clueTime: [15, 20, 30, 45, 60], discussTime: [30, 45, 60, 90, 120, 180],
  voteTime: [15, 20, 30, 45, 60], pack: ['all', 'in', 'gen'], twoGuesses: [true, false], hideCard: [true, false], memes: [true, false]
};
const DEFAULTS = { target: 5, clueTime: 30, discussTime: 60, voteTime: 30, pack: 'all', twoGuesses: false, hideCard: false, memes: true };

/* ------------------------------------------------------------------ helpers */
const now = () => Date.now();
const K = +process.env.TIMESCALE || 1; // tests only: shrink every timer
const T = x => x * K;
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const CODE_CH = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const rooms = new Map();
function newCode() { for (let k = 0; k < 200; k++) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_CH[rnd(CODE_CH.length)]; if (!rooms.has(c)) return c; } return null; }
const rid = () => Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 8);
const cleanName = (s, fb) => { s = String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14); return s || fb; };
const cleanText = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const present = p => p.bot || p.connected;

function send(p, m) { if (p.ws && p.ws.readyState === 1) { try { p.ws.send(JSON.stringify(m)); } catch (e) { } } }
function sendRoom(room, m, except) { const s = JSON.stringify(m); for (const p of room.players) if (p.ws && p.ws.readyState === 1 && p.pid !== except) { try { p.ws.send(s); } catch (e) { } } }

/* ------------------------------------------------------------------ rooms */
function newRoom(code) {
  return { code, players: [], host: 0, phase: 'lobby', dl: 0, S: Object.assign({}, DEFAULTS), round: 0, dealer: 0, g: null, res: null, winners: null,
    bag: [], chamCount: {}, chat: [], nextPid: 1, posDirty: {}, hostLost: 0, empty: 0, created: now() };
}
function freeColor(room, want) {
  const used = new Set(room.players.map(p => p.color));
  if (want != null && want >= 0 && want < COLORS && !used.has(want)) return want;
  const free = []; for (let i = 0; i < COLORS; i++) if (!used.has(i)) free.push(i);
  return free.length ? pick(free) : rnd(COLORS);
}
function addPlayer(room, o) {
  const p = { pid: room.nextPid++, token: rid(), name: '', skin: SKINS.includes(o.skin) ? o.skin : 'chomu', color: freeColor(room, o.color),
    ws: null, connected: !o.bot, bot: !!o.bot, score: 0, x: LW / 2 + rnd(300) - 150, y: LH / 2 + 60 + rnd(160), f: 1, mv: 0, ready: false, seen: now(), gone: 0, act: 0, chatAt: 0, memeAt: 0, vote: null };
  let nm = cleanName(o.name, 'Player'), base = nm, k = 2; while (room.players.some(q => q.name.toLowerCase() === nm.toLowerCase())) nm = base.slice(0, 11) + ' ' + (k++);
  p.name = nm; room.players.push(p); return p;
}
const pById = (room, pid) => room.players.find(p => p.pid === pid);
const humans = room => room.players.filter(p => !p.bot);
const connHumans = room => room.players.filter(p => !p.bot && p.connected);

function pubPlayer(room, p) {
  const o = { id: p.pid, name: p.name, skin: p.skin, color: p.color, score: p.score, on: present(p) ? 1 : 0, bot: p.bot ? 1 : 0 };
  if (room.phase === 'lobby') { o.x = Math.round(p.x); o.y = Math.round(p.y); o.f = p.f; }
  if (room.phase === 'discuss') o.ready = p.ready ? 1 : 0;
  if (room.phase === 'vote') o.voted = p.vote != null ? 1 : 0;
  return o;
}
function pubState(room) {
  const g = room.g, ph = room.phase;
  const st = { t: 'state', now: now(), code: room.code, host: room.host, phase: ph, dl: room.dl, round: room.round, set: room.S, dealer: room.dealer,
    players: room.players.map(p => pubPlayer(room, p)) };
  if (g && ph !== 'lobby') {
    st.g = { topic: g.topic.n, words: g.words, order: g.order, turn: g.turn, clues: g.clues, dealer: g.dealer, hide: !!(room.S.hideCard && ['discuss', 'vote', 'tie', 'accuse'].includes(ph)), tied: g.tied || null };
    if (['accuse', 'guess', 'result', 'final'].includes(ph)) { st.g.votes = g.votesList; st.g.accused = g.accused; st.g.caught = g.caught; st.g.cham = g.caught || ph === 'result' || ph === 'final' ? g.cham : null; }
    if (ph === 'guess' || ph === 'result' || ph === 'final') { st.g.guesses = g.guesses; st.g.left = g.left; }
  }
  if (ph === 'result' || ph === 'final') st.res = room.res;
  if (ph === 'final') st.winners = room.winners;
  return st;
}
function pushState(room) { sendRoom(room, pubState(room)); }
function sendYou(room, p) {
  const g = room.g; if (!g || room.phase === 'lobby') return send(p, { t: 'you', id: p.pid, role: null });
  const cham = g.cham === p.pid;
  send(p, { t: 'you', id: p.pid, role: cham ? 'cham' : 'crew', secret: cham ? null : g.secret, word: cham ? null : g.words[g.secret] });
}
function sys(room, text) { const m = { t: 'chat', id: 0, m: text, sys: 1, at: now() }; room.chat.push(m); if (room.chat.length > 40) room.chat.shift(); sendRoom(room, m); }

/* ------------------------------------------------------------------ game flow */
function setPhase(room, ph, ms) {
  room.phase = ph; room.dl = ms ? now() + ms : 0;
  for (const p of room.players) { p.ready = false; if (ph !== 'vote') p.vote = null; p.act = 0; }
}
function nextTopic(room) {
  const pool = TOPICS.map((t, i) => i).filter(i => room.S.pack === 'all' || TOPICS[i].pack === room.S.pack);
  room.bag = room.bag.filter(i => pool.includes(i));
  if (!room.bag.length) room.bag = shuffle(pool);
  return TOPICS[room.bag.pop()];
}
function startGame(room) {
  const ps = room.players.filter(present);
  if (ps.length < MINP) return false;
  room.players = ps; // drop absent
  room.players.forEach(p => { p.score = 0; });
  room.round = 0; room.res = null; room.winners = null; room.chamCount = {}; room.bag = [];
  const host = pById(room, room.host); room.dealer = (host || room.players[0]).pid;
  startRound(room); return true;
}
function startRound(room) {
  const ps = room.players.filter(present);
  if (ps.length < MINP) return toLobby(room, 'Not enough players to continue.');
  room.players = ps;
  if (!pById(room, room.dealer)) room.dealer = room.players[0].pid;
  room.round++;
  const TP = nextTopic(room);
  const words = shuffle(TP.w);
  // chameleon: least-chosen first so everybody gets a turn
  const minC = Math.min(...room.players.map(p => room.chamCount[p.pid] || 0));
  const cands = room.players.filter(p => (room.chamCount[p.pid] || 0) === minC);
  const cham = pick(cands); room.chamCount[cham.pid] = (room.chamCount[cham.pid] || 0) + 1;
  const di = room.players.findIndex(p => p.pid === room.dealer);
  const order = []; for (let i = 0; i < room.players.length; i++) order.push(room.players[(di + i) % room.players.length].pid);
  room.g = { topic: TP, words, secret: rnd(16), cham: cham.pid, order, turn: 0, clues: [], dealer: room.dealer, accused: null, caught: null, votesList: [], tied: null, guesses: [], left: room.S.twoGuesses ? 2 : 1, correct: null };
  room.res = null;
  setPhase(room, 'reveal', T(8500));
  for (const p of room.players) sendYou(room, p);
  pushState(room);
}
function beginTurn(room) {
  const g = room.g; room.phase = 'clue';
  const sp = pById(room, g.order[g.turn]);
  room.dl = now() + T(sp && present(sp) ? room.S.clueTime * 1000 : 2500);
  if (sp && sp.bot) sp.act = now() + T(1500 + rnd(2800));
}
function addClue(room, p, w) {
  const g = room.g; g.clues.push({ id: p.pid, w }); g.turn++;
  if (g.turn >= g.order.length) { setPhase(room, 'discuss', T(room.S.discussTime * 1000)); botDiscussInit(room); }
  else beginTurn(room);
  pushState(room);
}
function botDiscussInit(room) { for (const b of room.players.filter(x => x.bot)) b.act = now() + T(5000 + rnd(Math.max(4000, room.S.discussTime * 600))); }
function startVote(room) {
  setPhase(room, 'vote', T(room.S.voteTime * 1000));
  for (const b of room.players.filter(x => x.bot)) b.act = now() + T(3000 + rnd(Math.max(3000, room.S.voteTime * 500)));
  pushState(room);
}
function tally(room) {
  const g = room.g, counts = {};
  g.votesList = room.players.filter(p => p.vote != null).map(p => ({ from: p.pid, to: p.vote }));
  g.votesList.forEach(v => { counts[v.to] = (counts[v.to] || 0) + 1; });
  const mx = Math.max(0, ...Object.values(counts));
  if (!mx) return accuse(room, null);
  const top = Object.keys(counts).filter(k => counts[k] === mx).map(Number);
  if (top.length === 1) return accuse(room, top[0]);
  g.tied = top; setPhase(room, 'tie', T(15000));
  const d = pById(room, g.dealer); if (d && d.bot) d.act = now() + T(2000);
  pushState(room);
}
function accuse(room, pid) {
  const g = room.g; g.accused = pid; g.caught = pid != null && pid === g.cham;
  setPhase(room, 'accuse', T(8000)); pushState(room);
}
function afterAccuse(room) {
  const g = room.g;
  if (g.caught) { setPhase(room, 'guess', T(30000)); const c = pById(room, g.cham); if (c && c.bot) c.act = now() + T(3500 + rnd(4000)); pushState(room); }
  else finishRound(room, false);
}
function finishRound(room, correct) {
  const g = room.g, deltas = {};
  room.players.forEach(p => { deltas[p.pid] = 0; });
  if (!g.caught) deltas[g.cham] = 2;
  else if (correct) deltas[g.cham] = 1;
  else room.players.forEach(p => { if (p.pid !== g.cham) deltas[p.pid] = 2; });
  room.players.forEach(p => { p.score += deltas[p.pid] || 0; });
  g.correct = !!correct;
  room.res = { cham: g.cham, secret: g.secret, word: g.words[g.secret], accused: g.accused, caught: g.caught, correct: !!correct, guesses: g.guesses, deltas, scores: Object.fromEntries(room.players.map(p => [p.pid, p.score])), target: room.S.target };
  const best = Math.max(...room.players.map(p => p.score));
  room.res.over = best >= room.S.target;
  setPhase(room, 'result', T(14000)); pushState(room);
}
function afterResult(room) {
  if (room.res && room.res.over) {
    const best = Math.max(...room.players.map(p => p.score));
    room.winners = room.players.filter(p => p.score === best).map(p => p.pid);
    setPhase(room, 'final', 0); pushState(room); return;
  }
  // the chameleon deals next (official rule)
  room.dealer = room.g.cham; startRound(room);
}
function toLobby(room, why) {
  setPhase(room, 'lobby', 0); room.g = null; room.res = null; room.winners = null; room.round = 0;
  room.players.forEach(p => { p.score = 0; p.x = LW / 2 + rnd(300) - 150; p.y = LH / 2 + 60 + rnd(160); });
  if (why) sys(room, why);
  pushState(room);
}

/* tick: deadlines + bots + housekeeping */
function advance(room) {
  const g = room.g;
  switch (room.phase) {
    case 'reveal': g.turn = 0; beginTurn(room); pushState(room); break;
    case 'clue': { const sp = pById(room, g.order[g.turn]); if (sp) addClue(room, sp, '…'); else { g.turn++; if (g.turn >= g.order.length) { setPhase(room, 'discuss', T(room.S.discussTime * 1000)); botDiscussInit(room); } else beginTurn(room); pushState(room); } break; }
    case 'discuss': startVote(room); break;
    case 'vote': tally(room); break;
    case 'tie': accuse(room, pick(g.tied)); break;
    case 'accuse': afterAccuse(room); break;
    case 'guess': finishRound(room, false); break;
    case 'result': afterResult(room); break;
  }
}
function botAct(room, b) {
  const g = room.g; if (!g) return;
  switch (room.phase) {
    case 'clue': if (g.order[g.turn] === b.pid) {
      const TP = TOPICS.find(t => t.n === g.topic.n), cham = g.cham === b.pid;
      let w = cham || Math.random() < .35 ? pick(BOT_VAGUE) : pick(TP.h);
      addClue(room, b, w);
    } break;
    case 'discuss': sendRoom(room, { t: 'chat', id: b.pid, m: pick(BOT_CHAT), at: now() }); break;
    case 'vote': { const others = room.players.filter(p => p.pid !== b.pid); b.vote = pick(others).pid; pushState(room); checkVoteDone(room); break; }
    case 'tie': if (g.dealer === b.pid) { const t = pick(g.tied); accuse(room, t); } break;
    case 'guess': if (g.cham === b.pid) guess(room, b, rnd(16)); break;
  }
}
function checkVoteDone(room) {
  if (room.phase !== 'vote') return;
  const need = room.players.filter(p => present(p));
  if (need.length && need.every(p => p.vote != null)) room.dl = Math.min(room.dl, now() + 1200);
}
function guess(room, p, idx) {
  const g = room.g; if (room.phase !== 'guess' || g.cham !== p.pid || !(idx >= 0 && idx < 16) || g.guesses.includes(idx)) return;
  g.guesses.push(idx); g.left--;
  if (idx === g.secret) { finishRound(room, true); return; }
  if (g.left <= 0) { finishRound(room, false); return; }
  pushState(room);
}

function tick() {
  const t = now();
  for (const room of [...rooms.values()]) {
    // housekeeping
    const hs = humans(room);
    for (const p of hs.slice()) {
      if (!p.connected) {
        const limit = room.phase === 'lobby' ? 25000 : 240000;
        if (t - p.seen > limit) removePlayer(room, p, true);
      }
    }
    if (!connHumans(room).length) { room.empty = room.empty || t; if (t - room.empty > 5 * 60000) { rooms.delete(room.code); continue; } } else room.empty = 0;
    // host transfer
    const h = pById(room, room.host);
    if (!h || (!h.bot && !h.connected && t - h.seen > 12000)) { const nh = connHumans(room)[0]; if (nh && nh.pid !== room.host) { room.host = nh.pid; sys(room, nh.name + ' is the host now'); pushState(room); } }
    // deadlines
    if (room.dl && t >= room.dl && room.phase !== 'lobby' && room.phase !== 'final') advance(room);
    // bots
    for (const b of room.players) if (b.bot && b.act && t >= b.act) { b.act = 0; botAct(room, b); }
    // absent players should not block
    if (room.g && room.phase === 'clue') { const sp = pById(room, room.g.order[room.g.turn]); if (sp && !present(sp) && room.dl - t > 2600) room.dl = t + 2500; }
    if (room.phase === 'guess' && room.g) { const c = pById(room, room.g.cham); if (c && !present(c) && room.dl - t > 4000) room.dl = t + 3000; }
    if (room.phase === 'tie' && room.g) { const d = pById(room, room.g.dealer); if (d && !present(d) && room.dl - t > 3000) room.dl = t + 2500; }
    if (room.phase === 'vote') checkVoteDone(room);
    if (room.phase !== 'lobby' && room.phase !== 'final' && room.g && room.players.filter(present).length < MINP) toLobby(room, 'Not enough players left. Back to the lobby.');
    // lobby positions
    if (room.phase === 'lobby' && Object.keys(room.posDirty).length) {
      const arr = Object.keys(room.posDirty).map(k => { const p = pById(room, +k); return p ? [p.pid, Math.round(p.x), Math.round(p.y), p.f, p.mv] : null; }).filter(Boolean);
      room.posDirty = {}; if (arr.length) sendRoom(room, { t: 'pos', p: arr });
    }
  }
}
setInterval(tick, 150);

function removePlayer(room, p, silent) {
  const i = room.players.indexOf(p); if (i < 0) return;
  if (room.phase !== 'lobby' && room.g && !silent) { /* keep seat as absent until the round ends */ p.connected = false; p.seen = 0; return; }
  room.players.splice(i, 1);
  if (p.ws) { try { p.ws.ctx = null; } catch (e) { } }
  if (room.host === p.pid) { const nh = connHumans(room)[0]; if (nh) { room.host = nh.pid; sys(room, nh.name + ' is the host now'); } }
  if (!humans(room).length) { rooms.delete(room.code); return; }
  pushState(room);
}

/* ------------------------------------------------------------------ websocket */
function onMsg(ws, m) {
  const t = m.t;
  if (t === 'ping') return ws.send('{"t":"pong"}');
  if (t === 'create' || t === 'join' || t === 'resume') return onEnter(ws, m);
  const c = ws.ctx; if (!c) return;
  const room = c.room, p = c.p; if (!room || !room.players.includes(p)) return;
  p.seen = now();
  const isHost = room.host === p.pid;
  switch (t) {
    case 'pos': if (room.phase === 'lobby') { p.x = Math.max(40, Math.min(LW - 40, +m.x || 0)); p.y = Math.max(40, Math.min(LH - 20, +m.y || 0)); p.f = m.f < 0 ? -1 : 1; p.mv = m.mv ? 1 : 0; room.posDirty[p.pid] = 1; } break;
    case 'avatar': if (room.phase === 'lobby') {
      if (SKINS.includes(m.skin)) p.skin = m.skin;
      if (m.color >= 0 && m.color < COLORS && !room.players.some(q => q !== p && q.color === m.color)) p.color = m.color | 0;
      if (m.name != null) { const nm = cleanName(m.name, p.name); if (!room.players.some(q => q !== p && q.name.toLowerCase() === nm.toLowerCase())) p.name = nm; }
      pushState(room);
    } break;
    case 'set': if (isHost && room.phase === 'lobby' && OPTS[m.k] && OPTS[m.k].includes(m.v)) { room.S[m.k] = m.v; pushState(room); } break;
    case 'addbot': if (isHost && room.phase === 'lobby' && room.players.length < MAXP) { const used = new Set(room.players.map(q => q.name)); const nm = shuffle(BOT_NAMES).find(n => !used.has(n)) || 'Bot'; addPlayer(room, { name: nm, bot: true, skin: pick(SKINS) }); pushState(room); } break;
    case 'kick': if (isHost && room.phase === 'lobby') { const q = pById(room, m.id | 0); if (q && q !== p) { if (q.ws) { send(q, { t: 'kicked' }); try { q.ws.ctx = null; q.ws.close(); } catch (e) { } } room.players.splice(room.players.indexOf(q), 1); pushState(room); } } break;
    case 'start': if (isHost && room.phase === 'lobby') { if (!startGame(room)) send(p, { t: 'err', code: 'min', msg: 'Need at least ' + MINP + ' players (you can add bots).' }); } break;
    case 'lobby': if (isHost && room.phase !== 'lobby') toLobby(room, 'Host ended the game.'); break;
    case 'again': if (isHost && room.phase === 'final') toLobby(room); break;
    case 'skip': if (isHost && ['result'].includes(room.phase)) { room.dl = now(); } break;
    case 'clue': {
      if (room.phase !== 'clue' || !room.g || room.g.order[room.g.turn] !== p.pid) break;
      let w = cleanText(m.w, 40).split(' ')[0].slice(0, 20); if (!w) break;
      addClue(room, p, w); break;
    }
    case 'chat': {
      const tx = cleanText(m.m, 90); if (!tx || now() - p.chatAt < 600) break; p.chatAt = now();
      const msg = { t: 'chat', id: p.pid, m: tx, at: now() }; room.chat.push(msg); if (room.chat.length > 40) room.chat.shift(); sendRoom(room, msg); break;
    }
    case 'emote': if (typeof m.e === 'string' && m.e.length <= 8 && now() - (p.emoteAt || 0) > 400) { p.emoteAt = now(); sendRoom(room, { t: 'emote', id: p.pid, e: m.e }); } break;
    case 'meme': if (room.S.memes && room.phase !== 'reveal' && typeof m.id === 'string' && /^m\d{3}$/.test(m.id) && now() - p.memeAt > 2200) { p.memeAt = now(); sendRoom(room, { t: 'meme', id: p.pid, c: m.id }); } break;
    case 'ready': if (room.phase === 'discuss') {
      p.ready = !p.ready; const hp = connHumans(room); const rd = hp.filter(q => q.ready).length;
      pushState(room); if (hp.length && rd / hp.length >= 0.6) startVote(room);
    } break;
    case 'vote': if (room.phase === 'vote' && p.vote == null) { const to = m.to | 0; if (to !== p.pid && room.g.order.includes(to) && pById(room, to)) { p.vote = to; pushState(room); checkVoteDone(room); } } break;
    case 'tiepick': if (room.phase === 'tie' && room.g.dealer === p.pid && room.g.tied.includes(m.id | 0)) accuse(room, m.id | 0); break;
    case 'guess': guess(room, p, m.i | 0); break;
    case 'leave': p.token = 'x' + rid(); removePlayer(room, p, room.phase === 'lobby'); ws.ctx = null; break;
  }
}
function onEnter(ws, m) {
  if (ws.ctx) return;
  const fail = (code, msg) => ws.send(JSON.stringify({ t: 'err', code, msg }));
  if (m.t === 'create') {
    if (rooms.size > 400) return fail('busy', 'Server is busy. Try again in a minute.');
    const code = newCode(); if (!code) return fail('busy', 'Server is busy.');
    const room = newRoom(code); rooms.set(code, room);
    const p = addPlayer(room, m); room.host = p.pid; bind(ws, room, p); return;
  }
  const code = String(m.code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4), room = rooms.get(code);
  if (!room) return fail('no-room', 'Room ' + code + ' not found. Check the code, or ask the host to keep the game open.');
  if (m.t === 'resume') {
    const p = room.players.find(q => !q.bot && q.pid === (m.id | 0) && q.token === m.token);
    if (!p) return fail('no-seat', 'Your seat is gone.');
    if (p.ws && p.ws !== ws) { try { p.ws.ctx = null; p.ws.close(); } catch (e) { } }
    bind(ws, room, p, true); return;
  }
  if (room.phase !== 'lobby') return fail('started', 'Game already started. Wait for the next game.');
  if (room.players.length >= MAXP) return fail('full', 'Room is full (' + MAXP + ' players).');
  const p = addPlayer(room, m); bind(ws, room, p);
}
function bind(ws, room, p, resumed) {
  p.ws = ws; p.connected = true; p.seen = now(); p.gone = 0; ws.ctx = { room, p };
  send(p, { t: 'hello', id: p.pid, token: p.token, code: room.code, chat: room.chat, resumed: !!resumed, memes: room.S.memes });
  sendYou(room, p); pushState(room);
  if (!resumed) sys(room, p.name + ' joined');
  else if (room.phase !== 'lobby') sys(room, p.name + ' is back');
}
function onClose(ws) {
  const c = ws.ctx; if (!c) return; ws.ctx = null;
  const { room, p } = c; if (p.ws !== ws) return;
  p.ws = null; p.connected = false; p.seen = now();
  if (room.phase === 'lobby') { /* removed by tick after 25 s unless they come back */ }
  pushState(room);
}

/* ------------------------------------------------------------------ http */
let htmlCache = null, htmlGz = null, htmlMt = 0;
function loadHtml() {
  try { const st = fs.statSync(HTML_PATH); if (st.mtimeMs !== htmlMt) { htmlMt = st.mtimeMs; htmlCache = fs.readFileSync(HTML_PATH); htmlGz = zlib.gzipSync(htmlCache, { level: 9 }); } } catch (e) { htmlCache = null; }
}
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/health' || url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', 'cache-control': 'no-store' }); return res.end('ok ' + rooms.size); }
  if (url === '/' || url === '/index.html') {
    loadHtml();
    if (!htmlCache) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('index.html not found next to server.js'); }
    const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    res.writeHead(200, Object.assign({ 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }, gz ? { 'content-encoding': 'gzip' } : {}));
    return res.end(gz ? htmlGz : htmlCache);
  }
  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});
const wss = new WSS({ noServer: true, maxPayload: 8192 });
server.on('upgrade', (req, sock, head) => {
  if ((req.url || '').split('?')[0] !== '/ws') { sock.destroy(); return; }
  wss.handleUpgrade(req, sock, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', ws => {
  ws.alive = true; let cnt = 0, win = now();
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', d => {
    const t = now(); if (t - win > 1000) { win = t; cnt = 0; } if (++cnt > 60) return;
    let m; try { m = JSON.parse(d); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    try { onMsg(ws, m); } catch (e) { console.error('msg error', e); }
  });
  ws.on('close', () => onClose(ws));
  ws.on('error', () => { });
});
setInterval(() => { wss.clients.forEach(ws => { if (!ws.alive) { try { ws.terminate(); } catch (e) { } return; } ws.alive = false; try { ws.ping(); } catch (e) { } }); }, 20000);
server.listen(PORT, () => console.log('CHOMU CHAMELEON server on :' + PORT + ' (topics: ' + TOPICS.length + ')'));
module.exports = { rooms, TOPICS };
