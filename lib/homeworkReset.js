// 로스트아크 초기화 기준: 매일 KST 06:00, 매주 수요일 KST 06:00.
// "오늘/이번 주"를 이 경계로 계산해서 day_key/week_key 문자열을 만든다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const RESET_HOUR = 6;

function toKstShifted(date) {
  // KST 06:00을 자정처럼 취급하기 위해 (KST - 6시간)으로 밀어서 계산한다.
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  return new Date(kst.getTime() - RESET_HOUR * 60 * 60 * 1000);
}

function getDayKey(date = new Date()) {
  const shifted = toKstShifted(date);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekKey(date = new Date()) {
  const shifted = toKstShifted(date);
  // 위 shift 이후에는 "수요일 06:00 KST"가 그 날짜의 00:00으로 떨어진다.
  // ISO 요일(월=1..일=7) 기준으로 수요일(3)을 주의 시작으로 보고 주차를 센다.
  const dayOfWeek = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay(); // 1=월 ... 7=일
  const daysSinceWednesday = (dayOfWeek - 3 + 7) % 7;
  const weekStart = new Date(shifted.getTime() - daysSinceWednesday * 24 * 60 * 60 * 1000);

  // ISO 8601 주차 번호 계산 (weekStart 기준).
  const target = new Date(Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate()));
  const dayNr = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  target.setUTCDate(target.getUTCDate() + 4 - dayNr);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);

  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

module.exports = { getDayKey, getWeekKey };
