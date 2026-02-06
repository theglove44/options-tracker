
const safeFloat = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const cleanVal = String(val).replace(/[$,]/g, '');
  const num = parseFloat(cleanVal);
  return isNaN(num) ? 0 : num;
};

const processData = (rows) => {
    // Mocking the strategies array and logic from App.jsx
    let strategies = [];
    let inventory = [];

    // Simplified grouping and processing logic
    // We assume rows are already cleaned and sorted for this test
    
    // ... (Copying relevant parts of processData)
    
    // 2. Grouping Logic - Event Based (Simplified for test)
    const events = [];
    const groupedOrders = {};
    const noOrderEvents = {};

    rows.forEach(row => {
      const orderId = row.OrderId;
      if (orderId && orderId.trim() !== '') {
        if (!groupedOrders[orderId]) {
          groupedOrders[orderId] = [];
        }
        groupedOrders[orderId].push(row);
      } else {
        const expDateStr = row.ExpirationObj instanceof Date && !isNaN(row.ExpirationObj) 
            ? row.ExpirationObj.toISOString().split('T')[0] 
            : 'INVALID_DATE';
        const contractKey = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}-${row.DateObj.getTime()}`;
        if (!noOrderEvents[contractKey]) {
          noOrderEvents[contractKey] = [];
        }
        noOrderEvents[contractKey].push(row);
      }
    });

    Object.values(groupedOrders).forEach(group => events.push(group));
    Object.values(noOrderEvents).forEach(group => {
       group.sort((a, b) => {
        const getPriority = (r) => {
              const sub = r.SubType || '';
              if (sub.includes('Cash Settled')) return 0;
              if (r.Action && !sub.includes('Exercise') && !sub.includes('Assignment') && !sub.includes('Expiration')) return 1;
              return 2;
        };
        return getPriority(a) - getPriority(b);
      });
      events.push(group);
    });
    
    events.sort((a, b) => a[0].DateObj - b[0].DateObj);

    events.forEach(orderRows => {
      const hasOpen = orderRows.some(r => r.Action.includes('OPEN'));
      const hasClose = orderRows.some(r => r.Action.includes('CLOSE') || r.SubType.includes('Expiration') || r.SubType.includes('Assignment') || r.SubType.includes('Exercise') || r.SubType.includes('Cash Settled'));
      
      let targetStrategyId = null;

      // --- PHASE 1: Process Closing Legs First ---
      if (hasClose) {
        orderRows.filter(r => r.Action.includes('CLOSE') || r.SubType.includes('Expiration') || r.SubType.includes('Assignment') || r.SubType.includes('Exercise') || r.SubType.includes('Cash Settled')).forEach(row => {
           const expDateStr = row.ExpirationObj instanceof Date && !isNaN(row.ExpirationObj) 
            ? row.ExpirationObj.toISOString().split('T')[0] 
            : 'INVALID_DATE';
          const contractId = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}`;
          
          let qtyToClose = Math.abs(row.Quantity);
          if (qtyToClose === 0 || row.Total === 0) return; 
          
          const matches = inventory.filter(item => 
            item.contractId === contractId && item.legRef.remainingQty > 0
          );

          for (let match of matches) {
            if (qtyToClose <= 0) break;
            
            if (!targetStrategyId) targetStrategyId = match.strategyId;

            const taken = Math.min(qtyToClose, match.legRef.remainingQty);
            match.legRef.remainingQty -= taken;
            
            let actionLabel = row.Action;
            if (row.SubType.includes('Expiration')) actionLabel = 'EXPIRED';
            else if (row.SubType.includes('Assignment')) actionLabel = 'ASSIGNED';
            else if (row.SubType.includes('Exercise')) actionLabel = 'EXERCISED';
            else if (row.SubType.includes('Cash Settled')) actionLabel = 'CASH SETTLED';

            let closeQty = Math.abs(row.Quantity);
            let portionTotal;
            let totalForPL = row.Total;
            
            if (actionLabel === 'ASSIGNED' || actionLabel === 'EXERCISED' || actionLabel === 'CASH SETTLED') {
              if (closeQty > 0) {
                if (actionLabel === 'CASH SETTLED') {
                  totalForPL = row.Total;
                  portionTotal = totalForPL;
                } else {
                  totalForPL = (row.Total / closeQty) * taken;
                  portionTotal = totalForPL;
                }
              } else {
                portionTotal = 0;
                totalForPL = 0;
              }
            } else {
              const closeTotal = row.Total; 
              portionTotal = closeTotal > 0 ? (closeTotal / closeQty) * taken : 0;
              totalForPL = row.Total;
            }

            const parentStrategy = strategies.find(s => s.id === match.strategyId);
            if (parentStrategy) {
              const proportion = closeQty > 0 ? taken / closeQty : 0;
              parentStrategy.totalPL += (totalForPL * proportion);
              parentStrategy.fees += ((row.Fees + row.Commissions) * proportion);
            }
            qtyToClose -= taken;
          }
        });
      }

      // --- PHASE 2: Process Opening Legs ---
      if (hasOpen) {
        const openRows = orderRows.filter(r => r.Action.includes('OPEN'));
        let strategy;
        const isRoll = hasClose && targetStrategyId;
        
        if (isRoll) {
          strategy = strategies.find(s => s.id === targetStrategyId);
        }
        
        if (!strategy) {
          const stratId = openRows[0].OrderId || `AUTO-${openRows[0].DateObj.getTime()}`;
          strategy = {
            id: stratId,
            legs: [],
            totalPL: 0,
            fees: 0,
          };
          strategies.push(strategy);
        }

        openRows.forEach(row => {
          const expDateStr = row.ExpirationObj instanceof Date && !isNaN(row.ExpirationObj) 
            ? row.ExpirationObj.toISOString().split('T')[0] 
            : 'INVALID_DATE';
          const contractId = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}`;

          const leg = {
            contractId,
            remainingQty: Math.abs(row.Quantity),
            quantity: Math.abs(row.Quantity),
            expiration: row.ExpirationObj
          };

          strategy.legs.push(leg);
          strategy.totalPL += row.Total;
          strategy.fees += (row.Fees + row.Commissions);

          inventory.push({
            contractId,
            strategyId: strategy.id,
            legRef: leg
          });
        });
      }
    });

    return strategies;
};

// --- Test Cases ---

// Helper to create row
const createRow = (overrides) => ({
    DateObj: new Date('2023-01-01'),
    ExpirationObj: new Date('2023-01-20'),
    Action: 'OPEN',
    SubType: '',
    Symbol: 'TSLA',
    Underlying: 'TSLA',
    Strike: 100,
    Type: 'CALL',
    Quantity: 1,
    Price: 1.00,
    Total: -101.00, // 1.00 * 100 + fees
    Fees: -0.50,
    Commissions: -0.50,
    OrderId: '1',
    ...overrides
});

// Case 1: TSLA Standard Trade
// Open: Buy Call. Price 2.00. Qty 1. Comm -1.00. Fee -0.10. Total -201.10.
// Close: Sell Call. Price 4.20. Qty 1. Comm -1.00. Fee -0.10. Total 418.90.
// True P&L Before Fees: (4.20 - 2.00) * 100 = 220.
// True Fees: 1.10 + 1.10 = 2.20.
// True Net P&L: 217.80.

const tslaRows = [
    createRow({
        DateObj: new Date('2023-01-01T10:00:00'),
        Action: 'BOT', // TastyTrade uses BOT/SOLD or BUY/SELL. Code normalizes to OPEN/CLOSE?
        // Wait, code says: let action = row['Action'] ? row['Action'].toUpperCase() : '';
        // And checks .includes('OPEN') or 'CLOSE'.
        // I need to make sure my mock data matches what the code expects.
        // In processData: const hasOpen = orderRows.some(r => r.Action.includes('OPEN'));
        // So I should use 'OPEN' and 'CLOSE' for simplicity, or match the normalization logic if I was testing that.
        // I'll use 'OPEN' and 'CLOSE' as the code expects normalized actions.
        Action: 'OPEN',
        Quantity: 1,
        Price: 2.00,
        Total: -201.10,
        Fees: -0.10,
        Commissions: -1.00,
        OrderId: '1'
    }),
    createRow({
        DateObj: new Date('2023-01-02T10:00:00'),
        Action: 'CLOSE',
        Quantity: 1,
        Price: 4.20,
        Total: 418.90,
        Fees: -0.10,
        Commissions: -1.00,
        OrderId: '2'
    })
];

const tslaStrategies = processData(tslaRows);
console.log('--- TSLA Case ---');
console.log('Total PL (Net):', tslaStrategies[0].totalPL);
console.log('Total Fees:', tslaStrategies[0].fees);
console.log('Expected Net:', 217.80);
console.log('Expected Before Fees:', 220.00);


// Case 2: SPX Cash Settled
// Open: Sell Put. Price 5.00. Qty 1. Comm -1.00. Fee -0.50. Total 498.50.
// Close: Cash Settled. Settlement Price implies $130 profit before fees.
// Profit 130 = 500 - SettlementCost.
// SettlementCost = 370.
// Settlement Row: Total = -370 - Fees.
// Say Fees -1.00. Total = -371.00.

const spxRows = [
    createRow({
        DateObj: new Date('2023-01-01T10:00:00'),
        Underlying: 'SPX',
        Symbol: 'SPXW',
        Action: 'OPEN',
        Type: 'PUT',
        Quantity: 1,
        Price: 5.00,
        Total: 498.50,
        Fees: -0.50,
        Commissions: -1.00,
        OrderId: '10'
    }),
    createRow({
        DateObj: new Date('2023-01-20T16:00:00'), // Expiration
        Underlying: 'SPX',
        Symbol: 'SPXW',
        Action: '', // No action usually for cash settled?
        SubType: 'Cash Settled',
        Type: 'PUT',
        Quantity: 1,
        Price: 3.70, // Settlement price?
        Total: -371.00, // -370 - 1.00 fees
        Fees: -1.00,
        Commissions: 0,
        OrderId: '' // No order ID usually
    }),
    createRow({
        DateObj: new Date('2023-01-20T16:00:00'),
        Underlying: 'SPX',
        Symbol: 'SPXW',
        Action: '',
        SubType: 'Removal',
        Type: 'PUT',
        Quantity: 1,
        Price: 0,
        Total: 0,
        Fees: 0,
        Commissions: 0,
        OrderId: ''
    })
];

const spxStrategies = processData(spxRows);
console.log('\n--- SPX Case ---');
console.log('Total PL (Net):', spxStrategies[0].totalPL);
console.log('Total Fees:', spxStrategies[0].fees);
console.log('Expected Net:', 127.50); // 498.50 - 371.00
console.log('Expected Before Fees:', 130.00); // 500 - 370

