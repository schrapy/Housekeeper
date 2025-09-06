
/* Housekeeper - Local-first cleaning & maintenance PWA */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

const store = {
  load() {
    const raw = localStorage.getItem('hk_data');
    if (!raw) return { members: seedMembers(), tasks: seedTasks(), lastId: 1000 };
    try { return JSON.parse(raw); } catch { return { members: [], tasks: [], lastId: 1000 }; }
  },
  save(data) { localStorage.setItem('hk_data', JSON.stringify(data)); }
};

let state = store.load();

function seedMembers() {
  return [
    { id: 1, name: "You" },
    { id: 2, name: "Husband" },
    { id: 3, name: "Daughter" },
  ];
}

function seedTasks() {
  const today = isoDate(new Date());
  return [
    // Daily examples
    newTask("Wipe kitchen counters", "Kitchen", "", 2, { type: "daily" }, today),
    newTask("Set/clear dinner table", "Kitchen", "", 3, { type: "daily" }, today),
    newTask("Family 10‑min reset", "Whole House", "Tidy common areas", 1, { type: "daily" }, today),
    // Weekly examples
    newTask("Vacuum main floor", "Living/Dining/Hall", "", 2, { type: "weekly", days: [2] }, nextWeekday(2)),
    newTask("Bathroom mirrors & counters", "Bathrooms", "", 1, { type: "weekly", days: [1] }, nextWeekday(1)),
    // Monthly / Seasonal examples
    newTask("Fridge clean-out", "Kitchen", "", 3, { type: "monthly", day: 1 }, nextMonthly(1)),
    newTask("Replace furnace filter", "Utility", "", 2, { type: "seasonal", months: [3,6,9,12] }, nextSeasonal([3,6,9,12])),
  ];
}

function newTask(title, room, notes, assigneeId, cadence, nextDue) {
  state.lastId = (state.lastId || 1000) + 1;
  return { id: state.lastId, title, room, notes, assigneeId, cadence, nextDue, lastDone: null };
}

function isoDate(d) { return d.toISOString().slice(0,10); }

function parseISO(s) { const [y,m,d]=s.split('-').map(Number); return new Date(y, m-1, d); }

function nextWeekday(wd, fromDate=new Date()) {
  const d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const cur = d.getDay();
  let delta = (wd - cur + 7) % 7;
  if (delta === 0) delta = 7;
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function nextMonthly(day=1, fromDate=new Date()) {
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth();
  const curDay = fromDate.getDate();
  let targetMonth = m;
  if (curDay >= day) targetMonth = m + 1;
  const d = new Date(y, targetMonth, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
  const clamped = Math.min(day, lastDay);
  d.setDate(clamped);
  return isoDate(d);
}

function nextSeasonal(months=[3,6,9,12], fromDate=new Date()) {
  // months are 1-12
  const y = fromDate.getFullYear();
  const m = fromDate.getMonth() + 1;
  const day = 1;
  const sorted = [...months].sort((a,b)=>a-b);
  for (const mon of sorted) {
    if (mon > m || (mon === m && fromDate.getDate() >= day)) {
      return isoDate(new Date(y, mon-1, day));
    }
  }
  // next year's first
  return isoDate(new Date(y+1, sorted[0]-1, day));
}

function computeNextDue(task, fromDate=new Date()) {
  const type = task.cadence?.type || "once";
  if (type === "daily") {
    const d = new Date(fromDate); d.setDate(d.getDate()+1); return isoDate(d);
  }
  if (type === "weekly") {
    const days = task.cadence.days?.length ? task.cadence.days : [new Date().getDay()];
    // pick the next upcoming day after fromDate
    const cur = fromDate.getDay();
    let soonest = null, bestDelta = 999;
    for (const wd of days) {
      let delta = (wd - cur + 7) % 7;
      if (delta === 0) delta = 7;
      if (delta < bestDelta) { bestDelta = delta; soonest = wd; }
    }
    const d = new Date(fromDate);
    d.setDate(d.getDate() + bestDelta);
    return isoDate(d);
  }
  if (type === "monthly") {
    const day = Number(task.cadence.day || 1);
    return nextMonthly(day, fromDate);
  }
  if (type === "seasonal") {
    const months = task.cadence.months?.length ? task.cadence.months : [3,6,9,12];
    return nextSeasonal(months, fromDate);
  }
  // once: do nothing
  return task.nextDue || isoDate(fromDate);
}

function humanCadence(c) {
  if (!c) return "One-time";
  switch (c.type) {
    case "daily": return "Daily";
    case "weekly": return `Weekly (${(c.days||[]).map(d=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d]).join(", ")||"custom"})`;
    case "monthly": return `Monthly (day ${c.day||1})`;
    case "seasonal": return `Seasonal (months ${(c.months||[]).join(", ")||"3,6,9,12"})`;
    case "once": return "One-time";
  }
  return "Custom";
}

function memberName(id) { return (state.members.find(m=>m.id==id)?.name) || "Unassigned"; }

/* UI */
function switchTab(name) {
  $$(".tab").forEach(el => el.classList.remove("active"));
  $("#"+name).classList.add("active");
}

$$(".tab-btn").forEach(btn=>btn.addEventListener("click", ()=>switchTab(btn.dataset.tab)));

/* Today view */
function refreshToday() {
  const list = $("#todayList"); list.innerHTML = "";
  const today = isoDate(new Date());
  const due = state.tasks.filter(t => t.nextDue && t.nextDue <= today);
  if (due.length === 0) list.innerHTML = "<p>🎉 Nothing due today. Use Refresh after completing tasks.</p>";
  for (const t of due.sort((a,b)=> (a.assigneeId||0)-(b.assigneeId||0))) {
    list.appendChild(renderTaskItem(t, true));
  }
}

$("#refreshToday").addEventListener("click", refreshToday);

$("#addQuickTask").addEventListener("click", ()=>{
  openTaskModal({ title: "", room: "", notes: "", assigneeId: 1, cadence: {type:"once"}, nextDue: isoDate(new Date()) });
});

/* All tasks */
function renderAllTasks() {
  const list = $("#taskList"); list.innerHTML = "";
  const q = $("#taskSearch").value.toLowerCase();
  const items = state.tasks.filter(t => t.title.toLowerCase().includes(q));
  if (!items.length) { list.innerHTML = "<p>No tasks—add some!</p>"; return; }
  for (const t of items.sort((a,b)=> (a.nextDue||"")<(b.nextDue||"")?-1:1)) {
    list.appendChild(renderTaskItem(t, false));
  }
}
$("#taskSearch").addEventListener("input", renderAllTasks);
$("#addTaskBtn").addEventListener("click", ()=> openTaskModal(null));

/* Members */
function renderMembers() {
  const list = $("#memberList"); list.innerHTML = "";
  for (const m of state.members) {
    const tpl = $("#memberItemTemplate").content.firstElementChild.cloneNode(true);
    tpl.querySelector(".title").textContent = m.name;
    tpl.querySelector(".editBtn").addEventListener("click", ()=>openMemberModal(m));
    list.appendChild(tpl);
  }
}
$("#addMemberBtn").addEventListener("click", ()=>openMemberModal(null));

/* Templates */
const TEMPLATES = [
  {
    title: "Kitchen Deep Clean",
    tasks: [
      "Empty & wipe cabinets",
      "Clean fridge & freezer shelves",
      "Scrub backsplash & grout",
      "Deep clean oven & range hood",
      "Wash trash/recycling bins",
      "Wipe cabinet doors & handles",
    ]
  },
  {
    title: "Bathrooms Deep Clean",
    tasks: [
      "Scrub grout & tiles",
      "Wash shower curtain/liner",
      "Organize under-sink",
      "Deep clean toilet base & behind",
      "Polish fixtures & mirrors",
      "Dust vent & fan cover",
    ]
  },
  {
    title: "Bedrooms Deep Clean",
    tasks: [
      "Wash pillows & duvets",
      "Vacuum under bed",
      "Declutter closets",
      "Wipe baseboards & sills",
      "Dust ceiling fan/fixtures",
    ]
  },
  {
    title: "Living/Dining Deep Clean",
    tasks: [
      "Move & vacuum under furniture",
      "Dust bookshelves & frames",
      "Wipe switches, outlets, doors",
      "Spot clean upholstery",
      "Wash windows & tracks",
    ]
  },
  {
    title: "Entry & Hallways",
    tasks: [
      "Wipe doors & trim",
      "Shake rugs & clean shoe rack",
      "Organize closet/hooks",
      "Mop entry floor",
    ]
  },
  {
    title: "Whole House Seasonal",
    tasks: [
      "Wash windows",
      "Dust blinds & vents",
      "Replace furnace filter",
      "Test smoke/CO detectors",
      "Flip/rotate mattresses",
    ]
  }
];

function renderTemplates() {
  const wrap = $("#templateList"); wrap.innerHTML = "";
  for (const t of TEMPLATES) {
    const el = $("#templateCardTemplate").content.firstElementChild.cloneNode(true);
    el.querySelector(".title").textContent = t.title;
    const ul = el.querySelector(".task-bullets");
    t.tasks.forEach(name=>{
      const li = document.createElement("li"); li.textContent = name; ul.appendChild(li);
    });
    el.querySelector(".importBtn").addEventListener("click", ()=>{
      // import as monthly tasks on next available date, unassigned
      const baseDate = new Date();
      for (const name of t.tasks) {
        const task = newTask(name, t.title.replace(" Deep Clean",""), "", null, { type:"monthly", day: 1 }, nextMonthly(1, baseDate));
        state.tasks.push(task);
      }
      store.save(state);
      alert("Imported tasks! You can edit cadence/assignees in All Tasks.");
      renderAllTasks();
    });
    wrap.appendChild(el);
  }
}

/* Render a task in list */
function renderTaskItem(task, showCheckbox) {
  const el = $("#taskItemTemplate").content.firstElementChild.cloneNode(true);
  el.querySelector(".title").textContent = task.title;
  const metaBits = [];
  if (task.room) metaBits.push(task.room);
  metaBits.push(humanCadence(task.cadence));
  if (task.assigneeId) metaBits.push(`→ ${memberName(task.assigneeId)}`);
  if (task.nextDue) metaBits.push(`Due ${task.nextDue}`);
  el.querySelector(".meta").textContent = metaBits.join(" • ");

  const box = el.querySelector(".doneBox");
  if (!showCheckbox) box.classList.add("hidden");
  box.addEventListener("change", () => {
    if (box.checked) {
      // mark done and schedule next occurrence
      task.lastDone = isoDate(new Date());
      const type = task.cadence?.type || "once";
      if (type === "once") {
        // remove one-time tasks when done
        state.tasks = state.tasks.filter(t => t.id !== task.id);
      } else {
        task.nextDue = computeNextDue(task, new Date(task.lastDone));
      }
      store.save(state);
      refreshToday();
      renderAllTasks();
    }
  });

  el.querySelector(".editBtn").addEventListener("click", ()=>openTaskModal(task));
  return el;
}

/* Task modal logic */
const taskModal = $("#taskModal");
const taskForm = $("#taskForm");
const taskAssignee = $("#taskAssignee");
const cadenceType = $("#cadenceType");

function populateAssigneeOptions() {
  taskAssignee.innerHTML = `<option value="">Unassigned</option>` + state.members.map(m=>`<option value="${m.id}">${m.name}</option>`).join("");
}

function updateCadenceBoxes() {
  const type = cadenceType.value;
  $$(".cadence-box").forEach(box=>box.classList.add("hidden"));
  const tgt = $(`[data-cadence="${type}"]`);
  if (tgt) tgt.classList.remove("hidden");
}

cadenceType.addEventListener("change", updateCadenceBoxes);

function buildMonthPicker() {
  const mp = $(".month-picker");
  if (!mp) return;
  mp.innerHTML = "";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  months.forEach((m,i)=>{
    const lab = document.createElement("label");
    const cb = document.createElement("input");
    cb.type="checkbox"; cb.value = (i+1);
    lab.appendChild(cb);
    lab.append(" "+m);
    mp.appendChild(lab);
  });
}

function openTaskModal(task) {
  $("#taskModalTitle").textContent = task && task.id ? "Edit Task" : "New Task";
  $("#deleteTaskBtn").classList.toggle("hidden", !(task && task.id));
  populateAssigneeOptions();
  buildMonthPicker();
  // reset
  taskForm.reset();
  $("#taskId").value = task?.id || "";
  $("#taskTitle").value = task?.title || "";
  $("#taskRoom").value = task?.room || "";
  $("#taskNotes").value = task?.notes || "";
  taskAssignee.value = task?.assigneeId || "";

  const type = task?.cadence?.type || "once";
  cadenceType.value = type;
  updateCadenceBoxes();

  // weekly days
  if (type === "weekly") {
    const days = task?.cadence?.days || [];
    $$(".weekday-picker input").forEach(cb=> cb.checked = days.includes(Number(cb.value)));
  }
  // monthly day
  if (type === "monthly") {
    $("#monthlyDay").value = task?.cadence?.day ?? 1;
  }
  // seasonal months
  if (type === "seasonal") {
    const months = task?.cadence?.months || [3,6,9,12];
    $$(".month-picker input").forEach(cb => cb.checked = months.includes(Number(cb.value)));
  }
  // once date
  const nd = task?.nextDue || isoDate(new Date());
  $("#onceDate").value = nd;
  $("#taskNextDue").value = nd;

  taskModal.showModal();
}

$("#saveTaskBtn").addEventListener("click", (e)=>{
  e.preventDefault();
  const id = $("#taskId").value ? Number($("#taskId").value) : null;
  const t = {
    id: id || (state.lastId = (state.lastId||1000) + 1),
    title: $("#taskTitle").value.trim(),
    room: $("#taskRoom").value.trim(),
    notes: $("#taskNotes").value.trim(),
    assigneeId: $("#taskAssignee").value ? Number($("#taskAssignee").value) : null,
    cadence: buildCadenceFromUI(),
    nextDue: $("#taskNextDue").value || isoDate(new Date()),
    lastDone: id ? (state.tasks.find(x=>x.id===id)?.lastDone || null) : null,
  };
  if (!t.title) { alert("Please enter a title."); return; }
  if (id) {
    const idx = state.tasks.findIndex(x=>x.id===id);
    state.tasks[idx] = t;
  } else {
    state.tasks.push(t);
  }
  store.save(state);
  taskModal.close();
  refreshToday();
  renderAllTasks();
});

function buildCadenceFromUI() {
  const type = $("#cadenceType").value;
  if (type === "daily") return {type};
  if (type === "weekly") {
    const days = $$(".weekday-picker input:checked").map(cb=>Number(cb.value));
    return {type, days};
  }
  if (type === "monthly") {
    const day = Number($("#monthlyDay").value || 1);
    return {type, day};
  }
  if (type === "seasonal") {
    const months = $$(".month-picker input:checked").map(cb=>Number(cb.value));
    return {type, months: months.length?months:[3,6,9,12]};
  }
  if (type === "once") return {type};
  return {type:"once"};
}

$("#deleteTaskBtn").addEventListener("click", (e)=>{
  e.preventDefault();
  const id = Number($("#taskId").value);
  if (!id) return;
  if (confirm("Delete this task?")) {
    state.tasks = state.tasks.filter(t=>t.id!==id);
    store.save(state);
    taskModal.close();
    refreshToday(); renderAllTasks();
  }
});

/* Member modal */
const memberModal = $("#memberModal");
function openMemberModal(member) {
  $("#memberModalTitle").textContent = member && member.id ? "Edit Member" : "New Member";
  $("#deleteMemberBtn").classList.toggle("hidden", !(member && member.id));
  $("#memberId").value = member?.id || "";
  $("#memberName").value = member?.name || "";
  memberModal.showModal();
}

$("#saveMemberBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  const id = $("#memberId").value ? Number($("#memberId").value) : null;
  const name = $("#memberName").value.trim();
  if (!name) { alert("Enter a name."); return; }
  if (id) {
    const idx = state.members.findIndex(m=>m.id===id);
    state.members[idx].name = name;
  } else {
    const maxId = state.members.reduce((a,m)=>Math.max(a,m.id),0);
    state.members.push({ id: maxId+1, name });
  }
  store.save(state);
  memberModal.close();
  renderMembers();
  populateAssigneeOptions();
});

$("#deleteMemberBtn").addEventListener("click",(e)=>{
  e.preventDefault();
  const id = Number($("#memberId").value);
  if (!id) return;
  if (confirm("Delete this member? (Tasks will remain assigned to this name.)")) {
    state.members = state.members.filter(m=>m.id!==id);
    store.save(state);
    memberModal.close();
    renderMembers();
    populateAssigneeOptions();
  }
});

/* Settings: export/import */
$("#exportDataBtn").addEventListener("click", ()=>{
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'housekeeper-data.json';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
});

$("#importDataInput").addEventListener("change", async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!data.tasks || !data.members) throw new Error("Invalid data");
    state = data;
    store.save(state);
    refreshToday(); renderAllTasks(); renderMembers();
    alert("Import successful.");
  } catch (err) {
    alert("Import failed: " + err.message);
  }
});

/* Init */
function init() {
  renderMembers();
  renderAllTasks();
  renderTemplates();
  refreshToday();
}
init();
