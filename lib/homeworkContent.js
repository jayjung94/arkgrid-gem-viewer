// 숙제체크 V1: 체크리스트 전용 (골드 보상액은 아직 계산하지 않음, V2에서 추가 예정).
// 실질적으로 주간 골드/컨텐츠로 도는 최신 티어 위주로 구성.

const RAIDS = [
  { key: "카제로스-종막", label: "종막: 카제로스", difficulties: [{ name: "하드", gates: 3 }, { name: "노말", gates: 3 }] },
  { key: "카제로스-4막", label: "4막: 아르모체", difficulties: [{ name: "하드", gates: 2 }, { name: "노말", gates: 2 }] },
  { key: "카제로스-3막", label: "3막: 모르둠", difficulties: [{ name: "하드", gates: 2 }, { name: "노말", gates: 2 }] },
  { key: "카제로스-2막", label: "2막: 아브렐슈드", difficulties: [{ name: "하드", gates: 2 }, { name: "노말", gates: 2 }] },
  { key: "카제로스-1막", label: "1막: 에기르", difficulties: [{ name: "하드", gates: 2 }, { name: "노말", gates: 2 }] },
  { key: "카제로스-서막", label: "서막: 에키드나", difficulties: [{ name: "하드", gates: 2 }, { name: "노말", gates: 2 }] },
  { key: "카멘", label: "카멘", difficulties: [{ name: "하드", gates: 4 }, { name: "노말", gates: 4 }] },
  { key: "상아탑", label: "혼돈의 상아탑", difficulties: [{ name: "하드", gates: 3 }, { name: "노말", gates: 3 }] },
  { key: "일리아칸", label: "일리아칸", difficulties: [{ name: "하드", gates: 3 }, { name: "노말", gates: 3 }] },
  { key: "카양겔", label: "카양겔", difficulties: [{ name: "하드", gates: 3 }, { name: "노말", gates: 3 }] },
];

const DAILIES = [
  { key: "카오스던전", label: "카오스던전" },
  { key: "가디언토벌", label: "가디언 토벌" },
];

module.exports = { RAIDS, DAILIES };
