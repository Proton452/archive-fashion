/* ==============================================
   Football tab: leagues and clubs guessed from the jersey names.
   - CSV jerseys ("Adidas Jersey"…): title + style names from Weidian
     (Chinese, e.g. "2526切尔西客场"), matched once by scripts/jersey_skus.js
     → data/football.json { item id: [team ids] }
   - Sheet jerseys: their English title, matched in the browser
   An item can be several teams (one listing with many club styles).
   Shared with Node (module.exports), like js/prices.js.
============================================== */
(function (root) {
  // Order of the chips. "other" gathers the clubs of smaller leagues.
  const LEAGUES = [
    ['international', 'International'],
    ['premier-league', 'Premier League'],
    ['la-liga', 'La Liga'],
    ['serie-a', 'Serie A'],
    ['bundesliga', 'Bundesliga'],
    ['ligue-1', 'Ligue 1'],
    ['saudi', 'Saudi Pro League'],
    ['brasileirao', 'Brasileirão'],
    ['liga-mx', 'Liga MX'],
    ['other', 'Other clubs'],
  ];

  // [id, name, league, pattern] — pattern is tested on the lowercased text
  const TEAMS = [
    // ─── Premier League
    ['arsenal', 'Arsenal', 'premier-league', 'arsenal|阿森纳'],
    ['chelsea', 'Chelsea', 'premier-league', 'chelsea|切尔西|科尔韦尔'],
    ['man-united', 'Manchester United', 'premier-league', 'manchester united|man united|man utd|曼联'],
    ['man-city', 'Manchester City', 'premier-league', 'manchester city|man city|曼城|万城'],
    ['liverpool', 'Liverpool', 'premier-league', 'liverpool|利物浦'],
    ['tottenham', 'Tottenham', 'premier-league', 'tottenham|spurs|热刺|托特纳姆'],
    ['newcastle', 'Newcastle', 'premier-league', 'newcastle|纽卡斯'],
    ['aston-villa', 'Aston Villa', 'premier-league', 'aston villa|维拉'],
    ['west-ham', 'West Ham', 'premier-league', 'west ham|西汉姆'],
    ['brighton', 'Brighton', 'premier-league', 'brighton|布莱顿'],
    ['crystal-palace', 'Crystal Palace', 'premier-league', 'crystal palace|水晶宫'],
    ['fulham', 'Fulham', 'premier-league', 'fulham|富勒姆'],
    ['leeds', 'Leeds United', 'premier-league', 'leeds|利兹联'],
    ['wolves', 'Wolves', 'premier-league', 'wolves|wolverhampton|狼队'],
    ['sunderland', 'Sunderland', 'premier-league', 'sunderland|桑德兰'],
    // ─── La Liga
    ['real-madrid', 'Real Madrid', 'la-liga', 'real madrid|(?<!atl[eé]tico )\\bmadrid\\b(?! ?atl)|皇马|黄码|皇家马德里'],
    ['barcelona', 'Barcelona', 'la-liga', 'barcelona|barça|yamal|\\bbarca\\b|巴萨|巴塞(?!尔)'],
    ['atletico', 'Atlético Madrid', 'la-liga', 'atl[eé]tico madrid|atletico de madrid|马竞|马德里竞技'],
    ['betis', 'Real Betis', 'la-liga', 'betis|贝蒂斯'],
    ['celta', 'Celta Vigo', 'la-liga', 'celta|塞尔塔'],
    // ─── Serie A
    ['ac-milan', 'AC Milan', 'serie-a', 'ac milan|(?<![a-z])ac(?![a-z])|米兰(?<!国际米兰)'],
    ['inter', 'Inter', 'serie-a', 'inter milan|\\binter\\b(?! ?miami)|国米|国际米兰'],
    ['juventus', 'Juventus', 'serie-a', 'juventus|\\bjuve\\b|尤文'],
    ['napoli', 'Napoli', 'serie-a', 'napoli|naples|那不勒斯'],
    ['roma', 'AS Roma', 'serie-a', '\\bas roma\\b|\\broma\\b|罗马(?!尼亚)'],
    ['lazio', 'Lazio', 'serie-a', 'lazio|拉齐奥'],
    ['atalanta', 'Atalanta', 'serie-a', 'atalanta|亚特兰大'],
    ['como', 'Como', 'serie-a', '\\bcomo\\b|科莫'],
    ['genoa', 'Genoa', 'serie-a', 'genoa|热那亚'],
    // ─── Bundesliga
    ['bayern', 'Bayern Munich', 'bundesliga', '\\bbayern\\b(?! leverkusen)|拜仁'],
    ['dortmund', 'Dortmund', 'bundesliga', 'dortmund|\\bbvb\\b|多特'],
    ['leverkusen', 'Leverkusen', 'bundesliga', 'leverkusen|勒沃库森|勒物库森'],
    ['leipzig', 'RB Leipzig', 'bundesliga', 'leipzig|莱比锡'],
    ['koln', 'Köln', 'bundesliga', 'k[öo]ln|cologne|科隆'],
    // ─── Ligue 1
    ['psg', 'PSG', 'ligue-1', '\\bpsg\\b|paris saint|paris sg|巴黎'],
    ['marseille', 'Marseille', 'ligue-1', 'marseille|\\bom\\b|马赛'],
    ['lyon', 'Lyon', 'ligue-1', '\\blyon\\b|里昂'],
    ['lille', 'Lille', 'ligue-1', '\\blille\\b|里尔'],
    ['monaco', 'Monaco', 'ligue-1', 'monaco|摩纳哥'],
    // ─── Saudi Pro League
    ['al-nassr', 'Al Nassr', 'saudi', 'al[ -]?nass?r|利雅得胜利'],
    ['al-hilal', 'Al Hilal', 'saudi', 'al[ -]?hilal|利雅得新月'],
    ['al-ittihad', 'Al Ittihad', 'saudi', 'al[ -]?ittihad|吉达联合'],
    ['al-ahli', 'Al Ahli', 'saudi', 'al[ -]?ahli|阿尔阿赫利|吉达国民'],
    // ─── Brasileirão
    ['flamengo', 'Flamengo', 'brasileirao', 'flamengo|flamenco|弗拉门戈|佛拉门戈'],
    ['corinthians', 'Corinthians', 'brasileirao', 'corinthians|科林蒂安'],
    ['cruzeiro', 'Cruzeiro', 'brasileirao', 'cruzeiro|克鲁塞罗'],
    ['fluminense', 'Fluminense', 'brasileirao', 'fluminense|弗鲁米嫩赛'],
    ['palmeiras', 'Palmeiras', 'brasileirao', 'palmeiras|帕尔梅拉斯'],
    ['santos', 'Santos', 'brasileirao', '\\bsantos\\b|桑托斯'],
    ['sao-paulo', 'São Paulo', 'brasileirao', 's[ãa]o paulo|圣保罗'],
    ['internacional', 'Internacional', 'brasileirao', 'internacional|巴西国际'],
    ['bahia', 'Bahia', 'brasileirao', '\\bbahia\\b|巴伊亚'],
    // ─── Liga MX
    ['america', 'Club América', 'liga-mx', 'club am[eé]rica|美[州洲](?![狮杯])'],
    ['pumas', 'Pumas', 'liga-mx', '\\bpumas\\b|美[州洲]狮'],
    ['tigres', 'Tigres', 'liga-mx', 'tigres|老虎队'],
    ['cruz-azul', 'Cruz Azul', 'liga-mx', 'cruz azul|蓝十字'],
    ['chivas', 'Chivas', 'liga-mx', 'chivas|guadalajara|芝华士'],
    ['leon', 'Club León', 'liga-mx', 'club le[oó]n|莱昂'],
    ['monterrey', 'Monterrey', 'liga-mx', 'monterrey|蒙特雷'],
    ['inter-miami', 'Inter Miami', 'other', 'miami|迈阿密'],
    ['minnesota', 'Minnesota United', 'other', 'minnesota|明尼苏达'],
    // ─── Other clubs
    ['ajax', 'Ajax', 'other', '\\bajax\\b|阿贾克斯'],
    ['celtic', 'Celtic', 'other', 'celtic|凯尔特人'],
    ['sporting', 'Sporting CP', 'other', 'sporting|里斯本竞技'],
    ['boca', 'Boca Juniors', 'other', '\\bboca\\b|博卡'],
    ['river', 'River Plate', 'other', 'river plate|河床'],
    ['al-ain', 'Al Ain', 'other', 'al[ -]?ain\\b|艾因'],
    ['millonarios', 'Millonarios', 'other', 'millonarios|百万富翁'],
    ['atletico-nacional', 'Atlético Nacional', 'other', 'atl[eé]tico nacional|国民竞技'],
    ['wrexham', 'Wrexham', 'other', 'wrexham|雷克瑟姆'],
    ['middlesbrough', 'Middlesbrough', 'other', 'middlesbrough|米德尔斯堡'],
    ['portsmouth', 'Portsmouth', 'other', 'portsmouth|朴茨茅斯'],
    ['racing-santander', 'Racing Santander', 'other', 'santander|桑坦德'],
    ['tenerife', 'Tenerife', 'other', 'tenerife|特内里费'],
    ['valladolid', 'Valladolid', 'other', 'valladolid|巴拉多利德'],
    ['cordoba', 'Córdoba', 'other', 'c[óo]rdoba|科尔多瓦'],
    ['legia', 'Legia Warsaw', 'other', 'legia|华沙军团'],
    ['maccabi', 'Maccabi Tel Aviv', 'other', 'maccabi|特拉维夫马卡比'],
    // ─── International
    ['france', 'France', 'international', 'france|french|法国'],
    ['spain', 'Spain', 'international', '\\bspain\\b|spanish|西班牙'],
    ['portugal', 'Portugal', 'international', 'portugal|葡萄牙'],
    ['germany', 'Germany', 'international', 'germany|german|德国'],
    ['italy', 'Italy', 'international', '\\bitaly\\b|italian|意大利'],
    ['england', 'England', 'international', 'england|英格兰'],
    ['brazil', 'Brazil', 'international', 'brazil|巴西(?!国际)'],
    ['argentina', 'Argentina', 'international', 'argentin|阿根廷'],
    ['netherlands', 'Netherlands', 'international', 'netherlands|holland|dutch|荷兰'],
    ['belgium', 'Belgium', 'international', 'belgium|比利时'],
    ['croatia', 'Croatia', 'international', 'croatia|克罗地亚'],
    ['switzerland', 'Switzerland', 'international', 'switzerland|swiss|瑞士'],
    ['norway', 'Norway', 'international', 'norway|挪威'],
    ['scotland', 'Scotland', 'international', 'scotland|苏格兰'],
    ['greece', 'Greece', 'international', 'greece|希腊'],
    ['albania', 'Albania', 'international', 'albania|阿尔巴尼亚'],
    ['japan', 'Japan', 'international', 'japan|tokyo|日本'],
    ['korea', 'South Korea', 'international', 'korea|韩国'],
    ['china', 'China', 'international', '\\bchina\\b|中国队'],
    ['australia', 'Australia', 'international', 'australia|澳大利亚'],
    ['philippines', 'Philippines', 'international', 'philippines|菲律宾'],
    ['saudi-arabia', 'Saudi Arabia', 'international', 'saudi|沙特(?!联)'],
    ['palestine', 'Palestine', 'international', 'palestin|巴勒斯坦'],
    ['mexico', 'Mexico', 'international', 'mexico|墨西哥'],
    ['usa', 'USA', 'international', '\\busa\\b|united states|美国'],
    ['canada', 'Canada', 'international', 'canada|加拿大'],
    ['jamaica', 'Jamaica', 'international', 'jamaica|牙买加'],
    ['costa-rica', 'Costa Rica', 'international', 'costa rica|哥斯达黎加'],
    ['curacao', 'Curaçao', 'international', 'cura[cç]ao|库拉索'],
    ['colombia', 'Colombia', 'international', 'colombia|哥伦比亚'],
    ['uruguay', 'Uruguay', 'international', 'uruguay|乌拉圭'],
    ['venezuela', 'Venezuela', 'international', 'venezuela|委内瑞拉'],
    ['chile', 'Chile', 'international', '\\bchile\\b|智利'],
    ['paraguay', 'Paraguay', 'international', 'paraguay|巴拉圭'],
    ['morocco', 'Morocco', 'international', 'morocco|maroc|摩洛哥'],
    ['algeria', 'Algeria', 'international', 'algeria|alg[eé]rie|阿尔及利亚'],
    ['tunisia', 'Tunisia', 'international', 'tunisia|突尼斯'],
    ['senegal', 'Senegal', 'international', 's[eé]n[eé]gal|塞内加尔'],
    ['nigeria', 'Nigeria', 'international', 'nigeria|尼日利亚'],
    ['congo', 'Congo', 'international', 'congo|刚果'],
    ['ghana', 'Ghana', 'international', 'ghana|加纳'],
    ['cameroon', 'Cameroon', 'international', 'cameroon|喀麦隆'],
    ['ivory-coast', 'Ivory Coast', 'international', 'ivory coast|c[ôo]te d.ivoire|科特迪瓦'],
  ].map(([id, name, league, pattern]) => ({ id, name, league, re: new RegExp(pattern, 'i') }));

  // Teams removed by hand from a CSV jersey (Lovegobuy item id → team ids), e.g. a
  // listing with many styles where that team is only a minor one
  const EXCLUDE = {
    '7805994667': ['palestine'],   // Adidas Jersey (mostly Brazil)
    '7805941517': ['nigeria'],     // Many Brand Jersey
  };

  const BY_ID = new Map(TEAMS.map(t => [t.id, t]));

  // Team ids found in a text (title, style names…), in the order of TEAMS
  function classify(text) {
    const s = String(text || '').toLowerCase();
    return TEAMS.filter(t => t.re.test(s)).map(t => t.id);
  }

  const api = {
    LEAGUES,
    TEAMS,
    team: id => BY_ID.get(id),
    classify,
    EXCLUDE,
  };

  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Football = api;
})(typeof window !== 'undefined' ? window : globalThis);
