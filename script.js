// 全局变量
let CURRENT_MONTH = "";
let DATA = {}; // 由 xlsxLoader.js 注入
const $ = (id) => document.getElementById(id);

// 页面初始化
window.addEventListener("load", () => {
  if (typeof CONFIG_DATA !== "object") {
    // 兼容 xlsxLoader.js 还未注入数据的情况
    setTimeout(() => window.dispatchEvent(new Event("load")), 150);
    return;
  }
  DATA = CONFIG_DATA;
  CURRENT_MONTH = $("monthSelect").value;
  buildTable(CURRENT_MONTH, DATA[CURRENT_MONTH]);
  updateTargets();
  focusFirstSales();  
});

// 生成表格（动态插入 tableContainer）
function buildTable(month, list) {
  CURRENT_MONTH = month;
  const wrap = $("tableContainer");
  wrap.innerHTML = ""; // 清空旧表

  const showAccel = month !== "January" && month !== "February";
  const table = document.createElement("table");
  table.style.width = "100%";

  // 构建表头
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  ["Category", "Product", "Targets", "My Sales", "Multipliers"]
    .concat(showAccel ? ["Accelerator"] : [])
    .concat(["Estimated Commission"])
    .forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headRow.appendChild(th);
    });
  thead.appendChild(headRow);
  table.appendChild(thead);

  // 构建数据行
  const tbody = document.createElement("tbody");
  list.forEach((p, idx) => {
    if (typeof p.sales !== "number") p.sales = 0; // 确保初始化
    const tr = document.createElement("tr");

    // Category
    const tdCat = document.createElement("td");
    tdCat.textContent = p.category || "";
    tr.appendChild(tdCat);

    // Product
    const tdProd = document.createElement("td");
    tdProd.textContent = p.prod;
    tr.appendChild(tdProd);

    // Targets
    const tdTar = document.createElement("td");
    tdTar.className = "tar-cell";            
    if (!("baseTarget" in p)) p.baseTarget = p.target;
    tdTar.textContent = fmtTarget(p.target);
    tr.appendChild(tdTar);

    // Sales (可编辑)
    const tdSales = document.createElement("td");
    const inp = document.createElement("input");
    inp.type  = "number";          // CHANGED: 便于自定义过滤
    inp.step      = "1";
    inp.min       = "-500";        // CHANGED: 同现有规则
    inp.max       = "500";         // CHANGED
    inp.className = "sales-input";
    inp.value = p.sales || "";
    
    /* === 输入校验 === */       // CHANGED ↓↓↓
    const warn = document.createElement("div");
    warn.textContent = "Are you sure?";
    warn.style.cssText = "color:red;display:none;font-size:12px";
    
    inp.addEventListener("input", e => {
       let v = e.target.value.replace(/[^0-9\-]/g, "");   // 仅数字和负号
       if (/^-\d/.test(v)) v = "-" + v.slice(1).replace(/-/g, ""); // 单负号
       if (v.length > 4) v = v.slice(0, 4);               // 最多 4 位
       e.target.value = v;                                // 回填过滤后值
       
       const n = v === "" || v === "-" ? 0 : parseInt(v, 10);
       p.sales = n;                                       // 更新模型
       
       const invalid = Math.abs(n) > 500;
       warn.style.display = invalid ? "block" : "none";
       e.target.classList.toggle("invalid", invalid);     // 供刷新函数判断
       refreshCommissions();
       });
       
    tdSales.appendChild(inp);
    tdSales.appendChild(warn); 
    tr.appendChild(tdSales);

    // Multipliers
    const tdMult = document.createElement("td");
    // CHANGED: display range when different, otherwise single value
    tdMult.textContent = (p.multMin === p.multMax)
      ? `x${p.multMin}`                  
      : `x${p.multMin} - x${p.multMax}`; 
    tr.appendChild(tdMult);

    // Accelerator
    if (showAccel) {
      const tdAcc = document.createElement("td");
      tdAcc.className = "acc-cell";
      tdAcc.textContent = "-"; // 初始显示，由 refreshCommissions 更新
      tr.appendChild(tdAcc);
    }

    // Estimated Commission
    const tdComm = document.createElement("td");
    tdComm.id = `comm-${idx}`;
    tdComm.className = "comm-cell";
    tdComm.textContent = "$0";
    tr.appendChild(tdComm);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  refreshCommissions(); // 初次计算
}

/************* Accelerator 规则重写 *************/          // CHANGED: entire fn
/************* Accelerator 规则（按月份 + Category 动态判断）*************/
function accelFactor(month, list) {                                  // CHANGED
  /* 1‒2 月：无 Accelerator */
  if (month === "January" || month === "February") return 1.0;

  /* -------- 工具 -------- */
  const sum    = rs  => rs.reduce((s, r) => s + (Number(r.sales)  || 0), 0);
  const sumTgt = rs  => rs.reduce((s, r) => s + (Number(r.target) || 0), 0);

  /* ---------- Core（MP + HSIA 必须各自达标） ---------- */
  const coreRows = list.filter(r => 
      ["MP", "HSIA"].includes(r.prod));           // ★CHANGED
  const coreMet  = coreRows.length === 2 &&
        coreRows.every(r => Number(r.sales) >= Number(r.target));          // ★CHANGED

  /* ---------- Secondary ---------- */
  let secondaryRows = [];
  if (month === "March" || month === "April") {
    /* 3-4 月 Secondary 只有 BCON */
    secondaryRows = list.filter(r =>
        (r.prod || "").toUpperCase() === "BCON");                          // ★CHANGED
  } else { /* 5-6 月用五个产品汇总 */
    const secCodes = ["CD", "BCON", "WIFI", "DCC", "WLS RENEWALS"];
    secondaryRows  = list.filter(r =>
        secCodes.includes((r.prod || "").toUpperCase()));
  }
  const secondaryMet = secondaryRows.length &&
        (sum(secondaryRows) >= sumTgt(secondaryRows));                     // ★CHANGED

  /* ---------- Product + Value Add-on（3-4 月才需要） ---------- */
  const addonRows = list.filter(r =>
        ["PRODUCT ADD-ON", "VALUE ADD-ON"]
          .includes((r.category || "").toUpperCase()));
  const addonMet  = addonRows.length &&
        (sum(addonRows) >= sumTgt(addonRows));

  /* ---------- 返回各月加速档 ---------- */
  if (month === "March" || month === "April") {        // 最高 200 %
    if (!coreMet)                  return 1.0;
    if (!secondaryMet)             return 1.25;
    if (!addonMet)                 return 1.5;
    return 2.0;                                       // Core+Secondary+Add-on
  }

  /* 5-6 月：最高 150 % */
  if (month === "May" || month === "June") {
    if (!coreMet)                  return 1.0;
    if (!secondaryMet)             return 1.25;
    return 1.5;                                        // Core+Secondary
  }

  /* 其他月份默认 100 %（如以后要扩展） */
  return 1.0;
}



/* ============================== *
 * 刷新 Estimated & Total Commission
 * ============================== */
function refreshCommissions() {                                           // CHANGED
  const list      = DATA[CURRENT_MONTH];
  const accel     = accelFactor(CURRENT_MONTH, list);
  const useAccel  = !(CURRENT_MONTH === "January" || CURRENT_MONTH === "February");

  /* 若任意输入超过 ±500，则全部佣金归零 */      // CHANGED
  if (document.querySelector(".invalid")) {
    document.querySelectorAll(".comm-cell").forEach(td => td.textContent = "$0");
    $("totalComm").textContent = "Total Commission: $0";
    return;
  }

  /* 1. Accelerator 列实时刷新（仅 3–12 月显示） */
  if (useAccel) {
    document.querySelectorAll(".acc-cell")
            .forEach(td => td.textContent = `${(accel * 100).toFixed(0)}%`);
  }

  /* 2. 行级佣金计算与渲染 */
  let totalMin = 0, totalMax = 0;                                         // CHANGED

  list.forEach((p, idx) => {
    const sales = Number(p.sales) || 0;
    const td    = $(`comm-${idx}`);

    if (!sales) { td.textContent = "$0"; return; }

    /* 基础数值 */
    const baseMin  = Number(p.mrrMin);
    const baseMax  = Number(p.mrrMax);
    const multMin  = Number(p.multMin);
    const multMax  = Number(p.multMax);
    const factor   = useAccel ? accel : 1;

    const cMin = sales * baseMin * multMin * factor;
    const cMax = sales * baseMax * multMax * factor;

    /* MP 行显示区间，其余显示单值 */
    const isMP = (p.prod || "").toUpperCase() === "MP";                // CHANGED
    td.textContent = isMP
      ? `$${cMin.toFixed(2)} – $${cMax.toFixed(2)}`
      : `$${cMin.toFixed(2)}`;

    /* 累计总和（区间两端各累加） */
    totalMin += cMin;
    totalMax += cMax;
  });

  /* 3. Total Commission 区间显示 */
  const totalElem = $("totalComm");
  if (totalElem) {
    totalElem.textContent = (totalMin === totalMax)
      ? `Total Commission: $${totalMin.toFixed(2)}`
      : `Total Commission: $${totalMin.toFixed(2)} – $${totalMax.toFixed(2)}`;
  }
  updateGapLine(list, accel);
}

/* ====== 工具：整数不带小数，带小数保留 1 位 ====== */   // CHANGED
function fmtTarget(val) {                                    // CHANGED
  if (val === 0) return "0";
  return Number.isInteger(val) ? val.toFixed(0) : val.toFixed(1);
}

/* 整数 → n；小数 → 1 位；0.0 → 0 */                 // CHANGED
function fmtNum(n) {
  if (Math.abs(n) < 1e-6) return "0";
  return Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1);
}


/* ===== Ramping 下拉驱动 Targets ===== */
function updateTargets() {                     // CHANGED: 新增
  const factor = parseFloat($("rampSelect").value) || 1;      // 1,0.8,0.6,0.4,0.2
  const list   = DATA[CURRENT_MONTH] || [];
  const cells  = document.querySelectorAll(".tar-cell");

  list.forEach((p, i) => {
    const base = ("baseTarget" in p) ? p.baseTarget : (p.baseTarget = Number(p.target));
    const tgt  = base * factor;
    p.target   = tgt;                                           // 供 accelFactor() 使用
    if (cells[i]) cells[i].textContent = fmtTarget(tgt);        // 保留 1 位小数
  });

  refreshCommissions();                                         // 连带更新佣金
}

/* ===== 默认聚焦首个 My Sales 输入框 ===== */          // CHANGED: NEW
function focusFirstSales() {
  const first = document.querySelector(".sales-input");
  if (first) first.focus();
}

/* ===== 计算指定销量 & 加速下的总佣金 ===== */        // CHANGED: NEW
function calcTotals(list, accel, overrides = {}) {
  let tMin = 0, tMax = 0;
  list.forEach(r => {
    const s = overrides[r.prod] ?? r.sales;
    const cMin = s * r.mrrMin * r.multMin * accel;
    const cMax = s * r.mrrMax * r.multMax * accel;
    tMin += cMin;
    tMax += cMax;
  });
  return (tMin === tMax)
    ? `$${tMin.toFixed(2)}`
    : `$${tMin.toFixed(2)} – $${tMax.toFixed(2)}`;
}

function updateGapLine(list, accelNow) {
  const gapDiv = $("gapLine");
  const month = CURRENT_MONTH;

  /* 1‒2月无提示 */
  if (month === "January" || month === "February") {
    gapDiv.textContent = "";
    return;
  }

  /* ---------- 工具函数 ---------- */
  // 计算整个类别的总缺口（总目标 - 总销售）
  const calcCategoryGap = (rows) => {
    const totalTarget = rows.reduce((sum, r) => sum + Number(r.target), 0);
    const totalSales = rows.reduce((sum, r) => sum + Number(r.sales), 0);
    return Math.max(0, totalTarget - totalSales);
  };

  const findProd = code => list.find(r => (r.prod || "").toUpperCase() === code);

  /* ---------- Core：MP + HSIA 必须各自达标 ---------- */
  const mpRow = findProd("MP") || { sales: 0, target: 0 };
  const hsiaRow = findProd("HSIA") || { sales: 0, target: 0 };
  const mpGap = Math.max(0, mpRow.target - mpRow.sales);
  const hsiaGap = Math.max(0, hsiaRow.target - hsiaRow.sales);
  const coreMet = mpGap === 0 && hsiaGap === 0;

  /* ---------- Secondary 产品组 ---------- */
  let secondaryRows = [];
  let secondaryGap = 0;
  let secondaryMet = false;
  
  if (month === "March" || month === "April") {
    // 3-4月：仅BCON
    secondaryRows = list.filter(r => (r.prod || "").toUpperCase() === "BCON");
    secondaryGap = calcCategoryGap(secondaryRows);
    secondaryMet = secondaryGap === 0;
  } else {
    // 5-6月：五类产品按总和计算
    const secCodes = ["CD", "BCON", "WIFI", "DCC", "WLS RENEWALS"];
    secondaryRows = list.filter(r => 
      secCodes.includes((r.prod || "").toUpperCase())
    );
    secondaryGap = calcCategoryGap(secondaryRows);
    secondaryMet = secondaryGap === 0;
  }

  /* ---------- VALUE ADD-ON（仅3-4月，包含CD/WiFi/DCC） ---------- */
  let addonRows = [];
  let addonGap = 0;
  let addonMet = false;
  
  if (month === "March" || month === "April") {
    // 只考虑VALUE ADD-ON类别
    addonRows = list.filter(r => 
      (r.category || "").toUpperCase() === "VALUE ADD-ON"
    );
    // 按类别总和计算缺口
    addonGap = calcCategoryGap(addonRows);
    addonMet = addonGap === 0;
  }

  /* ---------- 判定下一档 & 组装提示 ---------- */
  let nextAcc = 1.0;
  let gapText = "";
  let currentTierText = `${(accelNow * 100).toFixed(0)}%`;

  if (month === "March" || month === "April") {
    // 3-4月逻辑保持不变
    // ========== 3-4月跨级加速新逻辑 ==========
    if (!coreMet && secondaryMet && !addonMet) {          // 情况 1 → 150 %
      nextAcc = 1.5;
      const parts = [];
      if (mpGap   > 0) parts.push(`${fmtNum(mpGap)} MP`);
      if (hsiaGap > 0) parts.push(`${fmtNum(hsiaGap)} HSIA`);
      gapText = parts.join(" & ");
    } else if (!coreMet && secondaryMet && addonMet) {    // 情况 2 → 200 %
      nextAcc = 2.0;
      const parts = [];
      if (mpGap   > 0) parts.push(`${fmtNum(mpGap)} MP`);
      if (hsiaGap > 0) parts.push(`${fmtNum(hsiaGap)} HSIA`);
      gapText = parts.join(" & ");
    } else if (coreMet && !secondaryMet && addonMet) {    // 情况 3 → 200 %
      nextAcc = 2.0;
      gapText = `${fmtNum(secondaryGap)} Secondary`;
    } else if (!coreMet) {                                // 原先 125 %
      nextAcc = 1.25;
      const parts = [];
      if (mpGap   > 0) parts.push(`${fmtNum(mpGap)} MP`);
      if (hsiaGap > 0) parts.push(`${fmtNum(hsiaGap)} HSIA`);
      gapText = parts.join(" & ");
    } else if (!secondaryMet) {                           // 原先 150 %
      nextAcc = 1.5;
      gapText = `${fmtNum(secondaryGap)} Secondary`;
    } else if (!addonMet) {                               // 原先 200 %
      nextAcc = 2.0;
      gapText = `${fmtNum(addonGap)} Value Add-on`;
    } else {
      gapDiv.textContent = `Congratulations! You have achieved the highest tier accelerator ${currentTierText} !`;
      return;
    }

  } else if (month === "May" || month === "June") {
    // 5-6月逻辑 - 区分四种状态
    if (!coreMet) {
      // Core未达标：当前100%
      if (secondaryMet) {
        // Core未达标但Secondary已达标：提示150%
        nextAcc = 1.5;
        const parts = [];
        if (mpGap > 0) parts.push(`${fmtNum(mpGap)} MP`);
        if (hsiaGap > 0) parts.push(`${fmtNum(hsiaGap)} HSIA`);
        gapText = parts.join(" & ");
      } else {
        // Core未达标且Secondary未达标：提示125%
        nextAcc = 1.25;
        const parts = [];
        if (mpGap > 0) parts.push(`${fmtNum(mpGap)} MP`);
        if (hsiaGap > 0) parts.push(`${fmtNum(hsiaGap)} HSIA`);
        gapText = parts.join(" & ");
      }
    } else if (!secondaryMet) {
      // Core已达标但Secondary未达标：当前125%，提示150%
      nextAcc = 1.5;
      gapText = `${fmtNum(secondaryGap)} Secondary`;
    } else {
      // 全部达标：当前150%
      gapDiv.textContent = `Congratulations! You have achieved the highest tier accelerator ${currentTierText} !`;
      return;
    }
  }

  /* ---------- 估算下一档佣金 ---------- */
  const overrides = {};
  
  if (!coreMet) {
    if (mpGap > 0) overrides["MP"] = mpRow.target;
    if (hsiaGap > 0) overrides["HSIA"] = hsiaRow.target;
  } else if (!secondaryMet) {
    // 将未达标的Secondary产品设置为刚好达标
    secondaryRows.forEach(r => {
      if (r.sales < r.target) overrides[r.prod] = r.target;
    });
  } else if (!addonMet) {
    // 将未达标的Value Add-on产品设置为刚好达标
    addonRows.forEach(r => {
      if (r.sales < r.target) overrides[r.prod] = r.target;
    });
  }
  
  const estComm = calcTotals(list, nextAcc, overrides);

  /* ---------- 输出 ---------- */
  gapDiv.textContent = `You are only ${gapText} away from the next tier ${(nextAcc * 100).toFixed(0)}% accelerator, ` +
    `estimated commission ${estComm}.`;
}



// 月份切换事件
function onMonthChange() {
  const m = $("monthSelect").value;
  if (!DATA[m]) return;
  buildTable(m, DATA[m]);
  updateTargets(); 
  focusFirstSales();  
}
