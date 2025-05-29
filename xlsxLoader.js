(async function () {
  // Excel 文件名
  const FILE_NAME = 'WinbackComp2025.xlsx';

  // 下载 .xlsx 为 ArrayBuffer
  const buf = await fetch(FILE_NAME).then(r => r.arrayBuffer());

  // 解析 workbook
  const workbook = XLSX.read(buf, { type: 'array' });

  // 解析所有 sheet，组装成全局 CONFIG_DATA
  const CONFIG_DATA = {};
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet);

    CONFIG_DATA[sheetName] = rows.map(row => ({
      category: row["Category"] || "",
      prod: row["Product"] || "",
      target: Number(row["Targets"]) || 0,
      multMin: Number(row["Min-Multipliers"]) || 0,
      multMax: Number(row["Max-Multipliers"]) || 0,
      mrrMin: Number(row["Min-Base"]) || 0,
      mrrMax: Number(row["Max-Base"]) || 0
    }));
  });

  // 注入全局，供 script.js 使用
  window.CONFIG_DATA = CONFIG_DATA;

  // 不主动调用 buildTable，全部由 script.js 控制初始化
})();
