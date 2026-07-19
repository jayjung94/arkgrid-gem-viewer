// 아크그리드 원석(가공 전 젬) 거래소 시세 조회
// CategoryCode 230000 = "아크 그리드 재료" (markets/options 기준)

const CATEGORY_CODE = 230000;
const TARGET_GRADE = "영웅"; // 마켓에서 구매 가능한 최상위 등급 (유물/고대는 가공 시 확률 승급)

// 티어 순위: 1=안정/침식, 2=견고/왜곡, 3=불변/붕괴
const TIERS = {
  order: [
    { rank: 1, name: "안정" },
    { rank: 2, name: "견고" },
    { rank: 3, name: "불변" },
  ],
  chaos: [
    { rank: 1, name: "침식" },
    { rank: 2, name: "왜곡" },
    { rank: 3, name: "붕괴" },
  ],
};

async function fetchAllArkGridMarketItems(apiKey) {
  const items = [];
  let pageNo = 0;
  // TotalCount가 18 안팎(3등급 x 6종류)이라 페이지 1~2장이면 충분하지만,
  // 여유 있게 반복 조회하다 더 이상 새 항목이 없으면 멈춘다.
  while (pageNo < 5) {
    const res = await fetch("https://developer-lostark.game.onstove.com/markets/items", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `bearer ${apiKey}`,
      },
      body: JSON.stringify({
        Sort: "YDayAvgPrice",
        CategoryCode: CATEGORY_CODE,
        PageNo: pageNo,
        SortCondition: "DESC",
      }),
    });
    if (!res.ok) throw new Error(`market API 오류 (status ${res.status})`);
    const data = await res.json();
    const pageItems = data.Items || [];
    items.push(...pageItems);
    if (items.length >= (data.TotalCount || 0) || pageItems.length === 0) break;
    pageNo += 1;
  }
  return items;
}

function pickGrade(items, name, grade) {
  return items.find((it) => it.Name === name && it.Grade === grade) || null;
}

async function getGemPrices(apiKey) {
  const items = await fetchAllArkGridMarketItems(apiKey);

  const build = (side) =>
    TIERS[side].map(({ rank, name }) => {
      const fullName = `${side === "order" ? "질서의 젬" : "혼돈의 젬"} : ${name}`;
      const item = pickGrade(items, fullName, TARGET_GRADE);
      const rareItem = pickGrade(items, fullName, "희귀");
      return {
        rank,
        tier: name,
        side,
        grade: TARGET_GRADE,
        currentMinPrice: item ? item.CurrentMinPrice : null,
        yDayAvgPrice: item ? item.YDayAvgPrice : null,
        icon: item ? item.Icon : null,
        // 희귀 등급 원석 가격 — "영웅 vs 희귀 중 더 싼 경로" 기대값 계산에만 쓰인다.
        rareMinPrice: rareItem ? rareItem.CurrentMinPrice : null,
      };
    });

  return {
    order: build("order"),
    chaos: build("chaos"),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { getGemPrices, TIERS };
