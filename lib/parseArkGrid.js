// 로스트아크 오픈API의 /armories/characters/{name}/arkgrid 응답에서
// 코어/젬 툴팁(HTML 문자열)을 실제 수치 데이터로 파싱한다.

function stripTags(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\r/g, "")
    .trim();
}

function parseGem(gem) {
  const tooltip = JSON.parse(gem.Tooltip);

  const nameRaw = stripTags(tooltip.Element_000?.value || "");
  // 예: "질서의 젬 : 안정" -> tier = "안정"
  const nameParts = nameRaw.split(":").map((s) => s.trim());
  const tier = nameParts.length > 1 ? nameParts[1] : nameRaw;

  const infoText = stripTags(tooltip.Element_004?.value?.Element_001 || "");
  const gemTypeMatch = infoText.match(/젬 타입\s*:\s*(질서|혼돈)/);
  const gemPointRawMatch = infoText.match(/젬 포인트\s*:\s*(\d+)/);

  const effText = stripTags(tooltip.Element_005?.value?.Element_001 || "");
  const willpowerMatch = effText.match(
    /필요 의지력\s*:\s*(\d+)\s*\(기본\s*값\s*(\d+)\s*[-–]\s*의지력\s*효율\s*(\d+)\)/
  );
  const pointMatch = effText.match(/(질서|혼돈)\s*포인트\s*:\s*(\d+)/);

  const optionMatches = [...effText.matchAll(/\[([^\]]+)\]\s*Lv\.(\d+)/g)];
  const options = optionMatches.map((m) => ({
    name: m[1],
    level: Number(m[2]),
  }));

  return {
    index: gem.Index,
    icon: gem.Icon,
    grade: gem.Grade, // 고대 | 유물
    isActive: gem.IsActive,
    name: nameRaw,
    tier, // 안정/견고/불변/침식/왜곡/붕괴 등
    gemType: gemTypeMatch ? gemTypeMatch[1] : null, // 질서 | 혼돈
    itemPoint: gemPointRawMatch ? Number(gemPointRawMatch[1]) : null,
    willpower: willpowerMatch ? Number(willpowerMatch[1]) : null,
    willpowerBase: willpowerMatch ? Number(willpowerMatch[2]) : null,
    willpowerEfficiency: willpowerMatch ? Number(willpowerMatch[3]) : null,
    corePoint: pointMatch ? Number(pointMatch[2]) : null,
    options,
  };
}

function parseCore(slot) {
  const tooltip = JSON.parse(slot.Tooltip);

  let willpowerBudget = null;
  let coreOptionText = null;
  for (const key of Object.keys(tooltip)) {
    const el = tooltip[key];
    if (!el || el.type !== "ItemPartBox") continue;
    const label = stripTags(el.value?.Element_000 || "");
    if (label.includes("코어 공급 의지력")) {
      const m = stripTags(el.value?.Element_001 || "").match(/(\d+)/);
      willpowerBudget = m ? Number(m[1]) : null;
    }
    if (label.includes("코어 옵션")) {
      coreOptionText = stripTags(el.value?.Element_001 || "");
    }
  }

  const gems = (slot.Gems || []).map(parseGem);
  const usedWillpower = gems.reduce((sum, g) => sum + (g.willpower || 0), 0);
  const totalPoint = gems.reduce((sum, g) => sum + (g.corePoint || 0), 0);

  return {
    index: slot.Index,
    icon: slot.Icon,
    name: slot.Name,
    grade: slot.Grade, // 고대 | 유물
    maxPoint: slot.Point, // 20 (상한)
    willpowerBudget,
    coreOptionText,
    usedWillpower,
    totalPoint,
    gems,
  };
}

function parseArkGrid(raw) {
  const cores = (raw.Slots || []).map(parseCore);
  const effects = raw.Effects || [];
  return { cores, effects };
}

module.exports = { parseArkGrid };
