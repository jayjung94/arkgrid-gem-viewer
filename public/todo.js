const CODE_STORAGE_KEY = "homeworkCode";

const authGateEl = document.getElementById("authGate");
const appEl = document.getElementById("app");
const authStatusEl = document.getElementById("authStatus");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const newCodeBtn = document.getElementById("newCodeBtn");
const myCodeEl = document.getElementById("myCode");
const copyCodeBtn = document.getElementById("copyCodeBtn");
const logoutBtn = document.getElementById("logoutBtn");
const addCharForm = document.getElementById("addCharForm");
const charNameInput = document.getElementById("charNameInput");
const charactersEl = document.getElementById("charactersEl");
const addCustomForm = document.getElementById("addCustomForm");
const customLabelInput = document.getElementById("customLabelInput");
const customResetSelect = document.getElementById("customResetSelect");
const customListEl = document.getElementById("customListEl");

let content = null; // { raids, dailies }
let state = null; // 서버 /api/homework/state 응답

function getSavedCode() {
  return localStorage.getItem(CODE_STORAGE_KEY);
}
function saveCode(code) {
  localStorage.setItem(CODE_STORAGE_KEY, code);
}
function clearCode() {
  localStorage.removeItem(CODE_STORAGE_KEY);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
  return data;
}

async function loadContent() {
  if (content) return content;
  content = await api("/api/homework/content");
  return content;
}

async function loadState(code) {
  return api(`/api/homework/state?code=${encodeURIComponent(code)}`);
}

async function tryEnterWithCode(code) {
  authStatusEl.textContent = "확인 중...";
  authStatusEl.classList.remove("error");
  try {
    await loadContent();
    state = await loadState(code);
    saveCode(code);
    showApp();
  } catch (err) {
    authStatusEl.textContent = err.message;
    authStatusEl.classList.add("error");
  }
}

codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return;
  tryEnterWithCode(code);
});

newCodeBtn.addEventListener("click", async () => {
  authStatusEl.textContent = "코드 발급 중...";
  authStatusEl.classList.remove("error");
  try {
    const account = await api("/api/homework/account", { method: "POST" });
    await tryEnterWithCode(account.code);
  } catch (err) {
    authStatusEl.textContent = err.message;
    authStatusEl.classList.add("error");
  }
});

logoutBtn.addEventListener("click", () => {
  clearCode();
  state = null;
  appEl.style.display = "none";
  authGateEl.style.display = "";
  codeInput.value = "";
  authStatusEl.textContent = "";
});

copyCodeBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(state.code);
    copyCodeBtn.textContent = "복사됨!";
    setTimeout(() => (copyCodeBtn.textContent = "복사"), 1200);
  } catch {
    // 클립보드 접근 실패 시 조용히 무시 (코드는 화면에 항상 보임)
  }
});

function showApp() {
  authGateEl.style.display = "none";
  appEl.style.display = "";
  myCodeEl.textContent = state.code;
  renderCharacters();
  renderCustomTodos();
}

addCharForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nickname = charNameInput.value.trim();
  if (!nickname) return;
  try {
    await api("/api/homework/characters", {
      method: "POST",
      body: JSON.stringify({ code: state.code, nickname }),
    });
    charNameInput.value = "";
    state = await loadState(state.code);
    renderCharacters();
  } catch (err) {
    alert(err.message);
  }
});

async function removeCharacter(characterId) {
  if (!confirm("이 캐릭터의 숙제 기록을 삭제할까요?")) return;
  await api(`/api/homework/characters/${characterId}`, {
    method: "DELETE",
    body: JSON.stringify({ code: state.code }),
  });
  state = await loadState(state.code);
  renderCharacters();
}

function isRaidChecked(characterId, raidKey, difficulty, gate) {
  return state.raidChecks.some(
    (c) => c.character_id === characterId && c.raid_key === raidKey && c.difficulty === difficulty && c.gate === gate
  );
}
function isDailyChecked(characterId, contentKey) {
  return state.dailyChecks.some((c) => c.character_id === characterId && c.content_key === contentKey);
}

async function toggleRaid(characterId, raidKey, difficulty, gate, checkboxEl) {
  checkboxEl.disabled = true;
  try {
    await api("/api/homework/raid-check", {
      method: "POST",
      body: JSON.stringify({ code: state.code, characterId, raidKey, difficulty, gate }),
    });
    state = await loadState(state.code);
    renderCharacters();
  } catch (err) {
    alert(err.message);
    checkboxEl.disabled = false;
  }
}

async function toggleDaily(characterId, contentKey, checkboxEl) {
  checkboxEl.disabled = true;
  try {
    await api("/api/homework/daily-check", {
      method: "POST",
      body: JSON.stringify({ code: state.code, characterId, contentKey }),
    });
    state = await loadState(state.code);
    renderCharacters();
  } catch (err) {
    alert(err.message);
    checkboxEl.disabled = false;
  }
}

function renderCharacters() {
  charactersEl.innerHTML = "";
  if (state.characters.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "캐릭터를 추가하면 여기에 숙제 체크리스트가 생겨요.";
    charactersEl.appendChild(empty);
    return;
  }

  state.characters.forEach((character) => {
    const card = document.createElement("div");
    card.className = "todo-char-card";

    const head = document.createElement("div");
    head.className = "todo-char-head";
    head.innerHTML = `<span class="todo-char-name">${character.nickname}</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "todo-secondary-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", () => removeCharacter(character.id));
    head.appendChild(removeBtn);
    card.appendChild(head);

    const raidGrid = document.createElement("div");
    raidGrid.className = "todo-raid-grid";
    content.raids.forEach((raid) => {
      const raidBox = document.createElement("div");
      raidBox.className = "todo-raid-box";
      const title = document.createElement("div");
      title.className = "todo-raid-title";
      title.textContent = raid.label;
      raidBox.appendChild(title);

      raid.difficulties.forEach((diff) => {
        const row = document.createElement("div");
        row.className = "todo-raid-diff-row";
        const diffLabel = document.createElement("span");
        diffLabel.className = "todo-raid-diff-label";
        diffLabel.textContent = diff.name;
        row.appendChild(diffLabel);

        for (let gate = 1; gate <= diff.gates; gate++) {
          const label = document.createElement("label");
          label.className = "todo-gate-checkbox";
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = isRaidChecked(character.id, raid.key, diff.name, gate);
          input.addEventListener("change", () => toggleRaid(character.id, raid.key, diff.name, gate, input));
          label.appendChild(input);
          label.appendChild(document.createTextNode(`${gate}관`));
          row.appendChild(label);
        }
        raidBox.appendChild(row);
      });
      raidGrid.appendChild(raidBox);
    });
    card.appendChild(raidGrid);

    const dailyRow = document.createElement("div");
    dailyRow.className = "todo-daily-row";
    content.dailies.forEach((daily) => {
      const label = document.createElement("label");
      label.className = "todo-gate-checkbox todo-daily-checkbox";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = isDailyChecked(character.id, daily.key);
      input.addEventListener("change", () => toggleDaily(character.id, daily.key, input));
      label.appendChild(input);
      label.appendChild(document.createTextNode(daily.label));
      dailyRow.appendChild(label);
    });
    card.appendChild(dailyRow);

    charactersEl.appendChild(card);
  });
}

const RESET_LABEL = { weekly: "매주", daily: "매일", none: "고정" };

addCustomForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const label = customLabelInput.value.trim();
  if (!label) return;
  try {
    await api("/api/homework/custom", {
      method: "POST",
      body: JSON.stringify({ code: state.code, label, resetType: customResetSelect.value }),
    });
    customLabelInput.value = "";
    state = await loadState(state.code);
    renderCustomTodos();
  } catch (err) {
    alert(err.message);
  }
});

async function toggleCustom(todoId) {
  await api(`/api/homework/custom/${todoId}`, {
    method: "PATCH",
    body: JSON.stringify({ code: state.code }),
  });
  state = await loadState(state.code);
  renderCustomTodos();
}

async function removeCustom(todoId) {
  await api(`/api/homework/custom/${todoId}`, {
    method: "DELETE",
    body: JSON.stringify({ code: state.code }),
  });
  state = await loadState(state.code);
  renderCustomTodos();
}

function renderCustomTodos() {
  customListEl.innerHTML = "";
  if (state.customTodos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-note";
    empty.textContent = "아직 추가한 항목이 없어요.";
    customListEl.appendChild(empty);
    return;
  }
  state.customTodos.forEach((todo) => {
    const row = document.createElement("div");
    row.className = "todo-custom-row";
    const label = document.createElement("label");
    label.className = "todo-gate-checkbox";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = todo.checked;
    input.addEventListener("change", () => toggleCustom(todo.id));
    label.appendChild(input);
    label.appendChild(document.createTextNode(todo.label));
    row.appendChild(label);

    const tag = document.createElement("span");
    tag.className = "todo-reset-tag";
    tag.textContent = RESET_LABEL[todo.reset_type] || "매주";
    row.appendChild(tag);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "todo-secondary-btn";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => removeCustom(todo.id));
    row.appendChild(delBtn);

    customListEl.appendChild(row);
  });
}

(async function init() {
  const saved = getSavedCode();
  if (saved) {
    await tryEnterWithCode(saved);
  }
})();
