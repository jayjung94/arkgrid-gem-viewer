const form = document.getElementById("searchForm");
const input = document.getElementById("nameInput");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const replacementSectionEl = document.getElementById("replacementSection");

let currentCharacterData = null;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = input.value.trim();
  if (!name) return;
  await search(name);
});

async function search(name) {
  statusEl.textContent = `"${name}" 검색 중...`;
  statusEl.classList.remove("error");
  resultEl.innerHTML = "";
  document.getElementById("gemLuck").innerHTML = "";
  replacementSectionEl.style.display = "none";

  try {
    const res = await fetch(`/api/gems?name=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || "알 수 없는 오류가 발생했습니다.";
      statusEl.classList.add("error");
      currentCharacterData = null;
      return;
    }

    statusEl.textContent = `${data.name} 님의 아크그리드 (코어 ${data.cores.length}개)`;
    currentCharacterData = data;
    render(data);
    renderGemLuck(data, currentRole());
    replacementSectionEl.style.display = "";
    renderReplacementPlan();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "서버에 연결할 수 없습니다.";
    statusEl.classList.add("error");
    currentCharacterData = null;
  }
}

function render(data) {
  resultEl.innerHTML = "";

  if (data.effects && data.effects.length > 0) {
    const box = document.createElement("div");
    box.className = "effects-summary";
    data.effects.forEach((eff) => {
      const span = document.createElement("div");
      span.className = "effect";
      span.innerHTML = `<span class="name">${eff.Name}</span><span class="lvl">Lv.${eff.Level}</span>`;
      box.appendChild(span);
    });
    resultEl.appendChild(box);
  }

  const grid = document.createElement("div");
  grid.className = "cores-grid";

  data.cores.forEach((core) => {
    grid.appendChild(renderCore(core));
  });

  resultEl.appendChild(grid);
}

function renderCore(core) {
  const el = document.createElement("div");
  const isOrder = core.name.includes("질서");
  el.className = `core-card ${isOrder ? "order" : "chaos"}`;

  const over = core.willpowerBudget != null && core.usedWillpower > core.willpowerBudget;

  el.innerHTML = `
    <div class="core-head">
      <div class="core-name">${core.name}</div>
      <div class="core-grade grade-${core.grade}">${core.grade}</div>
    </div>
    <div class="core-meta">
      <span>의지력 <b class="${over ? "over" : ""}">${core.usedWillpower}</b> / ${core.willpowerBudget ?? "?"}</span>
      <span>포인트 <b>${core.totalPoint}</b> / ${core.maxPoint}</span>
    </div>
    <div class="gem-list"></div>
  `;

  const role = currentRole();
  const list = el.querySelector(".gem-list");
  if (!core.gems || core.gems.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-note";
    empty.textContent = "장착된 젬이 없습니다.";
    list.appendChild(empty);
  } else {
    let worstIdx = -1;
    let worstVal = Infinity;
    core.gems.forEach((gem, i) => {
      const v = valueOfGem(gem, role);
      if (v < worstVal) {
        worstVal = v;
        worstIdx = i;
      }
    });
    core.gems.forEach((gem, i) => list.appendChild(renderGem(gem, { flagWorst: i === worstIdx, role })));
  }

  return el;
}

function renderGem(gem, opts = {}) {
  const role = opts.role || currentRole();
  const row = document.createElement("div");
  row.className = "gem-row" + (opts.flagWorst ? " flag-worst" : "");

  const optionsHtml = gem.options
    .map(
      (o) =>
        `<span class="gem-option">${o.name}<span class="lv">Lv.${o.level}</span></span>`
    )
    .join("");

  const val = valueOfGem(gem, role);
  const idealMax = idealMaxForTier(role, gem.tier);
  const unit = ROLE_UNIT[role];
  const gap = idealMax - val;
  const powerGain = estimatePowerGain(gap, role);

  let dpsHtml;
  if (isFullyComplete(gem, role)) {
    dpsHtml = `<div class="gem-value gem-complete">완전 종결 젬 (의지력·포인트·옵션 모두 기준 충족)</div>`;
  } else if (isGemComplete(gem, role)) {
    const wpSlack = willpowerSlack(gem);
    const wpText =
      wpSlack > 0
        ? `의지력이 기준보다 <b>${wpSlack}</b> 높아요 (기준 ${TIER_TARGET_WILLPOWER[gem.tier]}, 현재 ${gem.willpower})`
        : gem.corePoint !== TIER_TARGET_POINT
        ? `포인트가 기준(${TIER_TARGET_POINT})과 달라요 (현재 ${gem.corePoint})`
        : "";
    dpsHtml = `<div class="gem-value gem-complete">옵션은 종결이에요 — ${wpText}</div>`;
  } else if (isSemiComplete(gem, role)) {
    dpsHtml = `<div class="gem-value gem-semi">준종결 젬이에요 (옵션 레벨 합 9) — 충분히 좋은 상태예요</div>`;
  } else if (powerGain != null) {
    dpsHtml = `<div class="gem-value">완벽 재가공 시 예상 전투력 <b>+${powerGain.toFixed(2)}</b></div>`;
  } else {
    dpsHtml = `<div class="gem-value">${ROLE_LABEL[role]} 가치 기여도 <b>${fmtValue(val, role)}${unit}</b> (이론 최대 ${fmtValue(idealMax, role)}${unit})</div>`;
  }

  row.innerHTML = `
    <img src="${gem.icon}" alt="${gem.tier}" />
    <div class="gem-body">
      <div class="gem-title-row">
        <span class="gem-tier">${gem.gemType ?? ""} · ${gem.tier}</span>
        <span class="gem-grade-tag grade-${gem.grade}">${gem.grade}</span>
      </div>
      <div class="gem-stats">
        <span>필요 의지력 <b>${gem.willpower ?? "-"}</b> (기본 ${gem.willpowerBase ?? "-"} − 효율 ${gem.willpowerEfficiency ?? "-"})</span>
        <span>포인트 <b>${gem.corePoint ?? "-"}</b></span>
      </div>
      <div class="gem-options">${optionsHtml}</div>
      ${dpsHtml}
    </div>
  `;

  return row;
}

/* ---------------------------------------------------------------------- */
/* 역할별(딜러/서포터) 옵션 가치 환산 테이블                                    */
/* ---------------------------------------------------------------------- */

// 딜러: 레벨별 데미지 증가량(%). 이 3개 외 옵션(낙인력/아군 피해 강화/아군 공격 강화)은 0으로 취급.
const DPS_TABLE = {
  "보스 피해": { 5: 0.391, 4: 0.313, 3: 0.244, 2: 0.156, 1: 0.078 },
  "추가 피해": { 5: 0.299, 4: 0.239, 3: 0.187, 2: 0.119, 1: 0.06 },
  공격력: { 5: 0.172, 4: 0.134, 3: 0.105, 2: 0.067, 1: 0.029 },
};

// 서포터: 레벨당 전투력 점수(선형). 1렙 기준 아공강 4.13 / 낙인력 2.915 / 아피강 1.67.
// 공격력/추가피해/보스피해 등 딜러용 옵션은 0으로 취급.
function linearTable(perLevel) {
  const t = {};
  for (let lv = 1; lv <= 5; lv++) t[lv] = Number((perLevel * lv).toFixed(3));
  return t;
}
const SUPPORT_TABLE = {
  "아군 공격 강화": linearTable(4.13),
  낙인력: linearTable(2.915),
  "아군 피해 강화": linearTable(1.67),
};

const ROLE_TABLES = { dealer: DPS_TABLE, support: SUPPORT_TABLE };
const ROLE_UNIT = { dealer: "%", support: "점" };
const ROLE_LABEL = { dealer: "딜러", support: "서포터" };

function idealMaxFor(role) {
  const table = ROLE_TABLES[role];
  return Object.values(table)
    .map((lv) => lv[5])
    .sort((a, b) => b - a)
    .slice(0, 2)
    .reduce((a, b) => a + b, 0);
}

// 티어마다 실제로 노려야 하는 "종결" 2옵션 조합 (사용자 제공 값 기준).
// 안정=침식, 견고=왜곡, 불변=붕괴가 각각 같은 목표 조합을 쓴다.
const TIER_TARGET_PAIR = {
  dealer: {
    안정: ["공격력", "추가 피해"],
    견고: ["공격력", "보스 피해"],
    불변: ["추가 피해", "보스 피해"],
    침식: ["공격력", "추가 피해"],
    왜곡: ["공격력", "보스 피해"],
    붕괴: ["추가 피해", "보스 피해"],
  },
  support: {
    안정: ["낙인력", "아군 피해 강화"],
    견고: ["아군 공격 강화", "아군 피해 강화"],
    불변: ["아군 공격 강화", "낙인력"],
    침식: ["낙인력", "아군 피해 강화"],
    왜곡: ["아군 공격 강화", "아군 피해 강화"],
    붕괴: ["아군 공격 강화", "낙인력"],
  },
};

// 이 티어의 "종결" 조합(2옵션 모두 Lv.5)이 만드는 값. 티어마다 목표 조합 자체가 다르므로
// 안정 < 견고 < 불변 순으로 커진다 (의지력을 더 쓰는 만큼 상한도 높다).
function idealMaxForTier(role, tier) {
  const pair = TIER_TARGET_PAIR[role]?.[tier];
  if (!pair) return idealMaxFor(role);
  return pair.reduce((sum, name) => sum + valueOf(role, name, 5), 0);
}

// 종결 젬의 필요 의지력·포인트 (질서/혼돈 동일 티어끼리는 같은 기준).
const TIER_TARGET_WILLPOWER = { 안정: 3, 견고: 4, 불변: 5, 침식: 3, 왜곡: 4, 붕괴: 5 };
const TIER_TARGET_POINT = 5;

function currentRole() {
  return document.querySelector('input[name="role"]:checked')?.value || "dealer";
}

function valueOf(role, optionName, level) {
  return ROLE_TABLES[role][optionName]?.[level] ?? 0;
}

function valueOfGem(gem, role) {
  return gem.options.reduce((sum, o) => sum + valueOf(role, o.name, o.level), 0);
}

function fmtValue(v, role) {
  return role === "dealer" ? v.toFixed(3) : v.toFixed(2);
}

// 이 젬의 옵션 2개(이름)가 티어가 노리는 "종결" 조합(TIER_TARGET_PAIR)과 같은지만 본다
// (레벨은 상관없이 이름만).
function matchesTargetPair(gem, role) {
  const target = TIER_TARGET_PAIR[role]?.[gem.tier];
  if (!target || gem.options.length !== 2) return false;
  const names = gem.options.map((o) => o.name).sort();
  const targetNames = [...target].sort();
  return names.length === targetNames.length && names.every((n, i) => n === targetNames[i]);
}

function optionLevelSum(gem) {
  return gem.options.reduce((sum, o) => sum + o.level, 0);
}

// 종결 조합과 같은 옵션이 둘 다 Lv.5(합 10)로 떠 있으면 "옵션 종결". 재가공은 같은
// 젬의 레벨을 올리는 게 아니라 완전히 새 젬을 뽑는 도박이라, 이미 옵션이 종결된
// 젬을 "고쳐야 할 것"으로 추천하면 안 된다. (의지력/포인트는 isFullyComplete에서 별도 확인)
function isGemComplete(gem, role) {
  return matchesTargetPair(gem, role) && gem.options.every((o) => o.level === 5);
}

// 옵션 종결에 더해 의지력·포인트까지 사용자가 지정한 종결 기준과 정확히 같으면
// "완전 종결". 옵션은 종결인데 의지력이 기준보다 높은 경우(효율 롤이 아쉬운 경우)를
// 구분해서 보여주기 위함.
function isFullyComplete(gem, role) {
  if (!isGemComplete(gem, role)) return false;
  const targetWillpower = TIER_TARGET_WILLPOWER[gem.tier];
  return gem.willpower === targetWillpower && gem.corePoint === TIER_TARGET_POINT;
}

// "준종결": 종결 조합과 같은 옵션인데 레벨 합이 9(예: Lv.5 + Lv.4)이고, 의지력도
// 이 티어의 기준 의지력이거나 그보다 1 높은 경우(효율 5 또는 4 롤)까지 인정한다.
function isSemiComplete(gem, role) {
  if (!matchesTargetPair(gem, role) || isGemComplete(gem, role)) return false;
  if (optionLevelSum(gem) !== 9) return false;
  const targetWillpower = TIER_TARGET_WILLPOWER[gem.tier];
  if (targetWillpower == null || gem.willpower == null) return false;
  return gem.willpower === targetWillpower || gem.willpower === targetWillpower + 1;
}

function willpowerSlack(gem) {
  const targetWillpower = TIER_TARGET_WILLPOWER[gem.tier];
  if (targetWillpower == null || gem.willpower == null) return 0;
  return gem.willpower - targetWillpower;
}

/* ---------------------------------------------------------------------- */
/* 젬 가공 "총 기대값" — 몬테카를로 시뮬레이션(영웅 등급 원석 기준, 100만 회) 결과 */
/* ---------------------------------------------------------------------- */

// 완전종결/준종결/옵션만 완성(의지력·포인트 미달) 각각이 실제로 나올 확률.
// 티어(안정/견고/불변 등)는 확률에 영향이 없어 등급(원석 고급/희귀/영웅)만 반영했고,
// 그중 실전에서 고점용으로 실제 쓰이는 영웅 등급 기준값을 썼다.
const HERO_GRADE_LUCK = {
  full: 0.000303, // 완전종결: 효율5·포인트5·옵션 둘 다 목표 Lv.5
  optionOnly: 0.005614, // 옵션은 완성(둘 다 Lv.5)인데 효율/포인트가 기준 미달
  semi: 0.005108, // 준종결: 옵션 레벨 합 9, 효율 4 이상
};
HERO_GRADE_LUCK.other = 1 - HERO_GRADE_LUCK.full - HERO_GRADE_LUCK.optionOnly - HERO_GRADE_LUCK.semi;

function gemLuckBucket(gem, role) {
  if (isFullyComplete(gem, role)) return "full";
  if (isGemComplete(gem, role)) return "optionOnly";
  if (isSemiComplete(gem, role)) return "semi";
  return "other";
}

function computeGemLuck(cores, role) {
  const counts = { full: 0, optionOnly: 0, semi: 0, other: 0 };
  let totalExpectedTries = 0;
  let totalGems = 0;

  cores.forEach((core) => {
    core.gems.forEach((gem) => {
      const bucket = gemLuckBucket(gem, role);
      counts[bucket] += 1;
      totalExpectedTries += 1 / HERO_GRADE_LUCK[bucket];
      totalGems += 1;
    });
  });

  return { counts, totalExpectedTries, totalGems };
}

function renderGemLuck(data, role) {
  const el = document.getElementById("gemLuck");
  if (!el) return;
  if (!data.cores || data.cores.length === 0) {
    el.innerHTML = "";
    return;
  }

  const { counts, totalExpectedTries, totalGems } = computeGemLuck(data.cores, role);

  el.innerHTML = `
    <div class="gem-luck-title">🎲 젬 가공 총 기대값 <span class="gem-luck-note">(영웅 등급 원석 기준 추정)</span></div>
    <div class="gem-luck-main">장착 젬 ${totalGems}개를 만들려면 통계적으로 총 <b>약 ${Math.round(
    totalExpectedTries
  ).toLocaleString()}회</b>의 가공 시도가 기대돼요.</div>
    <div class="gem-luck-breakdown">
      완전종결 <b>${counts.full}</b>개 · 준종결 <b>${counts.semi}</b>개 ·
      옵션만 완성 <b>${counts.optionOnly}</b>개 · 그 외 <b>${counts.other}</b>개
    </div>
  `;
}

/* ---------------------------------------------------------------------- */
/* 젬 시세 & 조합 시나리오 비교                                              */
/* ---------------------------------------------------------------------- */

const SCENARIOS = {
  A: { label: "안정 + 견고 + 불변 + 불변", tag: "최상", counts: { 1: 1, 2: 1, 3: 2 } },
  B: { label: "견고 + 견고 + 견고 + 불변", tag: "차선", counts: { 2: 3, 3: 1 } },
};

const TIER_RANK = {
  order: { 안정: 1, 견고: 2, 불변: 3 },
  chaos: { 침식: 1, 왜곡: 2, 붕괴: 3 },
};
const RANK_TIER = {
  order: { 1: "안정", 2: "견고", 3: "불변" },
  chaos: { 1: "침식", 2: "왜곡", 3: "붕괴" },
};

const priceStatusEl = document.getElementById("priceStatus");
const priceTableEl = document.getElementById("priceTable");
let gemPriceData = null;

document.querySelectorAll('input[name="scenario"]').forEach((radio) => {
  radio.addEventListener("change", () => renderReplacementPlan());
});

async function loadGemPrices() {
  priceStatusEl.textContent = "거래소 시세 불러오는 중...";
  try {
    const res = await fetch("/api/gem-prices");
    const data = await res.json();
    if (!res.ok) {
      priceStatusEl.textContent = data.error || "시세를 불러오지 못했습니다.";
      return;
    }
    gemPriceData = data;
    const fetchedAt = new Date(data.fetchedAt).toLocaleString("ko-KR");
    priceStatusEl.textContent = `${fetchedAt} 조회${data.cached ? " · 캐시" : ""}`;
    renderPriceTable();
    renderReplacementPlan();
  } catch (err) {
    console.error(err);
    priceStatusEl.textContent = "서버에 연결할 수 없습니다.";
  }
}

function renderPriceTable() {
  if (!gemPriceData) return;

  const all = [...gemPriceData.order, ...gemPriceData.chaos]
    .filter((r) => r.currentMinPrice != null)
    .sort((a, b) => a.currentMinPrice - b.currentMinPrice);

  const rowsHtml = all
    .map((r, i) => {
      const delta = r.yDayAvgPrice != null ? r.currentMinPrice - r.yDayAvgPrice : null;
      let deltaHtml = "-";
      if (delta != null) {
        const cls = delta <= 0 ? "delta-down" : "delta-up";
        const sign = delta > 0 ? "+" : "";
        deltaHtml = `<span class="${cls}">${sign}${delta.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`;
      }
      return `
      <tr>
        <td><span class="rank-num">${i + 1}</span><img src="${r.icon}" alt="" />${r.side === "order" ? "질서" : "혼돈"} · ${r.tier}</td>
        <td class="num">${r.currentMinPrice.toLocaleString()}</td>
        <td class="num">${r.yDayAvgPrice != null ? r.yDayAvgPrice.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}</td>
        <td class="num">${deltaHtml}</td>
      </tr>`;
    })
    .join("");

  priceTableEl.innerHTML = `
    <table>
      <thead>
        <tr><th>티어 (영웅 등급)</th><th class="num">현재 최저가</th><th class="num">어제 평균가</th><th class="num">전일 대비</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

/* ---------------------------------------------------------------------- */
/* 딜러 기준 교체 우선순위                                                   */
/* ---------------------------------------------------------------------- */

function buildCorePlan(core, scenarioKey, role) {
  const side = core.name.includes("질서") ? "order" : "chaos";
  const remaining = { ...SCENARIOS[scenarioKey].counts };

  const gems = core.gems.map((g, idx) => ({
    gem: g,
    idx,
    rank: TIER_RANK[side][g.tier] ?? null,
    value: valueOfGem(g, role),
  }));

  // 값이 높은 젬부터 목표 티어 슬롯을 선점하게 해서, 같은 티어가 남을 때
  // 가장 옵션이 나쁜 것부터 "교체 대상"으로 밀려나게 한다.
  const byValueDesc = [...gems].sort((a, b) => b.value - a.value);
  byValueDesc.forEach((g) => {
    if (g.rank != null && remaining[g.rank] > 0) {
      g.tierOk = true;
      remaining[g.rank] -= 1;
    } else {
      g.tierOk = false;
    }
  });

  const missingRanks = [];
  Object.entries(remaining).forEach(([rank, count]) => {
    for (let i = 0; i < count; i++) missingRanks.push(Number(rank));
  });

  const mismatched = gems.filter((g) => !g.tierOk).sort((a, b) => a.value - b.value);
  mismatched.forEach((g, i) => {
    g.recommendedRank = missingRanks[i] ?? g.rank;
  });

  const recommendations = [];
  mismatched.forEach((g) => {
    const recommendedTier = RANK_TIER[side][g.recommendedRank] ?? g.gem.tier;
    // 이 슬롯을 새 티어로 바꿀 거라, 목표는 "새 티어의 종결 조합" 기준으로 잡는다.
    const targetMax = idealMaxForTier(role, recommendedTier);
    recommendations.push({
      core,
      side,
      gem: g.gem,
      value: g.value,
      gap: targetMax - g.value,
      type: "mismatch",
      currentTier: g.gem.tier,
      recommendedTier,
    });
  });

  gems
    .filter((g) => g.tierOk && !isGemComplete(g.gem, role) && !isSemiComplete(g.gem, role))
    .filter((g) => idealMaxForTier(role, g.gem.tier) - g.value > 0.001)
    .forEach((g) => {
      const targetMax = idealMaxForTier(role, g.gem.tier);
      recommendations.push({
        core,
        side,
        gem: g.gem,
        value: g.value,
        gap: targetMax - g.value,
        type: "reprocess",
        currentTier: g.gem.tier,
        recommendedTier: g.gem.tier,
      });
    });

  return recommendations;
}

function hasBatchim(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}
function eulro(word) {
  return hasBatchim(word) ? `${word}으로` : `${word}로`;
}

function priceForTier(side, tierName) {
  if (!gemPriceData) return null;
  const row = gemPriceData[side].find((r) => r.tier === tierName);
  return row ? row.currentMinPrice : null;
}

// 딜러: "현재 전투력 × (딜증 격차 / 100)"으로 젬 교체 시 예상 전투력 상승분을 추정한다.
// (전투력이 총 딜증 배율에 비례한다고 가정한 근사치 — 로펙 등 커뮤니티 툴도 쓰는 방식.
// 이 캐릭터의 실제 전투력에 비례하므로 캐릭터마다 다르게 나온다.)
//
// 서포터: 커뮤니티에서 측정된 옵션별 고정 전투력 기여치(아공강/낙인력/아피강 레벨당 점수)를
// 그대로 쓴다. 이 캐릭터의 실제 전투력에 비례 스케일링된 값이 아니라 고정 평균값이라
// 딜러 쪽보다 정확도는 떨어진다.
function estimatePowerGain(gap, role) {
  if (role === "dealer") {
    if (!currentCharacterData?.combatPower) return null;
    return currentCharacterData.combatPower * (gap / 100);
  }
  if (role === "support") {
    return gap;
  }
  return null;
}

function renderRecCard(r, rank, role) {
  const price = priceForTier(r.side, r.recommendedTier);
  const priceHtml = price != null ? `<b>${price.toLocaleString()}</b> 골드` : "시세 정보 없음";
  const actionLabel =
    r.type === "mismatch"
      ? `${r.currentTier} → <b>${eulro(r.recommendedTier)}</b> 교체`
      : `${r.currentTier} 그대로 재가공 (더 좋은 2옵션 노리기)`;
  const optionsText = r.gem.options.map((o) => `${o.name} Lv.${o.level}`).join(" · ");
  const unit = ROLE_UNIT[role];
  const idealMax = idealMaxForTier(role, r.recommendedTier);

  const powerGain = estimatePowerGain(r.gap, role);
  const powerHtml =
    powerGain != null
      ? `<div class="rec-power">예상 전투력 <b>+${powerGain.toFixed(2)}</b></div>`
      : "";
  const valueDetail =
    powerGain != null
      ? ""
      : ` · 가치 <b>${fmtValue(r.value, role)}${unit}</b> (이론 최대 ${fmtValue(idealMax, role)}${unit} 대비 <span class="rec-gap">-${fmtValue(r.gap, role)}${unit}</span>)`;

  return `
    <div class="rec-card ${r.type === "mismatch" ? "mismatch" : "reprocess"}">
      <div class="rec-rank">${rank}</div>
      <img src="${r.gem.icon}" alt="" />
      <div class="rec-body">
        <div class="rec-title">${r.core.name} · ${actionLabel}</div>
        <div class="rec-detail">현재 옵션: <b>${optionsText}</b>${valueDetail}</div>
      </div>
      <div class="rec-price">
        ${powerHtml}
        ${r.recommendedTier} 시세<br>${priceHtml}
      </div>
    </div>
  `;
}

function renderReplacementPlan() {
  if (!currentCharacterData) return;
  const scenarioKey = document.querySelector('input[name="scenario"]:checked').value;
  const role = currentRole();

  document.getElementById("replacementTitle").textContent = `교체 우선순위 (${ROLE_LABEL[role]} 기준)`;
  document.getElementById("replacementSubtitle").textContent =
    role === "dealer"
      ? "지금 낀 젬들의 옵션을 실제 딜증(%)으로 환산해서, 목표 조합에 맞춰 가장 먼저 손봐야 할 슬롯부터 보여줍니다. 교체/재가공 시 필요한 티어의 현재 시세도 함께 표시합니다."
      : "지금 낀 젬들의 옵션을 아군 공격 강화 기준 전투력 점수로 환산해서, 목표 조합에 맞춰 가장 먼저 손봐야 할 슬롯부터 보여줍니다. 교체/재가공 시 필요한 티어의 현재 시세도 함께 표시합니다.";

  const lopecUrl = `https://lopec.kr/character/simulator/${encodeURIComponent(currentCharacterData.name)}`;
  const powerNote =
    role === "dealer" && currentCharacterData.combatPower
      ? ` "예상 전투력"은 현재 전투력(${currentCharacterData.combatPower.toLocaleString()}) 기준, 재가공이 성공해서 이론 최댓값이 나온다고 가정한 <b>상한 추정치</b>예요 — 실제 가공은 확률이라 이보다 적게 오를 수 있습니다.`
      : role === "support"
      ? ` 서포터 "예상 전투력"은 이 캐릭터의 실제 전투력에 비례한 값이 아니라, <b>커뮤니티에서 측정된 옵션별 고정 평균치</b>예요 — 딜러 쪽보다 정확도가 낮으니 참고용으로만 봐주세요.`
      : "";
  document.getElementById("lopecNote").innerHTML =
    `<span>이 %는 로펙(lopec.kr)이 공개하는 실제 딜증 환산율과 비교 검증한 값이에요.${powerNote} <b>정확한 점수 변화</b>는 골드를 쓰기 전에 로펙 시뮬레이터에서 마지막으로 확인하세요.</span>` +
    `<a href="${lopecUrl}" target="_blank" rel="noopener">로펙에서 확인 →</a>`;

  const allRecs = [];
  currentCharacterData.cores.forEach((core) => {
    allRecs.push(...buildCorePlan(core, scenarioKey, role));
  });

  allRecs.sort((a, b) => {
    if (a.type !== b.type) return a.type === "mismatch" ? -1 : 1;
    return b.gap - a.gap;
  });

  // 티어 불일치(필수 교체)는 전부 보여주고, 남는 자리는 재가공 추천으로 채운다.
  const mismatchCount = allRecs.filter((r) => r.type === "mismatch").length;
  const top = allRecs.slice(0, Math.max(mismatchCount, 6));
  const topEl = document.getElementById("replacementTop");

  if (top.length === 0) {
    topEl.innerHTML = '<p class="empty-note">모든 코어가 이미 목표 조합·옵션에 가깝습니다. 지금은 손볼 슬롯이 없어요.</p>';
  } else {
    topEl.innerHTML = top.map((r, i) => renderRecCard(r, i + 1, role)).join("");
  }
}

document.querySelectorAll('input[name="role"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    if (currentCharacterData) {
      render(currentCharacterData);
      renderGemLuck(currentCharacterData, currentRole());
      renderReplacementPlan();
    }
  });
});

// 세그먼트 토글의 활성 라벨 스타일 동기화
document.querySelectorAll(".segmented").forEach((group) => {
  const sync = () => {
    group.querySelectorAll("label").forEach((label) => {
      label.classList.toggle("active", label.querySelector("input").checked);
    });
  };
  group.querySelectorAll("input").forEach((input) => input.addEventListener("change", sync));
  sync();
});

loadGemPrices();
