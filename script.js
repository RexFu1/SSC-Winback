/* ======== Data ======== */
const productOrder = [
  { cat: "Core", prod: "MP",    rowspan: 2, mrrMin: 40,  mrrMax: 50,  multMin: 0.8,  multMax: 1.07 },
  { cat: null,   prod: "HSIA",  rowspan: 0, mrrMin: 160, mrrMax: 160, multMin: 1.57, multMax: 1.57 },
  { cat: "Secondary", prod: "Bcon", rowspan: 0, mrrMin: 30,  mrrMax: 30,  multMin: 1.01, multMax: 1.01 },
  { cat: "Product Add-on", prod: "IoT",  rowspan: 3, mrrMin: 0.5,  mrrMax: 0.5,  multMin: 0.5,  multMax: 0.5 },
  { cat: null,   prod: "TSB",   rowspan: 0, mrrMin: 70,  mrrMax: 70,  multMin: 0.89, multMax: 0.89 },
  { cat: null,   prod: "BTV",   rowspan: 0, mrrMin: 30,  mrrMax: 30,  multMin: 0.71, multMax: 0.71 },
  { cat: "Value Add-on", prod: "CD",   rowspan: 3, mrrMin: 15,  mrrMax: 15,  multMin: 0.97, multMax: 0.97 },
  { cat: null,   prod: "BWifi", rowspan: 0, mrrMin: 15,  mrrMax: 15,  multMin: 0.58, multMax: 0.58 },
  { cat: null,   prod: "DCC",   rowspan: 0, mrrMin: 17,  mrrMax: 17,  multMin: 1.0,  multMax: 1.0 }
];

const baseTargets = {
  Low:    { MP: 19, HSIA: 3, Bcon: 3, IoT: 0.5, TSB: 0.5, BTV: 0.5, CD: 1, BWifi: 3, DCC: 2 },
  Medium: { MP: 25, HSIA: 3, Bcon: 3, IoT: 0.5, TSB: 0.5, BTV: 0.5, CD: 1, BWifi: 3, DCC: 4 },
  High:   { MP: 40, HSIA: 3, Bcon: 3, IoT: 0.5, TSB: 0.5, BTV: 0.5, CD: 1, BWifi: 3, DCC: 8 }
};

const targetsLvl = JSON.parse(JSON.stringify(baseTargets));

/* ======== Helper shortcuts ======== */
const $   = (id) => document.getElementById(id);
const val = (id) => parseFloat($(id)?.value || 0);
const tgt = (p) => parseFloat($(`target-${p}`).textContent || 0);
const fmt = (v) => `$ ${v.toFixed(0)}`;

/* ======== Build table ======== */
function buildTable() {
  const tb = $("targetTable").querySelector("tbody");
  tb.innerHTML = "";
  productOrder.forEach(p => {
    const tr = document.createElement("tr");

    if (p.cat) {
      const tdCat = document.createElement("td");
      tdCat.textContent = p.cat;
      if (p.rowspan) tdCat.rowSpan = p.rowspan;
      tr.appendChild(tdCat);
    }

    tr.innerHTML += `
      <td>${p.prod}</td>
      <td id="target-${p.prod}"></td>
      <td style="position:relative;">
        <input id="sales-${p.prod}" class="sales-input blur-style" type="number" 
               min="-500" max="500" step="1" value="0" />
        <div id="warn-${p.prod}" class="warn">Are you sure?</div>
      </td>
      <td>x ${p.multMin.toFixed(2)}${p.multMin !== p.multMax ? " – " + p.multMax.toFixed(2) : ""}</td>
      <td class="acc-cell">100 %</td>
      <td id="comm-${p.prod}">$ 0</td>`;
    tb.appendChild(tr);

    const inp = $(`sales-${p.prod}`);
    inp.addEventListener("focus", () => inp.classList.remove("blur-style"));
    inp.addEventListener("blur",  () => inp.classList.add("blur-style"));
    // Attach input listener to recalculate commissions on the fly
    inp.addEventListener("input", function(e) {
      // Input validation: numeric only, limit length, remove leading zeros
      let value = e.target.value.replace(/[^0-9-]/g, '');
      if (value.length > 4) value = value.slice(0, 4);
      if (value.length > 1) value = value.replace(/^0+/, '') || '0';
      e.target.value = value;
      // Immediate recalculation on input
      computeAll();
    });
    // Debounced recalculation for performance (invokes after 300ms of no new input)
    const debounceCompute = debounce(computeAll, 300);
    inp.addEventListener("input", debounceCompute);
    function debounce(fn, delay) {
      // (Consider moving this function definition outside the loop for efficiency)
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
      };
    }
  });
}

/* ======== Update targets ======== */
function updateTargets() {
  const lvl = $("monthSelect").value;
  const rampFactor = parseFloat($("rampSelect").value);

  Object.keys(baseTargets[lvl]).forEach(prod => {
    let value = baseTargets[lvl][prod];

    // Apply ramping factor to targets
    if (rampFactor !== 1) {
      value *= rampFactor;
      value = ['MP','HSIA','Bcon'].includes(prod) ? Math.ceil(value) : Number(value.toFixed(1));
    }
    targetsLvl[lvl][prod] = value;
    $(`target-${prod}`).textContent = value % 1 === 0 ? value : value.toFixed(1);
  });

  computeAll();
}

/* ======== Accelerator ======== */
let currentAccel = 1;
function calcAccel() {
  const s = {}, t = {};
  productOrder.forEach(meta => {
    s[meta.prod] = val(`sales-${meta.prod}`);
    t[meta.prod] = tgt(meta.prod);
  });

  let acc = 1;
  if (s.MP >= t.MP && s.HSIA >= t.HSIA) {
    acc = 1.25;
    if (s.Bcon >= t.Bcon) {
      acc = 1.5;
      const addS = s.IoT + s.TSB + s.BTV,
            addT = t.IoT + t.TSB + t.BTV,
            valS = s.CD + s.BWifi + s.DCC,
            valT = t.CD + t.BWifi + t.DCC;
      if (addS >= addT && valS >= valT) acc = 2;
    }
  }
  currentAccel = acc;
  document.querySelectorAll(".acc-cell").forEach(td => td.textContent = `${(acc * 100).toFixed(0)} %`);
  return { sales: s, targets: t, acc };
}

/* ======== Commission ======== */
function commission(meta, qty, acc) {
  return {
    min: meta.mrrMin * qty * meta.multMin * acc,
    max: meta.mrrMax * qty * meta.multMax * acc
  };
}

function computeCommission(accOverride = null) {
  let minTot = 0, maxTot = 0;
  productOrder.forEach(meta => {
    const qty = val(`sales-${meta.prod}`);
    const acc = accOverride || currentAccel;
    const c = commission(meta, qty, acc);

    $(`comm-${meta.prod}`).textContent =
      qty === 0 ? "$ 0"
      : c.min === c.max ? fmt(c.min) : `${fmt(c.min)} – ${fmt(c.max)}`;

    minTot += c.min;
    maxTot += c.max;
  });

  $("totalComm").textContent =
    minTot === maxTot
      ? `Total Commission: ${fmt(minTot)}`
      : `Total Commission: ${fmt(minTot)} – ${fmt(maxTot)}`;

  return { minTot, maxTot };
}

function computeCommissionFor(sim, acc) {
  // Calculate total commission for a given simulated sales scenario at a specified accelerator
  let mi = 0, ma = 0;
  productOrder.forEach(meta => {
    const q = sim[meta.prod] || 0;
    const c = commission(meta, q, acc);
    mi += c.min;
    ma += c.max;
  });
  return { min: mi, max: ma };
}

/* ======== Next Tier Output ======== */
function updateGap(ctx, commNow) {
  const line = $("gapLine");
  if (ctx.acc === 2) {
    line.textContent = "Congratulations! You have achieved the highest tier 200% accelerator!";
    return;
  }

  // Determine next accelerator tier scenario and requirements based on current performance
  const s = ctx.sales, t = ctx.targets;
  const mpMet = s.MP >= t.MP, hsiaMet = s.HSIA >= t.HSIA;
  const coreMet = mpMet && hsiaMet;
  const bconMet = s.Bcon >= t.Bcon;
  const productAddMet = (s.IoT + s.TSB + s.BTV) >= (t.IoT + t.TSB + t.BTV);
  const valueAddMet = (s.CD + s.BWifi + s.DCC) >= (t.CD + t.BWifi + t.DCC);
  const addAllMet = productAddMet && valueAddMet;

let nextAcc = 1;
const neededParts = [];
let sim = null;  

// Scenario 1: Core (MP/HSIA) below target AND Bcon below target
if (!coreMet && !bconMet) {
  const mpGap = Math.max(0, Math.ceil(t.MP - s.MP));
  const hsiaGap = Math.max(0, Math.ceil(t.HSIA - s.HSIA));
  if (mpGap > 0) neededParts.push(`${mpGap} MP`);
  if (hsiaGap > 0) neededParts.push(`${hsiaGap} HSIA`);
  nextAcc = 1.25;
  sim = { ...s };                    
  if (s.MP < t.MP) sim.MP = t.MP; 
  if (s.HSIA < t.HSIA) sim.HSIA = t.HSIA;
}

  // Scenario 2: Core met, Bcon below target, and at least one add-on category below target -> need Bcon to reach 150%
  else if (coreMet && !bconMet && !addAllMet) {
    const bconGap = Math.max(0, Math.ceil(t.Bcon - s.Bcon));
    if (bconGap > 0) neededParts.push(`${bconGap} Bcon`);
    nextAcc = 1.5;
    // Only Bcon is required for 150% since core is met; add-ons are not needed for this tier.
  }
  // Scenario 6: Core met, Bcon below target, and all add-ons meet target -> need Bcon to reach 200%
  else if (coreMet && !bconMet && addAllMet) {
    const bconGap = Math.max(0, Math.ceil(t.Bcon - s.Bcon));
    if (bconGap > 0) neededParts.push(`${bconGap} Bcon`);
    nextAcc = 2.0;
    // FIX: Previously next tier would be shown as 150%, but since all other categories are met, achieving Bcon target yields 200%. Corrected.
  }
  // Scenario 3: Core met, Bcon met, but one or both add-on categories below target -> need add-on(s) to reach 200%
  else if (coreMet && bconMet && !addAllMet) {
    const addGap = Math.max(0, (t.IoT + t.TSB + t.BTV) - (s.IoT + s.TSB + s.BTV));
    const valGap = Math.max(0, (t.CD + t.BWifi + t.DCC) - (s.CD + s.BWifi + s.DCC));
    if (addGap > 0) neededParts.push(`${addGap.toFixed(1)} Product Add-on`);
    if (valGap > 0) neededParts.push(`${valGap.toFixed(1)} Value Add-on`);
    nextAcc = 2.0;
    // We use one decimal place for add-on gaps (targets can be fractional). This explicitly shows remaining add-ons needed for 200%.
  }
  // Scenario 5: Core (MP/HSIA) below target, Bcon met, all add-ons met -> need MP/HSIA to reach 200%
  else if (!coreMet && bconMet && addAllMet) {
    const mpGap = Math.max(0, Math.ceil(t.MP - s.MP));
    const hsiaGap = Math.max(0, Math.ceil(t.HSIA - s.HSIA));
    if (mpGap > 0) neededParts.push(`${mpGap} MP`);
    if (hsiaGap > 0) neededParts.push(`${hsiaGap} HSIA`);
    nextAcc = 2.0;
    // FIX: Previously this might have been treated as a 125% scenario. Now we correctly identify that completing core achieves 200% since others are met.
  }
  // Scenario 4: Core (MP/HSIA) below target, Bcon met, and at least one add-on category below target -> need MP/HSIA to reach 150%
  else if (!coreMet && bconMet && !addAllMet) {
    const mpGap = Math.max(0, Math.ceil(t.MP - s.MP));
    const hsiaGap = Math.max(0, Math.ceil(t.HSIA - s.HSIA));
    if (mpGap > 0) neededParts.push(`${mpGap} MP`);
    if (hsiaGap > 0) neededParts.push(`${hsiaGap} HSIA`);
    nextAcc = 1.5;
    // Add-ons are incomplete but not required for 150%. Old logic would not reach 150% here (stuck at 125%); now corrected.
  }

  // Format the needed parts into a readable string
  let gapText = neededParts.join(" and ");
  if (neededParts.length > 2) {
    gapText = neededParts.slice(0, -1).join(", ") + ", and " + neededParts[neededParts.length - 1];
  }

  // Simulate achieving the next tier by setting unmet categories to target values for commission calculation
  if (!sim) {
      sim = { ...s };
      if (s.MP < t.MP) sim.MP = t.MP;
      if (s.HSIA < t.HSIA) sim.HSIA = t.HSIA;
      if (s.Bcon < t.Bcon) sim.Bcon = t.Bcon;
      if (nextAcc === 2.0) {
        const addGap = Math.max(0, (t.IoT + t.TSB + t.BTV) - (s.IoT + s.TSB + s.BTV));
        const valGap = Math.max(0, (t.CD + t.BWifi + t.DCC) - (s.CD + s.BWifi + s.DCC));
        if (addGap > 0) sim.IoT = s.IoT + addGap;
        if (valGap > 0) sim.CD = s.CD + valGap;
    }
  }

  const nextComm = computeCommissionFor(sim, nextAcc);
  const nextCommText = nextComm.min === nextComm.max
    ? fmt(nextComm.min)
    : `${fmt(nextComm.min)} – ${fmt(nextComm.max)}`;

  line.textContent = `You are only ${gapText} away from the next tier ${(nextAcc * 100).toFixed(0)}% accelerator, estimated commission ${nextCommText}`;

}

/* ======== Validation ======== */
function validateRange() {
  let ok = true;
  productOrder.forEach(meta => {
    const input = $(`sales-${meta.prod}`);
    const warn  = $(`warn-${meta.prod}`);
    const v = parseFloat(input.value) || 0;
    // Only show warning if value is out of range and non-zero
    const isValid = v >= -500 && v <= 500;
    const isDirty = v !== 0;
    warn.style.display = (!isValid && isDirty) ? "block" : "none";
    ok = ok && isValid;
  });
  return ok;
}

/* ======== Recalculation Trigger ======== */
function computeAll() {
  if (!validateRange()) return;
  const ctx = calcAccel();
  const comm = computeCommission();  
  updateGap(ctx, comm);             

}

// Initialize table and default calculations on page load
buildTable();
updateTargets();
