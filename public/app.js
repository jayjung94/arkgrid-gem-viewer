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
  const idealMax = idealMaxFor(role);
  const unit = ROLE_UNIT[role];
  const dpsHtml = `<div class="gem-value">${ROLE_LABEL[role]} 가치 기여도 <b>${fmtValue(val, role)}${unit}</b> (이론 최대 ${fmtValue(idealMax, role)}${unit})</div>`;

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
const scenarioResultEl = document.getElementById("scenarioResult");
const priceTableEl = document.getElementById("priceTable");
let gemPriceData = null;

document.querySelectorAll('input[name="scenario"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    renderScenario();
    renderReplacementPlan();
  });
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
    priceStatusEl.textContent = `영웅 등급 원석 기준 · ${fetchedAt} 조회${data.cached ? " (캐시)" : ""}`;
    renderScenario();
    renderPriceTable();
    renderReplacementPlan();
  } catch (err) {
    console.error(err);
    priceStatusEl.textContent = "서버에 연결할 수 없습니다.";
  }
}

function priceOf(list, rank) {
  const row = list.find((r) => r.rank === rank);
  return row ? row.currentMinPrice : null;
}

function calcScenarioCost(list, counts) {
  let total = 0;
  let hasNull = false;
  const rows = Object.entries(counts).map(([rank, count]) => {
    const row = list.find((r) => r.rank === Number(rank));
    const price = row ? row.currentMinPrice : null;
    if (price == null) hasNull = true;
    else total += price * count;
    return { tier: row ? row.tier : `티어${rank}`, count, price, subtotal: price != null ? price * count : null };
  });
  return { rows, total, hasNull };
}

function renderScenario() {
  if (!gemPriceData) return;
  const selected = document.querySelector('input[name="scenario"]:checked').value;

  scenarioResultEl.innerHTML = "";

  const sides = [
    { key: "order", label: "질서 코어 (안정/견고/불변)" },
    { key: "chaos", label: "혼돈 코어 (침식/왜곡/붕괴)" },
  ];

  const costs = {}; // costs[side][scenarioKey] = total

  sides.forEach(({ key, label }) => {
    const list = gemPriceData[key];
    costs[key] = {};

    const card = document.createElement("div");
    card.className = "side-cost-card";

    const scenario = SCENARIOS[selected];
    const { rows, total, hasNull } = calcScenarioCost(list, scenario.counts);

    let rowsHtml = rows
      .map(
        (r) => `
      <tr>
        <td>${r.tier}</td>
        <td class="num">${r.count}개</td>
        <td class="num">${r.price != null ? r.price.toLocaleString() : "-"}</td>
        <td class="num">${r.subtotal != null ? r.subtotal.toLocaleString() : "-"}</td>
      </tr>`
      )
      .join("");

    card.innerHTML = `
      <h3>${label} · 시나리오 ${selected} (${scenario.label})</h3>
      <table>
        <thead>
          <tr><th>티어</th><th class="num">필요 수량</th><th class="num">개당 시세</th><th class="num">소계</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr><td colspan="3">코어 1개 완성 비용</td><td class="num">${hasNull ? "일부 시세 없음" : total.toLocaleString() + " 골드"}</td></tr>
        </tfoot>
      </table>
    `;
    scenarioResultEl.appendChild(card);

    // A/B 둘 다 계산해서 비교 배너에 사용
    Object.keys(SCENARIOS).forEach((key2) => {
      costs[key][key2] = calcScenarioCost(list, SCENARIOS[key2].counts);
    });
  });

  // 비교 배너
  sides.forEach(({ key, label }) => {
    const a = costs[key].A;
    const b = costs[key].B;
    if (a.hasNull || b.hasNull) return;
    const diff = a.total - b.total;
    const banner = document.createElement("div");
    banner.className = "compare-banner";
    if (diff === 0) {
      banner.innerHTML = `${label}: 시나리오 A와 B의 코어당 비용이 <b>동일</b>합니다 (${a.total.toLocaleString()} 골드).`;
    } else {
      const cheaper = diff > 0 ? "B" : "A";
      const cheaperCost = diff > 0 ? b.total : a.total;
      const gap = Math.abs(diff);
      banner.innerHTML = `${label}: 지금은 <b>시나리오 ${cheaper}</b>가 코어당 <b>${gap.toLocaleString()} 골드</b> 더 저렴합니다 (A ${a.total.toLocaleString()} / B ${b.total.toLocaleString()} 골드, ${cheaper} 선택 시 ${cheaperCost.toLocaleString()} 골드).`;
    }
    scenarioResultEl.appendChild(banner);
  });
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
        <td><span class="rank-badge">${i + 1}</span><img src="${r.icon}" alt="" />${r.side === "order" ? "질서" : "혼돈"} · ${r.tier}</td>
        <td class="num">${r.currentMinPrice.toLocaleString()}</td>
        <td class="num">${r.yDayAvgPrice != null ? r.yDayAvgPrice.toLocaleString(undefined, { maximumFractionDigits: 1 }) : "-"}</td>
        <td class="num">${deltaHtml}</td>
      </tr>`;
    })
    .join("");

  priceTableEl.innerHTML = `
    <table>
      <thead>
        <tr><th>순위 · 티어 (영웅 등급)</th><th class="num">현재 최저가</th><th class="num">어제 평균가</th><th class="num">전일 대비</th></tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <p class="price-status">1위가 지금 가장 저렴한 티어입니다 — 같은 예산이면 이 티어부터 사서 가공하는 게 유리해요.</p>
  `;
}

/* ---------------------------------------------------------------------- */
/* 딜러 기준 교체 우선순위                                                   */
/* ---------------------------------------------------------------------- */

function buildCorePlan(core, scenarioKey, role) {
  const side = core.name.includes("질서") ? "order" : "chaos";
  const remaining = { ...SCENARIOS[scenarioKey].counts };
  const idealMax = idealMaxFor(role);

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
    recommendations.push({
      core,
      side,
      gem: g.gem,
      value: g.value,
      gap: idealMax - g.value,
      type: "mismatch",
      currentTier: g.gem.tier,
      recommendedTier: RANK_TIER[side][g.recommendedRank] ?? g.gem.tier,
    });
  });

  gems
    .filter((g) => g.tierOk && idealMax - g.value > 0.001)
    .forEach((g) => {
      recommendations.push({
        core,
        side,
        gem: g.gem,
        value: g.value,
        gap: idealMax - g.value,
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

function renderRecCard(r, rank, role) {
  const price = priceForTier(r.side, r.recommendedTier);
  const priceHtml = price != null ? `<b>${price.toLocaleString()}</b> 골드` : "시세 정보 없음";
  const actionLabel =
    r.type === "mismatch"
      ? `${r.currentTier} → <b>${eulro(r.recommendedTier)}</b> 교체`
      : `${r.currentTier} 그대로 재가공 (더 좋은 2옵션 노리기)`;
  const optionsText = r.gem.options.map((o) => `${o.name} Lv.${o.level}`).join(" · ");
  const unit = ROLE_UNIT[role];
  const idealMax = idealMaxFor(role);

  return `
    <div class="rec-card ${r.type === "mismatch" ? "mismatch" : "reprocess"}">
      <div class="rec-rank">${rank}</div>
      <img src="${r.gem.icon}" alt="" />
      <div class="rec-body">
        <div class="rec-title">${r.core.name} · ${actionLabel}</div>
        <div class="rec-detail">현재 옵션: <b>${optionsText}</b> · 가치 <b>${fmtValue(r.value, role)}${unit}</b> (이론 최대 ${fmtValue(idealMax, role)}${unit} 대비 <span class="rec-gap">-${fmtValue(r.gap, role)}${unit}</span>)</div>
      </div>
      <div class="rec-price">${r.recommendedTier} 시세<br>${priceHtml}</div>
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
      renderReplacementPlan();
    }
  });
});

loadGemPrices();
