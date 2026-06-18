// Athena Analytics App Engine
let currentDataset = [];
let activeData = [];
let datasetName = "";
let datasetType = ""; // spotify, ecommerce, inventory, custom
let activeTab = "welcome";
let currentTheme = "indigo";

const themePalettes = {
  indigo: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7'],
  cyberpunk: ['#d946ef', '#06b6d4', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b'],
  emerald: ['#10b981', '#3b82f6', '#14b8a6', '#06b6d4', '#22c55e', '#84cc16'],
  solar: ['#f97316', '#ef4444', '#eab308', '#f43f5e', '#f59e0b', '#ea580c'],
  graphite: ['#94a3b8', '#64748b', '#cbd5e1', '#475569', '#334155', '#1e293b']
};


// Data Profile Metadata
let dataProfile = {
  rowCount: 0,
  colCount: 0,
  columns: [],
  numericCols: [],
  textCols: [],
  dateCols: []
};

// Paginated view config
let tablePage = 0;
const tablePageSize = 10;

// SQL Playground state
let sqlHistory = [];
let sqlOutput = [];
let sqlSavedQueries = [];
let colOutlierStats = {};

// Dashboard widget configurations
let dashboardCharts = [];

// Active pivot inputs
let pivotChart = null;

// Initialize Page
window.addEventListener("DOMContentLoaded", () => {
  // Load Spotify dataset by default to show interactive content instantly
  loadSample('spotify');
  
  // Set up drag and drop listeners
  const dropZone = document.getElementById("drop-zone");
  if (dropZone) {
    dropZone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "var(--primary-color)";
    });
    
    dropZone.addEventListener("dragleave", () => {
      dropZone.style.borderColor = "rgba(255, 255, 255, 0.15)";
    });
    
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropZone.style.borderColor = "rgba(255, 255, 255, 0.15)";
      if (e.dataTransfer.files.length > 0) {
        processUploadedFile(e.dataTransfer.files[0]);
      }
    });
  }

  // SQL Enter shortcut
  document.getElementById("sql-editor-textarea").addEventListener("keydown", (e) => {
    if (e.key === "F8" || (e.key === "Enter" && e.ctrlKey)) {
      e.preventDefault();
      executeSqlQuery();
    }
  });

  // Load saved and history queries from localStorage
  try {
    sqlSavedQueries = JSON.parse(localStorage.getItem('athena_saved_queries')) || [];
    sqlHistory = JSON.parse(localStorage.getItem('athena_sql_history')) || [];
    renderSavedQueries();
    renderSqlHistory();
  } catch (e) {
    console.error("Failed to load history or saved queries:", e);
  }
});

// Switch Tabs Panel
function switchTab(tabId) {
  activeTab = tabId;
  
  // Update nav link active styles
  document.querySelectorAll(".nav-link").forEach(link => {
    link.classList.remove("active");
  });
  
  // Find trigger nav element
  const navItem = Array.from(document.querySelectorAll(".nav-link")).find(link => 
    link.getAttribute("onclick").includes(`'${tabId}'`)
  );
  if (navItem) navItem.classList.add("active");

  // Show corresponding section
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
  });
  
  const targetSection = document.getElementById(`tab-${tabId}`);
  if (targetSection) targetSection.classList.add("active");

  // Customize header title & icons
  const headerText = document.getElementById("header-title-text");
  const headerIcon = document.getElementById("header-icon");
  
  switch (tabId) {
    case "welcome":
      headerText.textContent = "Home Dashboard Welcome";
      headerIcon.className = "fa-solid fa-house";
      headerIcon.style.color = "var(--accent-color)";
      break;
    case "datahub":
      headerText.textContent = "Data Hub & Profile";
      headerIcon.className = "fa-solid fa-database";
      headerIcon.style.color = "var(--primary-color)";
      renderDataTable();
      break;
    case "sqllab":
      headerText.textContent = "SQL Terminal Laboratory";
      headerIcon.className = "fa-solid fa-code";
      headerIcon.style.color = "var(--accent-color)";
      initSqlConsole();
      break;
    case "pivot":
      headerText.textContent = "Pivot Multi-Aggregation Table";
      headerIcon.className = "fa-solid fa-table-cells";
      headerIcon.style.color = "var(--secondary-color)";
      initPivotOptions();
      break;
    case "dashboard":
      headerText.textContent = "Business Intelligence Studio";
      headerIcon.className = "fa-solid fa-chart-line";
      headerIcon.style.color = "var(--primary-color)";
      renderDashboard();
      break;
    case "aianalyst":
      headerText.textContent = "AI Agent Copilot";
      headerIcon.className = "fa-solid fa-robot";
      headerIcon.style.color = "var(--accent-color)";
      renderAiStory();
      break;
  }
}

// Trigger browser file dialog
function triggerFileUpload() {
  document.getElementById("file-uploader").click();
}

// File Input trigger
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (file) {
    processUploadedFile(file);
  }
}

// Parse File via FileReader (supports CSV and Excel XLSX)
function processUploadedFile(file) {
  const reader = new FileReader();
  const fileExt = file.name.split('.').pop().toLowerCase();
  datasetName = file.name;
  datasetType = "custom";

  reader.onload = function(e) {
    let data = e.target.result;
    let parsedRows = [];

    try {
      if (fileExt === 'xlsx' || fileExt === 'xls') {
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        parsedRows = XLSX.utils.sheet_to_json(sheet);
      } else {
        // Simple CSV Parser
        const textDecoder = new TextDecoder('utf-8');
        const csvContent = textDecoder.decode(data);
        parsedRows = parseCsvText(csvContent);
      }

      if (parsedRows.length === 0) {
        alert("The parsed dataset is empty. Please check your file.");
        return;
      }

      // Convert number strings to float
      parsedRows.forEach(row => {
        for (let key in row) {
          if (row.hasOwnProperty(key)) {
            const rawVal = row[key];
            if (typeof rawVal === 'string') {
              const cleaned = rawVal.trim().replace(/,/g, '');
              if (!isNaN(cleaned) && cleaned !== "") {
                row[key] = Number(cleaned);
              }
            }
          }
        }
      });

      currentDataset = parsedRows;
      activeData = JSON.parse(JSON.stringify(parsedRows)); // deep clone
      
      initLoadedDataset();
      switchTab('datahub');
      
    } catch (err) {
      console.error(err);
      alert("Error parsing document. Verify layout matches CSV/XLSX standards.");
    }
  };

  if (fileExt === 'xlsx' || fileExt === 'xls') {
    reader.readAsArrayBuffer(file);
  } else {
    reader.readAsArrayBuffer(file);
  }
}

// Simple robust CSV parser to json array
function parseCsvText(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i+1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push("");
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [""];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== "") {
    lines.push(row);
  }

  if (lines.length < 2) return [];

  const headers = lines[0].map(h => h.trim());
  const jsonArray = [];

  for (let r = 1; r < lines.length; r++) {
    const values = lines[r];
    if (values.length !== headers.length) continue; // skip skewed lines
    const record = {};
    for (let c = 0; c < headers.length; c++) {
      record[headers[c]] = values[c].trim();
    }
    jsonArray.push(record);
  }

  return jsonArray;
}

// Load Preloaded Samples
function loadSample(sampleId) {
  if (sampleDatasets[sampleId]) {
    currentDataset = JSON.parse(JSON.stringify(sampleDatasets[sampleId]));
    activeData = JSON.parse(JSON.stringify(sampleDatasets[sampleId]));
    datasetName = sampleId === 'spotify' ? "Spotify Streams 2024" :
                  sampleId === 'ecommerce' ? "E-Commerce Retail Orders" :
                  "Warehouse Tech Inventory";
    datasetType = sampleId;
    
    // Clear dashboards
    dashboardCharts = [];
    
    initLoadedDataset();
    
    // Automatically generate standard sample graphs
    generateDefaultWidgets();
    
    if (activeTab !== "welcome") {
      switchTab(activeTab);
    } else {
      updateSidebarBadge();
    }
  }
}

// Post-dataset load configuration
function initLoadedDataset() {
  tablePage = 0;
  profileSchema();
  updateSidebarBadge();
  initSelectDropdowns();
  
  // Reset SQL editor query suggestion
  document.getElementById("sql-editor-textarea").value = `SELECT * FROM data LIMIT 10;`;
  sqlOutput = [];
  
  // Generate automated AI welcomes
  const chatMessages = document.getElementById("chat-bubble-messages");
  if (chatMessages) {
    chatMessages.innerHTML = `
      <div class="message-bubble message-assistant">
        Hello! I have loaded the dataset: <strong>${datasetName}</strong> (${activeData.length} records). 
        You can ask me questions about it, profile columns, or write query statements in the playground.
      </div>
    `;
    generateChatSuggestions();
  }
}

// Update UI Badge
function updateSidebarBadge() {
  const dot = document.getElementById("dataset-status-dot");
  const nameLabel = document.getElementById("loaded-dataset-name");
  const countLabel = document.getElementById("loaded-dataset-rows");
  
  if (activeData.length > 0) {
    dot.className = "dataset-badge-dot loaded";
    nameLabel.textContent = datasetName;
    countLabel.textContent = `${activeData.length} entries parsed`;
  } else {
    dot.className = "dataset-badge-dot";
    nameLabel.textContent = "No Dataset Loaded";
    countLabel.textContent = "Upload a file to start";
  }
}

// Generate Default BI Widgets based on dataset type
function generateDefaultWidgets() {
  dashboardCharts = [];
  if (datasetType === 'spotify') {
    dashboardCharts.push(
      { id: "w-1", title: "Streams by Genre (Total)", type: "donut", xaxis: "Genre", yaxis: "Streams", agg: "SUM" },
      { id: "w-2", title: "Danceability vs Energy Ratings", type: "scatter", xaxis: "Danceability", yaxis: "Energy", agg: "NONE" },
      { id: "w-3", title: "Monthly Stream Releases", type: "bar", xaxis: "ReleaseDate", yaxis: "Streams", agg: "SUM" }
    );
  } else if (datasetType === 'ecommerce') {
    dashboardCharts.push(
      { id: "w-1", title: "Revenue contribution by Category", type: "donut", xaxis: "Category", yaxis: "Revenue", agg: "SUM" },
      { id: "w-2", title: "Daily Sales Revenue Trend", type: "line", xaxis: "Date", yaxis: "Revenue", agg: "SUM" },
      { id: "w-3", title: "Product Profit Margin Analysis", type: "bar", xaxis: "SubCategory", yaxis: "Profit", agg: "SUM" }
    );
  } else if (datasetType === 'inventory') {
    dashboardCharts.push(
      { id: "w-1", title: "Stock Distribution by Category", type: "bar", xaxis: "Category", yaxis: "StockLevel", agg: "SUM" },
      { id: "w-2", title: "Retail Pricing vs Stock Unit Cost", type: "scatter", xaxis: "UnitCost", yaxis: "RetailPrice", agg: "NONE" },
      { id: "w-3", title: "Warehouse Storage Holdings", type: "donut", xaxis: "Warehouse", yaxis: "StockLevel", agg: "SUM" }
    );
  } else {
    // Custom upload default widgets: pick first text and first numeric column
    if (dataProfile.textCols.length > 0 && dataProfile.numericCols.length > 0) {
      dashboardCharts.push({
        id: "w-1",
        title: `Total ${dataProfile.numericCols[0]} by ${dataProfile.textCols[0]}`,
        type: "bar",
        xaxis: dataProfile.textCols[0],
        yaxis: dataProfile.numericCols[0],
        agg: "SUM"
      });
    }
  }
}

// Profile Columns
function profileSchema() {
  if (activeData.length === 0) return;
  
  const firstRow = activeData[0];
  const keys = Object.keys(firstRow);
  
  dataProfile.rowCount = activeData.length;
  dataProfile.colCount = keys.length;
  dataProfile.columns = [];
  dataProfile.numericCols = [];
  dataProfile.textCols = [];
  dataProfile.dateCols = [];
  
  keys.forEach(key => {
    // Basic type evaluation based on first 5 elements
    let isNum = true;
    let isDate = true;
    
    for (let i = 0; i < Math.min(activeData.length, 5); i++) {
      const val = activeData[i][key];
      if (val !== null && val !== undefined && val !== "") {
        if (typeof val !== 'number') isNum = false;
        // Simple regex check for date format YYYY-MM-DD
        const dateStr = String(val);
        if (!/^\d{4}-\d{2}-\d{2}/.test(dateStr) && isNaN(Date.parse(dateStr))) {
          isDate = false;
        }
      }
    }
    
    let evaluatedType = "Text";
    if (isNum) {
      evaluatedType = "Number";
      dataProfile.numericCols.push(key);
    } else if (isDate) {
      evaluatedType = "Date";
      dataProfile.dateCols.push(key);
    } else {
      dataProfile.textCols.push(key);
    }
    
    // Calculate unique count & null values
    const uniqueVals = new Set(activeData.map(r => r[key]));
    const nullsCount = activeData.filter(r => r[key] === null || r[key] === undefined || r[key] === "").length;
    
    dataProfile.columns.push({
      name: key,
      type: evaluatedType,
      unique: uniqueVals.size,
      nulls: nullsCount
    });
  });

  // Compute outliers for all numeric columns
  colOutlierStats = {};
  dataProfile.numericCols.forEach(col => {
    const vals = activeData.map(r => Number(r[col])).filter(v => !isNaN(v));
    if (vals.length > 0) {
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sqDiffs = vals.map(v => Math.pow(v - mean, 2));
      const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / vals.length) || 1;
      
      const outliers = activeData.filter(r => {
        const val = Number(r[col]);
        return !isNaN(val) && Math.abs((val - mean) / stdDev) > 2;
      }).length;
      
      colOutlierStats[col] = { mean, stdDev, count: outliers };
    }
  });

  // Render profile list to UI
  renderProfileUi();
  renderOutliersUi();
}

// Render profile UI
function renderProfileUi() {
  const container = document.getElementById("profile-metric-list");
  if (!container) return;
  
  let html = `
    <div class="profile-metric">
      <span class="profile-metric-name">Row Record Count</span>
      <span class="profile-metric-value">${dataProfile.rowCount}</span>
    </div>
    <div class="profile-metric">
      <span class="profile-metric-name">Total Columns</span>
      <span class="profile-metric-value">${dataProfile.colCount}</span>
    </div>
    <div style="margin-top: 12px; font-weight: 700; font-size: 13px; color: var(--text-main);">Column Schema Details:</div>
  `;
  
  dataProfile.columns.forEach(col => {
    let iconClass = col.type === "Number" ? "fa-hashtag" :
                    col.type === "Date" ? "fa-calendar-days" :
                    "fa-font";
    let iconColor = col.type === "Number" ? "var(--primary-color)" :
                    col.type === "Date" ? "var(--secondary-color)" :
                    "var(--accent-color)";
    
    html += `
      <div style="background-color: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <span style="font-weight: 600; color: var(--text-main);"><i class="fa-solid ${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${col.name}</span>
          <span style="font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); background-color: rgba(255,255,255,0.04); padding: 2px 6px; border-radius: 4px;">${col.type}</span>
        </div>
        <div style="display: flex; justify-content: space-between; color: var(--text-muted); font-size: 11px;">
          <span>Unique: ${col.unique}</span>
          <span>Nulls: ${col.nulls} (${Math.round((col.nulls/dataProfile.rowCount)*100)}%)</span>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Load Dropdown Options
function initSelectDropdowns() {
  const rowSelect = document.getElementById("pivot-row-select");
  const colSelect = document.getElementById("pivot-col-select");
  const valSelect = document.getElementById("pivot-val-select");
  
  if (!rowSelect) return;
  
  // Setup selectors
  rowSelect.innerHTML = `<option value="None">None</option>`;
  colSelect.innerHTML = `<option value="None">None</option>`;
  valSelect.innerHTML = `<option value="None">None</option>`;
  
  dataProfile.columns.forEach(col => {
    rowSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    colSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    if (col.type === "Number") {
      valSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    }
  });

  // Select defaults if possible
  if (dataProfile.textCols.length > 0) rowSelect.value = dataProfile.textCols[0];
  if (dataProfile.textCols.length > 1) colSelect.value = dataProfile.textCols[1];
  if (dataProfile.numericCols.length > 0) valSelect.value = dataProfile.numericCols[0];

  // Populate Smart Date dropdown
  const dateColSelect = document.getElementById("smart-date-col");
  if (dateColSelect) {
    dateColSelect.innerHTML = "";
    if (dataProfile.dateCols.length === 0) {
      dateColSelect.innerHTML = `<option value="">No Date Columns found</option>`;
    } else {
      dataProfile.dateCols.forEach(col => {
        dateColSelect.innerHTML += `<option value="${col}">${col}</option>`;
      });
    }
  }
}

// Render data viewport table (paginated)
function renderDataTable() {
  const table = document.getElementById("main-data-table");
  const rowCounter = document.getElementById("table-row-counter");
  const prevBtn = document.getElementById("table-btn-prev");
  const nextBtn = document.getElementById("table-btn-next");
  
  if (!table || activeData.length === 0) return;
  
  const headers = Object.keys(activeData[0]);
  
  // Render headers
  let headHtml = "<tr>";
  headers.forEach(h => {
    headHtml += `<th>${h}</th>`;
  });
  headHtml += "</tr>";
  table.querySelector("thead").innerHTML = headHtml;
  
  // Slice page
  const startIdx = tablePage * tablePageSize;
  const endIdx = Math.min(startIdx + tablePageSize, activeData.length);
  const pageRows = activeData.slice(startIdx, endIdx);
  
  let bodyHtml = "";
  pageRows.forEach(row => {
    bodyHtml += "<tr>";
    headers.forEach(h => {
      let val = row[h];
      if (val === null || val === undefined) val = "";
      
      // Check for outlier cell
      let cellClass = "";
      if (typeof val === 'number' && colOutlierStats[h]) {
        const stats = colOutlierStats[h];
        if (Math.abs((val - stats.mean) / stats.stdDev) > 2) {
          cellClass = ' class="outlier-cell" title="Outlier detected (|Z-Score| > 2)"';
        }
      }
      
      if (typeof val === 'number' && h.toLowerCase().includes("streams")) {
        val = val.toLocaleString();
      } else if (typeof val === 'number' && (h.toLowerCase().includes("revenue") || h.toLowerCase().includes("profit") || h.toLowerCase().includes("cost") || h.toLowerCase().includes("price"))) {
        val = "$" + val.toLocaleString();
      }
      bodyHtml += `<td${cellClass}>${val}</td>`;
    });
    bodyHtml += "</tr>";
  });
  table.querySelector("tbody").innerHTML = bodyHtml;
  
  // Row pagination labels
  rowCounter.textContent = `Showing ${startIdx + 1}-${endIdx} of ${activeData.length} records`;
  
  // Enable disable buttons
  prevBtn.disabled = tablePage === 0;
  nextBtn.disabled = endIdx >= activeData.length;
}

function prevTablePage() {
  if (tablePage > 0) {
    tablePage--;
    renderDataTable();
  }
}

function nextTablePage() {
  if ((tablePage + 1) * tablePageSize < activeData.length) {
    tablePage++;
    renderDataTable();
  }
}

// Data cleaner drawer toggle
function toggleCleanerPanel() {
  const panel = document.getElementById("cleaner-panel");
  panel.style.display = panel.style.display === "none" ? "flex" : "none";
}

// Clean dataset operations
function cleanData(operation) {
  if (activeData.length === 0) return;
  
  if (operation === 'dropna') {
    const prevCount = activeData.length;
    activeData = activeData.filter(row => {
      return Object.values(row).every(val => val !== null && val !== undefined && val !== "");
    });
    alert(`Cleaned: Dropped ${prevCount - activeData.length} records containing null fields.`);
  } 
  
  else if (operation === 'fillna') {
    // Fill null numerical columns with column average
    dataProfile.numericCols.forEach(col => {
      const numbers = activeData.map(r => r[col]).filter(v => typeof v === 'number');
      if (numbers.length === 0) return;
      const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      
      activeData.forEach(row => {
        if (row[col] === null || row[col] === undefined || row[col] === "") {
          row[col] = avg;
        }
      });
    });
    alert("Cleaned: Substituted null numerical records with the average metric values.");
  } 
  
  else if (operation === 'dropdupes') {
    const prevCount = activeData.length;
    const seen = new Set();
    activeData = activeData.filter(row => {
      const serialized = JSON.stringify(row);
      if (seen.has(serialized)) return false;
      seen.add(serialized);
      return true;
    });
    alert(`Cleaned: Deduplicated dataset. Removed ${prevCount - activeData.length} duplicates.`);
  }
  
  profileSchema();
  renderDataTable();
  updateSidebarBadge();
}

// SQL Lab Panel Operations
function initSqlConsole() {
  const explorerList = document.getElementById("sql-schema-list");
  if (!explorerList || activeData.length === 0) return;
  
  const headers = Object.keys(activeData[0]);
  let explorerHtml = `
    <div class="schema-table-node">
      <span class="schema-table-name"><i class="fa-solid fa-table"></i> data</span>
      <ul class="schema-columns">
  `;
  
  headers.forEach(h => {
    let colObj = dataProfile.columns.find(c => c.name === h);
    let typeCode = colObj ? colObj.type : "Text";
    explorerHtml += `
      <li class="schema-col-item">
        <span>${h}</span>
        <span class="schema-col-type">${typeCode.toLowerCase()}</span>
      </li>
    `;
  });
  
  explorerHtml += `
      </ul>
    </div>
  `;
  
  explorerList.innerHTML = explorerHtml;

  // Populate Visual Query Builder select options
  const filterCol = document.getElementById("qb-filter-col");
  const sortCol = document.getElementById("qb-sort-col");
  if (filterCol && sortCol) {
    filterCol.innerHTML = `<option value="None">None</option>`;
    sortCol.innerHTML = `<option value="None">None</option>`;
    headers.forEach(h => {
      filterCol.innerHTML += `<option value="${h}">${h}</option>`;
      sortCol.innerHTML += `<option value="${h}">${h}</option>`;
    });
  }
}

// Insert SQL editor template strings
function insertSqlTemplate(type) {
  const textarea = document.getElementById("sql-editor-textarea");
  let numCol = dataProfile.numericCols[0] || "Streams";
  let txtCol = dataProfile.textCols[0] || "Genre";
  
  if (type === 'select') {
    textarea.value = `SELECT * FROM data LIMIT 10;`;
  } else if (type === 'groupby') {
    textarea.value = `SELECT ${txtCol}, SUM(${numCol}) AS Total_${numCol}\nFROM data\nGROUP BY ${txtCol}\nORDER BY Total_${numCol} DESC;`;
  } else if (type === 'filter') {
    textarea.value = `SELECT * \nFROM data\nWHERE ${txtCol} = '${activeData[0] ? activeData[0][txtCol] : "Pop"}'\nLIMIT 15;`;
  } else if (type === 'sort') {
    textarea.value = `SELECT * \nFROM data\nORDER BY ${numCol} DESC\nLIMIT 10;`;
  }
}

// Execute In-Browser SQL Statement
function executeSqlQuery() {
  const query = document.getElementById("sql-editor-textarea").value;
  const resultTable = document.getElementById("sql-result-table");
  const exportRow = document.getElementById("sql-export-row");
  
  if (!query || activeData.length === 0) return;
  
  // AlaSQL executes queries against Javascript memory structures.
  // We represent activeData array as the variable parameter "?" mapped in AlaSQL context.
  // To simulate query targets, we substitute the table word "data" with "?"
  let preparedQuery = query.replace(/\bdata\b/gi, "?");
  
  try {
    const startTime = performance.now();
    const result = alasql(preparedQuery, [activeData]);
    const duration = ((performance.now() - startTime) / 1000).toFixed(3);
    
    if (!Array.isArray(result) || result.length === 0) {
      // It might be a single scalar, object or empty array
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        sqlOutput = [result];
      } else if (Array.isArray(result) && result.length === 0) {
        resultTable.querySelector("thead").innerHTML = "<tr><th>Status</th></tr>";
        resultTable.querySelector("tbody").innerHTML = "<tr><td>Empty Result Set. Query executed successfully.</td></tr>";
        exportRow.style.display = "none";
        return;
      } else {
        resultTable.querySelector("thead").innerHTML = "<tr><th>Output</th></tr>";
        resultTable.querySelector("tbody").innerHTML = `<tr><td>${result}</td></tr>`;
        exportRow.style.display = "none";
        return;
      }
    } else {
      sqlOutput = result;
    }
    
    // Display result headers
    const cols = Object.keys(sqlOutput[0]);
    let headHtml = "<tr>";
    cols.forEach(c => {
      headHtml += `<th>${c}</th>`;
    });
    headHtml += "</tr>";
    resultTable.querySelector("thead").innerHTML = headHtml;
    
    // Display rows (max limit of 100 inside UI table to prevent rendering bottleneck)
    let bodyHtml = "";
    const limitRows = sqlOutput.slice(0, 100);
    limitRows.forEach(row => {
      bodyHtml += "<tr>";
      cols.forEach(c => {
        bodyHtml += `<td>${row[c] !== null && row[c] !== undefined ? row[c] : ""}</td>`;
      });
      bodyHtml += "</tr>";
    });
    resultTable.querySelector("tbody").innerHTML = bodyHtml;
    
    // Show exports
    exportRow.style.display = "flex";
    
    // Save successful query to history
    const historyIdx = sqlHistory.indexOf(query);
    if (historyIdx > -1) {
      sqlHistory.splice(historyIdx, 1);
    }
    sqlHistory.unshift(query);
    if (sqlHistory.length > 10) sqlHistory.pop();
    localStorage.setItem('athena_sql_history', JSON.stringify(sqlHistory));
    renderSqlHistory();
    
  } catch (err) {
    console.error(err);
    resultTable.querySelector("thead").innerHTML = "<tr><th style='background-color: var(--danger); color:#ffffff;'><i class='fa-solid fa-circle-exclamation'></i> Query Execution Error</th></tr>";
    resultTable.querySelector("tbody").innerHTML = `<tr><td style='color: var(--danger); font-family: var(--font-mono); font-size:12px; white-space:pre-wrap;'>${err.message}</td></tr>`;
    exportRow.style.display = "none";
  }
}

// SQL Result CSV exporter
function exportSqlToCsv() {
  if (sqlOutput.length === 0) return;
  
  const headers = Object.keys(sqlOutput[0]);
  let csvContent = headers.join(",") + "\n";
  
  sqlOutput.forEach(row => {
    let line = headers.map(h => {
      let val = row[h];
      if (val === null || val === undefined) return "";
      let str = String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        str = '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }).join(",");
    csvContent += line + "\n";
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `athena_sql_export.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// SQL Visualizer modal
function visualizeSqlResults() {
  if (sqlOutput.length === 0) return;
  
  const fields = Object.keys(sqlOutput[0]);
  const xaxisSelect = document.getElementById("sql-vis-xaxis");
  const yaxisSelect = document.getElementById("sql-vis-yaxis");
  
  xaxisSelect.innerHTML = "";
  yaxisSelect.innerHTML = "";
  
  fields.forEach(f => {
    xaxisSelect.innerHTML += `<option value="${f}">${f}</option>`;
    // Evaluate if numeric
    let sampleVal = sqlOutput[0][f];
    if (typeof sampleVal === 'number') {
      yaxisSelect.innerHTML += `<option value="${f}">${f}</option>`;
    }
  });
  
  if (yaxisSelect.options.length === 0) {
    fields.forEach(f => {
      yaxisSelect.innerHTML += `<option value="${f}">${f}</option>`;
    });
  }

  // Open modal
  const modal = document.getElementById("sql-vis-modal");
  modal.classList.add("active");
  
  renderSqlVisChart();
}

function closeSqlVisModal() {
  document.getElementById("sql-vis-modal").classList.remove("active");
}

let sqlVisChartObj = null;

function renderSqlVisChart() {
  const container = document.getElementById("sql-vis-container");
  const xCol = document.getElementById("sql-vis-xaxis").value;
  const yCol = document.getElementById("sql-vis-yaxis").value;
  const type = document.getElementById("sql-vis-type").value;
  
  if (!xCol || !yCol) return;
  
  container.innerHTML = "";
  
  // Extract data arrays
  const xData = sqlOutput.map(r => r[xCol]);
  const yData = sqlOutput.map(r => Number(r[yCol]) || 0);
  
  const options = {
    chart: {
      type: type === 'donut' ? 'donut' : type,
      height: 250,
      foreColor: '#94a3b8',
      background: 'transparent',
      toolbar: { show: false }
    },
    theme: { mode: 'dark' },
    colors: themePalettes[currentTheme],
    plotOptions: {
      bar: { borderRadius: 4, horizontal: false }
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2 },
    series: type === 'donut' ? yData : [{ name: yCol, data: yData }],
    labels: type === 'donut' ? xData.map(String) : undefined,
    xaxis: type !== 'donut' ? { categories: xData } : undefined
  };
  
  if (sqlVisChartObj) {
    sqlVisChartObj.destroy();
  }
  
  sqlVisChartObj = new ApexCharts(container, options);
  sqlVisChartObj.render();
}

// Excel style Pivot Aggregator
function initPivotOptions() {
  // Config selectors populated in initSelectDropdowns()
  // Simply clear old compiler output if activeData is updated
}

function generatePivotTable() {
  const rowField = document.getElementById("pivot-row-select").value;
  const colField = document.getElementById("pivot-col-select").value;
  const valField = document.getElementById("pivot-val-select").value;
  const aggFunc = document.getElementById("pivot-agg-select").value;
  
  const matrixTable = document.getElementById("pivot-matrix-table");
  
  if (activeData.length === 0) return;
  
  // Pivot calculations:
  // Let's create unique list of Rows and Columns
  const uniqueRows = [...new Set(activeData.map(r => r[rowField]))].filter(v => v !== null && v !== undefined && v !== "");
  const uniqueCols = colField !== "None" ? [...new Set(activeData.map(r => r[colField]))].filter(v => v !== null && v !== undefined && v !== "") : ["Value"];
  
  // Build Matrix
  const pivotMap = {};
  uniqueRows.forEach(r => {
    pivotMap[r] = {};
    uniqueCols.forEach(c => {
      pivotMap[r][c] = [];
    });
  });
  
  // Group elements
  activeData.forEach(row => {
    const rVal = row[rowField];
    const cVal = colField !== "None" ? row[colField] : "Value";
    const metric = valField !== "None" ? Number(row[valField]) : 1; // count fallback
    
    if (pivotMap[rVal] && pivotMap[rVal][cVal] !== undefined) {
      pivotMap[rVal][cVal].push(metric);
    }
  });
  
  // Compile aggregator
  const aggregate = (arr) => {
    if (!arr || arr.length === 0) return 0;
    switch (aggFunc) {
      case "SUM": return arr.reduce((a, b) => a + b, 0);
      case "AVG": return arr.reduce((a, b) => a + b, 0) / arr.length;
      case "COUNT": return arr.length;
      case "MAX": return Math.max(...arr);
      case "MIN": return Math.min(...arr);
      default: return 0;
    }
  };
  
  // Build headers HTML
  let headHtml = `<tr><th class="pivot-header">${rowField}</th>`;
  uniqueCols.forEach(c => {
    headHtml += `<th style="text-align: right;">${c}</th>`;
  });
  headHtml += `<th style="text-align: right; font-weight: 700;">Grand Total</th></tr>`;
  matrixTable.querySelector("thead").innerHTML = headHtml;
  
  // Accumulate rows and totals
  let bodyHtml = "";
  const colTotals = {};
  uniqueCols.forEach(c => { colTotals[c] = []; });
  let grandTotalList = [];
  
  uniqueRows.forEach(r => {
    bodyHtml += `<tr><td style="font-weight: 600;">${r}</td>`;
    let rowValues = [];
    
    uniqueCols.forEach(c => {
      const cellValList = pivotMap[r][c];
      const aggregatedVal = cellValList.length > 0 ? aggregate(cellValList) : 0;
      bodyHtml += `<td style="text-align: right;">${aggregatedVal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
      
      rowValues.push(aggregatedVal);
      cellValList.forEach(v => colTotals[c].push(v));
    });
    
    // Row Total
    const rowTotal = aggregate(rowValues);
    bodyHtml += `<td style="text-align: right; font-weight: 700; background-color: rgba(255,255,255,0.02);">${rowTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td></tr>`;
  });
  
  // Grand bottom total row
  bodyHtml += `<tr class="pivot-total"><td style="font-weight: 700;">Grand Total</td>`;
  let bottomRowValues = [];
  uniqueCols.forEach(c => {
    const bottomAggVal = aggregate(colTotals[c]);
    bodyHtml += `<td style="text-align: right; font-weight: 700;">${bottomAggVal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
    bottomRowValues.push(bottomAggVal);
  });
  
  const absoluteGrandTotal = aggregate(bottomRowValues);
  bodyHtml += `<td style="text-align: right; font-weight: 800; background-color: rgba(255,255,255,0.05);">${absoluteGrandTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td></tr>`;
  
  matrixTable.querySelector("tbody").innerHTML = bodyHtml;
  
  // Render "Chart Pivot" action button
  const exportActions = document.getElementById("pivot-export-actions");
  exportActions.innerHTML = `
    <button class="btn btn-secondary btn-sm" onclick="chartPivotMatrix('${rowField}', '${colField}', '${valField}', '${aggFunc}')">
      <i class="fa-solid fa-chart-line"></i> Chart Pivot
    </button>
  `;
  
  // Render inline pivot chart visualization
  renderInlinePivotChart(uniqueRows, uniqueCols, pivotMap, aggregate, rowField, colField, valField);
}

// Generate chart from compiled pivot
function chartPivotMatrix(rowField, colField, valField, aggFunc) {
  // Redirect and load this visualization as a custom dashboard widget
  openWidgetModal();
  document.getElementById("widget-title-input").value = `${aggFunc} of ${valField} by ${rowField}`;
  document.getElementById("widget-xaxis-select").value = rowField;
  document.getElementById("widget-yaxis-select").value = valField;
  document.getElementById("widget-agg-select").value = aggFunc;
}

// BI Dashboard studio rendering
function renderDashboard() {
  const kpiRow = document.getElementById("dashboard-kpi-row");
  const chartGrid = document.getElementById("dashboard-chart-grid");
  
  if (activeData.length === 0) return;
  
  // 1. Compile KPI Cards
  let firstNumCol = dataProfile.numericCols[0];
  let secondNumCol = dataProfile.numericCols[1] || firstNumCol;
  
  let totalRecs = activeData.length;
  let sumFirstCol = firstNumCol ? activeData.reduce((sum, r) => sum + (Number(r[firstNumCol]) || 0), 0) : 0;
  let avgFirstCol = firstNumCol ? (sumFirstCol / totalRecs) : 0;
  let sumSecondCol = secondNumCol ? activeData.reduce((sum, r) => sum + (Number(r[secondNumCol]) || 0), 0) : 0;
  
  // Format numbers nicely
  const formatKpi = (val, colName) => {
    if (colName && (colName.toLowerCase().includes("streams") || colName.toLowerCase().includes("views"))) {
      if (val >= 1e9) return (val/1e9).toFixed(1) + "B";
      if (val >= 1e6) return (val/1e6).toFixed(1) + "M";
      return val.toLocaleString();
    }
    if (colName && (colName.toLowerCase().includes("revenue") || colName.toLowerCase().includes("profit") || colName.toLowerCase().includes("cost") || colName.toLowerCase().includes("price"))) {
      if (val >= 1e6) return "$" + (val/1e6).toFixed(1) + "M";
      return "$" + val.toLocaleString(undefined, {maximumFractionDigits: 0});
    }
    return val.toLocaleString(undefined, {maximumFractionDigits: 1});
  };
  
  kpiRow.innerHTML = `
    <div class="glass-card kpi-card col-span-1">
      <div class="kpi-data">
        <span class="kpi-value">${totalRecs}</span>
        <span class="kpi-label">Total Records</span>
      </div>
      <div class="kpi-icon-container" style="color: var(--accent-color);"><i class="fa-solid fa-calculator"></i></div>
    </div>
    <div class="glass-card kpi-card col-span-1">
      <div class="kpi-data">
        <span class="kpi-value">${firstNumCol ? formatKpi(sumFirstCol, firstNumCol) : "N/A"}</span>
        <span class="kpi-label">Sum of ${firstNumCol || "Metric"}</span>
      </div>
      <div class="kpi-icon-container" style="color: var(--secondary-color);"><i class="fa-solid fa-coins"></i></div>
    </div>
    <div class="glass-card kpi-card col-span-1">
      <div class="kpi-data">
        <span class="kpi-value">${firstNumCol ? formatKpi(avgFirstCol, firstNumCol) : "N/A"}</span>
        <span class="kpi-label">Average ${firstNumCol || "Metric"}</span>
      </div>
      <div class="kpi-icon-container" style="color: var(--primary-color);"><i class="fa-solid fa-chart-line"></i></div>
    </div>
    <div class="glass-card kpi-card col-span-1">
      <div class="kpi-data">
        <span class="kpi-value">${secondNumCol ? formatKpi(sumSecondCol, secondNumCol) : "N/A"}</span>
        <span class="kpi-label">Total ${secondNumCol || "Metric"}</span>
      </div>
      <div class="kpi-icon-container" style="color: var(--warning);"><i class="fa-solid fa-scale-balanced"></i></div>
    </div>
  `;
  
  // 2. Render Charts
  chartGrid.innerHTML = "";
  
  dashboardCharts.forEach((widget, idx) => {
    const colClass = widget.type === 'donut' ? 'col-span-2' : 'col-span-2';
    
    chartGrid.innerHTML += `
      <div class="glass-card chart-card-wrapper ${colClass}">
        <div class="chart-delete-btn" onclick="deleteWidget('${widget.id}')">&times;</div>
        <h3 style="font-size: 14px; margin-bottom: 12px; font-weight:700;">${widget.title}</h3>
        <div id="chart-widget-${widget.id}" style="width: 100%; min-height: 250px;"></div>
      </div>
    `;
  });
  
  // Render charts using requestAnimationFrame to ensure divs are injected
  requestAnimationFrame(() => {
    dashboardCharts.forEach(widget => {
      renderSingleWidget(widget);
    });
  });
}

// Delete custom widget
function deleteWidget(id) {
  dashboardCharts = dashboardCharts.filter(w => w.id !== id);
  renderDashboard();
}

// Render individual ApexChart
function renderSingleWidget(widget) {
  const elementId = `chart-widget-${widget.id}`;
  const div = document.getElementById(elementId);
  if (!div) return;
  
  // Aggregate data if agg !== NONE
  let chartData = [];
  
  if (widget.agg !== "NONE") {
    // Perform AlaSQL group query
    const sqlQuery = `SELECT [${widget.xaxis}] AS X, ${widget.agg}([${widget.yaxis}]) AS Y FROM ? GROUP BY [${widget.xaxis}] ORDER BY Y DESC`;
    try {
      const aggResult = alasql(sqlQuery, [activeData]);
      chartData = aggResult.map(r => ({ x: r.X, y: Number(r.Y) || 0 }));
    } catch (err) {
      console.error(err);
      div.innerHTML = `<div style="color: var(--danger); font-size:12px; padding: 24px;">Failed to compile visualization: ${err.message}</div>`;
      return;
    }
  } else {
    // Just map direct coordinates (max 100 scatter plots to preserve load speed)
    chartData = activeData.slice(0, 100).map(row => ({
      x: row[widget.xaxis],
      y: Number(row[widget.yaxis]) || 0
    }));
  }
  
  let xCategories = chartData.map(d => String(d.x));
  let yValues = chartData.map(d => d.y);
  
  let options = {
    chart: {
      type: widget.type,
      height: 260,
      foreColor: '#94a3b8',
      background: 'transparent',
      toolbar: { show: true }
    },
    theme: { mode: 'dark' },
    colors: widget.type === 'donut' ? themePalettes[currentTheme] : [themePalettes[currentTheme][0]],
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    plotOptions: {
      bar: { borderRadius: 4 }
    },
    series: widget.type === 'donut' ? yValues : [{ name: widget.yaxis, data: yValues }],
    labels: widget.type === 'donut' ? xCategories : undefined,
    xaxis: widget.type !== 'donut' ? { categories: xCategories } : undefined,
    grid: { borderColor: 'rgba(255,255,255,0.05)' }
  };
  
  if (widget.type === 'scatter') {
    options.series = [{
      name: `${widget.xaxis} vs ${widget.yaxis}`,
      data: chartData.map(d => ({ x: Number(d.x) || d.x, y: d.y }))
    }];
    options.xaxis = { type: 'numeric' };
  }
  
  const apexChart = new ApexCharts(div, options);
  apexChart.render();
}

// Widget Modal Controls
function openWidgetModal() {
  const modal = document.getElementById("widget-modal");
  const xaxisSelect = document.getElementById("widget-xaxis-select");
  const yaxisSelect = document.getElementById("widget-yaxis-select");
  
  xaxisSelect.innerHTML = "";
  yaxisSelect.innerHTML = "";
  
  dataProfile.columns.forEach(col => {
    xaxisSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    if (col.type === "Number") {
      yaxisSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    }
  });
  
  modal.classList.add("active");
}

function closeWidgetModal() {
  document.getElementById("widget-modal").classList.remove("active");
}

function addNewChartWidget() {
  const title = document.getElementById("widget-title-input").value || "Custom Widget";
  const type = document.getElementById("widget-type-select").value;
  const xaxis = document.getElementById("widget-xaxis-select").value;
  const yaxis = document.getElementById("widget-yaxis-select").value;
  const agg = document.getElementById("widget-agg-select").value;
  
  const newWidget = {
    id: "w-" + Date.now(),
    title,
    type,
    xaxis,
    yaxis,
    agg
  };
  
  dashboardCharts.push(newWidget);
  closeWidgetModal();
  renderDashboard();
}

// AI Storyboard narrative generator
function renderAiStory() {
  const storyboard = document.getElementById("ai-storyboard-content");
  if (activeData.length === 0) return;
  
  // Gather metrics for the narrative
  let firstNumCol = dataProfile.numericCols[0];
  let firstTextCol = dataProfile.textCols[0];
  
  if (!firstNumCol || !firstTextCol) {
    storyboard.innerHTML = `<p>Not enough columns loaded for programmatic narrative drafting. Load Spotify or E-commerce datasets for samples.</p>`;
    return;
  }
  
  // Gather summary stats
  const total = activeData.length;
  
  // Top elements
  let topQuery = `SELECT [${firstTextCol}] AS label, SUM([${firstNumCol}]) AS metric FROM ? GROUP BY [${firstTextCol}] ORDER BY metric DESC LIMIT 1`;
  let topResult = alasql(topQuery, [activeData])[0];
  
  let botQuery = `SELECT [${firstTextCol}] AS label, SUM([${firstNumCol}]) AS metric FROM ? GROUP BY [${firstTextCol}] ORDER BY metric ASC LIMIT 1`;
  let botResult = alasql(botQuery, [activeData])[0];
  
  let html = `
    <h3>Dataset Profile Summary</h3>
    <p>We analyzed <strong>${total} records</strong> across <strong>${dataProfile.colCount} dimensions</strong>. The primary descriptive indicator is <strong>${firstTextCol}</strong>, measured against the performance metric <strong>${firstNumCol}</strong>.</p>
    
    <h3>Key Takeaways & Strengths</h3>
    <ul>
      <li><strong>Dominant Performer:</strong> The highest-performing segment in the dataset is <strong>${topResult ? topResult.label : "N/A"}</strong>, contributing a cumulative <strong>${topResult ? topResult.metric.toLocaleString() : "0"}</strong> for the metric ${firstNumCol}.</li>
      <li><strong>Growth Opportunities:</strong> The lowest contribution comes from <strong>${botResult ? botResult.label : "N/A"}</strong> with a total of ${botResult ? botResult.metric.toLocaleString() : "0"}. Focus marketing or resource efforts here to capture market variance.</li>
    </ul>
  `;
  
  // Dataset specific insights
  if (datasetType === 'spotify') {
    // Correlation between danceability and streams
    const highDance = activeData.filter(r => r.Danceability > 75).length;
    const avgBpm = Math.round(activeData.reduce((sum, r) => sum + r.BPM, 0) / total);
    html += `
      <h3>Spotify Deep-Dive Insights</h3>
      <ul>
        <li><strong>Rhythm & Tempo:</strong> The average tempo of tracks in this set is <strong>${avgBpm} BPM</strong>. High-tempo music (BPM > 120) commands a disproportionate share of global stream counts.</li>
        <li><strong>Danceability:</strong> ${highDance} tracks have a danceability rating above 75%. Listeners show a massive preference for upbeat, rhythmically consistent music, representing a critical focus for artist playlist placement.</li>
      </ul>
      <blockquote>
        [!TIP]
        Create playlists targeting "High-Energy Workout" themes (BPM > 120, Energy > 80) to maximize user streaming time.
      </blockquote>
    `;
  } else if (datasetType === 'ecommerce') {
    const avgProfit = Math.round(activeData.reduce((sum, r) => sum + r.Profit, 0) / total);
    const sumRevenue = activeData.reduce((sum, r) => sum + r.Revenue, 0);
    const profitMargin = ((activeData.reduce((sum, r) => sum + r.Profit, 0) / sumRevenue) * 100).toFixed(1);
    
    html += `
      <h3>E-Commerce Performance Insights</h3>
      <ul>
        <li><strong>Profit Margin Ratio:</strong> The overall portfolio average profit margin sits at <strong>${profitMargin}%</strong>. High-value categories (like Electronics) capture bulk sales, but furniture exhibits high margins.</li>
        <li><strong>Consumer Segments:</strong> Corporate purchasing segments yield 20% higher average order values compared to individual consumer orders.</li>
      </ul>
      <blockquote>
        [!IMPORTANT]
        Focus targeted display advertising on Home Office equipment and desk chairs during peak Q3 cycles.
      </blockquote>
    `;
  } else if (datasetType === 'inventory') {
    const underStock = activeData.filter(r => r.StockLevel < 20).length;
    html += `
      <h3>Warehouse Logistics Insights</h3>
      <ul>
        <li><strong>Restock Alerts:</strong> <strong>${underStock} SKUs</strong> have drop-levels below the safety stock threshold (20 units). Check secures supplier links immediately.</li>
        <li><strong>Capital Tied in Stock:</strong> Graphics Cards and Motherboard sub-categories occupy 65% of absolute liquid storage value.</li>
      </ul>
      <blockquote>
        [!WARNING]
        Immediate stock shortage in "Secure Vault". Place reorders for top GPU models immediately.
      </blockquote>
    `;
  }
  
  storyboard.innerHTML = html;
}

// AI Local Chatbot engine
function generateChatSuggestions() {
  const container = document.getElementById("chat-prompt-suggestions");
  if (!container) return;
  
  let firstNumCol = dataProfile.numericCols[0] || "Streams";
  let secondNumCol = dataProfile.numericCols[1] || firstNumCol;
  let firstTextCol = dataProfile.textCols[0] || "Genre";
  
  let cardsHtml = "";
  
  if (datasetType === 'spotify') {
    cardsHtml = `
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('What is the total streams of all tracks?')">
        <i class="fa-solid fa-music"></i>
        <span class="chat-prompt-card-title">Sum of Streams</span>
        <span class="chat-prompt-card-desc">Calculate total streams across all artists.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Show top 5 Genre by Streams')">
        <i class="fa-solid fa-chart-simple"></i>
        <span class="chat-prompt-card-title">Top Genres</span>
        <span class="chat-prompt-card-desc">Identify the most popular music genres.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Compare Danceability versus Energy')">
        <i class="fa-solid fa-sliders"></i>
        <span class="chat-prompt-card-title">Tempo Audit</span>
        <span class="chat-prompt-card-desc">Run side-by-side metric comparison.</span>
      </button>
    `;
  } else if (datasetType === 'ecommerce') {
    cardsHtml = `
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('What is the total Revenue?')">
        <i class="fa-solid fa-sack-dollar"></i>
        <span class="chat-prompt-card-title">Total Sales Revenue</span>
        <span class="chat-prompt-card-desc">Compute cumulative cash transactions.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Show top 5 Category by Revenue')">
        <i class="fa-solid fa-cart-shopping"></i>
        <span class="chat-prompt-card-title">Top Categories</span>
        <span class="chat-prompt-card-desc">Determine high-performing retail categories.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Compare Revenue versus Profit')">
        <i class="fa-solid fa-chart-line"></i>
        <span class="chat-prompt-card-title">Profit Margins</span>
        <span class="chat-prompt-card-desc">Evaluate revenue vs net profits.</span>
      </button>
    `;
  } else if (datasetType === 'inventory') {
    cardsHtml = `
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('What is the average StockLevel?')">
        <i class="fa-solid fa-warehouse"></i>
        <span class="chat-prompt-card-title">Average Stock levels</span>
        <span class="chat-prompt-card-desc">Review average units held per SKU.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Show top 5 Category by StockLevel')">
        <i class="fa-solid fa-boxes-stacked"></i>
        <span class="chat-prompt-card-title">Holding Distribution</span>
        <span class="chat-prompt-card-desc">Find categories with highest warehouse units.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Compare UnitCost versus RetailPrice')">
        <i class="fa-solid fa-money-bill-trend-up"></i>
        <span class="chat-prompt-card-title">Pricing Margins</span>
        <span class="chat-prompt-card-desc">Plot unit cost vs retail sale pricing.</span>
      </button>
    `;
  } else {
    // Custom uploaded file
    cardsHtml = `
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('What is the total ${firstNumCol}?')">
        <i class="fa-solid fa-calculator"></i>
        <span class="chat-prompt-card-title">Total Sum</span>
        <span class="chat-prompt-card-desc">Sum value counts for ${firstNumCol}.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Show top 5 ${firstTextCol} by ${firstNumCol}')">
        <i class="fa-solid fa-ranking-star"></i>
        <span class="chat-prompt-card-title">Top ${firstTextCol}</span>
        <span class="chat-prompt-card-desc">Rank highest items in ${firstTextCol}.</span>
      </button>
      <button class="chat-prompt-card" onclick="submitSuggestedQuery('Compare ${firstNumCol} versus ${secondNumCol}')">
        <i class="fa-solid fa-scale-balanced"></i>
        <span class="chat-prompt-card-title">Compare Metrics</span>
        <span class="chat-prompt-card-desc">Compare ${firstNumCol} and ${secondNumCol}.</span>
      </button>
    `;
  }
  
  container.innerHTML = cardsHtml;
}

function submitSuggestedQuery(text) {
  document.getElementById("chat-input-field").value = text;
  submitChatQuery();
}

function handleChatKeyPress(event) {
  if (event.key === "Enter") {
    submitChatQuery();
  }
}

// Chat engine NLP matching and response
function submitChatQuery() {
  const input = document.getElementById("chat-input-field");
  const messages = document.getElementById("chat-bubble-messages");
  const text = input.value.trim();
  
  if (!text || activeData.length === 0) return;
  
  // Append User message
  messages.innerHTML += `
    <div class="message-bubble message-user">
      ${text}
    </div>
  `;
  
  input.value = "";
  
  // Scroll to bottom
  messages.scrollTop = messages.scrollHeight;
  
  // AI program calculation delay
  setTimeout(() => {
    const response = processChatMessage(text);
    
    let chartHtml = "";
    if (response.chartData) {
      const chartId = "chat-chart-" + Date.now();
      chartHtml = `
        <div class="message-chart" id="${chartId}"></div>
      `;
      
      messages.innerHTML += `
        <div class="message-bubble message-assistant">
          ${response.text}
          ${chartHtml}
        </div>
      `;
      
      requestAnimationFrame(() => {
        renderChatChart(chartId, response.chartData);
      });
    } else {
      messages.innerHTML += `
        <div class="message-bubble message-assistant">
          ${response.text}
        </div>
      `;
    }
    
    messages.scrollTop = messages.scrollHeight;
  }, 400);
}

// Local conversational NLP-to-SQL logic
function processChatMessage(userQuery) {
  const query = userQuery.toLowerCase();
  let firstNumCol = dataProfile.numericCols[0] || "Streams";
  let firstTextCol = dataProfile.textCols[0] || "Genre";
  
  // 1. Total/Sum calculation
  if (query.includes("total") || query.includes("sum of")) {
    // Detect column mentioned
    let col = dataProfile.numericCols.find(c => query.includes(c.toLowerCase())) || firstNumCol;
    try {
      const res = alasql(`SELECT SUM([${col}]) AS total FROM ?`, [activeData]);
      const totalVal = res[0].total;
      return { text: `The total cumulative <strong>${col}</strong> calculated across the active dataset is <strong>${totalVal.toLocaleString()}</strong>.` };
    } catch (e) {
      return { text: `I encountered an error trying to sum ${col}: ${e.message}` };
    }
  }
  
  // 2. Average calculation
  if (query.includes("average") || query.includes("mean")) {
    let col = dataProfile.numericCols.find(c => query.includes(c.toLowerCase())) || firstNumCol;
    try {
      const res = alasql(`SELECT AVG([${col}]) AS avgVal FROM ?`, [activeData]);
      const avgVal = Number(res[0].avgVal).toFixed(1);
      return { text: `The average <strong>${col}</strong> calculated across all records is <strong>${Number(avgVal).toLocaleString()}</strong>.` };
    } catch (e) {
      return { text: `I encountered an error calculating the average of ${col}: ${e.message}` };
    }
  }
  
  // 3. Top records/categories
  if (query.includes("top") || query.includes("highest") || query.includes("most popular")) {
    // Check if limit specified (e.g. top 5, top 10)
    let limitMatch = query.match(/top\s*(\d+)/i);
    let limit = limitMatch ? Number(limitMatch[1]) : 5;
    
    // Choose dimensions
    let col = dataProfile.numericCols.find(c => query.includes(c.toLowerCase())) || firstNumCol;
    let category = dataProfile.textCols.find(c => query.includes(c.toLowerCase())) || firstTextCol;
    
    try {
      const sql = `SELECT [${category}] AS X, SUM([${col}]) AS Y FROM ? GROUP BY [${category}] ORDER BY Y DESC LIMIT ${limit}`;
      const res = alasql(sql, [activeData]);
      
      let replyText = `Here are the top performing categories by <strong>${col}</strong>: <br><br>`;
      res.forEach((r, i) => {
        replyText += `${i+1}. <strong>${r.X}</strong>: ${r.Y.toLocaleString()}<br>`;
      });
      
      return {
        text: replyText,
        chartData: {
          type: "bar",
          categories: res.map(r => r.X),
          values: res.map(r => Number(r.Y) || 0),
          title: `Top ${category} by ${col}`
        }
      };
    } catch (e) {
      return { text: `I tried to extract the top performers but ran into a database error: ${e.message}` };
    }
  }
  
  // 4. Comparison analysis
  if (query.includes("compare") || query.includes("versus") || query.includes(" vs ")) {
    // Pick two numerical columns
    let num1 = dataProfile.numericCols[0];
    let num2 = dataProfile.numericCols[1] || num1;
    let label = dataProfile.textCols[0];
    
    try {
      const sql = `SELECT [${label}] AS L, AVG([${num1}]) AS N1, AVG([${num2}]) AS N2 FROM ? GROUP BY [${label}] LIMIT 10`;
      const res = alasql(sql, [activeData]);
      
      return {
        text: `Here is a side-by-side comparison of average <strong>${num1}</strong> and average <strong>${num2}</strong> by ${label}:`,
        chartData: {
          type: "doubleBar",
          categories: res.map(r => r.L),
          series: [
            { name: num1, data: res.map(r => Number(r.N1) || 0) },
            { name: num2, data: res.map(r => Number(r.N2) || 0) }
          ]
        }
      };
    } catch (e) {
      return { text: `Failed to compile comparison charts: ${e.message}` };
    }
  }
  
  // Fallback default message
  return {
    text: `I received your message! I'm analyzing the schema. If you're asking about a specific column, verify the spelling matches one of the following: <strong>${dataProfile.columns.map(c => c.name).join(", ")}</strong>. <br><br>Try typing: "Show top 5 Categories by Revenue" or "What is the average streams?".`
  };
}

// Render chart bubble inline
function renderChatChart(divId, chartConfig) {
  const container = document.getElementById(divId);
  if (!container) return;
  
  let options = {
    chart: {
      type: chartConfig.type === "doubleBar" ? "bar" : chartConfig.type,
      height: 180,
      foreColor: '#94a3b8',
      background: 'transparent',
      toolbar: { show: false }
    },
    theme: { mode: 'dark' },
    colors: chartConfig.type === "doubleBar" ? [themePalettes[currentTheme][0], themePalettes[currentTheme][1]] : [themePalettes[currentTheme][2] || '#10b981'],
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    series: chartConfig.type === "doubleBar" ? chartConfig.series : [{ name: chartConfig.title, data: chartConfig.values }],
    xaxis: { categories: chartConfig.categories },
    grid: { borderColor: 'rgba(255,255,255,0.05)' }
  };
  
  const apex = new ApexCharts(container, options);
  apex.render();
}

// Custom Dashboard Theme Changer
function changeTheme(themeId) {
  currentTheme = themeId;
  
  // Update select dropdown value if triggered programmatically
  const select = document.getElementById("theme-selector");
  if (select) select.value = themeId;

  // Remove existing themes
  document.body.classList.remove('theme-cyberpunk', 'theme-emerald', 'theme-solar', 'theme-graphite');
  
  // Add new theme
  if (themeId !== 'indigo') {
    document.body.classList.add(`theme-${themeId}`);
  }
  
  // Re-render dashboard if active to apply theme colors to ApexCharts
  if (activeTab === 'dashboard') {
    renderDashboard();
  }
}

// SQL Playground Favorites and History Handlers
function renderSavedQueries() {
  const list = document.getElementById("sql-saved-list");
  if (!list) return;
  if (sqlSavedQueries.length === 0) {
    list.innerHTML = `<div style="color: var(--text-muted); font-size: 11px; font-style: italic; padding: 4px 8px;">No saved queries yet.</div>`;
    return;
  }
  list.innerHTML = sqlSavedQueries.map((q, idx) => `
    <div class="saved-query-item" onclick="loadSavedQuery(${idx})">
      <span class="query-item-text" title="${q.query.replace(/"/g, '&quot;')}">${q.label}</span>
      <div class="query-item-actions">
        <button class="query-item-btn" onclick="deleteSavedQuery(event, ${idx})" title="Delete Query"><i class="fa-solid fa-trash-can"></i></button>
      </div>
    </div>
  `).join("");
}

function renderSqlHistory() {
  const list = document.getElementById("sql-history-list");
  if (!list) return;
  if (sqlHistory.length === 0) {
    list.innerHTML = `<div style="color: var(--text-muted); font-size: 11px; font-style: italic; padding: 4px 8px;">No recent history.</div>`;
    return;
  }
  list.innerHTML = sqlHistory.map((q, idx) => `
    <div class="history-query-item" onclick="loadHistoryQuery(${idx})">
      <span class="query-item-text" title="${q.replace(/"/g, '&quot;')}">${q}</span>
    </div>
  `).join("");
}

function loadSavedQuery(idx) {
  const q = sqlSavedQueries[idx];
  if (q) {
    document.getElementById("sql-editor-textarea").value = q.query;
  }
}

function loadHistoryQuery(idx) {
  const q = sqlHistory[idx];
  if (q) {
    document.getElementById("sql-editor-textarea").value = q;
  }
}

function deleteSavedQuery(e, idx) {
  e.stopPropagation();
  sqlSavedQueries.splice(idx, 1);
  localStorage.setItem('athena_saved_queries', JSON.stringify(sqlSavedQueries));
  renderSavedQueries();
}

function saveCurrentQuery() {
  const query = document.getElementById("sql-editor-textarea").value.trim();
  if (!query) {
    alert("Please write a query first.");
    return;
  }
  const label = prompt("Enter a label for this saved query:", "My Custom Query");
  if (label === null) return; // cancelled
  const cleanLabel = label.trim() || "Saved Query " + (sqlSavedQueries.length + 1);
  sqlSavedQueries.push({ label: cleanLabel, query });
  localStorage.setItem('athena_saved_queries', JSON.stringify(sqlSavedQueries));
  renderSavedQueries();
}

// Outlier Diagnostics & Smart Columns Handlers
function renderOutliersUi() {
  const container = document.getElementById("outlier-summary-list");
  if (!container) return;
  
  if (dataProfile.numericCols.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 12px;">No numeric columns to profile.</div>`;
    return;
  }
  
  let html = "";
  dataProfile.numericCols.forEach(col => {
    const stats = colOutlierStats[col];
    if (stats) {
      const percentage = Math.round((stats.count / activeData.length) * 100);
      const color = stats.count > 0 ? "var(--danger)" : "var(--success)";
      const bg = stats.count > 0 ? "rgba(239, 68, 68, 0.03)" : "rgba(16, 185, 129, 0.03)";
      const border = stats.count > 0 ? "rgba(239, 68, 68, 0.15)" : "rgba(16, 185, 129, 0.15)";
      
      html += `
        <div style="background-color: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-weight: 600; color: var(--text-main);">${col}</span>
            <span style="font-size: 10px; color: var(--text-muted);">Mean: ${stats.mean.toFixed(1)} | SD: ${stats.stdDev.toFixed(1)}</span>
          </div>
          <div style="text-align: right;">
            <span style="color: ${color}; font-weight: 700; font-size: 13px;">${stats.count}</span>
            <span style="font-size: 10px; color: var(--text-muted); display: block;">outliers (${percentage}%)</span>
          </div>
        </div>
      `;
    }
  });
  container.innerHTML = html;
}

function generateSmartDateColumn() {
  const dateCol = document.getElementById("smart-date-col").value;
  const part = document.getElementById("smart-date-part").value;
  
  if (!dateCol) {
    alert("Please select a valid date column.");
    return;
  }
  
  const newColName = `${dateCol}_${part}`;
  
  if (activeData.length > 0 && activeData[0].hasOwnProperty(newColName)) {
    alert(`Column "${newColName}" already exists!`);
    return;
  }
  
  // Apply transformation to activeData
  activeData.forEach(row => {
    const rawVal = row[dateCol];
    if (rawVal) {
      const dateVal = new Date(rawVal);
      if (!isNaN(dateVal)) {
        let extractedVal = "";
        if (part === 'dayofweek') {
          extractedVal = dateVal.toLocaleString('en-US', { weekday: 'long' });
        } else if (part === 'month') {
          extractedVal = dateVal.toLocaleString('en-US', { month: 'long' });
        } else if (part === 'year') {
          extractedVal = dateVal.getFullYear().toString();
        }
        row[newColName] = extractedVal;
      } else {
        row[newColName] = "Invalid Date";
      }
    } else {
      row[newColName] = "";
    }
  });

  // Sync currentDataset
  currentDataset.forEach((row, idx) => {
    const rawVal = row[dateCol];
    if (rawVal) {
      const dateVal = new Date(rawVal);
      if (!isNaN(dateVal)) {
        let extractedVal = "";
        if (part === 'dayofweek') {
          extractedVal = dateVal.toLocaleString('en-US', { weekday: 'long' });
        } else if (part === 'month') {
          extractedVal = dateVal.toLocaleString('en-US', { month: 'long' });
        } else if (part === 'year') {
          extractedVal = dateVal.getFullYear().toString();
        }
        row[newColName] = extractedVal;
      } else {
        row[newColName] = "Invalid Date";
      }
    } else {
      row[newColName] = "";
    }
  });
  
  alert(`Smart Column Created: Created "${newColName}" and appended it to the dataset.`);
  
  // Refresh profiling, grids and dropdowns
  profileSchema();
  renderDataTable();
  initSelectDropdowns();
  initSqlConsole();
}

// Visual Query Builder Drawer Handlers
function toggleQueryBuilder() {
  const drawer = document.getElementById("qb-content-drawer");
  const chevron = document.getElementById("qb-chevron-icon");
  const toggleBtn = document.querySelector(".qb-toggle-btn");
  
  if (drawer.style.display === "none") {
    drawer.style.display = "flex";
    chevron.style.transform = "rotate(180deg)";
    toggleBtn.style.borderBottomLeftRadius = "0px";
    toggleBtn.style.borderBottomRightRadius = "0px";
  } else {
    drawer.style.display = "none";
    chevron.style.transform = "rotate(0deg)";
    toggleBtn.style.borderBottomLeftRadius = "8px";
    toggleBtn.style.borderBottomRightRadius = "8px";
  }
}

function compileVisualQuery() {
  const filterCol = document.getElementById("qb-filter-col").value;
  const filterOp = document.getElementById("qb-filter-op").value;
  const filterVal = document.getElementById("qb-filter-val").value.trim();
  const sortCol = document.getElementById("qb-sort-col").value;
  const sortDir = document.getElementById("qb-sort-dir").value;
  const limit = document.getElementById("qb-limit").value;
  
  let sql = "SELECT * FROM data";
  
  // Add where filter
  if (filterCol !== "None" && filterVal !== "") {
    let colType = "Text";
    const colObj = dataProfile.columns.find(c => c.name === filterCol);
    if (colObj) colType = colObj.type;
    
    let formattedVal = filterVal;
    if (colType !== "Number") {
      if (filterOp === "LIKE") {
        formattedVal = `'%${filterVal}%'`;
      } else {
        formattedVal = `'${filterVal}'`;
      }
    } else {
      if (filterOp === "LIKE") {
        formattedVal = `'%${filterVal}%'`;
      }
    }
    
    sql += `\nWHERE [${filterCol}] ${filterOp} ${formattedVal}`;
  }
  
  // Add sort
  if (sortCol !== "None") {
    sql += `\nORDER BY [${sortCol}] ${sortDir}`;
  }
  
  // Add limit
  if (limit && Number(limit) > 0) {
    sql += `\nLIMIT ${limit}`;
  }
  
  sql += ";";
  
  const textarea = document.getElementById("sql-editor-textarea");
  if (textarea) {
    textarea.value = sql;
    textarea.focus();
  }
}

// Inline Pivot Chart Visualizer Handler
function renderInlinePivotChart(uniqueRows, uniqueCols, pivotMap, aggregate, rowField, colField, valField) {
  const chartViewport = document.getElementById("pivot-chart-viewport");
  const chartType = document.getElementById("pivot-chart-type").value;
  
  if (!chartViewport) return;
  
  if (chartType === "none") {
    chartViewport.style.display = "none";
    if (pivotChart) {
      pivotChart.destroy();
      pivotChart = null;
    }
    return;
  }
  
  chartViewport.style.display = "block";
  chartViewport.innerHTML = "";
  
  const series = [];
  
  uniqueCols.forEach(colVal => {
    const data = [];
    uniqueRows.forEach(rowVal => {
      const cellValList = pivotMap[rowVal][colVal];
      const aggregatedVal = cellValList.length > 0 ? aggregate(cellValList) : 0;
      data.push(aggregatedVal);
    });
    
    series.push({
      name: colField !== "None" ? `${colVal}` : (valField !== "None" ? valField : "Count"),
      data: data
    });
  });
  
  const options = {
    chart: {
      type: chartType === 'stacked' ? 'bar' : chartType,
      stacked: chartType === 'stacked',
      height: 280,
      foreColor: '#94a3b8',
      background: 'transparent',
      toolbar: { show: true }
    },
    theme: { mode: 'dark' },
    colors: themePalettes[currentTheme],
    stroke: { curve: 'smooth', width: 2 },
    dataLabels: { enabled: false },
    plotOptions: {
      bar: { borderRadius: 4 }
    },
    series: series,
    xaxis: { categories: uniqueRows.map(String) },
    grid: { borderColor: 'rgba(255,255,255,0.05)' }
  };
  
  if (pivotChart) {
    pivotChart.destroy();
  }
  
  pivotChart = new ApexCharts(chartViewport, options);
  pivotChart.render();
}





