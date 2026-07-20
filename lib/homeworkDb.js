const { Pool } = require("pg");
const { customAlphabet } = require("nanoid");
const { getDayKey, getWeekKey } = require("./homeworkReset");

// 헷갈리기 쉬운 문자(0/O, 1/I/L) 제외한 8자리 코드.
const generateCode = customAlphabet("23456789ABCDEFGHJKMNPQRSTUVWXYZ", 8);

let pool = null;
function getPool() {
  if (!pool) {
    const connectionString = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
    if (!connectionString) return null;
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

function requireDb() {
  const p = getPool();
  if (!p) {
    const err = new Error("서버에 DB 연결(SUPABASE_DB_URL)이 설정되어 있지 않습니다.");
    err.statusCode = 500;
    throw err;
  }
  return p;
}

async function createAccount() {
  const db = requireDb();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const { rows } = await db.query(
        "insert into accounts (code) values ($1) returning id, code",
        [code]
      );
      return rows[0];
    } catch (err) {
      if (err.code === "23505") continue; // unique violation, 코드 충돌 -> 재시도
      throw err;
    }
  }
  throw new Error("코드 발급에 실패했습니다. 다시 시도해 주세요.");
}

async function getAccountByCode(code) {
  const db = requireDb();
  const { rows } = await db.query("select id, code from accounts where code = $1", [code]);
  return rows[0] || null;
}

async function requireAccount(code) {
  const account = await getAccountByCode((code || "").trim().toUpperCase());
  if (!account) {
    const err = new Error("존재하지 않는 코드입니다.");
    err.statusCode = 404;
    throw err;
  }
  return account;
}

async function listCharacters(accountId) {
  const db = requireDb();
  const { rows } = await db.query(
    "select id, nickname from characters where account_id = $1 order by sort_order, created_at",
    [accountId]
  );
  return rows;
}

async function addCharacter(accountId, nickname) {
  const db = requireDb();
  const { rows } = await db.query(
    "insert into characters (account_id, nickname) values ($1, $2) returning id, nickname",
    [accountId, nickname]
  );
  return rows[0];
}

async function deleteCharacter(accountId, characterId) {
  const db = requireDb();
  await db.query("delete from characters where id = $1 and account_id = $2", [characterId, accountId]);
}

async function getRaidChecks(characterIds, weekKey) {
  if (characterIds.length === 0) return [];
  const db = requireDb();
  const { rows } = await db.query(
    `select character_id, raid_key, difficulty, gate
     from raid_checks
     where character_id = any($1::uuid[]) and week_key = $2`,
    [characterIds, weekKey]
  );
  return rows;
}

async function toggleRaidCheck(characterId, raidKey, difficulty, gate) {
  const db = requireDb();
  const weekKey = getWeekKey();
  const existing = await db.query(
    `select id from raid_checks
     where character_id = $1 and raid_key = $2 and difficulty = $3 and gate = $4 and week_key = $5`,
    [characterId, raidKey, difficulty, gate, weekKey]
  );
  if (existing.rows.length > 0) {
    await db.query("delete from raid_checks where id = $1", [existing.rows[0].id]);
    return { checked: false };
  }
  await db.query(
    `insert into raid_checks (character_id, raid_key, difficulty, gate, week_key)
     values ($1, $2, $3, $4, $5)`,
    [characterId, raidKey, difficulty, gate, weekKey]
  );
  return { checked: true };
}

async function getDailyChecks(characterIds, dayKey) {
  if (characterIds.length === 0) return [];
  const db = requireDb();
  const { rows } = await db.query(
    `select character_id, content_key
     from daily_checks
     where character_id = any($1::uuid[]) and day_key = $2`,
    [characterIds, dayKey]
  );
  return rows;
}

async function toggleDailyCheck(characterId, contentKey) {
  const db = requireDb();
  const dayKey = getDayKey();
  const existing = await db.query(
    "select id from daily_checks where character_id = $1 and content_key = $2 and day_key = $3",
    [characterId, contentKey, dayKey]
  );
  if (existing.rows.length > 0) {
    await db.query("delete from daily_checks where id = $1", [existing.rows[0].id]);
    return { checked: false };
  }
  await db.query(
    "insert into daily_checks (character_id, content_key, day_key) values ($1, $2, $3)",
    [characterId, contentKey, dayKey]
  );
  return { checked: true };
}

function currentPeriodKey(resetType) {
  if (resetType === "daily") return getDayKey();
  if (resetType === "weekly") return getWeekKey();
  return null;
}

async function listCustomTodos(accountId) {
  const db = requireDb();
  const { rows } = await db.query(
    "select id, label, reset_type, period_key, checked from custom_todos where account_id = $1 order by sort_order, created_at",
    [accountId]
  );
  // 리셋 주기가 지난 항목은 조회 시점에 자동으로 되돌린다.
  const stale = rows.filter((r) => r.reset_type !== "none" && r.checked && r.period_key !== currentPeriodKey(r.reset_type));
  if (stale.length > 0) {
    await db.query("update custom_todos set checked = false where id = any($1::uuid[])", [stale.map((r) => r.id)]);
  }
  const staleIds = new Set(stale.map((r) => r.id));
  return rows.map((r) => (staleIds.has(r.id) ? { ...r, checked: false } : r));
}

async function addCustomTodo(accountId, label, resetType) {
  const db = requireDb();
  const { rows } = await db.query(
    "insert into custom_todos (account_id, label, reset_type) values ($1, $2, $3) returning id, label, reset_type, checked",
    [accountId, label, resetType]
  );
  return rows[0];
}

async function toggleCustomTodo(accountId, todoId) {
  const db = requireDb();
  const { rows } = await db.query(
    "select id, checked, reset_type from custom_todos where id = $1 and account_id = $2",
    [todoId, accountId]
  );
  if (rows.length === 0) return null;
  const next = !rows[0].checked;
  const periodKey = next ? currentPeriodKey(rows[0].reset_type) : null;
  await db.query("update custom_todos set checked = $1, period_key = $2 where id = $3", [next, periodKey, todoId]);
  return { checked: next };
}

async function deleteCustomTodo(accountId, todoId) {
  const db = requireDb();
  await db.query("delete from custom_todos where id = $1 and account_id = $2", [todoId, accountId]);
}

module.exports = {
  createAccount,
  requireAccount,
  listCharacters,
  addCharacter,
  deleteCharacter,
  getRaidChecks,
  toggleRaidCheck,
  getDailyChecks,
  toggleDailyCheck,
  listCustomTodos,
  addCustomTodo,
  toggleCustomTodo,
  deleteCustomTodo,
};
