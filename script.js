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
    tdTar.textContent = p.target;
    tr.appendChild(tdTar);

    // My Sales（输入框）
    const tdSales = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "number";
    inp.min = "0";
    inp.value = p.sales || "";
    inp.className = "sales-input";
    inp.oninput = () => {
      p.sales = Number(inp.value) || 0;
      refreshCommissions();
    };
    tdSales.appendChild(inp);
    tr.appendChild(tdSales);

    // Multipliers
    const tdMult = document.createElement("td");
    tdMult.textContent = (p.multMin === p.multMax)
      ? `x ${p.multMin}`
      : `x ${p.multMin}–${p.multMax}`;
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
    tdComm.textContent = "$0";
    tr.appendChild(tdComm);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  refreshCommissions(); // 初次计算
}

// 动态计算加速因子
function accelFactor(month, list) {
  if (month === "January" || month === "February") return 1.0;
  const isDone = cat =>
    list.filter(r => r.category === cat).every(r => (Number(r.sales) || 0) >= (Number(r.target) || 0));
  const core = isDone("Core");
  const secondary = isDone("Secondary");
  const addon = isDone("Product Add-on") && isDone("Value Add-on");
  let count = 0;
  if (core) count++;
  if (secondary) count++;
  if (addon) count++;
  if (month === "March" || month === "April") return [1.0, 1.25, 1.5, 2.0][count];
  return [1.0, 1.25, 1.5][Math.min(count, 2)];
}

// 刷新所有佣金和加速显示
function refreshCommissions() {
  const list = DATA[CURRENT_MONTH];
  const acc = accelFactor(CURRENT_MONTH, list);

  // 更新加速因子列
  if (CURRENT_MONTH !== "January" && CURRENT_MONTH !== "February") {
    document.querySelectorAll(".acc-cell").forEach(td => {
      td.textContent = `${(acc * 100).toFixed(0)}%`;
    });
  }

  // 行佣金计算
  let total = 0;
  list.forEach((p, idx) => {
    const sales = Number(p.sales) || 0;
    if (!sales) {
      $(`comm-${idx}`).textContent = "$0";
      return;
    }
    const cMin = sales * Number(p.mrrMin) * Number(p.multMin) * acc;
    const cMax = sales * Number(p.mrrMax) * Number(p.multMax) * acc;
    let val = cMin === cMax
      ? `$${cMin.toFixed(2)}`
      : `$${cMin.toFixed(2)}–$${cMax.toFixed(2)}`;
    $(`comm-${idx}`).textContent = val;

    // 统计总佣金（用最低值）
    total += cMin;
  });

  // 总佣金显示
  if ($("totalComm")) $("totalComm").textContent = `Total Commission: $${total.toFixed(2)}`;
}

// 月份切换事件
function onMonthChange() {
  const m = $("monthSelect").value;
  if (!DATA[m]) return;
  buildTable(m, DATA[m]);
}
