require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const { parseArkGrid } = require("./lib/parseArkGrid");
const { getGemPrices } = require("./lib/gemPrices");
const homeworkDb = require("./lib/homeworkDb");
const { RAIDS, DAILIES } = require("./lib/homeworkContent");
const { getDayKey, getWeekKey } = require("./lib/homeworkReset");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.LOSTARK_API_KEY;

// 공개 배포 시 한 API 키를 여러 방문자가 나눠 쓰게 되므로, Lost Ark Open API를
// 실제로 호출하는 라우트만 IP당 호출 빈도를 제한한다.
app.set("trust proxy", 1);
const gemsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 잦습니다. 1분 후 다시 시도해 주세요." },
});
// 숙제체크는 Open API를 호출하지 않는 순수 DB CRUD라 체크박스를 연달아 눌러도
// 막히지 않도록 더 넉넉한 한도를 둔다.
const homeworkLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요." },
});
app.use("/api/gems", gemsLimiter);
app.use("/api/gem-prices", gemsLimiter);
app.use("/api/homework", homeworkLimiter);

app.use(express.json());
app.use(express.static("public"));

function sendHomeworkError(res, err) {
  console.error(err);
  res.status(err.statusCode || 500).json({ error: err.message || "서버 오류가 발생했습니다." });
}

let priceCache = null;
let priceCacheAt = 0;
const PRICE_CACHE_MS = 5 * 60 * 1000; // 5분 캐시 (거래소 API 호출 절약)

const gemsCache = new Map(); // name -> { at, data }
const GEMS_CACHE_MS = 60 * 1000; // 같은 닉네임 재검색은 1분간 캐시로 응답

app.get("/api/gems", async (req, res) => {
  const name = (req.query.name || "").trim();
  if (!name) {
    return res.status(400).json({ error: "닉네임을 입력해 주세요." });
  }
  if (!API_KEY) {
    return res.status(500).json({ error: "서버에 LOSTARK_API_KEY가 설정되어 있지 않습니다." });
  }

  const cached = gemsCache.get(name);
  if (cached && Date.now() - cached.at < GEMS_CACHE_MS) {
    return res.json(cached.data);
  }

  try {
    const base = `https://developer-lostark.game.onstove.com/armories/characters/${encodeURIComponent(name)}`;
    const authHeaders = { accept: "application/json", authorization: `bearer ${API_KEY}` };

    const [arkgridRes, profileRes] = await Promise.all([
      fetch(`${base}/arkgrid`, { headers: authHeaders }),
      fetch(`${base}/profiles`, { headers: authHeaders }),
    ]);

    if (arkgridRes.status === 404) {
      return res.status(404).json({ error: "해당 닉네임의 캐릭터를 찾을 수 없습니다." });
    }
    if (arkgridRes.status === 401 || arkgridRes.status === 403) {
      return res.status(500).json({ error: "API 키가 유효하지 않거나 만료되었습니다." });
    }
    if (!arkgridRes.ok) {
      return res.status(arkgridRes.status).json({ error: `Open API 오류 (status ${arkgridRes.status})` });
    }

    const raw = await arkgridRes.json();
    if (!raw || !raw.Slots || raw.Slots.length === 0) {
      return res.status(404).json({ error: "장착된 아크그리드 코어/젬 정보가 없습니다." });
    }

    let combatPower = null;
    if (profileRes.ok) {
      const profile = await profileRes.json();
      // "4,765.58" 같은 콤마 포함 문자열로 내려온다.
      const num = Number(String(profile.CombatPower || "").replace(/,/g, ""));
      combatPower = Number.isFinite(num) && num > 0 ? num : null;
    }

    const parsed = parseArkGrid(raw);
    const payload = { name, combatPower, ...parsed };
    gemsCache.set(name, { at: Date.now(), data: payload });
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

app.get("/api/gem-prices", async (req, res) => {
  if (!API_KEY) {
    return res.status(500).json({ error: "서버에 LOSTARK_API_KEY가 설정되어 있지 않습니다." });
  }

  const now = Date.now();
  if (priceCache && now - priceCacheAt < PRICE_CACHE_MS) {
    return res.json({ ...priceCache, cached: true });
  }

  try {
    const prices = await getGemPrices(API_KEY);
    priceCache = prices;
    priceCacheAt = now;
    res.json({ ...prices, cached: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "거래소 시세 조회 중 오류가 발생했습니다." });
  }
});

app.get("/api/homework/content", (req, res) => {
  res.json({ raids: RAIDS, dailies: DAILIES });
});

app.post("/api/homework/account", async (req, res) => {
  try {
    const account = await homeworkDb.createAccount();
    res.json(account);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.get("/api/homework/state", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.query.code);
    const characters = await homeworkDb.listCharacters(account.id);
    const characterIds = characters.map((c) => c.id);
    const weekKey = getWeekKey();
    const dayKey = getDayKey();
    const [raidChecks, dailyChecks, customTodos] = await Promise.all([
      homeworkDb.getRaidChecks(characterIds, weekKey),
      homeworkDb.getDailyChecks(characterIds, dayKey),
      homeworkDb.listCustomTodos(account.id),
    ]);
    res.json({ code: account.code, characters, raidChecks, dailyChecks, customTodos, weekKey, dayKey });
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.post("/api/homework/characters", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    const nickname = (req.body.nickname || "").trim();
    if (!nickname) return res.status(400).json({ error: "닉네임을 입력해 주세요." });
    const character = await homeworkDb.addCharacter(account.id, nickname);
    res.json(character);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.delete("/api/homework/characters/:id", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    await homeworkDb.deleteCharacter(account.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

async function assertOwnsCharacter(accountId, characterId) {
  const characters = await homeworkDb.listCharacters(accountId);
  if (!characters.some((c) => c.id === characterId)) {
    const err = new Error("권한이 없습니다.");
    err.statusCode = 403;
    throw err;
  }
}

app.post("/api/homework/raid-check", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    const { characterId, raidKey, difficulty, gate } = req.body;
    await assertOwnsCharacter(account.id, characterId);
    const result = await homeworkDb.toggleRaidCheck(characterId, raidKey, difficulty, Number(gate));
    res.json(result);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.post("/api/homework/daily-check", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    const { characterId, contentKey } = req.body;
    await assertOwnsCharacter(account.id, characterId);
    const result = await homeworkDb.toggleDailyCheck(characterId, contentKey);
    res.json(result);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.post("/api/homework/custom", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    const label = (req.body.label || "").trim();
    if (!label) return res.status(400).json({ error: "항목 이름을 입력해 주세요." });
    const resetType = ["none", "daily", "weekly"].includes(req.body.resetType) ? req.body.resetType : "weekly";
    const todo = await homeworkDb.addCustomTodo(account.id, label, resetType);
    res.json(todo);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.patch("/api/homework/custom/:id", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    const result = await homeworkDb.toggleCustomTodo(account.id, req.params.id);
    if (!result) return res.status(404).json({ error: "항목을 찾을 수 없습니다." });
    res.json(result);
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.delete("/api/homework/custom/:id", async (req, res) => {
  try {
    const account = await homeworkDb.requireAccount(req.body.code);
    await homeworkDb.deleteCustomTodo(account.id, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    sendHomeworkError(res, err);
  }
});

app.listen(PORT, () => {
  console.log(`arkgrid-gem-viewer running at http://localhost:${PORT}`);
});
