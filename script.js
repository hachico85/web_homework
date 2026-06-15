const STORAGE_KEYS = {
  tasks: "kidsHomework.tasks.v1",
  checks: "kidsHomework.checks.v1",
  summary: "kidsHomework.summary.v1"
};

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const DISPLAY_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const defaultTasks = [
  { id: createId(), name: "音読", mode: "daily", days: [] },
  { id: createId(), name: "計算ドリル", mode: "weekly", days: [1, 2, 3, 4, 5] },
  { id: createId(), name: "明日の準備", mode: "daily", days: [] }
];

const elements = {
  todayLabel: document.querySelector("#todayLabel"),
  homeworkList: document.querySelector("#homeworkList"),
  emptyState: document.querySelector("#emptyState"),
  celebration: document.querySelector("#celebration"),
  progressText: document.querySelector("#progressText"),
  progressHint: document.querySelector("#progressHint"),
  progressFill: document.querySelector("#progressFill"),
  form: document.querySelector("#homeworkForm"),
  nameInput: document.querySelector("#homeworkName"),
  formMessage: document.querySelector("#formMessage"),
  weekdayGroup: document.querySelector("#weekdayGroup"),
  dateField: document.querySelector("#dateField"),
  dateInput: document.querySelector("#homeworkDate"),
  registeredList: document.querySelector("#registeredList"),
  confettiLayer: document.querySelector("#confettiLayer"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarDetail: document.querySelector("#calendarDetail"),
  submitButton: document.querySelector("#submitButton"),
  cancelButton: document.querySelector("#cancelButton")
};

let tasks = loadTasks();
let checks = loadChecks();
let summary = loadSummary();
let celebrationShown = false;
let editingId = null;

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadTasks() {
  const saved = localStorage.getItem(STORAGE_KEYS.tasks);

  if (!saved) {
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(defaultTasks));
    return defaultTasks;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadChecks() {
  const saved = localStorage.getItem(STORAGE_KEYS.checks);

  if (!saved) {
    return {};
  }

  try {
    return JSON.parse(saved) || {};
  } catch {
    return {};
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
}

function saveChecks() {
  localStorage.setItem(STORAGE_KEYS.checks, JSON.stringify(checks));
}

function loadSummary() {
  const saved = localStorage.getItem(STORAGE_KEYS.summary);

  if (!saved) {
    return {};
  }

  try {
    return JSON.parse(saved) || {};
  } catch {
    return {};
  }
}

function saveSummary() {
  localStorage.setItem(STORAGE_KEYS.summary, JSON.stringify(summary));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayKey() {
  return dateKey(new Date());
}

function isDueOn(task, dateStr) {
  if (task.mode === "daily") {
    return true;
  }

  if (task.mode === "weekly") {
    return task.days.includes(new Date(`${dateStr}T00:00:00`).getDay());
  }

  if (task.mode === "once") {
    // 登録した日から、チェックして完了するまで毎日出し続ける。
    return !task.done && task.date <= dateStr;
  }

  return false;
}

function recurringTasksForWeekday(day) {
  // 過去日の集計用。単発は日ごとの完了状態を再現できないため対象外にする。
  return tasks.filter(
    (task) => task.mode === "daily" || (task.mode === "weekly" && task.days.includes(day))
  );
}

function todayTasks() {
  const today = todayKey();
  const dayChecks = checks[today] || {};
  // 単発は完了すると isDueOn が false になるが、「今日完了した」分は今日のうちは残す。
  return tasks.filter(
    (task) => isDueOn(task, today) || (task.mode === "once" && dayChecks[task.id])
  );
}

function backfillSummary() {
  const today = todayKey();
  let changed = false;

  Object.keys(checks).forEach((date) => {
    if (date >= today || summary[date]) {
      return;
    }

    const due = recurringTasksForWeekday(new Date(`${date}T00:00:00`).getDay());
    const done = due.filter((task) => checks[date][task.id]);
    summary[date] = {
      done: done.length,
      total: due.length,
      names: done.map((task) => task.name)
    };
    changed = true;
  });

  if (changed) {
    saveSummary();
  }
}

function pruneOldChecks() {
  const cutoff = dateKey(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  let changed = false;

  Object.keys(checks).forEach((date) => {
    if (date < cutoff) {
      delete checks[date];
      changed = true;
    }
  });

  if (changed) {
    saveChecks();
  }
}

function pruneFinishedOnceTasks() {
  const today = todayKey();
  const before = tasks.length;

  // 完了済みで日付も過ぎた単発タスクは、登録リストから自動で片付ける。
  tasks = tasks.filter(
    (task) => !(task.mode === "once" && task.done && task.date < today)
  );

  if (tasks.length !== before) {
    saveTasks();
  }
}

function currentDayChecks() {
  const key = todayKey();
  if (!checks[key]) {
    checks[key] = {};
  }
  return checks[key];
}

function formatOnceDate(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}月${day}日（${weekday}）`;
}

function scheduleLabel(task) {
  if (task.mode === "daily") {
    return "毎日";
  }

  if (task.mode === "once") {
    return task.date ? formatOnceDate(task.date) : "日付未設定";
  }

  const days = task.days
    .slice()
    .sort((a, b) => DISPLAY_DAY_ORDER.indexOf(a) - DISPLAY_DAY_ORDER.indexOf(b))
    .map((day) => WEEKDAYS[day])
    .join("・");

  return days ? `${days}曜日` : "曜日未設定";
}

function render() {
  const today = new Date();
  const visibleTasks = todayTasks();
  const dayChecks = currentDayChecks();
  const completedTasks = visibleTasks.filter((task) => dayChecks[task.id]);
  const completedCount = completedTasks.length;
  const totalCount = visibleTasks.length;
  const percent = totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const isComplete = totalCount > 0 && completedCount === totalCount;

  elements.todayLabel.textContent = `${todayKey()}（${WEEKDAYS[today.getDay()]}）`;
  elements.progressText.textContent = `${completedCount} / ${totalCount} 完了`;
  elements.progressFill.style.width = `${percent}%`;
  elements.progressFill.classList.toggle("is-complete", isComplete);
  elements.progressHint.textContent = isComplete
    ? "ぜんぶできました"
    : totalCount === 0
      ? "ゆっくり休める日です"
      : "今日の宿題をチェックしよう";

  summary[todayKey()] = {
    done: completedCount,
    total: totalCount,
    names: completedTasks.map((task) => task.name)
  };
  saveSummary();

  renderTodayTasks(visibleTasks, dayChecks);
  renderRegisteredTasks();
  renderCalendar();

  elements.emptyState.hidden = totalCount !== 0;
  elements.celebration.hidden = !isComplete;

  if (isComplete && !celebrationShown) {
    celebrationShown = true;
    launchConfetti();
  }

  if (!isComplete) {
    celebrationShown = false;
  }
}

function renderTodayTasks(visibleTasks, dayChecks) {
  elements.homeworkList.innerHTML = "";

  visibleTasks.forEach((task) => {
    const label = document.createElement("label");
    label.className = `homework-item${dayChecks[task.id] ? " done" : ""}`;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(dayChecks[task.id]);
    checkbox.addEventListener("change", () => {
      dayChecks[task.id] = checkbox.checked;
      if (task.mode === "once") {
        task.done = checkbox.checked;
        saveTasks();
      }
      saveChecks();
      render();
    });

    const textWrap = document.createElement("div");
    const name = document.createElement("div");
    name.className = "homework-name";
    name.textContent = task.name;

    const meta = document.createElement("div");
    meta.className = "homework-meta";
    meta.textContent = scheduleLabel(task);

    textWrap.append(name, meta);
    label.append(checkbox, textWrap);
    elements.homeworkList.append(label);
  });
}

function renderRegisteredTasks() {
  elements.registeredList.innerHTML = "";

  if (tasks.length === 0) {
    const empty = document.createElement("p");
    empty.className = "registered-schedule";
    empty.textContent = "まだ宿題が登録されていません。";
    elements.registeredList.append(empty);
    return;
  }

  tasks.forEach((task, index) => {
    const item = document.createElement("div");
    item.className = `registered-item${task.id === editingId ? " editing" : ""}`;

    const copy = document.createElement("div");
    const name = document.createElement("div");
    name.className = "registered-name";
    name.textContent = task.name;

    const schedule = document.createElement("div");
    schedule.className = "registered-schedule";
    schedule.textContent = scheduleLabel(task);

    const actions = document.createElement("div");
    actions.className = "registered-actions";

    const upButton = document.createElement("button");
    upButton.className = "move-button";
    upButton.type = "button";
    upButton.textContent = "↑";
    upButton.setAttribute("aria-label", `${task.name}を上へ`);
    upButton.disabled = index === 0;
    upButton.addEventListener("click", () => moveTask(task.id, -1));

    const downButton = document.createElement("button");
    downButton.className = "move-button";
    downButton.type = "button";
    downButton.textContent = "↓";
    downButton.setAttribute("aria-label", `${task.name}を下へ`);
    downButton.disabled = index === tasks.length - 1;
    downButton.addEventListener("click", () => moveTask(task.id, 1));

    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.type = "button";
    editButton.textContent = "編集";
    editButton.addEventListener("click", () => startEditing(task));

    const deleteButton = document.createElement("button");
    deleteButton.className = "delete-button";
    deleteButton.type = "button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    actions.append(upButton, downButton, editButton, deleteButton);
    copy.append(name, schedule);
    item.append(copy, actions);
    elements.registeredList.append(item);
  });
}

function moveTask(id, delta) {
  const index = tasks.findIndex((task) => task.id === id);
  const target = index + delta;

  if (index < 0 || target < 0 || target >= tasks.length) {
    return;
  }

  [tasks[index], tasks[target]] = [tasks[target], tasks[index]];
  saveTasks();
  render();
}

function startEditing(task) {
  editingId = task.id;
  elements.nameInput.value = task.name;
  elements.form.elements.scheduleMode.value = task.mode;
  elements.weekdayGroup.querySelectorAll("input").forEach((input) => {
    input.checked = task.days.includes(Number(input.value));
  });
  elements.dateInput.value = task.mode === "once" ? task.date || todayKey() : "";
  updateWeekdayState();
  elements.formMessage.textContent = "";
  elements.submitButton.textContent = "保存する";
  elements.cancelButton.hidden = false;
  elements.nameInput.focus();
  render();
}

function stopEditing() {
  editingId = null;
  elements.form.reset();
  updateWeekdayState();
  elements.submitButton.textContent = "宿題を追加";
  elements.cancelButton.hidden = true;
}

function stampFor(entry) {
  if (!entry) {
    return "";
  }

  if (entry.total === 0 || entry.done === 0) {
    return "🍵";
  }

  return entry.done === entry.total ? "💮" : "👍";
}

function todayStamp(entry) {
  // 今日はまだ途中なので、全部終わってはなまる（💮）になったときだけ表示する。
  // 途中・未着手のうちは無印にして「おやすみ」と誤解させない。
  if (entry && entry.total > 0 && entry.done === entry.total) {
    return "💮";
  }

  return "";
}

function renderCalendar() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = todayKey();

  elements.calendarTitle.textContent = `${month + 1}月のきろく`;
  elements.calendarGrid.innerHTML = "";

  DISPLAY_DAY_ORDER.forEach((day) => {
    const head = document.createElement("div");
    head.className = "calendar-head";
    head.textContent = WEEKDAYS[day];
    elements.calendarGrid.append(head);
  });

  const leadingBlanks = (new Date(year, month, 1).getDay() + 6) % 7;

  for (let index = 0; index < leadingBlanks; index += 1) {
    const blank = document.createElement("div");
    blank.className = "calendar-cell blank";
    elements.calendarGrid.append(blank);
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let date = 1; date <= daysInMonth; date += 1) {
    const key = dateKey(new Date(year, month, date));
    const cell = document.createElement("div");
    cell.className = `calendar-cell${key === today ? " today" : ""}`;

    const number = document.createElement("span");
    number.className = "calendar-date";
    number.textContent = date;

    const stamp = document.createElement("span");
    stamp.className = "calendar-stamp";
    stamp.textContent = key === today ? todayStamp(summary[key]) : stampFor(summary[key]);

    cell.append(number, stamp);

    if (summary[key]) {
      cell.classList.add("has-detail");
      cell.addEventListener("mouseenter", () => showDayDetail(key));
    }

    elements.calendarGrid.append(cell);
  }

  resetDayDetail();
}

function completedNamesOn(key) {
  // まずその日のチェック実績から、現在のタスク名で復元する（直近30日ぶん保持）。
  const dayChecks = checks[key];
  if (dayChecks) {
    const names = tasks.filter((task) => dayChecks[task.id]).map((task) => task.name);
    if (names.length > 0) {
      return names;
    }
  }

  // 古い日（checksが消えている）は、summaryに保存した名前を使う。
  const entry = summary[key];
  return entry && entry.names ? entry.names : [];
}

function showDayDetail(key) {
  const [year, month, day] = key.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  const label = `${month}月${day}日（${weekday}）`;
  const names = completedNamesOn(key);
  const entry = summary[key];

  if (names.length > 0) {
    elements.calendarDetail.textContent = `${label} にできたこと：${names.join("、")}`;
  } else if (entry && entry.done > 0) {
    elements.calendarDetail.textContent = `${label} は ${entry.done}個 できました`;
  } else {
    elements.calendarDetail.textContent = `${label} は おやすみ 🍵`;
  }
}

function resetDayDetail() {
  elements.calendarDetail.textContent = "日にちにカーソルを合わせると、その日の記録が見られます。";
}

function deleteTask(id) {
  if (id === editingId) {
    stopEditing();
  }

  tasks = tasks.filter((task) => task.id !== id);

  Object.values(checks).forEach((dailyChecks) => {
    delete dailyChecks[id];
  });

  saveTasks();
  saveChecks();
  render();
}

function selectedMode() {
  return new FormData(elements.form).get("scheduleMode");
}

function selectedDays() {
  return [...elements.weekdayGroup.querySelectorAll("input:checked")].map((input) =>
    Number(input.value)
  );
}

function updateWeekdayState() {
  const mode = selectedMode();
  elements.weekdayGroup.disabled = mode !== "weekly";

  const isOnce = mode === "once";
  elements.dateField.hidden = !isOnce;
  if (isOnce && !elements.dateInput.value) {
    elements.dateInput.value = todayKey();
  }
}

function handleSubmit(event) {
  event.preventDefault();
  elements.formMessage.textContent = "";

  const name = elements.nameInput.value.trim();
  const mode = selectedMode();
  const days = mode === "weekly" ? selectedDays() : [];
  const date = mode === "once" ? elements.dateInput.value : "";

  if (!name) {
    elements.formMessage.textContent = "宿題名を入力してください。";
    return;
  }

  if (mode === "weekly" && days.length === 0) {
    elements.formMessage.textContent = "曜日を1つ以上選んでください。";
    return;
  }

  if (mode === "once" && !date) {
    elements.formMessage.textContent = "日にちを選んでください。";
    return;
  }

  if (editingId) {
    const task = tasks.find((item) => item.id === editingId);

    if (task) {
      task.name = name;
      task.mode = mode;
      task.days = days;
      task.date = date;
      if (typeof task.done !== "boolean") {
        task.done = false;
      }
    }

    stopEditing();
  } else {
    tasks.push({
      id: createId(),
      name,
      mode,
      days,
      date,
      done: false
    });

    elements.form.reset();
    updateWeekdayState();
  }

  saveTasks();
  render();
  elements.nameInput.focus();
}

function launchConfetti() {
  const colors = ["#ffd84d", "#ff7aa8", "#62d58b", "#8edcff", "#ff9f45", "#4c7dff"];
  const total = 90;

  for (let index = 0; index < total; index += 1) {
    const piece = document.createElement("span");
    piece.className = "confetti";

    const duration = 2800 + Math.random() * 2000;
    const delay = Math.random() * 1600;
    const width = 8 + Math.random() * 8;

    piece.style.left = `${Math.random() * 100}%`;
    piece.style.width = `${width}px`;
    piece.style.height = `${width * (0.6 + Math.random() * 0.7)}px`;
    piece.style.background = colors[index % colors.length];
    piece.style.borderRadius = Math.random() < 0.35 ? "50%" : "2px";
    piece.style.animationDuration = `${duration}ms`;
    piece.style.animationDelay = `${delay}ms`;
    piece.style.setProperty("--sway", `${30 + Math.random() * 60}px`);
    piece.style.setProperty(
      "--spin",
      `${(Math.random() < 0.5 ? -1 : 1) * (360 + Math.random() * 540)}deg`
    );
    elements.confettiLayer.append(piece);

    window.setTimeout(() => piece.remove(), delay + duration + 400);
  }
}

elements.form.addEventListener("submit", handleSubmit);
elements.form.addEventListener("change", updateWeekdayState);
elements.cancelButton.addEventListener("click", () => {
  stopEditing();
  render();
});
elements.calendarGrid.addEventListener("mouseleave", resetDayDetail);

backfillSummary();
pruneOldChecks();
pruneFinishedOnceTasks();
updateWeekdayState();
render();
