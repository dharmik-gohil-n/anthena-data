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
let activeSqlParams = [];
let activeFilters = [];
let loadedDatasets = {};

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
        let fileIndex = 0;
        function processNextDrop() {
          if (fileIndex < e.dataTransfer.files.length) {
            processUploadedFile(e.dataTransfer.files[fileIndex], () => {
              fileIndex++;
              processNextDrop();
            });
          }
        }
        processNextDrop();
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

  // Watch for parameters in SQL editor text
  document.getElementById("sql-editor-textarea").addEventListener("input", (e) => {
    parseSqlParameters(e.target.value);
  });

  // Toggle forecasting field based on chart type selection
  const typeSelect = document.getElementById("widget-type-select");
  if (typeSelect) {
    typeSelect.addEventListener("change", (e) => {
      const container = document.getElementById("widget-forecast-container");
      if (e.target.value === 'line' || e.target.value === 'area') {
        container.style.display = "flex";
      } else {
        container.style.display = "none";
        document.getElementById("widget-forecast-enable").checked = false;
      }
    });
  }

  // Load saved and history queries from localStorage
  try {
    sqlSavedQueries = JSON.parse(localStorage.getItem('athena_saved_queries')) || [];
    sqlHistory = JSON.parse(localStorage.getItem('athena_sql_history')) || [];
    renderSavedQueries();
    renderSqlHistory();
  } catch (e) {
    console.error("Failed to load history or saved queries:", e);
  }

  // Initialize Autocomplete suggestions box
  initSqlAutocomplete();
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
  const files = event.target.files;
  if (files && files.length > 0) {
    let fileIndex = 0;
    function processNext() {
      if (fileIndex < files.length) {
        processUploadedFile(files[fileIndex], () => {
          fileIndex++;
          processNext();
        });
      }
    }
    processNext();
  }
}

function cleanTableName(filename) {
  const baseName = filename.split('.').slice(0, -1).join('.');
  let cleanName = baseName.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  if (/^[0-9]/.test(cleanName)) {
    cleanName = '_' + cleanName;
  }
  return cleanName || 'table_' + Math.floor(Math.random() * 1000);
}

// Parse File via FileReader (supports CSV and Excel XLSX)
function processUploadedFile(file, callback) {
  const reader = new FileReader();
  const fileExt = file.name.split('.').pop().toLowerCase();
  const cleanName = cleanTableName(file.name);

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
        if (callback) callback();
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

      const isFirst = Object.keys(loadedDatasets).length === 0;

      if (isFirst) {
        datasetName = file.name;
        datasetType = "custom";
        currentDataset = parsedRows;
        activeData = JSON.parse(JSON.stringify(parsedRows)); // deep clone
        loadedDatasets = { data: currentDataset };
        
        initLoadedDataset();
        switchTab('datahub');
      } else {
        loadedDatasets[cleanName] = parsedRows;
        alert(`Successfully loaded additional table: "${cleanName}" (${parsedRows.length} rows)`);
        
        registerTablesInAlaSql();
        initSqlConsole();
      }
      
      if (callback) callback();
    } catch (err) {
      console.error(err);
      alert("Error parsing document. Verify layout matches CSV/XLSX standards.");
      if (callback) callback();
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
    
    // Clear dashboards and slicers
    dashboardCharts = [];
    dashboardSlicers = {};
    
    loadedDatasets = { data: currentDataset };
    registerTablesInAlaSql();
    
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
  activeFilters = [];
  dashboardSlicers = {};
  const chipsContainer = document.getElementById("filter-chips-container");
  if (chipsContainer) {
    renderFilterChips();
  }
  
  // Register tables in AlaSQL context
  registerTablesInAlaSql();
  
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
      { id: "w-1", title: "Streams by Genre (Total)", type: "donut", xaxis: "Genre", yaxis: ["Streams"], agg: "SUM" },
      { id: "w-2", title: "Danceability vs Energy Ratings", type: "scatter", xaxis: "Danceability", yaxis: ["Energy"], agg: "NONE" },
      { id: "w-3", title: "Monthly Stream Releases", type: "bar", xaxis: "ReleaseDate", yaxis: ["Streams"], agg: "SUM" }
    );
  } else if (datasetType === 'ecommerce') {
    dashboardCharts.push(
      { id: "w-1", title: "Revenue contribution by Category", type: "donut", xaxis: "Category", yaxis: ["Revenue"], agg: "SUM" },
      { id: "w-2", title: "Daily Sales Revenue Trend", type: "line", xaxis: "Date", yaxis: ["Revenue"], agg: "SUM" },
      { id: "w-3", title: "Product Profit Margin Analysis", type: "bar", xaxis: "SubCategory", yaxis: ["Profit"], agg: "SUM" }
    );
  } else if (datasetType === 'inventory') {
    dashboardCharts.push(
      { id: "w-1", title: "Stock Distribution by Category", type: "bar", xaxis: "Category", yaxis: ["StockLevel"], agg: "SUM" },
      { id: "w-2", title: "Retail Pricing vs Stock Unit Cost", type: "scatter", xaxis: "UnitCost", yaxis: ["RetailPrice"], agg: "NONE" },
      { id: "w-3", title: "Warehouse Storage Holdings", type: "donut", xaxis: "Warehouse", yaxis: ["StockLevel"], agg: "SUM" }
    );
  } else {
    // Custom upload default widgets: pick first text and first numeric column
    if (dataProfile.textCols.length > 0 && dataProfile.numericCols.length > 0) {
      dashboardCharts.push({
        id: "w-1",
        title: `Total ${dataProfile.numericCols[0]} by ${dataProfile.textCols[0]}`,
        type: "bar",
        xaxis: dataProfile.textCols[0],
        yaxis: [dataProfile.numericCols[0]],
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
  renderCorrelationHeatmap();
  populateFormulaHelpers();
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
      <div style="background-color: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px; font-size: 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: 600; color: var(--text-main); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 130px;" title="${col.name}"><i class="fa-solid ${iconClass}" style="color: ${iconColor}; margin-right: 6px;"></i>${col.name}</span>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select onchange="updateColumnType('${col.name}', this.value)" style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 4px; padding: 2px 4px; font-size: 9px; cursor: pointer; outline: none; font-weight: 600;">
              <option value="Text" ${col.type === 'Text' ? 'selected' : ''}>Text</option>
              <option value="Number" ${col.type === 'Number' ? 'selected' : ''}>Number</option>
              <option value="Date" ${col.type === 'Date' ? 'selected' : ''}>Date</option>
            </select>
            <i class="fa-solid fa-pen-to-square schema-action-btn" onclick="renameColumn('${col.name}')" title="Rename Column" style="font-size: 11px;"></i>
            <i class="fa-solid fa-trash-can schema-action-btn schema-action-btn-danger" onclick="dropColumn('${col.name}')" title="Drop Column" style="font-size: 11px; color: var(--danger);"></i>
          </div>
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

// Column Schema Mutation Operations (Option 1)
function updateColumnType(colName, newType) {
  currentDataset.forEach(row => {
    if (row.hasOwnProperty(colName)) {
      if (newType === 'Number') {
        const val = Number(String(row[colName]).replace(/,/g, '').trim());
        row[colName] = isNaN(val) ? 0 : val;
      } else if (newType === 'Text') {
        row[colName] = String(row[colName]);
      } else if (newType === 'Date') {
        const val = Date.parse(row[colName]);
        if (!isNaN(val)) {
          row[colName] = new Date(val).toISOString().split('T')[0];
        }
      }
    }
  });
  
  activeData = JSON.parse(JSON.stringify(currentDataset));
  if (loadedDatasets.hasOwnProperty("data")) {
    loadedDatasets.data = currentDataset;
  }
  applyActiveFilters();
  profileSchema();
  renderDataTable();
  initSelectDropdowns();
  initSqlConsole();
}

function renameColumn(colName) {
  const newName = prompt(`Enter new column name for "${colName}":`, colName);
  if (!newName || newName.trim() === "" || newName === colName) return;
  const cleanName = newName.trim();
  
  currentDataset.forEach(row => {
    if (row.hasOwnProperty(colName)) {
      row[cleanName] = row[colName];
      delete row[colName];
    }
  });
  
  activeData = JSON.parse(JSON.stringify(currentDataset));
  if (loadedDatasets.hasOwnProperty("data")) {
    loadedDatasets.data = currentDataset;
  }
  applyActiveFilters();
  profileSchema();
  renderDataTable();
  initSelectDropdowns();
  initSqlConsole();
}

function dropColumn(colName) {
  if (!confirm(`Are you sure you want to drop column "${colName}"?`)) return;
  
  currentDataset.forEach(row => {
    if (row.hasOwnProperty(colName)) {
      delete row[colName];
    }
  });
  
  activeData = JSON.parse(JSON.stringify(currentDataset));
  if (loadedDatasets.hasOwnProperty("data")) {
    loadedDatasets.data = currentDataset;
  }
  applyActiveFilters();
  profileSchema();
  renderDataTable();
  initSelectDropdowns();
  initSqlConsole();
}

// Load Dropdown Options
function initSelectDropdowns() {
  const rowSelect = document.getElementById("pivot-row-select");
  const rowNestedSelect = document.getElementById("pivot-row-nested-select");
  const colSelect = document.getElementById("pivot-col-select");
  const valSelect = document.getElementById("pivot-val-select");
  
  if (!rowSelect) return;
  
  // Setup selectors
  rowSelect.innerHTML = `<option value="None">None</option>`;
  if (rowNestedSelect) rowNestedSelect.innerHTML = `<option value="None">None</option>`;
  colSelect.innerHTML = `<option value="None">None</option>`;
  valSelect.innerHTML = `<option value="None">None</option>`;
  
  dataProfile.columns.forEach(col => {
    rowSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    if (rowNestedSelect) rowNestedSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    colSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    if (col.type === "Number") {
      valSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    }
  });

  // Select defaults if possible
  if (dataProfile.textCols.length > 0) rowSelect.value = dataProfile.textCols[0];
  if (rowNestedSelect) rowNestedSelect.value = "None";
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

  // Populate filter columns dropdown
  const filterColSelect = document.getElementById("filter-col-select");
  if (filterColSelect) {
    filterColSelect.innerHTML = "";
    dataProfile.columns.forEach(col => {
      filterColSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    });
    // Set initial dropdown value selectors
    handleFilterColChange();
  }

  // Populate cleaner columns dropdown
  const cleanerColSelect = document.getElementById("cleaner-col-select");
  if (cleanerColSelect) {
    cleanerColSelect.innerHTML = "";
    dataProfile.numericCols.forEach(col => {
      cleanerColSelect.innerHTML += `<option value="${col}">${col}</option>`;
    });
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
  if (currentDataset.length === 0) return;
  
  if (operation === 'dropna') {
    const prevCount = currentDataset.length;
    currentDataset = currentDataset.filter(row => {
      return Object.values(row).every(val => val !== null && val !== undefined && val !== "");
    });
    const droppedCount = prevCount - currentDataset.length;
    applyActiveFilters();
    alert(`Cleaned: Dropped ${droppedCount} records containing null fields.`);
  } 
  
  else if (operation === 'fillna') {
    // Fill null numerical columns with column average using currentDataset
    let filledCount = 0;
    dataProfile.numericCols.forEach(col => {
      const numbers = currentDataset.map(r => r[col]).filter(v => typeof v === 'number');
      if (numbers.length === 0) return;
      const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
      
      currentDataset.forEach(row => {
        if (row[col] === null || row[col] === undefined || row[col] === "") {
          row[col] = avg;
          filledCount++;
        }
      });
    });
    applyActiveFilters();
    alert("Cleaned: Substituted null numerical records with the average metric values.");
  } 
  
  else if (operation === 'dropdupes') {
    const prevCount = currentDataset.length;
    const seen = new Set();
    currentDataset = currentDataset.filter(row => {
      const serialized = JSON.stringify(row);
      if (seen.has(serialized)) return false;
      seen.add(serialized);
      return true;
    });
    const removedCount = prevCount - currentDataset.length;
    applyActiveFilters();
    alert(`Cleaned: Deduplicated dataset. Removed ${removedCount} duplicates.`);
  }

  else if (operation === 'zscore') {
    const colName = document.getElementById("cleaner-col-select").value;
    if (!colName) {
      alert("Please select a numeric column to standardize.");
      return;
    }
    const vals = currentDataset.map(r => Number(r[colName])).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sqDiffs = vals.map(v => Math.pow(v - mean, 2));
    const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / vals.length) || 1;
    
    currentDataset.forEach(row => {
      const val = Number(row[colName]);
      if (!isNaN(val)) {
        row[colName] = Number(((val - mean) / stdDev).toFixed(4));
      }
    });
    
    applyActiveFilters();
    alert(`Cleaned: Applied Z-score standardization on "${colName}". Mean is now 0, Std Dev is 1.`);
  }
  
  else if (operation === 'minmax') {
    const colName = document.getElementById("cleaner-col-select").value;
    if (!colName) {
      alert("Please select a numeric column to scale.");
      return;
    }
    const vals = currentDataset.map(r => Number(r[colName])).filter(v => !isNaN(v));
    if (vals.length === 0) return;
    
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || 1;
    
    currentDataset.forEach(row => {
      const val = Number(row[colName]);
      if (!isNaN(val)) {
        row[colName] = Number(((val - min) / range).toFixed(4));
      }
    });
    
    applyActiveFilters();
    alert(`Cleaned: Applied Min-Max scaling on "${colName}". Range is now [0, 1].`);
  }
  
  else if (operation === 'impute_median') {
    const colName = document.getElementById("cleaner-col-select").value;
    if (!colName) {
      alert("Please select a numeric column to impute.");
      return;
    }
    
    const vals = currentDataset.map(r => Number(r[colName])).filter(v => !isNaN(v)).sort((a,b)=>a-b);
    if (vals.length === 0) return;
    
    let median = 0;
    const midIdx = Math.floor(vals.length / 2);
    if (vals.length % 2 === 0) {
      median = (vals[midIdx - 1] + vals[midIdx]) / 2;
    } else {
      median = vals[midIdx];
    }
    
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const sqDiffs = vals.map(v => Math.pow(v - mean, 2));
    const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / vals.length) || 1;
    
    let imputedCount = 0;
    currentDataset.forEach(row => {
      const val = Number(row[colName]);
      if (!isNaN(val) && Math.abs((val - mean) / stdDev) > 2) {
        row[colName] = median;
        imputedCount++;
      }
    });
    
    applyActiveFilters();
    alert(`Cleaned: Replaced ${imputedCount} outliers in "${colName}" with the column median (${median.toLocaleString()}).`);
  }
}

// SQL Lab Panel Operations
// SQL Lab Panel Operations
function initSqlConsole() {
  const explorerList = document.getElementById("sql-schema-list");
  if (!explorerList) return;
  
  explorerList.innerHTML = "";
  let explorerHtml = "";
  
  for (let tableName in loadedDatasets) {
    const dataset = loadedDatasets[tableName];
    if (!dataset || dataset.length === 0) continue;
    const headers = Object.keys(dataset[0]);
    
    explorerHtml += `
      <div class="schema-table-node" style="margin-bottom: 12px;">
        <span class="schema-table-name" style="font-weight: 600; color: var(--text-main); font-size: 13px; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-table" style="color: var(--accent-color);"></i> ${tableName}</span>
        <ul class="schema-columns" style="margin-top: 4px; padding-left: 18px; list-style: none;">
    `;
    
    headers.forEach(h => {
      let colType = "text";
      const sampleVal = dataset[0][h];
      if (typeof sampleVal === 'number') colType = "number";
      else if (!isNaN(Date.parse(sampleVal))) colType = "date";
      
      explorerHtml += `
        <li class="schema-col-item" style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); margin-bottom: 2px;">
          <span>${h}</span>
          <span class="schema-col-type" style="font-family: var(--font-mono); font-size: 9px; opacity: 0.7;">${colType}</span>
        </li>
      `;
    });
    
    explorerHtml += `
        </ul>
      </div>
    `;
  }
  
  explorerList.innerHTML = explorerHtml;

  // Populate Visual Query Builder select options based on primary 'data' dataset
  const primaryData = loadedDatasets["data"] || activeData;
  const filterCol = document.getElementById("qb-filter-col");
  const sortCol = document.getElementById("qb-sort-col");
  if (filterCol && sortCol && primaryData && primaryData.length > 0) {
    const headers = Object.keys(primaryData[0]);
    filterCol.innerHTML = `<option value="None">None</option>`;
    sortCol.innerHTML = `<option value="None">None</option>`;
    headers.forEach(h => {
      filterCol.innerHTML += `<option value="${h}">${h}</option>`;
      sortCol.innerHTML += `<option value="${h}">${h}</option>`;
    });
  }

  // Populate Join Builder tables & keys (Option 2)
  populateJoinTables();
}

// SQL Visual Join Builder Handlers (Option 2)
function populateJoinTables() {
  const leftTable = document.getElementById("qb-join-left-table");
  const rightTable = document.getElementById("qb-join-right-table");
  if (!leftTable || !rightTable) return;
  
  const tables = Object.keys(loadedDatasets);
  leftTable.innerHTML = "";
  rightTable.innerHTML = "";
  
  tables.forEach(t => {
    leftTable.innerHTML += `<option value="${t}">${t}</option>`;
    rightTable.innerHTML += `<option value="${t}">${t}</option>`;
  });
  
  if (tables.length > 0) {
    leftTable.value = tables[0];
    if (tables[1]) {
      rightTable.value = tables[1];
    } else {
      rightTable.value = tables[0];
    }
  }
  handleJoinLeftTableChange();
  handleJoinRightTableChange();
}

function handleJoinLeftTableChange() {
  const leftTable = document.getElementById("qb-join-left-table").value;
  const leftKey = document.getElementById("qb-join-left-key");
  if (!leftKey || !loadedDatasets[leftTable]) return;
  
  leftKey.innerHTML = "";
  const cols = Object.keys(loadedDatasets[leftTable][0] || {});
  cols.forEach(c => {
    leftKey.innerHTML += `<option value="${c}">${c}</option>`;
  });
}

function handleJoinRightTableChange() {
  const rightTable = document.getElementById("qb-join-right-table").value;
  const rightKey = document.getElementById("qb-join-right-key");
  if (!rightKey || !loadedDatasets[rightTable]) return;
  
  rightKey.innerHTML = "";
  const cols = Object.keys(loadedDatasets[rightTable][0] || {});
  cols.forEach(c => {
    rightKey.innerHTML += `<option value="${c}">${c}</option>`;
  });
}

function compileJoinQuery() {
  const leftTable = document.getElementById("qb-join-left-table").value;
  const leftKey = document.getElementById("qb-join-left-key").value;
  const joinType = document.getElementById("qb-join-type").value;
  const rightTable = document.getElementById("qb-join-right-table").value;
  const rightKey = document.getElementById("qb-join-right-key").value;
  
  if (!leftTable || !rightTable) {
    alert("Make sure you have at least two tables loaded to join.");
    return;
  }
  
  let sql = `SELECT * \nFROM ${leftTable} \n${joinType} ${rightTable} \n  ON ${leftTable}.[${leftKey}] = ${rightTable}.[${rightKey}] \nLIMIT 15;`;
  
  const textarea = document.getElementById("sql-editor-textarea");
  if (textarea) {
    textarea.value = sql;
    textarea.focus();
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
  
  let preparedQuery = query;
  
  // Replace active parameters with user inputs
  let parametersBoundSuccessfully = true;
  activeSqlParams.forEach(name => {
    const input = document.getElementById(`param-input-${name}`);
    const val = input ? input.value.trim() : "";
    if (val === "") {
      parametersBoundSuccessfully = false;
    }
    
    // Check if it is a number or text, format quotes accordingly
    let replacedVal = val;
    if (isNaN(val) || val === "") {
      if (!val.startsWith("'") && !val.endsWith("'")) {
        replacedVal = `'${val.replace(/'/g, "''")}'`;
      }
    }
    
    const valRegex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
    preparedQuery = preparedQuery.replace(valRegex, replacedVal);
  });
  
  if (!parametersBoundSuccessfully && activeSqlParams.length > 0) {
    alert("Please fill in all parameter values before executing the query.");
    return;
  }
  
  // Update register tables state before querying to ensure they have the latest activeData
  registerTablesInAlaSql();
  
  try {
    const startTime = performance.now();
    const result = alasql(preparedQuery);
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
  const rowNestedField = document.getElementById("pivot-row-nested-select").value;
  const colField = document.getElementById("pivot-col-select").value;
  const valField = document.getElementById("pivot-val-select").value;
  const aggFunc = document.getElementById("pivot-agg-select").value;
  const enableHeatmap = document.getElementById("pivot-enable-heatmap").checked;
  
  const matrixTable = document.getElementById("pivot-matrix-table");
  
  if (activeData.length === 0) return;
  
  const uniqueRows = [...new Set(activeData.map(r => r[rowField]))].filter(v => v !== null && v !== undefined && v !== "");
  const uniqueCols = colField !== "None" ? [...new Set(activeData.map(r => r[colField]))].filter(v => v !== null && v !== undefined && v !== "") : ["Value"];
  
  // Aggregate helper
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
  
  // 1. Build pivot map hierarchy
  const pivotMap = {};
  
  if (rowNestedField !== "None") {
    // Unique list of parent-child groups that actually exist
    activeData.forEach(row => {
      const p = row[rowField];
      const c = row[rowNestedField];
      if (p !== null && p !== undefined && p !== "" && c !== null && c !== undefined && c !== "") {
        if (!pivotMap[p]) {
          pivotMap[p] = { children: {} };
        }
        if (!pivotMap[p].children[c]) {
          pivotMap[p].children[c] = {};
          uniqueCols.forEach(col => {
            pivotMap[p].children[c][col] = [];
          });
        }
        
        const metric = valField !== "None" ? Number(row[valField]) : 1;
        const colVal = colField !== "None" ? row[colField] : "Value";
        if (pivotMap[p].children[c][colVal] !== undefined) {
          pivotMap[p].children[c][colVal].push(metric);
        }
      }
    });
  } else {
    // Flat rows
    uniqueRows.forEach(r => {
      pivotMap[r] = {};
      uniqueCols.forEach(c => {
        pivotMap[r][c] = [];
      });
    });
    
    activeData.forEach(row => {
      const rVal = row[rowField];
      const cVal = colField !== "None" ? row[colField] : "Value";
      const metric = valField !== "None" ? Number(row[valField]) : 1;
      
      if (pivotMap[rVal] && pivotMap[rVal][cVal] !== undefined) {
        pivotMap[rVal][cVal].push(metric);
      }
    });
  }
  
  // 2. Build headers HTML
  let headHtml = `<tr><th class="pivot-header">${rowField} ${rowNestedField !== "None" ? " / " + rowNestedField : ""}</th>`;
  uniqueCols.forEach(c => {
    headHtml += `<th style="text-align: right;">${c}</th>`;
  });
  headHtml += `<th style="text-align: right; font-weight: 700;">Grand Total</th></tr>`;
  matrixTable.querySelector("thead").innerHTML = headHtml;
  
  // Calculate value ranges for Heatmap scaling
  let allAggregatedValues = [];
  if (rowNestedField !== "None") {
    for (let p in pivotMap) {
      for (let c in pivotMap[p].children) {
        uniqueCols.forEach(col => {
          const list = pivotMap[p].children[c][col];
          allAggregatedValues.push(list.length > 0 ? aggregate(list) : 0);
        });
      }
    }
  } else {
    uniqueRows.forEach(r => {
      uniqueCols.forEach(c => {
        const list = pivotMap[r][c];
        allAggregatedValues.push(list.length > 0 ? aggregate(list) : 0);
      });
    });
  }
  
  const minVal = allAggregatedValues.length > 0 ? Math.min(...allAggregatedValues) : 0;
  const maxVal = allAggregatedValues.length > 0 ? Math.max(...allAggregatedValues) : 0;
  const valRange = maxVal - minVal || 1;
  
  const getCellBg = (val) => {
    if (!enableHeatmap || allAggregatedValues.length === 0) return "";
    const pct = (val - minVal) / valRange;
    const primaryColor = themePalettes[currentTheme][0];
    return `background-color: ${hexToRgba(primaryColor, pct * 0.35)};`;
  };
  
  // 3. Populate matrix content
  let bodyHtml = "";
  const colTotals = {};
  uniqueCols.forEach(c => { colTotals[c] = []; });
  
  if (rowNestedField !== "None") {
    // Nested rows render loop
    for (let p in pivotMap) {
      // Parent Row Total aggregation
      const parentColTotals = {};
      uniqueCols.forEach(col => { parentColTotals[col] = []; });
      for (let c in pivotMap[p].children) {
        uniqueCols.forEach(col => {
          pivotMap[p].children[c][col].forEach(v => parentColTotals[col].push(v));
        });
      }
      
      const parentGrandVals = [];
      uniqueCols.forEach(col => {
        parentGrandVals.push(aggregate(parentColTotals[col]));
      });
      const parentGrandTotal = aggregate(parentGrandVals);
      
      bodyHtml += `<tr class="pivot-parent-row">`;
      bodyHtml += `<td style="font-weight: 700;"><i class="fa-solid fa-folder-open" style="margin-right: 6px; color: var(--primary-color);"></i>${p}</td>`;
      uniqueCols.forEach((col, idx) => {
        bodyHtml += `<td style="text-align: right; font-weight: 700;">${parentGrandVals[idx].toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
      });
      bodyHtml += `<td style="text-align: right; font-weight: 700;">${parentGrandTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
      bodyHtml += `</tr>`;
      
      // Children rows loop
      for (let c in pivotMap[p].children) {
        bodyHtml += `<tr><td class="pivot-indent"><i class="fa-solid fa-angle-right" style="margin-right: 6px; font-size:10px; opacity:0.5;"></i>${c}</td>`;
        let rowValues = [];
        uniqueCols.forEach(col => {
          const list = pivotMap[p].children[c][col];
          const val = list.length > 0 ? aggregate(list) : 0;
          bodyHtml += `<td style="text-align: right; ${getCellBg(val)}">${val.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
          rowValues.push(val);
          list.forEach(v => colTotals[col].push(v));
        });
        
        const rowTotal = aggregate(rowValues);
        bodyHtml += `<td style="text-align: right; font-weight: 700; background-color: rgba(255,255,255,0.01);">${rowTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td></tr>`;
      }
    }
  } else {
    // Flat rows render loop
    uniqueRows.forEach(r => {
      bodyHtml += `<tr><td style="font-weight: 600;">${r}</td>`;
      let rowValues = [];
      
      uniqueCols.forEach(c => {
        const cellValList = pivotMap[r][c];
        const aggregatedVal = cellValList.length > 0 ? aggregate(cellValList) : 0;
        bodyHtml += `<td style="text-align: right; ${getCellBg(aggregatedVal)}">${aggregatedVal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td>`;
        
        rowValues.push(aggregatedVal);
        cellValList.forEach(v => colTotals[c].push(v));
      });
      
      const rowTotal = aggregate(rowValues);
      bodyHtml += `<td style="text-align: right; font-weight: 700; background-color: rgba(255,255,255,0.02);">${rowTotal.toLocaleString(undefined, {maximumFractionDigits: 2})}</td></tr>`;
    });
  }
  
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
  
  // Render inline pivot chart visualization (Option 5 compatibility)
  if (rowNestedField !== "None") {
    const flatRows = [];
    const flatPivotMap = {};
    for (let p in pivotMap) {
      for (let c in pivotMap[p].children) {
        const flatKey = `${p} - ${c}`;
        flatRows.push(flatKey);
        flatPivotMap[flatKey] = {};
        uniqueCols.forEach(col => {
          flatPivotMap[flatKey][col] = pivotMap[p].children[c][col];
        });
      }
    }
    renderInlinePivotChart(flatRows, uniqueCols, flatPivotMap, aggregate, rowField, colField, valField);
  } else {
    renderInlinePivotChart(uniqueRows, uniqueCols, pivotMap, aggregate, rowField, colField, valField);
  }
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
  
  // Render slicers panel
  renderDashboardSlicers();
  
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
    const colSpanClass = widget.width || 'col-span-2';
    const widgetStyle = widget.style || '';
    
    chartGrid.innerHTML += `
      <div class="glass-card chart-card-wrapper ${colSpanClass}" style="${widgetStyle}" draggable="true" ondragstart="handleWidgetDragStart(event, '${widget.id}')" ondragover="handleWidgetDragOver(event)" ondrop="handleWidgetDrop(event, '${widget.id}')">
        <div style="display: flex; gap: 6px; position: absolute; top: 16px; right: 16px; z-index: 5;">
          <button class="btn btn-secondary btn-sm" onclick="resizeWidget('${widget.id}')" title="Cycle Card Width" style="padding: 2px 6px; font-size:10px; height: 22px; border-radius: 4px;"><i class="fa-solid fa-arrows-left-right"></i> Width</button>
          <button class="btn btn-secondary btn-sm" onclick="styleWidgetModal('${widget.id}')" title="Custom Card Style" style="padding: 2px 6px; font-size:10px; height: 22px; border-radius: 4px;"><i class="fa-solid fa-paintbrush"></i> Style</button>
          <div class="chart-delete-btn" onclick="deleteWidget('${widget.id}')" style="position:static; width:22px; height:22px; font-size:12px;">&times;</div>
        </div>
        <h3 style="font-size: 14px; margin-bottom: 12px; font-weight:700; max-width: 70%; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${widget.title}</h3>
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

// Drag & Drop event handlers (Option 3)
function handleWidgetDragStart(e, widgetId) {
  e.dataTransfer.setData("text/plain", widgetId);
  e.currentTarget.classList.add("dragging");
}

function handleWidgetDragOver(e) {
  e.preventDefault();
}

function handleWidgetDrop(e, targetId) {
  e.preventDefault();
  const draggedId = e.dataTransfer.getData("text/plain");
  if (draggedId === targetId) return;
  
  const draggedIdx = dashboardCharts.findIndex(w => w.id === draggedId);
  const targetIdx = dashboardCharts.findIndex(w => w.id === targetId);
  if (draggedIdx > -1 && targetIdx > -1) {
    const [draggedWidget] = dashboardCharts.splice(draggedIdx, 1);
    dashboardCharts.splice(targetIdx, 0, draggedWidget);
    renderDashboard();
  }
}

// Widget customization handlers (Option 3)
function resizeWidget(id) {
  const widget = dashboardCharts.find(w => w.id === id);
  if (widget) {
    const widths = ['col-span-1', 'col-span-2', 'col-span-3', 'col-span-4'];
    let currentWidth = widget.width || 'col-span-2';
    let nextIdx = (widths.indexOf(currentWidth) + 1) % widths.length;
    widget.width = widths[nextIdx];
    renderDashboard();
  }
}

function styleWidgetModal(widgetId) {
  const widget = dashboardCharts.find(w => w.id === widgetId);
  if (widget) {
    document.getElementById("style-widget-id").value = widgetId;
    document.getElementById("style-widget-bg").value = widget.styleBg || "";
    document.getElementById("style-widget-glow").value = widget.styleGlow || "";
    document.getElementById("widget-style-modal").classList.add("active");
  }
}

function closeStyleWidgetModal() {
  document.getElementById("widget-style-modal").classList.remove("active");
}

function saveWidgetStyle() {
  const id = document.getElementById("style-widget-id").value;
  const bg = document.getElementById("style-widget-bg").value;
  const glow = document.getElementById("style-widget-glow").value;
  
  const widget = dashboardCharts.find(w => w.id === id);
  if (widget) {
    widget.styleBg = bg;
    widget.styleGlow = glow;
    widget.style = (bg ? bg + "; " : "") + (glow ? glow : "");
    closeStyleWidgetModal();
    renderDashboard();
  }
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
  
  const yAxisList = Array.isArray(widget.yaxis) ? widget.yaxis : [widget.yaxis];
  const primaryYaxis = yAxisList[0];
  
  let series = [];
  let xCategories = [];
  
  if (widget.agg !== "NONE") {
    // Perform AlaSQL group query for multiple Y fields
    const selectFields = yAxisList.map(col => `${widget.agg}([${col}]) AS [${col}]`).join(", ");
    
    let orderBy = `[${yAxisList[0]}] DESC`;
    if (dataProfile.dateCols.includes(widget.xaxis) || widget.xaxis.toLowerCase().includes("date")) {
      orderBy = `[${widget.xaxis}] ASC`;
    }
    
    const sqlQuery = `SELECT [${widget.xaxis}] AS X, ${selectFields} FROM ? GROUP BY [${widget.xaxis}] ORDER BY ${orderBy}`;
    
    try {
      const aggResult = alasql(sqlQuery, [activeData]);
      xCategories = aggResult.map(r => String(r.X));
      
      yAxisList.forEach((col, idx) => {
        let typeOverride = widget.type;
        if (widget.type === 'combo') {
          typeOverride = idx === 0 ? 'column' : 'line';
        }
        series.push({
          name: col,
          type: typeOverride === 'combo' ? 'column' : typeOverride,
          data: aggResult.map(r => Number(r[col]) || 0)
        });
      });
      
    } catch (err) {
      console.error(err);
      div.innerHTML = `<div style="color: var(--danger); font-size:12px; padding: 24px;">Failed to compile visualization: ${err.message}</div>`;
      return;
    }
  } else {
    // Just map direct coordinates (max 100 scatter plots to preserve load speed)
    yAxisList.forEach(col => {
      const chartData = activeData.slice(0, 100).map(row => ({
        x: row[widget.xaxis],
        y: Number(row[col]) || 0
      }));
      
      if (dataProfile.dateCols.includes(widget.xaxis) || widget.xaxis.toLowerCase().includes("date")) {
        chartData.sort((a, b) => new Date(a.x) - new Date(b.x));
      }
      
      series.push({
        name: col,
        data: chartData.map(d => ({ x: Number(d.x) || d.x, y: d.y }))
      });
    });
    
    xCategories = activeData.slice(0, 100).map(row => String(row[widget.xaxis]));
  }
  
  let chartColors = widget.type === 'donut' ? themePalettes[currentTheme] : themePalettes[currentTheme].slice(0, yAxisList.length);
  let strokeOptions = { curve: 'smooth', width: widget.type === 'combo' ? [0, 3, 3] : 2 };
  let fillOptions = undefined;
  
  // Custom styling attributes for predictive bounds (Option 4)
  if (widget.forecast && (widget.type === 'line' || widget.type === 'area') && yAxisList.length === 1 && series[0].data.length >= 3) {
    const yValues = series[0].data;
    const forecastPeriods = widget.forecastPeriods || 6;
    const forecastResults = calculateForecast(xCategories, yValues, forecastPeriods);
    if (forecastResults) {
      const isDateSeries = dataProfile.dateCols.includes(widget.xaxis) || widget.xaxis.toLowerCase().includes("date");
      const futureDates = projectFutureDates(xCategories, forecastPeriods, isDateSeries);
      
      const extendedCategories = [...xCategories, ...futureDates];
      const actualsData = [...yValues, ...Array(forecastPeriods).fill(null)];
      const forecastData = [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastResults.futureY];
      const upperData = [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastResults.futureUpper];
      const lowerData = [...Array(yValues.length - 1).fill(null), yValues[yValues.length - 1], ...forecastResults.futureLower];
      
      series = [
        { name: `${primaryYaxis} (Actual)`, type: widget.type, data: actualsData },
        { name: `${primaryYaxis} (Forecast)`, type: 'line', data: forecastData },
        { name: 'Upper Confidence Bound', type: 'area', data: upperData },
        { name: 'Lower Confidence Bound', type: 'area', data: lowerData }
      ];
      
      xCategories = extendedCategories;
      
      chartColors = [
        themePalettes[currentTheme][0], 
        themePalettes[currentTheme][0], 
        themePalettes[currentTheme][1], 
        '#0d1423'
      ];
      
      strokeOptions = {
        curve: 'smooth',
        width: [3, 3, 1, 1],
        dashArray: [0, 6, 4, 4]
      };
      
      fillOptions = {
        type: ['solid', 'solid', 'solid', 'solid'],
        opacity: [1.0, 1.0, 0.15, 1.0]
      };
    }
  }
  
  // Anomaly outlier points highlighting (Option 4)
  let annotationsOptions = undefined;
  if (widget.type !== 'donut' && series.length > 0 && series[0].data.length >= 3 && !widget.forecast) {
    let rawYValues = [];
    let xVals = [];
    if (widget.agg !== "NONE") {
      rawYValues = series[0].data;
      xVals = xCategories;
    } else {
      rawYValues = series[0].data.map(pt => pt.y);
      xVals = series[0].data.map(pt => pt.x);
    }
    
    const outliers = getApexOutlierAnnotations(xVals, rawYValues);
    if (outliers.length > 0) {
      annotationsOptions = {
        points: outliers
      };
    }
  }
  
  let options = {
    chart: {
      type: widget.type === 'donut' ? 'donut' : (widget.type === 'combo' ? 'line' : widget.type),
      height: 260,
      foreColor: '#94a3b8',
      background: 'transparent',
      toolbar: { show: true }
    },
    theme: { mode: 'dark' },
    colors: chartColors,
    stroke: strokeOptions,
    fill: fillOptions,
    annotations: annotationsOptions,
    dataLabels: { enabled: false },
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: '50%' }
    },
    series: widget.type === 'donut' ? series[0].data : series,
    labels: widget.type === 'donut' ? xCategories : undefined,
    xaxis: widget.type !== 'donut' ? { categories: xCategories } : undefined,
    grid: { borderColor: 'rgba(255,255,255,0.05)' }
  };
  
  if (widget.type === 'scatter') {
    options.xaxis = { type: 'numeric' };
  }
  
  const apexChart = new ApexCharts(div, options);
  apexChart.render();
}

// Widget Modal Controls
function openWidgetModal() {
  const modal = document.getElementById("widget-modal");
  const xaxisSelect = document.getElementById("widget-xaxis-select");
  const yaxisContainer = document.getElementById("widget-yaxis-checkboxes");
  
  // Reset modal state
  document.getElementById("widget-title-input").value = "";
  document.getElementById("widget-type-select").value = "bar";
  document.getElementById("widget-forecast-enable").checked = false;
  document.getElementById("widget-forecast-container").style.display = "none";
  document.getElementById("widget-forecast-periods").value = "6";
  
  xaxisSelect.innerHTML = "";
  yaxisContainer.innerHTML = "";
  
  dataProfile.columns.forEach(col => {
    xaxisSelect.innerHTML += `<option value="${col.name}">${col.name}</option>`;
    if (col.type === "Number") {
      yaxisContainer.innerHTML += `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-main); margin-bottom: 2px;">
          <input type="checkbox" name="widget-yaxis-metric" value="${col.name}" style="width: 14px; height: 14px; cursor: pointer; accent-color: var(--accent-color);">
          <span>${col.name}</span>
        </div>
      `;
    }
  });
  
  modal.classList.add("active");
}

// Close custom modal
function closeWidgetModal() {
  document.getElementById("widget-modal").classList.remove("active");
}

function addNewChartWidget() {
  const title = document.getElementById("widget-title-input").value || "Custom Widget";
  const type = document.getElementById("widget-type-select").value;
  const xaxis = document.getElementById("widget-xaxis-select").value;
  const agg = document.getElementById("widget-agg-select").value;
  const forecast = document.getElementById("widget-forecast-enable").checked;
  const forecastPeriods = Number(document.getElementById("widget-forecast-periods").value) || 6;
  
  const checkedInputs = document.querySelectorAll('input[name="widget-yaxis-metric"]:checked');
  const yaxis = Array.from(checkedInputs).map(input => input.value);
  
  if (yaxis.length === 0) {
    alert("Please select at least one Y-axis metric.");
    return;
  }
  
  const newWidget = {
    id: "w-" + Date.now(),
    title,
    type,
    xaxis,
    yaxis,
    agg,
    forecast,
    forecastPeriods
  };
  
  dashboardCharts.push(newWidget);
  closeWidgetModal();
  renderDashboard();
}

// Utility Math for hex to rgba conversion
function hexToRgba(hex, alpha) {
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Outlier annotations calculation helper
function getApexOutlierAnnotations(xVals, yVals) {
  if (yVals.length < 3) return [];
  
  const mean = yVals.reduce((a, b) => a + b, 0) / yVals.length;
  const sqDiffs = yVals.map(v => Math.pow(v - mean, 2));
  const stdDev = Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / yVals.length) || 1;
  
  const annotations = [];
  yVals.forEach((val, idx) => {
    const z = (val - mean) / stdDev;
    if (Math.abs(z) > 2) {
      annotations.push({
        x: xVals[idx],
        y: val,
        marker: {
          size: 6,
          fillColor: '#ef4444',
          strokeColor: '#ffffff',
          radius: 4
        },
        label: {
          borderColor: '#ef4444',
          style: {
            color: '#fff',
            background: '#ef4444',
            fontSize: '9px',
            padding: { left: 4, right: 4, top: 2, bottom: 2 }
          },
          text: `Outlier (Z=${z.toFixed(1)})`
        }
      });
    }
  });
  return annotations;
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

// Regression Forecasting Math
function calculateForecast(xData, yData, forecastPeriods = 6) {
  const N = xData.length;
  if (N < 3) return null;
  
  const xIndices = Array.from({ length: N }, (_, i) => i);
  
  const meanX = xIndices.reduce((a, b) => a + b, 0) / N;
  const meanY = yData.reduce((a, b) => a + b, 0) / N;
  
  let num = 0;
  let den = 0;
  for (let i = 0; i < N; i++) {
    num += (xIndices[i] - meanX) * (yData[i] - meanY);
    den += Math.pow(xIndices[i] - meanX, 2);
  }
  
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  
  let sumSqRes = 0;
  for (let i = 0; i < N; i++) {
    const pred = slope * xIndices[i] + intercept;
    sumSqRes += Math.pow(yData[i] - pred, 2);
  }
  
  const stdErrorEst = Math.sqrt(sumSqRes / (N - 2)) || 0;
  const sumSqXDiff = xIndices.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0) || 1;
  
  const futureY = [];
  const futureUpper = [];
  const futureLower = [];
  
  for (let k = 0; k < forecastPeriods; k++) {
    const xNew = N + k;
    const pred = slope * xNew + intercept;
    
    // Calculate standard error for confidence interval (t-critical ~ 1.96 for 95% CI)
    const sePred = stdErrorEst * Math.sqrt(1 + 1/N + Math.pow(xNew - meanX, 2) / sumSqXDiff);
    const tVal = 1.96;
    
    futureY.push(pred);
    futureUpper.push(pred + tVal * sePred);
    futureLower.push(Math.max(0, pred - tVal * sePred));
  }
  
  return {
    futureY,
    futureUpper,
    futureLower
  };
}

function projectFutureDates(datesList, periodsCount, isDateSeries) {
  if (!isDateSeries || datesList.length < 2) {
    return Array.from({ length: periodsCount }, (_, i) => `Forecast ${i + 1}`);
  }
  
  const timestamps = datesList.map(d => Date.parse(d)).filter(t => !isNaN(t));
  if (timestamps.length < 2) {
    return Array.from({ length: periodsCount }, (_, i) => `Forecast ${i + 1}`);
  }
  
  let diffSum = 0;
  for (let i = 1; i < timestamps.length; i++) {
    diffSum += timestamps[i] - timestamps[i - 1];
  }
  const avgInterval = diffSum / (timestamps.length - 1);
  
  const lastTimestamp = timestamps[timestamps.length - 1];
  const futureDates = [];
  
  for (let i = 1; i <= periodsCount; i++) {
    const nextTimestamp = lastTimestamp + avgInterval * i;
    const nextDate = new Date(nextTimestamp);
    
    const yyyy = nextDate.getFullYear();
    const mm = String(nextDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nextDate.getDate()).padStart(2, '0');
    futureDates.push(`${yyyy}-${mm}-${dd}`);
  }
  
  return futureDates;
}

// SQL Query Parameter Parsing & Chips Handlers
function parseSqlParameters(sqlText) {
  const paramRegex = /\{\{([^}]+)\}\}/g;
  const matches = [];
  let match;
  while ((match = paramRegex.exec(sqlText)) !== null) {
    const name = match[1].trim();
    if (!matches.includes(name)) {
      matches.push(name);
    }
  }
  
  const container = document.getElementById("sql-params-container");
  const chipsContainer = document.getElementById("sql-params-chips");
  const inputsContainer = document.getElementById("sql-params-inputs");
  
  if (!container || !chipsContainer || !inputsContainer) return;
  
  if (matches.length === 0) {
    container.style.display = "none";
    activeSqlParams = [];
    return;
  }
  
  container.style.display = "flex";
  
  // Retain existing values from previous inputs
  const existingValues = {};
  activeSqlParams.forEach(name => {
    const input = document.getElementById(`param-input-${name}`);
    if (input) {
      existingValues[name] = input.value;
    }
  });
  
  activeSqlParams = matches;
  
  // Generate chips and input fields
  chipsContainer.innerHTML = "";
  inputsContainer.innerHTML = "";
  
  matches.forEach(name => {
    const savedVal = existingValues[name] || "";
    const isBound = savedVal.trim() !== "";
    const chipClass = isBound ? "param-chip bound" : "param-chip unbound";
    const dotIcon = isBound ? '<i class="fa-solid fa-circle-check"></i>' : '<i class="fa-solid fa-circle-minus"></i>';
    
    // Append Chip
    chipsContainer.innerHTML += `
      <div class="${chipClass}" id="param-chip-${name}">
        ${dotIcon}
        <span>${name}</span>
      </div>
    `;
    
    // Append Input Field
    inputsContainer.innerHTML += `
      <div class="select-group">
        <label style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">{{${name}}}</label>
        <input type="text" id="param-input-${name}" class="custom-select" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; margin-top: 4px; font-size: 12px; height: 32px;" value="${savedVal.replace(/"/g, '&quot;')}" placeholder="Enter value..." oninput="handleParamInput('${name}')">
      </div>
    `;
  });
}

function handleParamInput(name) {
  const input = document.getElementById(`param-input-${name}`);
  const chip = document.getElementById(`param-chip-${name}`);
  if (input && chip) {
    const value = input.value.trim();
    if (value !== "") {
      chip.className = "param-chip bound";
      chip.innerHTML = `<i class="fa-solid fa-circle-check"></i><span>${name}</span>`;
    } else {
      chip.className = "param-chip unbound";
      chip.innerHTML = `<i class="fa-solid fa-circle-minus"></i><span>${name}</span>`;
    }
  }
}

// Multi-Tag Filtering Handlers
function handleFilterColChange() {
  const colName = document.getElementById("filter-col-select").value;
  const valContainer = document.getElementById("filter-val-input-container");
  if (!colName || !valContainer) return;
  
  const colObj = dataProfile.columns.find(c => c.name === colName);
  const opSelect = document.getElementById("filter-op-select");
  
  if (!colObj) return;
  
  // Set default operator list based on type
  if (colObj.type === "Number") {
    opSelect.innerHTML = `
      <option value="=">=</option>
      <option value="!=">!=</option>
      <option value=">">&gt;</option>
      <option value="<">&lt;</option>
      <option value=">=">&gt;=</option>
      <option value="<=">&lt;=</option>
    `;
    valContainer.innerHTML = `<input type="number" id="filter-val-input" placeholder="e.g. 50" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; font-size: 12px; height: 100%;">`;
  } else if (colObj.type === "Date") {
    opSelect.innerHTML = `
      <option value="=">=</option>
      <option value="!=">!=</option>
      <option value=">">&gt;</option>
      <option value="<">&lt;</option>
      <option value=">=">&gt;=</option>
      <option value="<=">&lt;=</option>
    `;
    valContainer.innerHTML = `<input type="date" id="filter-val-input" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; font-size: 12px; height: 100%;">`;
  } else {
    // Text columns
    opSelect.innerHTML = `
      <option value="=">=</option>
      <option value="!=">!=</option>
      <option value="contains">Contains</option>
    `;
    
    // For small number of unique categories, show a select dropdown of options!
    if (colObj.unique <= 30) {
      // Extract unique sorted values
      const uniqueVals = [...new Set(currentDataset.map(r => r[colName]))]
        .filter(v => v !== null && v !== undefined && v !== "")
        .sort();
      
      let optHtml = `<select id="filter-val-input" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; font-size: 12px; height: 100%; cursor: pointer;">`;
      uniqueVals.forEach(v => {
        optHtml += `<option value="${v.replace(/"/g, '&quot;')}">${v}</option>`;
      });
      optHtml += `</select>`;
      valContainer.innerHTML = optHtml;
    } else {
      valContainer.innerHTML = `<input type="text" id="filter-val-input" placeholder="e.g. Pop" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; font-size: 12px; height: 100%;">`;
    }
  }
}

function addFilterBadge() {
  const colSelect = document.getElementById("filter-col-select");
  const opSelect = document.getElementById("filter-op-select");
  const valInput = document.getElementById("filter-val-input");
  
  if (!colSelect || !opSelect || !valInput) return;
  
  const column = colSelect.value;
  const operator = opSelect.value;
  const value = valInput.value.trim();
  
  if (value === "") {
    alert("Please enter or select a filter value.");
    return;
  }
  
  // Prevent duplicate filter rules
  const isDuplicate = activeFilters.some(f => f.column === column && f.operator === operator && f.value === value);
  if (isDuplicate) {
    alert("This filter rule is already applied.");
    return;
  }
  
  const newFilter = {
    id: "filter-" + Date.now(),
    column,
    operator,
    value
  };
  
  activeFilters.push(newFilter);
  
  // Re-run filter and render
  applyActiveFilters();
  renderFilterChips();
  
  // Reset input field if it was a text input
  if (valInput.tagName.toLowerCase() === "input" && valInput.type !== "date") {
    valInput.value = "";
  }
}

function removeFilterBadge(id) {
  const chip = document.getElementById(id);
  if (chip) {
    chip.classList.add("removing");
    // Wait for the exit animation to complete (240ms) before updating state
    setTimeout(() => {
      activeFilters = activeFilters.filter(f => f.id !== id);
      applyActiveFilters();
      renderFilterChips();
    }, 240);
  } else {
    activeFilters = activeFilters.filter(f => f.id !== id);
    applyActiveFilters();
    renderFilterChips();
  }
}

function clearAllFilters() {
  const chips = document.querySelectorAll(".filter-chip");
  if (chips.length > 0) {
    chips.forEach(chip => chip.classList.add("removing"));
    setTimeout(() => {
      activeFilters = [];
      applyActiveFilters();
      renderFilterChips();
    }, 240);
  } else {
    activeFilters = [];
    applyActiveFilters();
    renderFilterChips();
  }
}

function applyActiveFilters() {
  let filtered = JSON.parse(JSON.stringify(currentDataset)); // Deep copy from core dataset
  
  // Apply dashboard slicers
  for (let col in dashboardSlicers) {
    const value = dashboardSlicers[col];
    if (value && value !== "All") {
      filtered = filtered.filter(row => String(row[col]) === value);
    }
  }
  
  activeFilters.forEach(f => {
    filtered = filtered.filter(row => {
      let rawVal = row[f.column];
      if (rawVal === null || rawVal === undefined) return false;
      
      const colObj = dataProfile.columns.find(c => c.name === f.column);
      const isNum = colObj ? colObj.type === "Number" : false;
      const isDate = colObj ? colObj.type === "Date" : false;
      
      if (isNum) {
        const rowNum = Number(rawVal);
        const filterNum = Number(f.value);
        if (isNaN(rowNum) || isNaN(filterNum)) return false;
        
        switch (f.operator) {
          case "=": return rowNum === filterNum;
          case "!=": return rowNum !== filterNum;
          case ">": return rowNum > filterNum;
          case "<": return rowNum < filterNum;
          case ">=": return rowNum >= filterNum;
          case "<=": return rowNum <= filterNum;
          default: return true;
        }
      } else if (isDate) {
        const rowDate = Date.parse(rawVal);
        const filterDate = Date.parse(f.value);
        if (isNaN(rowDate) || isNaN(filterDate)) return false;
        
        switch (f.operator) {
          case "=": return rowDate === filterDate;
          case "!=": return rowDate !== filterDate;
          case ">": return rowDate > filterDate;
          case "<": return rowDate < filterDate;
          case ">=": return rowDate >= filterDate;
          case "<=": return rowDate <= filterDate;
          default: return true;
        }
      } else {
        // String text processing
        const rowStr = String(rawVal).toLowerCase().trim();
        const filterStr = String(f.value).toLowerCase().trim();
        
        switch (f.operator) {
          case "=": return rowStr === filterStr;
          case "!=": return rowStr !== filterStr;
          case "contains": return rowStr.includes(filterStr);
          default: return true;
        }
      }
    });
  });
  
  activeData = filtered;
  tablePage = 0; // reset to page 1
  renderDataTable();
  updateSidebarBadge();
  
  // Re-run outline calculation and profiler counters
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
  
  renderProfileUi();
  renderOutliersUi();
}

function renderFilterChips() {
  const container = document.getElementById("filter-chips-container");
  const clearBtn = document.getElementById("clear-filters-btn");
  if (!container) return;
  
  if (activeFilters.length === 0) {
    container.innerHTML = `<span style="font-size: 11px; color: var(--text-muted); font-style: italic;">No active filters. Displaying full dataset.</span>`;
    if (clearBtn) clearBtn.style.display = "none";
    return;
  }
  
  if (clearBtn) clearBtn.style.display = "block";
  
  let html = "";
  activeFilters.forEach(f => {
    let opLabel = f.operator;
    if (f.operator === "contains") opLabel = "contains";
    
    // Format large numbers in chips for aesthetics
    let displayVal = f.value;
    if (!isNaN(displayVal) && displayVal !== "") {
      const num = Number(displayVal);
      if (num >= 1e6) {
        displayVal = (num/1e6).toFixed(0) + "M";
      } else if (num >= 1e3) {
        displayVal = (num/1e3).toFixed(0) + "K";
      } else {
        displayVal = num.toLocaleString();
      }
    }
    
    html += `
      <div class="filter-chip" id="${f.id}">
        <span><strong>${f.column}</strong> ${opLabel} <em>"${displayVal}"</em></span>
        <div class="filter-chip-remove" onclick="removeFilterBadge('${f.id}')" title="Remove filter">
          <i class="fa-solid fa-xmark"></i>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// Global dashboard slicers state
let dashboardSlicers = {};

// Register datasets in AlaSQL database context
function registerTablesInAlaSql() {
  alasql.tables = alasql.tables || {};
  alasql.tables.data = { data: activeData };
  for (let tableName in loadedDatasets) {
    if (tableName !== 'data') {
      alasql.tables[tableName] = { data: loadedDatasets[tableName] };
    }
  }
}

// Populate insert buttons in Calculated Columns Card
function populateFormulaHelpers() {
  const container = document.getElementById("formula-helper-buttons");
  if (!container) return;
  container.innerHTML = "";
  
  if (dataProfile.columns.length === 0) return;
  
  dataProfile.columns.forEach(col => {
    if (col.type === "Number") {
      const btn = document.createElement("button");
      btn.className = "sql-snippet-btn";
      btn.style.fontSize = "10px";
      btn.style.padding = "2px 6px";
      btn.textContent = `[${col.name}]`;
      btn.onclick = () => {
        const input = document.getElementById("formula-expression");
        input.value += `[${col.name}]`;
        input.focus();
      };
      container.appendChild(btn);
    }
  });
}

// Create Calculated Column Formula
function createFormulaColumn() {
  const colName = document.getElementById("formula-col-name").value.trim();
  const expression = document.getElementById("formula-expression").value.trim();
  
  if (!colName) {
    alert("Please enter a new column name.");
    return;
  }
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(colName)) {
    alert("Column name must start with a letter/underscore and contain only alphanumeric characters/underscores.");
    return;
  }
  if (activeData.length > 0 && activeData[0].hasOwnProperty(colName)) {
    alert(`Column "${colName}" already exists.`);
    return;
  }
  if (!expression) {
    alert("Please enter a formula expression.");
    return;
  }
  
  const colRegex = /\[([^\]]+)\]/g;
  const referencedCols = [];
  let match;
  while ((match = colRegex.exec(expression)) !== null) {
    referencedCols.push(match[1]);
  }
  
  if (referencedCols.length === 0) {
    alert("Your formula should reference at least one column using [ColumnName] syntax.");
    return;
  }
  
  for (let col of referencedCols) {
    const colObj = dataProfile.columns.find(c => c.name === col);
    if (!colObj) {
      alert(`Referenced column "${col}" does not exist in the dataset.`);
      return;
    }
  }
  
  let cleanExpr = expression;
  referencedCols.forEach(col => {
    cleanExpr = cleanExpr.replace(new RegExp(`\\[${escapeRegExp(col)}\\]`, 'g'), "1");
  });
  
  if (!/^[0-9+\-*/().\s]+$/.test(cleanExpr)) {
    alert("Invalid formula expression. Only standard arithmetic operators (+, -, *, /) and parentheses are allowed.");
    return;
  }
  
  try {
    Function(`"use strict"; return (${cleanExpr})`)();
  } catch (e) {
    alert(`Syntax error in formula: ${e.message}`);
    return;
  }
  
  function evaluateRow(row) {
    let rowExpr = expression;
    referencedCols.forEach(col => {
      const val = row[col] !== null && row[col] !== undefined ? Number(row[col]) : 0;
      rowExpr = rowExpr.replace(new RegExp(`\\[${escapeRegExp(col)}\\]`, 'g'), isNaN(val) ? "0" : String(val));
    });
    try {
      const result = Function(`"use strict"; return (${rowExpr})`)();
      return isNaN(result) || !isFinite(result) ? 0 : result;
    } catch (e) {
      return 0;
    }
  }
  
  activeData.forEach(row => {
    row[colName] = evaluateRow(row);
  });
  currentDataset.forEach(row => {
    row[colName] = evaluateRow(row);
  });
  
  alert(`Calculated Column Created: Added "${colName}" to the dataset.`);
  
  document.getElementById("formula-col-name").value = "";
  document.getElementById("formula-expression").value = "";
  
  profileSchema();
  renderDataTable();
  initSelectDropdowns();
  initSqlConsole();
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Pearson Correlation Coefficient Matrix Heatmap
function renderCorrelationHeatmap() {
  const container = document.getElementById("correlation-heatmap-container");
  if (!container) return;
  
  const numCols = dataProfile.numericCols;
  if (activeData.length === 0 || numCols.length < 2) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 24px; font-size: 12px;">Need at least 2 numerical columns to calculate correlation.</div>`;
    return;
  }
  
  const matrix = {};
  numCols.forEach(c1 => {
    matrix[c1] = {};
    numCols.forEach(c2 => {
      if (c1 === c2) {
        matrix[c1][c2] = 1.0;
      } else {
        const x = activeData.map(r => Number(r[c1])).filter(v => !isNaN(v));
        const y = activeData.map(r => Number(r[c2])).filter(v => !isNaN(v));
        const N = Math.min(x.length, y.length);
        if (N < 2) {
          matrix[c1][c2] = 0;
          return;
        }
        
        const meanX = x.reduce((a, b) => a + b, 0) / N;
        const meanY = y.reduce((a, b) => a + b, 0) / N;
        let num = 0;
        let denX = 0;
        let denY = 0;
        
        for (let i = 0; i < N; i++) {
          const diffX = x[i] - meanX;
          const diffY = y[i] - meanY;
          num += diffX * diffY;
          denX += diffX * diffX;
          denY += diffY * diffY;
        }
        
        const r = denX === 0 || denY === 0 ? 0 : num / Math.sqrt(denX * denY);
        matrix[c1][c2] = r;
      }
    });
  });
  
  let html = `<table class="correlation-table" style="width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed;">`;
  html += `<tr><th style="padding: 6px; text-align: left; background: var(--bg-panel-solid); border: 1px solid var(--border-color); font-weight: 700; width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Metric</th>`;
  numCols.forEach(c => {
    html += `<th style="padding: 6px; text-align: center; background: var(--bg-panel-solid); border: 1px solid var(--border-color); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c}">${c}</th>`;
  });
  html += `</tr>`;
  
  numCols.forEach(c1 => {
    html += `<tr><td style="padding: 6px; text-align: left; background: var(--bg-panel-solid); border: 1px solid var(--border-color); font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${c1}">${c1}</td>`;
    numCols.forEach(c2 => {
      const r = matrix[c1][c2];
      let bgStyle = "";
      const absR = Math.abs(r);
      if (r > 0.01) {
        bgStyle = `background-color: rgba(16, 185, 129, ${r.toFixed(2)});`;
      } else if (r < -0.01) {
        bgStyle = `background-color: rgba(239, 64, 64, ${absR.toFixed(2)});`;
      } else {
        bgStyle = `background-color: rgba(255, 255, 255, 0.02);`;
      }
      html += `<td style="padding: 8px 4px; text-align: center; border: 1px solid var(--border-color); ${bgStyle} color: var(--text-main); font-weight: 600;" title="Correlation between ${c1} and ${c2}: ${r.toFixed(3)}">${r.toFixed(2)}</td>`;
    });
    html += `</tr>`;
  });
  html += `</table>`;
  container.innerHTML = html;
}

// Global Dashboard Slicers Renderer
function renderDashboardSlicers() {
  const container = document.getElementById("dashboard-slicer-container");
  if (!container) return;
  
  const slicerCols = dataProfile.columns.filter(col => col.type === "Text" && col.unique <= 15 && col.name !== "OrderID" && col.name !== "SKU");
  if (slicerCols.length === 0) {
    container.style.display = "none";
    return;
  }
  
  container.style.display = "flex";
  
  let html = `
    <div style="font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 6px; color: var(--text-main); width: 100%; margin-bottom: 2px;">
      <i class="fa-solid fa-filter" style="color: var(--primary-color);"></i> Global Dashboard Slicers
    </div>
  `;
  
  slicerCols.forEach(col => {
    const colName = col.name;
    const uniqueVals = [...new Set(currentDataset.map(r => r[colName]))]
      .filter(v => v !== null && v !== undefined && v !== "")
      .sort();
      
    const currentSelected = dashboardSlicers[colName] || "All";
    
    html += `
      <div class="select-group" style="min-width: 160px; flex: 0 1 auto;">
        <label style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Filter by ${colName}</label>
        <select class="custom-select dashboard-slicer-select" style="background-color: var(--bg-panel-solid); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 6px; padding: 6px 10px; width: 100%; outline: none; margin-top: 4px; font-size: 12px; height: 32px;" onchange="handleSlicerChange('${colName}', this.value)">
          <option value="All">All ${colName}s</option>
    `;
    
    uniqueVals.forEach(v => {
      const isSel = currentSelected === v ? " selected" : "";
      html += `<option value="${v.replace(/"/g, '&quot;')}"${isSel}>${v}</option>`;
    });
    
    html += `
        </select>
      </div>
    `;
  });
  
  const hasActiveSlicer = Object.values(dashboardSlicers).some(v => v !== "All");
  if (hasActiveSlicer) {
    html += `
      <button class="btn btn-secondary btn-sm" onclick="clearDashboardSlicers()" style="height: 32px; padding: 0 14px; margin-bottom: 0;">
        Clear Slicers
      </button>
    `;
  }
  
  container.innerHTML = html;
}

function handleSlicerChange(colName, value) {
  if (value === "All") {
    delete dashboardSlicers[colName];
  } else {
    dashboardSlicers[colName] = value;
  }
  applyDashboardSlices();
  renderDashboard();
}

function clearDashboardSlicers() {
  dashboardSlicers = {};
  applyDashboardSlices();
  renderDashboard();
}

function applyDashboardSlices() {
  applyActiveFilters();
}

// PDF Exporter Trigger
function exportPrintReport() {
  window.print();
}

// Standalone Exporter Trigger
function exportStandaloneReport() {
  if (activeData.length === 0) return;
  
  const serializedData = JSON.stringify(activeData);
  const serializedWidgets = JSON.stringify(dashboardCharts);
  const serializedTheme = currentTheme;
  
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Athena AI - Standalone Dashboard Report</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script src="https://cdn.jsdelivr.net/npm/alasql@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>
  <style>
    :root {
      --bg-main: #060813;
      --bg-panel: rgba(13, 20, 35, 0.45);
      --border-color: rgba(255, 255, 255, 0.08);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --primary-color: #6366f1;
      --accent-color: #06b6d4;
      --secondary-color: #10b981;
      --warning: #f59e0b;
    }
    
    body {
      background-color: var(--bg-main);
      color: var(--text-main);
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 24px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    header {
      margin-bottom: 24px;
      border-bottom: 1px solid var(--border-color);
      padding-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    h1 {
      font-size: 24px;
      margin: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .glass-card {
      background: var(--bg-panel);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
    }
    
    .kpi-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .kpi-value {
      font-size: 28px;
      font-weight: 800;
      display: block;
    }
    
    .kpi-label {
      font-size: 12px;
      color: var(--text-muted);
      margin-top: 4px;
      display: block;
    }
    
    .kpi-icon {
      font-size: 24px;
    }
    
    .col-span-2 {
      grid-column: span 2;
    }
    
    .chart-card-wrapper {
      min-height: 300px;
    }
    
    .chart-title {
      font-size: 14px;
      margin-top: 0;
      margin-bottom: 12px;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1><i class="fa-solid fa-brain" style="color: var(--accent-color);"></i> Athena AI Dashboard Report</h1>
      <span style="color: var(--text-muted); font-size: 12px;">Exported Standalone: ${new Date().toLocaleString()}</span>
    </header>
    
    <div class="grid" id="kpi-grid"></div>
    <div class="grid" id="chart-grid"></div>
  </div>
  
  <script>
    const activeData = ${serializedData};
    const dashboardCharts = ${serializedWidgets};
    const currentTheme = "${serializedTheme}";
    
    const themePalettes = {
      indigo: ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#a855f7'],
      cyberpunk: ['#d946ef', '#06b6d4', '#a855f7', '#ec4899', '#f43f5e', '#f59e0b'],
      emerald: ['#10b981', '#3b82f6', '#14b8a6', '#06b6d4', '#22c55e', '#84cc16'],
      solar: ['#f97316', '#ef4444', '#eab308', '#f43f5e', '#f59e0b', '#ea580c'],
      graphite: ['#94a3b8', '#64748b', '#cbd5e1', '#475569', '#334155', '#1e293b']
    };
    
    const colors = themePalettes[currentTheme] || themePalettes.indigo;
    
    const totalRecs = activeData.length;
    const numericCols = Object.keys(activeData[0] || {}).filter(k => typeof activeData[0][k] === 'number');
    const firstCol = numericCols[0];
    const secondCol = numericCols[1] || firstCol;
    
    const sumFirst = firstCol ? activeData.reduce((sum, r) => sum + (Number(r[firstCol]) || 0), 0) : 0;
    const avgFirst = firstCol ? (sumFirst / totalRecs) : 0;
    const sumSecond = secondCol ? activeData.reduce((sum, r) => sum + (Number(r[secondCol]) || 0), 0) : 0;
    
    const formatVal = (val, name) => {
      if (name && (name.toLowerCase().includes("streams") || name.toLowerCase().includes("views"))) {
        if (val >= 1e9) return (val/1e9).toFixed(1) + "B";
        if (val >= 1e6) return (val/1e6).toFixed(1) + "M";
        return val.toLocaleString();
      }
      if (name && (name.toLowerCase().includes("revenue") || name.toLowerCase().includes("profit") || name.toLowerCase().includes("cost") || name.toLowerCase().includes("price"))) {
        if (val >= 1e6) return "$" + (val/1e6).toFixed(1) + "M";
        return "$" + val.toLocaleString(undefined, {maximumFractionDigits: 0});
      }
      return val.toLocaleString(undefined, {maximumFractionDigits: 1});
    };
    
    document.getElementById("kpi-grid").innerHTML = \`
      <div class="glass-card kpi-card">
        <div>
          <span class="kpi-value">\${totalRecs}</span>
          <span class="kpi-label">Total Records</span>
        </div>
        <i class="fa-solid fa-calculator kpi-icon" style="color: var(--accent-color);"></i>
      </div>
      <div class="glass-card kpi-card">
        <div>
          <span class="kpi-value">\${firstCol ? formatVal(sumFirst, firstCol) : "N/A"}</span>
          <span class="kpi-label">Sum of \${firstCol || "Metric"}</span>
        </div>
        <i class="fa-solid fa-coins kpi-icon" style="color: var(--secondary-color);"></i>
      </div>
      <div class="glass-card kpi-card">
        <div>
          <span class="kpi-value">\${firstCol ? formatVal(avgFirst, firstCol) : "N/A"}</span>
          <span class="kpi-label">Average \${firstCol || "Metric"}</span>
        </div>
        <i class="fa-solid fa-chart-line kpi-icon" style="color: var(--primary-color);"></i>
      </div>
      <div class="glass-card kpi-card">
        <div>
          <span class="kpi-value">\${secondCol ? formatVal(sumSecond, secondCol) : "N/A"}</span>
          <span class="kpi-label">Total \${secondCol || "Metric"}</span>
        </div>
        <i class="fa-solid fa-scale-balanced kpi-icon" style="color: var(--warning);"></i>
      </div>
    \`;
    
    const chartGrid = document.getElementById("chart-grid");
    dashboardCharts.forEach(widget => {
      const widgetId = "c-" + widget.id;
      chartGrid.innerHTML += \`
        <div class="glass-card chart-card-wrapper col-span-2">
          <h3 class="chart-title">\${widget.title}</h3>
          <div id="\${widgetId}"></div>
        </div>
      \`;
      
      setTimeout(() => {
        const yAxisList = Array.isArray(widget.yaxis) ? widget.yaxis : [widget.yaxis];
        let series = [];
        let xCategories = [];
        
        if (widget.agg !== "NONE") {
          const selectFields = yAxisList.map(col => \`\${widget.agg}([\${col}]) AS [\${col}]\`).join(", ");
          const sqlQuery = \`SELECT [\${widget.xaxis}] AS X, \${selectFields} FROM ? GROUP BY [\${widget.xaxis}]\`;
          
          try {
            const aggResult = alasql(sqlQuery, [activeData]);
            xCategories = aggResult.map(r => String(r.X));
            
            yAxisList.forEach(col => {
              series.push({
                name: col,
                type: widget.type === 'combo' ? 'column' : widget.type,
                data: aggResult.map(r => Number(r[col]) || 0)
              });
            });
          } catch(e) {
            document.getElementById(widgetId).innerText = "Execution error: " + e.message;
            return;
          }
        } else {
          yAxisList.forEach(col => {
            const chartData = activeData.slice(0, 100).map(row => ({
              x: row[widget.xaxis],
              y: Number(row[col]) || 0
            }));
            series.push({
              name: col,
              data: chartData.map(d => ({ x: Number(d.x) || d.x, y: d.y }))
            });
          });
          xCategories = activeData.slice(0, 100).map(row => String(row[widget.xaxis]));
        }
        
        const options = {
          chart: {
            type: widget.type === 'donut' ? 'donut' : (widget.type === 'combo' ? 'line' : widget.type),
            height: 260,
            foreColor: '#94a3b8',
            background: 'transparent',
            toolbar: { show: false }
          },
          theme: { mode: 'dark' },
          colors: widget.type === 'donut' ? colors : colors.slice(0, yAxisList.length),
          stroke: { curve: 'smooth', width: 2 },
          plotOptions: { bar: { borderRadius: 4 } },
          series: widget.type === 'donut' ? series[0].data : series,
          labels: widget.type === 'donut' ? xCategories : undefined,
          xaxis: widget.type !== 'donut' ? { categories: xCategories } : undefined,
          grid: { borderColor: 'rgba(255,255,255,0.05)' }
        };
        
        new ApexCharts(document.getElementById(widgetId), options).render();
      }, 50);
    });
  </script>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `athena_standalone_dashboard.html`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// SQL editor auto-complete keywords
const sqlKeywords = [
  "SELECT", "FROM", "WHERE", "GROUP BY", "ORDER BY", "LIMIT", "JOIN", "ON", 
  "UNION", "LEFT JOIN", "INNER JOIN", "AS", "AND", "OR", "SUM", "AVG", "COUNT", 
  "MAX", "MIN", "LIKE", "DESC", "ASC"
];

let selectedSuggestionIndex = -1;
let currentSuggestions = [];

function getAutocompleteSuggestions() {
  const columns = new Set();
  const tables = Object.keys(loadedDatasets);
  
  for (let tableName in loadedDatasets) {
    const dataset = loadedDatasets[tableName];
    if (dataset && dataset.length > 0) {
      Object.keys(dataset[0]).forEach(col => columns.add(col));
    }
  }
  
  return {
    keywords: sqlKeywords,
    tables: tables,
    columns: Array.from(columns)
  };
}

function initSqlAutocomplete() {
  const textarea = document.getElementById("sql-editor-textarea");
  const box = document.getElementById("sql-autocomplete-box");
  if (!textarea || !box) return;
  
  textarea.addEventListener("input", (e) => {
    showSuggestions();
  });
  
  textarea.addEventListener("keydown", (e) => {
    if (box.style.display !== "none") {
      const items = box.querySelectorAll(".autocomplete-suggestion-item");
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex + 1) % items.length;
        updateSelectedSuggestion(items);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedSuggestionIndex = (selectedSuggestionIndex - 1 + items.length) % items.length;
        updateSelectedSuggestion(items);
      } else if (e.key === "Enter" || e.key === "Tab") {
        if (selectedSuggestionIndex > -1 && items[selectedSuggestionIndex]) {
          e.preventDefault();
          insertSuggestion(currentSuggestions[selectedSuggestionIndex].value);
        }
      } else if (e.key === "Escape") {
        box.style.display = "none";
      }
    }
  });
  
  document.addEventListener("click", (e) => {
    if (e.target !== textarea && !box.contains(e.target)) {
      box.style.display = "none";
    }
  });
}

function updateSelectedSuggestion(items) {
  items.forEach((item, idx) => {
    if (idx === selectedSuggestionIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}

function showSuggestions() {
  const textarea = document.getElementById("sql-editor-textarea");
  const box = document.getElementById("sql-autocomplete-box");
  
  const text = textarea.value;
  const cursorIdx = textarea.selectionStart;
  
  const textBeforeCursor = text.substring(0, cursorIdx);
  const words = textBeforeCursor.split(/[\s,()=+\-*/]/);
  const currentWord = words[words.length - 1].trim();
  
  if (currentWord.length === 0) {
    box.style.display = "none";
    return;
  }
  
  const dictionary = getAutocompleteSuggestions();
  const matches = [];
  const query = currentWord.toLowerCase();
  
  dictionary.keywords.forEach(kw => {
    if (kw.toLowerCase().startsWith(query)) {
      matches.push({ value: kw, type: "keyword" });
    }
  });
  
  dictionary.tables.forEach(tbl => {
    if (tbl.toLowerCase().startsWith(query)) {
      matches.push({ value: tbl, type: "table" });
    }
  });
  
  dictionary.columns.forEach(col => {
    if (col.toLowerCase().startsWith(query)) {
      matches.push({ value: `[${col}]`, type: "column", rawValue: col });
    }
  });
  
  if (matches.length === 0) {
    box.style.display = "none";
    return;
  }
  
  currentSuggestions = matches;
  selectedSuggestionIndex = 0;
  
  let html = "";
  matches.forEach((m, idx) => {
    const isSel = idx === 0 ? " selected" : "";
    const displayVal = m.rawValue || m.value;
    html += `
      <div class="autocomplete-suggestion-item${isSel}" onclick="insertSuggestion('${m.value.replace(/'/g, "\\'")}')">
        <span>${displayVal}</span>
        <span class="autocomplete-suggestion-type" style="color: ${m.type === 'keyword' ? 'var(--primary-color)' : (m.type === 'table' ? 'var(--accent-color)' : 'var(--secondary-color)')}">${m.type}</span>
      </div>
    `;
  });
  box.innerHTML = html;
  
  box.style.left = "10px";
  box.style.top = "100px";
  box.style.display = "block";
}

function insertSuggestion(val) {
  const textarea = document.getElementById("sql-editor-textarea");
  const box = document.getElementById("sql-autocomplete-box");
  
  const text = textarea.value;
  const cursorIdx = textarea.selectionStart;
  
  const textBeforeCursor = text.substring(0, cursorIdx);
  const textAfterCursor = text.substring(cursorIdx);
  
  const words = textBeforeCursor.split(/([\s,()=+\-*/])/);
  words[words.length - 1] = val + " ";
  
  const newTextBefore = words.join("");
  textarea.value = newTextBefore + textAfterCursor;
  
  box.style.display = "none";
  textarea.focus();
  
  const newCursor = newTextBefore.length;
  textarea.setSelectionRange(newCursor, newCursor);
}

// Voice Recognition & Copilot Anomaly Scanner (Option 6)
let voiceRecognitionInstance = null;

function startVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    alert("Speech Recognition API is not supported in this browser. Please try Chrome or Edge.");
    return;
  }
  
  const voiceBtn = document.getElementById("chat-voice-btn");
  if (!voiceBtn) return;
  
  if (voiceRecognitionInstance) {
    voiceRecognitionInstance.stop();
    voiceRecognitionInstance = null;
    return;
  }
  
  try {
    voiceRecognitionInstance = new SpeechRecognition();
    voiceRecognitionInstance.lang = 'en-US';
    voiceRecognitionInstance.interimResults = false;
    voiceRecognitionInstance.maxAlternatives = 1;
    
    voiceBtn.classList.add("mic-active");
    voiceBtn.innerHTML = `<i class="fa-solid fa-microphone-slash"></i>`;
    
    voiceRecognitionInstance.onresult = (event) => {
      const speechToText = event.results[0][0].transcript;
      const chatInput = document.getElementById("chat-input-field");
      if (chatInput) {
        chatInput.value = speechToText;
        submitChatQuery();
      }
    };
    
    voiceRecognitionInstance.onspeechend = () => {
      voiceRecognitionInstance.stop();
    };
    
    voiceRecognitionInstance.onend = () => {
      voiceBtn.classList.remove("mic-active");
      voiceBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      voiceRecognitionInstance = null;
    };
    
    voiceRecognitionInstance.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      voiceBtn.classList.remove("mic-active");
      voiceBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
      voiceRecognitionInstance = null;
    };
    
    voiceRecognitionInstance.start();
  } catch (err) {
    console.error("Failed to start speech recognition:", err);
    voiceBtn.classList.remove("mic-active");
    voiceBtn.innerHTML = `<i class="fa-solid fa-microphone"></i>`;
    voiceRecognitionInstance = null;
  }
}

function runAutomatedAnomalyScan() {
  if (activeData.length === 0) {
    alert("Please load a dataset first.");
    return;
  }
  
  const messages = document.getElementById("chat-bubble-messages");
  if (!messages) return;
  
  // Show user action trigger message
  messages.innerHTML += `
    <div class="message-bubble message-user" style="display: flex; align-items: center; gap: 8px;">
      <i class="fa-solid fa-wand-magic-sparkles" style="color: var(--primary-color);"></i>
      <span>Triggered automated data anomaly scan.</span>
    </div>
  `;
  messages.scrollTop = messages.scrollHeight;
  
  setTimeout(() => {
    const anomalies = [];
    
    // 1. Scan for missing value columns (Null percentages)
    dataProfile.columns.forEach(col => {
      if (col.nulls > 0) {
        const pct = Math.round((col.nulls / dataProfile.rowCount) * 100);
        if (pct > 20) {
          anomalies.push({
            level: 'warning',
            text: `Column <strong>${col.name}</strong> contains a high ratio of missing values (<strong>${pct}% nulls</strong>). This could skew aggregates.`
          });
        } else {
          anomalies.push({
            level: 'info',
            text: `Column <strong>${col.name}</strong> contains minor null values (<strong>${col.nulls} records</strong>). Consider using Drop/Impute Null rows.`
          });
        }
      }
    });
    
    // 2. Scan for numerical outlier density
    dataProfile.numericCols.forEach(col => {
      const stats = colOutlierStats[col];
      if (stats && stats.count > 0) {
        const pct = ((stats.count / activeData.length) * 100).toFixed(1);
        const level = stats.count > activeData.length * 0.1 ? 'danger' : 'warning';
        anomalies.push({
          level: level,
          text: `Detected <strong>${stats.count} outliers</strong> in <strong>${col}</strong> (${pct}% of rows exceed 2 standard deviations). Consider Z-Score normalisation or Median Imputation.`
        });
      }
    });
    
    // 3. Scan for category uniqueness/skewness (cardinality checks)
    dataProfile.columns.forEach(col => {
      if (col.type === 'Text') {
        if (col.unique === 1) {
          anomalies.push({
            level: 'warning',
            text: `Column <strong>${col.name}</strong> has only <strong>1 unique value</strong>. It contains no statistical variance.`
          });
        } else if (col.unique > dataProfile.rowCount * 0.9 && dataProfile.rowCount > 10) {
          anomalies.push({
            level: 'info',
            text: `High cardinality detected on <strong>${col.name}</strong> (<strong>${col.unique} unique values</strong>). Likely acts as an identifier rather than group index.`
          });
        }
      }
    });
    
    // Compile and render the report response
    let reportHtml = `
      <div style="font-family: var(--font-sans); font-size: 13px;">
        <h4 style="font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; color: var(--accent-color);">
          <i class="fa-solid fa-square-poll-vertical"></i> Automated Data Anomaly Report
        </h4>
        <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 12px;">Scanning dimensions, metric distributions, and missing record densities...</p>
    `;
    
    if (anomalies.length === 0) {
      reportHtml += `
        <div style="display: flex; gap: 10px; align-items: center; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 8px; padding: 12px; font-size: 12px; color: var(--text-main);">
          <i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 16px;"></i>
          <span>No structural skews, high-null ratios, or significant outliers detected. The dataset is clean.</span>
        </div>
      `;
    } else {
      reportHtml += `<ul style="display: flex; flex-direction: column; gap: 8px; list-style: none; padding-left: 0; margin-top: 8px;">`;
      anomalies.forEach(an => {
        let icon = 'fa-circle-info';
        let color = 'var(--accent-color)';
        let bg = 'rgba(6, 182, 212, 0.03)';
        let border = 'rgba(6, 182, 212, 0.1)';
        
        if (an.level === 'warning') {
          icon = 'fa-triangle-exclamation';
          color = 'var(--warning)';
          bg = 'rgba(234, 179, 8, 0.03)';
          border = 'rgba(234, 179, 8, 0.15)';
        } else if (an.level === 'danger') {
          icon = 'fa-circle-xmark';
          color = 'var(--danger)';
          bg = 'rgba(239, 68, 68, 0.03)';
          border = 'rgba(239, 68, 68, 0.15)';
        }
        
        reportHtml += `
          <li style="display: flex; gap: 8px; background: ${bg}; border: 1px solid ${border}; border-radius: 8px; padding: 8px 12px; align-items: flex-start; line-height: 1.4;">
            <i class="fa-solid ${icon}" style="color: ${color}; font-size: 14px; margin-top: 2px; flex-shrink: 0;"></i>
            <span style="font-size: 11px;">${an.text}</span>
          </li>
        `;
      });
      reportHtml += `</ul>`;
    }
    
    reportHtml += `</div>`;
    
    messages.innerHTML += `
      <div class="message-bubble message-assistant">
        ${reportHtml}
      </div>
    `;
    
    messages.scrollTop = messages.scrollHeight;
  }, 700);
}







