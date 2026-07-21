require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const { parseArkGrid } = require("./lib/parseArkGrid");
const { getGemPrices } = require("./lib/gemPrices");

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.LOSTARK_API_KEY;

// 공개 배포 시 한 API 키를 여러 방문자가 나눠 쓰게 되므로, Lost Ark Open API
// 쿼터가 소진되지 않도록 IP당 호출 빈도를 제한한다.
app.set("trust proxy", 1);
const gemsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "요청이 너무 잦습니다. 1분 후 다시 시도해 주세요." },
});
app.use("/api/", gemsLimiter);

app.use(express.static("public"));

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

app.listen(PORT, () => {
  console.log(`arkgrid-gem-viewer running at http://localhost:${PORT}`);
});
