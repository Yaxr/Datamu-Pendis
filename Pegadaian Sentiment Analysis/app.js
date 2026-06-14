/* ============================================================
   APP.JS — Cicil Emas Dashboard
   CSV parsing, Chart.js rendering, filtering, table pagination
   ============================================================ */

// ── Global State ──
let allData = [];
let filteredData = [];
let charts = {};
let currentPage = 1;
const ROWS_PER_PAGE = 12;

// ── Color Constants for Charts ──
const COLORS = {
  gold:       '#F5C542',
  goldFaded:  'rgba(245,197,66,0.15)',
  green:      '#4CAF50',
  greenFaded: 'rgba(76,175,80,0.15)',
  red:        '#EF5350',
  redFaded:   'rgba(239,83,80,0.15)',
  blue:       '#42A5F5',
  blueFaded:  'rgba(66,165,245,0.15)',
  purple:     '#AB47BC',
  purpleFaded:'rgba(171,71,188,0.15)',
  orange:     '#FFA726',
  orangeFaded:'rgba(255,167,38,0.15)',
};

const ASPEK_COLORS = {
  'Aplikasi Digital (Bug/UI)':    { bg: COLORS.blueFaded,   border: COLORS.blue   },
  'Biaya & Administrasi':         { bg: COLORS.orangeFaded, border: COLORS.orange  },
  'Harga Emas & Gadai':           { bg: COLORS.goldFaded,   border: COLORS.gold    },
  'Customer Service / Pelayanan': { bg: COLORS.purpleFaded, border: COLORS.purple  },
  'Fitur Produk / Transaksi':     { bg: COLORS.greenFaded,  border: COLORS.green   },
};

const ASPEK_SOLID_COLORS = {
  'Aplikasi Digital (Bug/UI)':    COLORS.blue,
  'Biaya & Administrasi':         COLORS.orange,
  'Harga Emas & Gadai':           COLORS.gold,
  'Customer Service / Pelayanan': COLORS.purple,
  'Fitur Produk / Transaksi':     COLORS.green,
};

// ── CSV Parser ──
function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const result = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    if (values.length >= headers.length) {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h.trim()] = (values[idx] || '').trim();
      });
      result.push(obj);
    }
  }
  return result;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

// ── Data Processing Helpers ──
function getUniqueAspeks(data) {
  return [...new Set(data.map(d => d.Aspek_Bisnis))].sort();
}

function getDateRange(data) {
  const dates = data.map(d => d.Tanggal).filter(Boolean).sort();
  return { min: dates[0], max: dates[dates.length - 1] };
}

function countBy(data, key) {
  const counts = {};
  data.forEach(d => {
    const val = d[key];
    counts[val] = (counts[val] || 0) + 1;
  });
  return counts;
}

function countSentimenPerAspek(data) {
  const result = {};
  data.forEach(d => {
    if (!result[d.Aspek_Bisnis]) {
      result[d.Aspek_Bisnis] = { Positif: 0, Negatif: 0 };
    }
    result[d.Aspek_Bisnis][d.Sentimen]++;
  });
  return result;
}

function countSentimenPerDate(data) {
  const result = {};
  data.forEach(d => {
    if (!result[d.Tanggal]) {
      result[d.Tanggal] = { Positif: 0, Negatif: 0 };
    }
    result[d.Tanggal][d.Sentimen]++;
  });
  return result;
}

// ── Animated Counter ──
function animateCounter(el, target, suffix = '') {
  const duration = 1200;
  const start = 0;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(start + (target - start) * eased);
    el.textContent = current.toLocaleString('id-ID') + suffix;
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ── Chart.js Defaults ──
function setChartDefaults() {
  Chart.defaults.color = '#8B949E';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyle = 'circle';
  Chart.defaults.plugins.legend.labels.padding = 16;
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(13,17,23,0.95)';
  Chart.defaults.plugins.tooltip.titleColor = '#F5C542';
  Chart.defaults.plugins.tooltip.bodyColor = '#F0F6FC';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(212,165,55,0.3)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 10;
  Chart.defaults.plugins.tooltip.padding = 12;
  Chart.defaults.plugins.tooltip.titleFont = { weight: '600' };
  if (Chart.defaults.scale) {
    if (!Chart.defaults.scale.grid) Chart.defaults.scale.grid = {};
    Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.04)';
    if (!Chart.defaults.scale.ticks) Chart.defaults.scale.ticks = {};
    Chart.defaults.scale.ticks.color = '#6E7681';
  }
}

// ── Render Charts ──
function renderDonutChart(data) {
  const sentimen = countBy(data, 'Sentimen');
  const pos = sentimen['Positif'] || 0;
  const neg = sentimen['Negatif'] || 0;
  const total = pos + neg;
  const pct = total > 0 ? Math.round((pos / total) * 100) : 0;

  // Update center label
  const centerVal = document.querySelector('.donut-center-label .value');
  const centerLbl = document.querySelector('.donut-center-label .label');
  if (centerVal) centerVal.textContent = pct + '%';
  if (centerLbl) centerLbl.textContent = 'Positif';

  const ctx = document.getElementById('donutChart');
  if (charts.donut) charts.donut.destroy();

  charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Positif', 'Negatif'],
      datasets: [{
        data: [pos, neg],
        backgroundColor: [COLORS.green, COLORS.red],
        borderColor: ['rgba(76,175,80,0.4)', 'rgba(239,83,80,0.4)'],
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '72%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 20, font: { size: 13 } }
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const val = ctx.raw;
              const pctVal = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
              return ` ${ctx.label}: ${val.toLocaleString('id-ID')} (${pctVal}%)`;
            }
          }
        }
      },
      animation: {
        animateScale: true,
        animateRotate: true,
        duration: 1000,
        easing: 'easeOutQuart'
      }
    }
  });
}

function renderBarChart(data) {
  const aspekSentimen = countSentimenPerAspek(data);
  const aspeks = Object.keys(aspekSentimen).sort();
  const posData = aspeks.map(a => aspekSentimen[a].Positif || 0);
  const negData = aspeks.map(a => aspekSentimen[a].Negatif || 0);

  // Shorten labels for chart
  const shortLabels = aspeks.map(a => {
    if (a.length > 22) return a.substring(0, 20) + '…';
    return a;
  });

  const ctx = document.getElementById('barChart');
  if (charts.bar) charts.bar.destroy();

  charts.bar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: shortLabels,
      datasets: [
        {
          label: 'Positif',
          data: posData,
          backgroundColor: COLORS.greenFaded,
          borderColor: COLORS.green,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: 'Negatif',
          data: negData,
          backgroundColor: COLORS.redFaded,
          borderColor: COLORS.red,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
        },
        tooltip: {
          callbacks: {
            title: (items) => aspeks[items[0].dataIndex] || items[0].label,
          }
        }
      },
      scales: {
        x: {
          ticks: { maxRotation: 25, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function renderLineChart(data) {
  const perDate = countSentimenPerDate(data);
  const dates = Object.keys(perDate).sort();
  const posData = dates.map(d => perDate[d].Positif || 0);
  const negData = dates.map(d => perDate[d].Negatif || 0);

  // Format date labels
  const labels = dates.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  const ctx = document.getElementById('lineChart');
  if (charts.line) charts.line.destroy();

  charts.line = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Positif',
          data: posData,
          borderColor: COLORS.green,
          backgroundColor: COLORS.greenFaded,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: COLORS.green,
          pointBorderColor: '#0D1117',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        },
        {
          label: 'Negatif',
          data: negData,
          borderColor: COLORS.red,
          backgroundColor: COLORS.redFaded,
          fill: true,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: COLORS.red,
          pointBorderColor: '#0D1117',
          pointBorderWidth: 2,
          borderWidth: 2.5,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          callbacks: {
            title: (items) => {
              const idx = items[0].dataIndex;
              return dates[idx];
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 12, font: { size: 11 } },
          grid: { display: false },
        },
        y: {
          beginAtZero: true
        }
      },
      animation: { duration: 1200, easing: 'easeOutQuart' }
    }
  });
}

function renderHorizontalBarChart(data) {
  const aspekSentimen = countSentimenPerAspek(data);
  const aspeks = Object.keys(aspekSentimen).sort();

  const posPercent = aspeks.map(a => {
    const total = (aspekSentimen[a].Positif || 0) + (aspekSentimen[a].Negatif || 0);
    return total > 0 ? Math.round(((aspekSentimen[a].Positif || 0) / total) * 100) : 0;
  });
  const negPercent = aspeks.map(a => {
    const total = (aspekSentimen[a].Positif || 0) + (aspekSentimen[a].Negatif || 0);
    return total > 0 ? Math.round(((aspekSentimen[a].Negatif || 0) / total) * 100) : 0;
  });

  const ctx = document.getElementById('hBarChart');
  if (charts.hbar) charts.hbar.destroy();

  charts.hbar = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: aspeks,
      datasets: [
        {
          label: '% Positif',
          data: posPercent,
          backgroundColor: COLORS.greenFaded,
          borderColor: COLORS.green,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        },
        {
          label: '% Negatif',
          data: negPercent,
          backgroundColor: COLORS.redFaded,
          borderColor: COLORS.red,
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false,
        }
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw}%`
          }
        }
      },
      scales: {
        x: {
          max: 100,
          ticks: { callback: v => v + '%', stepSize: 25 },
        },
        y: {
          ticks: { font: { size: 11 } },
          grid: { display: false },
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

function renderRadarChart(data) {
  const aspekCount = countBy(data, 'Aspek_Bisnis');
  const aspeks = Object.keys(aspekCount).sort();
  const counts = aspeks.map(a => aspekCount[a]);

  const ctx = document.getElementById('radarChart');
  if (charts.radar) charts.radar.destroy();

  charts.radar = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: aspeks.map(a => a.length > 18 ? a.substring(0, 16) + '…' : a),
      datasets: [{
        label: 'Jumlah Ulasan',
        data: counts,
        backgroundColor: 'rgba(245,197,66,0.12)',
        borderColor: COLORS.gold,
        borderWidth: 2,
        pointBackgroundColor: COLORS.gold,
        pointBorderColor: '#0D1117',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => aspeks[items[0].dataIndex],
            label: ctx => ` ${ctx.raw} ulasan`
          }
        }
      },
      scales: {
        r: {
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.06)' },
          angleLines: { color: 'rgba(255,255,255,0.06)' },
          pointLabels: { font: { size: 10.5 }, color: '#8B949E' },
          ticks: { display: false },
        }
      },
      animation: { duration: 1000, easing: 'easeOutQuart' }
    }
  });
}

// ── Stat Cards ──
function updateStats(data) {
  const total = data.length;
  const positif = data.filter(d => d.Sentimen === 'Positif').length;
  const negatif = data.filter(d => d.Sentimen === 'Negatif').length;
  const aspeks = getUniqueAspeks(data).length;
  const pctPos = total > 0 ? ((positif / total) * 100).toFixed(1) : 0;
  const pctNeg = total > 0 ? ((negatif / total) * 100).toFixed(1) : 0;

  animateCounter(document.getElementById('statTotal'), total);
  animateCounter(document.getElementById('statPositif'), positif);
  animateCounter(document.getElementById('statNegatif'), negatif);
  animateCounter(document.getElementById('statAspek'), aspeks);

  document.getElementById('statTotalSub').textContent = `Ulasan terfilter`;
  document.getElementById('statPositifSub').textContent = `${pctPos}% dari total`;
  document.getElementById('statNegatifSub').textContent = `${pctNeg}% dari total`;
  document.getElementById('statAspekSub').textContent = `Kategori bisnis`;
}

// ── Data Table ──
function renderTable(data, page = 1) {
  currentPage = page;
  const tbody = document.getElementById('tableBody');
  const start = (page - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const pageData = data.slice(start, end);

  tbody.innerHTML = pageData.map((d, i) => {
    const sentClass = d.Sentimen === 'Positif' ? 'badge--positif' : 'badge--negatif';
    const sentIcon = d.Sentimen === 'Positif' ? '✓' : '✗';
    const tweet = d.Tweet.length > 100 ? d.Tweet.substring(0, 100) + '…' : d.Tweet;
    return `
      <tr>
        <td>${start + i + 1}</td>
        <td>${d.Tanggal}</td>
        <td class="tweet-col" title="${d.Tweet.replace(/"/g, '&quot;')}">${tweet}</td>
        <td><span class="badge ${sentClass}">${sentIcon} ${d.Sentimen}</span></td>
        <td><span class="badge badge--aspek">${d.Aspek_Bisnis}</span></td>
      </tr>
    `;
  }).join('');

  renderPagination(data.length, page);
  document.getElementById('tableInfo').textContent =
    `Menampilkan ${start + 1}–${Math.min(end, data.length)} dari ${data.length} ulasan`;
}

function renderPagination(totalItems, currentPage) {
  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE);
  const container = document.getElementById('pagination');
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';

  // Prev button
  html += `<button ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage(${currentPage - 1})">‹</button>`;

  // Page numbers (show max 7 pages)
  const maxShow = 7;
  let startPage = Math.max(1, currentPage - Math.floor(maxShow / 2));
  let endPage = Math.min(totalPages, startPage + maxShow - 1);
  if (endPage - startPage < maxShow - 1) {
    startPage = Math.max(1, endPage - maxShow + 1);
  }

  if (startPage > 1) {
    html += `<button onclick="goToPage(1)">1</button>`;
    if (startPage > 2) html += `<button disabled>…</button>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="${i === currentPage ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) html += `<button disabled>…</button>`;
    html += `<button onclick="goToPage(${totalPages})">${totalPages}</button>`;
  }

  // Next button
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage(${currentPage + 1})">›</button>`;

  container.innerHTML = html;
}

function goToPage(page) {
  renderTable(filteredData, page);
  document.getElementById('tableSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Search ──
function handleSearch(query) {
  if (!query.trim()) {
    renderTable(filteredData, 1);
    return;
  }
  const q = query.toLowerCase();
  const searchResults = filteredData.filter(d =>
    d.Tweet.toLowerCase().includes(q) ||
    d.Sentimen.toLowerCase().includes(q) ||
    d.Aspek_Bisnis.toLowerCase().includes(q) ||
    d.Tanggal.includes(q)
  );
  renderTable(searchResults, 1);
}

// ── Filtering ──
function applyFilters() {
  const aspekSelect = document.getElementById('filterAspek');
  const dateFrom = document.getElementById('filterDateFrom');
  const dateTo = document.getElementById('filterDateTo');

  const aspek = aspekSelect.value;
  const from = dateFrom.value;
  const to = dateTo.value;

  filteredData = allData.filter(d => {
    if (aspek && d.Aspek_Bisnis !== aspek) return false;
    if (from && d.Tanggal < from) return false;
    if (to && d.Tanggal > to) return false;
    return true;
  });

  refreshAll();
}

function resetFilters() {
  document.getElementById('filterAspek').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('searchInput').value = '';
  filteredData = [...allData];
  refreshAll();
}

function refreshAll() {
  updateStats(filteredData);
  renderDonutChart(filteredData);
  renderBarChart(filteredData);
  renderLineChart(filteredData);
  renderHorizontalBarChart(filteredData);
  renderRadarChart(filteredData);
  renderTable(filteredData, 1);
}

// ── Populate Filters ──
function populateFilters(data) {
  const aspekSelect = document.getElementById('filterAspek');
  const aspeks = getUniqueAspeks(data);

  aspeks.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a;
    opt.textContent = a;
    aspekSelect.appendChild(opt);
  });

  const range = getDateRange(data);
  document.getElementById('filterDateFrom').value = range.min;
  document.getElementById('filterDateTo').value = range.min;
  // Clear defaults – show all by default
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';

  // Set min/max on date inputs
  document.getElementById('filterDateFrom').min = range.min;
  document.getElementById('filterDateFrom').max = range.max;
  document.getElementById('filterDateTo').min = range.min;
  document.getElementById('filterDateTo').max = range.max;
}

// ── Intersection Observer for animations ──
function setupScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });
}

// ── Initialize ──
async function init() {
  try {
    setChartDefaults();

    const response = await fetch('siap_dashboard.csv');
    const text = await response.text();
    allData = parseCSV(text);
    filteredData = [...allData];

    // Populate filter dropdown
    populateFilters(allData);

    // Render everything
    refreshAll();

    // Setup animations
    setupScrollAnimations();

    // Event listeners
    document.getElementById('filterAspek').addEventListener('change', applyFilters);
    document.getElementById('filterDateFrom').addEventListener('change', applyFilters);
    document.getElementById('filterDateTo').addEventListener('change', applyFilters);
    document.getElementById('btnReset').addEventListener('click', resetFilters);

    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => handleSearch(e.target.value), 300);
    });

    // Hide loading overlay
    setTimeout(() => {
      const loader = document.getElementById('loadingOverlay');
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 500);
    }, 600);

  } catch (err) {
    console.error('Failed to load dashboard data:', err);
    const loader = document.getElementById('loadingOverlay');
    if (loader) {
      loader.querySelector('.loading-text').textContent = '❌ Gagal memuat data. Pastikan siap_dashboard.csv tersedia.';
      loader.querySelector('.loading-spinner').style.display = 'none';
    }
  }
}

// Start
document.addEventListener('DOMContentLoaded', init);
