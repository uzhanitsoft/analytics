/**
 * Telegram Mini App - Savdo Analitikasi
 * Telegram WebApp SDK integrated
 */

// Telegram WebApp initialization
const tg = window.Telegram?.WebApp;

// Initialize Telegram WebApp
if (tg) {
    tg.ready();
    tg.expand();

    // Set theme colors from Telegram
    document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#1c1c1e');
    document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || 'rgba(255,255,255,0.5)');
    document.documentElement.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color || '#5ac8fa');
    document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#5856d6');
    document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');
    document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color || '#2c2c2e');

    // Apply background color
    document.body.style.backgroundColor = tg.themeParams.bg_color || '#1c1c1e';
}

// Global state
let appData = {
    raw: [],
    categories: [],
    products: {},
    agents: {},
    clients: {},
};

let revenueChart = null;

// ==========================================
// Data Processing Functions
// ==========================================

function processData(rawData) {
    const products = {};
    const agents = {};
    const clients = {};
    const categoriesSet = new Set();

    rawData.forEach(row => {
        const category = row['Категория товара'] || row['Category'] || 'Noma\'lum';
        const product = row['Товар'] || row['Product'] || 'Noma\'lum';
        const agent = row['Агент'] || row['Agent'] || 'Noma\'lum';
        const client = row['Клиент расхода'] || row['Client'] || 'Noma\'lum';
        const revenue = parseFloat(row['Выручка'] || row['Revenue'] || 0);
        const profit = parseFloat(row['Прибыль'] || row['Profit'] || 0);
        const cost = parseFloat(row['Себестоимость'] || row['Cost'] || 0);
        const quantity = parseInt(row['Количество'] || row['Quantity'] || 0);
        const margin = parseFloat(row['Маржа (%)'] || row['Margin'] || 0);

        categoriesSet.add(category);

        // Aggregate by product
        if (!products[product]) {
            products[product] = {
                name: product,
                category: category,
                revenue: 0,
                profit: 0,
                cost: 0,
                quantity: 0,
                margin: 0,
                count: 0
            };
        }
        products[product].revenue += revenue;
        products[product].profit += profit;
        products[product].cost += cost;
        products[product].quantity += quantity;
        products[product].margin += margin;
        products[product].count++;

        // Aggregate by agent
        if (!agents[agent]) {
            agents[agent] = {
                name: agent,
                revenue: 0,
                profit: 0,
                quantity: 0,
                sales: 0
            };
        }
        agents[agent].revenue += revenue;
        agents[agent].profit += profit;
        agents[agent].quantity += quantity;
        agents[agent].sales++;

        // Aggregate by client
        if (!clients[client]) {
            clients[client] = {
                name: client,
                revenue: 0,
                profit: 0,
                purchases: 0
            };
        }
        clients[client].revenue += revenue;
        clients[client].profit += profit;
        clients[client].purchases++;
    });

    // Calculate average margins
    Object.values(products).forEach(p => {
        if (p.count > 0) p.margin = p.margin / p.count;
    });

    return { categories: Array.from(categoriesSet).sort(), products, agents, clients };
}

function calculateStats(data) {
    const products = Object.values(data.products);
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0);
    const totalProfit = products.reduce((sum, p) => sum + p.profit, 0);
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
    const avgMargin = products.length > 0
        ? products.reduce((sum, p) => sum + p.margin, 0) / products.length * 100
        : 0;

    return { totalRevenue, totalProfit, totalQuantity, avgMargin };
}

function getRevenueByDate(rawData) {
    const dateMap = {};

    rawData.forEach(row => {
        const dateStr = row['Дата расхода'] || row['Sale Date'] || '';
        if (!dateStr) return;

        const date = new Date(dateStr);
        const key = date.toISOString().split('T')[0];

        const revenue = parseFloat(row['Выручка'] || row['Revenue'] || 0);
        const profit = parseFloat(row['Прибыль'] || row['Profit'] || 0);

        if (!dateMap[key]) {
            dateMap[key] = { revenue: 0, profit: 0 };
        }
        dateMap[key].revenue += revenue;
        dateMap[key].profit += profit;
    });

    return Object.entries(dateMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));
}

// ==========================================
// Formatting Functions
// ==========================================

function formatCurrency(value) {
    if (value >= 1000000) return '$' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return '$' + (value / 1000).toFixed(1) + 'K';
    return '$' + value.toFixed(0);
}

function formatNumber(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toLocaleString();
}

// ==========================================
// UI Update Functions
// ==========================================

function updateStats(stats) {
    document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('totalProfit').textContent = formatCurrency(stats.totalProfit);
    document.getElementById('totalQuantity').textContent = formatNumber(stats.totalQuantity);
    document.getElementById('avgMargin').textContent = stats.avgMargin.toFixed(1) + '%';
}

function updateTopProducts(products) {
    const container = document.getElementById('topProducts');
    const sorted = Object.values(products).sort((a, b) => b.profit - a.profit).slice(0, 5);

    container.innerHTML = sorted.map((item, index) => `
        <div class="data-item">
            <div class="data-rank ${getRankClass(index)}">${index + 1}</div>
            <div class="data-info">
                <div class="data-name">${item.name}</div>
                <div class="data-meta">${item.category}</div>
            </div>
            <div class="data-value">${formatCurrency(item.profit)}</div>
        </div>
    `).join('');
}

function updateTopAgents(agents) {
    const container = document.getElementById('topAgents');
    const sorted = Object.values(agents).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

    container.innerHTML = sorted.map((item, index) => `
        <div class="data-item">
            <div class="data-rank ${getRankClass(index)}">${index + 1}</div>
            <div class="data-info">
                <div class="data-name">${item.name}</div>
                <div class="data-meta">${item.sales} ta savdo</div>
            </div>
            <div class="data-value">${formatCurrency(item.revenue)}</div>
        </div>
    `).join('');
}

function getRankClass(index) {
    if (index === 0) return 'gold';
    if (index === 1) return 'silver';
    if (index === 2) return 'bronze';
    return 'default';
}

// ==========================================
// Products List
// ==========================================

function updateProductsList(products, filter = '') {
    const container = document.getElementById('productsList');
    let productList = Object.values(products);

    if (filter) {
        const query = filter.toLowerCase();
        productList = productList.filter(p =>
            p.name.toLowerCase().includes(query) ||
            p.category.toLowerCase().includes(query)
        );
    }

    productList.sort((a, b) => b.revenue - a.revenue);

    container.innerHTML = productList.slice(0, 30).map(product => `
        <div class="product-item">
            <div class="name">${product.name}</div>
            <div class="category">${product.category}</div>
            <div class="stats-row">
                <div class="stat-mini">
                    <span class="label">Miqdor</span>
                    <span class="value">${formatNumber(product.quantity)}</span>
                </div>
                <div class="stat-mini">
                    <span class="label">Tushum</span>
                    <span class="value">${formatCurrency(product.revenue)}</span>
                </div>
                <div class="stat-mini">
                    <span class="label">Foyda</span>
                    <span class="value ${product.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(product.profit)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// Agents List
// ==========================================

function updateAgentsList(agents) {
    const container = document.getElementById('agentsList');
    const agentList = Object.values(agents).sort((a, b) => b.revenue - a.revenue);

    container.innerHTML = agentList.map(agent => `
        <div class="agent-item">
            <div class="name">👤 ${agent.name}</div>
            <div class="stats-row">
                <div class="stat-mini">
                    <span class="label">Sotuvlar</span>
                    <span class="value">${agent.sales}</span>
                </div>
                <div class="stat-mini">
                    <span class="label">Tushum</span>
                    <span class="value">${formatCurrency(agent.revenue)}</span>
                </div>
                <div class="stat-mini">
                    <span class="label">Foyda</span>
                    <span class="value ${agent.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(agent.profit)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// ==========================================
// Clients List
// ==========================================

function updateClientsList(clients) {
    const container = document.getElementById('clientsList');
    const clientList = Object.values(clients).sort((a, b) => b.revenue - a.revenue);

    container.innerHTML = clientList.slice(0, 30).map(client => {
        const avgCheck = client.purchases > 0 ? client.revenue / client.purchases : 0;
        return `
            <div class="client-item">
                <div class="name">🏪 ${client.name}</div>
                <div class="stats-row">
                    <div class="stat-mini">
                        <span class="label">Xaridlar</span>
                        <span class="value">${client.purchases}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="label">Summa</span>
                        <span class="value">${formatCurrency(client.revenue)}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="label">Foyda</span>
                        <span class="value ${client.profit >= 0 ? 'positive' : 'negative'}">${formatCurrency(client.profit)}</span>
                    </div>
                    <div class="stat-mini">
                        <span class="label">O'rtacha</span>
                        <span class="value">${formatCurrency(avgCheck)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ==========================================
// Chart
// ==========================================

function createRevenueChart(dateData) {
    const ctx = document.getElementById('revenueChart').getContext('2d');

    if (revenueChart) revenueChart.destroy();

    const labels = dateData.slice(-14).map(d => {
        const date = new Date(d.date);
        return date.toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
    });

    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Tushum',
                    data: dateData.slice(-14).map(d => d.revenue),
                    borderColor: '#bf5af2',
                    backgroundColor: 'rgba(191, 90, 242, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: 'Foyda',
                    data: dateData.slice(-14).map(d => d.profit),
                    borderColor: '#30d158',
                    backgroundColor: 'rgba(48, 209, 88, 0.1)',
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1c1c1e',
                    titleColor: '#fff',
                    bodyColor: 'rgba(255,255,255,0.7)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    padding: 10,
                    callbacks: {
                        label: ctx => ctx.dataset.label + ': ' + formatCurrency(ctx.raw)
                    }
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: false
                }
            }
        }
    });
}

// ==========================================
// Navigation
// ==========================================

function setupNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    const sections = {
        dashboard: document.getElementById('dashboardSection'),
        products: document.getElementById('productsSection'),
        agents: document.getElementById('agentsSection'),
        clients: document.getElementById('clientsSection')
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Haptic feedback
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.impactOccurred('light');
            }

            const sectionId = tab.dataset.section;

            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            Object.entries(sections).forEach(([key, section]) => {
                if (key === sectionId) {
                    section.classList.remove('hidden');
                } else {
                    section.classList.add('hidden');
                }
            });
        });
    });
}

// ==========================================
// File Upload
// ==========================================

function setupFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');

    uploadBtn.addEventListener('click', () => {
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred('medium');
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        showLoading(true);

        try {
            const data = await readExcelFile(file);
            loadData(data);

            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('success');
            }
        } catch (error) {
            console.error('Error reading file:', error);
            if (tg?.showAlert) {
                tg.showAlert('Faylni o\'qishda xatolik yuz berdi');
            } else {
                alert('Faylni o\'qishda xatolik yuz berdi');
            }
            if (tg?.HapticFeedback) {
                tg.HapticFeedback.notificationOccurred('error');
            }
        }

        showLoading(false);
    });
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                resolve(jsonData);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// ==========================================
// Search
// ==========================================

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        updateProductsList(appData.products, e.target.value);
    });
}

// ==========================================
// Loading & Data
// ==========================================

function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const dashboardSection = document.getElementById('dashboardSection');

    if (show) {
        loadingState.classList.remove('hidden');
        dashboardSection.classList.add('hidden');
    } else {
        loadingState.classList.add('hidden');
        dashboardSection.classList.remove('hidden');
    }
}

function loadData(rawData) {
    appData.raw = rawData;

    const processed = processData(rawData);
    appData.categories = processed.categories;
    appData.products = processed.products;
    appData.agents = processed.agents;
    appData.clients = processed.clients;

    const stats = calculateStats(processed);
    updateStats(stats);
    updateTopProducts(processed.products);
    updateTopAgents(processed.agents);

    const dateData = getRevenueByDate(rawData);
    createRevenueChart(dateData);

    updateProductsList(processed.products);
    updateAgentsList(processed.agents);
    updateClientsList(processed.clients);
}

// ==========================================
// Initialize
// ==========================================

async function init() {
    setupNavigation();
    setupFileUpload();
    setupSearch();

    try {
        const response = await fetch('data.json');
        if (response.ok) {
            const data = await response.json();
            loadData(data);
            showLoading(false);
        } else {
            showLoading(false);
            document.getElementById('dashboardSection').classList.remove('hidden');
        }
    } catch (error) {
        console.log('No default data found');
        showLoading(false);
        document.getElementById('dashboardSection').classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', init);
