/**
 * Sales Doctor Analytics - Proxy Server
 * CORS muammosini hal qilish uchun
 */

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS ni yoqish
app.use(cors());
app.use(express.json());

// Static fayllarni xizmat qilish
app.use(express.static(path.join(__dirname)));

// API Proxy endpoint
app.post('/api/proxy', async (req, res) => {
    try {
        const { serverUrl, body } = req.body;

        if (!serverUrl) {
            return res.status(400).json({ error: 'Server URL kiritilmagan' });
        }

        // Server URL ni formatlash
        const server = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const apiUrl = `https://${server}/api/v2/`;

        console.log(`📡 API so'rov: ${apiUrl}`);
        console.log(`📦 Method: ${body?.method}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (data.status) {
            console.log(`✅ Javob: Muvaffaqiyatli`);
            if (data.result) {
                console.log(`📊 Result:`, Array.isArray(data.result) ? `${data.result.length} ta element` : typeof data.result);
            }
        } else {
            console.log(`❌ Xato:`, data.error || JSON.stringify(data));
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Proxy xatosi:', error.message);
        res.status(500).json({
            status: false,
            error: error.message
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { serverUrl, login, password } = req.body;

        const server = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const apiUrl = `https://${server}/api/v2/`;

        console.log(`🔐 Login so'rov: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                method: 'login',
                auth: { login, password }
            })
        });

        const data = await response.json();

        if (data.status && data.result) {
            console.log(`✅ Login muvaffaqiyatli: userId=${data.result.userId}`);
        } else {
            console.log(`❌ Login xatosi:`, data.error);
        }

        res.json(data);
    } catch (error) {
        console.error('❌ Login xatosi:', error.message);
        res.status(500).json({
            status: false,
            error: error.message
        });
    }
});

// PivotPnL endpoint - mahsulot bo'yicha foyda ma'lumotlari
app.post('/api/pivotPnl', async (req, res) => {
    try {
        const { serverUrl, auth, dateStart, dateEnd } = req.body;

        const server = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

        // Cookie yaratish (session uchun)
        const cookies = `SD_account=${auth.userId}; SD_token=${auth.token}`;

        // Avval sana o'rnatish
        const setDateUrl = `https://${server}/finans/pivotPnl?type=product`;
        await fetch(setDateUrl, {
            method: 'GET',
            headers: {
                'Cookie': cookies,
                'Accept': 'application/json'
            }
        });

        // Keyin ma'lumotlarni olish
        const apiUrl = `https://${server}/finans/pivotPnl/loadByProduct?v=null`;

        console.log(`📊 PivotPnL so'rov: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Cookie': cookies,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();

        console.log(`✅ PivotPnL: ${Array.isArray(data) ? data.length : 0} ta mahsulot`);

        res.json({ status: true, result: data });
    } catch (error) {
        console.error('❌ PivotPnL xatosi:', error.message);
        res.status(500).json({
            status: false,
            error: error.message
        });
    }
});

// Balance with Srok (muddat) endpoint - API orqali to'g'ri hisoblash
// Mantiq: Har bir mijoz uchun to'lanmagan buyurtmalarning eng eski srogini topish
app.post('/api/balanceWithSrok', async (req, res) => {
    try {
        const { serverUrl, auth, agentId } = req.body;

        // Parametrlarni tekshirish
        if (!serverUrl || !auth?.userId || !auth?.token) {
            console.log('❌ Balance with Srok: serverUrl yoki auth yo\'q');
            return res.status(400).json({
                status: false,
                error: 'serverUrl va auth kerak'
            });
        }

        const server = serverUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
        const apiUrl = `https://${server}/api/v2/`;

        // API so'rov funksiyasi
        async function apiRequest(method, params = {}) {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auth: auth,
                    method: method,
                    params: params
                })
            });
            return response.json();
        }

        console.log(`📅 Balance with Srok: Agent ${agentId || 'hammasi'}`);

        // 1. Qarzdor mijozlarni olish (balance < 0)
        const balanceData = await apiRequest('getBalance', { page: 1, limit: 5000 });
        if (!balanceData.status || !balanceData.result?.balance) {
            console.log('❌ getBalance xatosi:', balanceData.error);
            return res.json({ status: false, error: 'getBalance xatosi' });
        }

        // Faqat qarzdor mijozlar (balance < 0)
        const debtors = balanceData.result.balance.filter(c => c.balance < 0);
        console.log(`📊 Jami ${debtors.length} ta qarzdor mijoz`);

        // 2. Barcha buyurtmalarni olish (status != 0, ya'ni bekor qilinmaganlar)
        let allOrders = [];
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= 10) {
            const orderParams = {
                page: page,
                limit: 1000,
                filter: { status: 'all' }
            };
            if (agentId) orderParams.filter.agent = { SD_id: agentId };

            const orderData = await apiRequest('getOrder', orderParams);
            if (orderData.result?.order && orderData.result.order.length > 0) {
                allOrders = allOrders.concat(orderData.result.order);
                hasMore = orderData.result.order.length === 1000;
                page++;
            } else {
                hasMore = false;
            }
        }
        console.log(`📦 Jami ${allOrders.length} ta buyurtma`);

        // 3. Barcha to'lovlarni olish
        let allPayments = [];
        page = 1;
        hasMore = true;

        while (hasMore && page <= 10) {
            const paymentData = await apiRequest('getPayment', { page: page, limit: 1000 });
            if (paymentData.result?.payment && paymentData.result.payment.length > 0) {
                allPayments = allPayments.concat(paymentData.result.payment);
                hasMore = paymentData.result.payment.length === 1000;
                page++;
            } else {
                hasMore = false;
            }
        }
        console.log(`💰 Jami ${allPayments.length} ta to'lov`);

        // 4. Har bir buyurtma uchun to'langan summani hisoblash
        const orderPaidAmounts = {}; // orderId -> to'langan summa
        allPayments.forEach(payment => {
            if (payment.orders && Array.isArray(payment.orders)) {
                payment.orders.forEach(order => {
                    const orderId = order.SD_id;
                    const amount = parseFloat(order.amount) || 0;
                    orderPaidAmounts[orderId] = (orderPaidAmounts[orderId] || 0) + amount;
                });
            }
        });

        // 5. Mijoz bo'yicha to'lanmagan buyurtmalarni topish va eng eski srokni aniqlash
        const clientSrok = {}; // clientId -> { srokDate, overdueDays, isOverdue, orders }

        allOrders.forEach(order => {
            if (!order.client?.SD_id || !order.debtDateExp) return;

            // 1970-01-01 va unga yaqin sanalarni o'tkazib yuborish (bo'sh sana)
            const srokDate = order.debtDateExp;
            if (srokDate.startsWith('1970') || srokDate.startsWith('1969')) return;

            const clientId = order.client.SD_id;
            const orderId = order.SD_id;
            const totalSumma = parseFloat(order.totalSumma) || 0;
            const paidAmount = orderPaidAmounts[orderId] || 0;
            const remainingDebt = totalSumma - paidAmount;

            // Agar bu buyurtmada hali qarz qolgan bo'lsa
            if (remainingDebt > 0) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const srok = new Date(srokDate);
                const diffDays = Math.ceil((srok - today) / (1000 * 60 * 60 * 24));
                const isOverdue = diffDays < 0;

                if (!clientSrok[clientId]) {
                    clientSrok[clientId] = {
                        srokDate: srokDate,
                        overdueDays: isOverdue ? Math.abs(diffDays) : 0,
                        daysLeft: isOverdue ? 0 : diffDays,
                        isOverdue: isOverdue,
                        unpaidOrders: 1,
                        totalUnpaidDebt: remainingDebt
                    };
                } else {
                    // Eng eski (birinchi) srokni saqlash
                    const existingSrok = new Date(clientSrok[clientId].srokDate);
                    if (srok < existingSrok) {
                        clientSrok[clientId].srokDate = srokDate;
                        clientSrok[clientId].overdueDays = isOverdue ? Math.abs(diffDays) : 0;
                        clientSrok[clientId].daysLeft = isOverdue ? 0 : diffDays;
                        clientSrok[clientId].isOverdue = isOverdue;
                    }
                    clientSrok[clientId].unpaidOrders++;
                    clientSrok[clientId].totalUnpaidDebt += remainingDebt;
                }
            }
        });

        // 6. Natijani shakllantirish
        const clients = debtors.map(debtor => {
            const srokInfo = clientSrok[debtor.SD_id] || {};

            // Agentni aniqlash (buyurtmalardan)
            const clientOrders = allOrders.filter(o => o.client?.SD_id === debtor.SD_id);
            const agentName = clientOrders[0]?.agent?.SD_id || '';

            return {
                CS_id: debtor.CS_id,
                SD_id: debtor.SD_id,
                name: debtor.name,
                balanceTotal: Math.abs(debtor.balance),
                // Dollar va so'm alohida (by-currency dan)
                balanceCash: (debtor['by-currency'] || [])
                    .filter(c => c.currency_id === 'd0_2')
                    .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0),
                balanceDollar: (debtor['by-currency'] || [])
                    .filter(c => c.currency_id === 'd0_4')
                    .reduce((sum, c) => sum + Math.abs(c.amount || 0), 0),
                srokDate: srokInfo.srokDate || '',
                overdueDays: srokInfo.overdueDays || 0,
                daysLeft: srokInfo.daysLeft || 0,
                isOverdue: srokInfo.isOverdue || false,
                unpaidOrders: srokInfo.unpaidOrders || 0,
                agentId: agentName
            };
        });

        // Agent bo'yicha filtrlash (agar kerak bo'lsa)
        let filteredClients = clients;
        if (agentId) {
            const agentOrders = allOrders.filter(o => o.agent?.SD_id === agentId);
            const agentClientIds = new Set(agentOrders.map(o => o.client?.SD_id));
            filteredClients = clients.filter(c => agentClientIds.has(c.SD_id));
        }

        console.log(`✅ Balance with Srok: ${filteredClients.length} ta mijoz (srok bilan)`);

        res.json({
            status: true,
            result: {
                clients: filteredClients,
                stats: {
                    totalDebtors: debtors.length,
                    totalOrders: allOrders.length,
                    totalPayments: allPayments.length
                }
            }
        });
    } catch (error) {
        console.error('❌ Balance with Srok xatosi:', error.message);
        res.status(500).json({
            status: false,
            error: error.message
        });
    }
});

// Bosh sahifa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serverni ishga tushirish
app.listen(PORT, () => {
    console.log('');
    console.log('╔════════════════════════════════════════════════╗');
    console.log('║     🏥 Sales Doctor Analytics Dashboard        ║');
    console.log('╠════════════════════════════════════════════════╣');
    console.log(`║  🌐 Server: http://localhost:${PORT}              ║`);
    console.log('║  📊 Dashboard tayyor!                          ║');
    console.log('╚════════════════════════════════════════════════╝');
    console.log('');
});
