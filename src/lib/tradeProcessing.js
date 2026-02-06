export const safeFloat = (val) => {
  if (val === null || val === undefined || val === '') return 0;
  const cleanVal = String(val).replace(/[$,]/g, '');
  const num = parseFloat(cleanVal);
  return Number.isNaN(num) ? 0 : num;
};

export const parseCSV = (text) => {
  const lines = text.split(/\r\n|\n/);
  const headers = lines[0].split(',').map((header) => header.trim().replace(/^[\uFEFF\uFFFE]/, ''));
  const result = [];

  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;

    const values = [];
    let inQuote = false;
    let value = '';

    for (let j = 0; j < line.length; j += 1) {
      const char = line[j];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(value.trim());
        value = '';
      } else {
        value += char;
      }
    }
    values.push(value.trim());

    if (values.length > 0) {
      const row = {};
      headers.forEach((header, index) => {
        let val = values[index] || '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        }
        row[header] = val;
      });
      result.push(row);
    }
  }
  return result;
};

export const isZeroDTE = (strategy) => {
  const validSymbols = ['SPX', 'XSP', 'RUT', '/ES'];
  const symbol = strategy.underlying ? strategy.underlying.toUpperCase() : '';
  const isTargetSymbol = validSymbols.some((ticker) => symbol.includes(ticker));

  if (!isTargetSymbol) return false;

  if (strategy.dateOpen && strategy.dateClosed) {
    const openDate = new Date(strategy.dateOpen).setHours(0, 0, 0, 0);
    const closeDate = new Date(strategy.dateClosed).setHours(0, 0, 0, 0);
    return openDate === closeDate;
  }

  return false;
};

export const estimateCapital = (strategy) => {
  const { legs } = strategy;
  const longLegs = legs.filter((leg) => leg.action.includes('BUY'));
  const shortLegs = legs.filter((leg) => leg.action.includes('SELL'));

  if (shortLegs.length === 0) {
    return legs.reduce((sum, leg) => sum + Math.abs(leg.costBasis), 0);
  }

  if (legs.length === 2 && longLegs.length === 1 && shortLegs.length === 1) {
    const long = longLegs[0];
    const short = shortLegs[0];

    if (long.type === short.type) {
      const width = Math.abs(long.strike - short.strike);
      const quantity = long.quantity;

      if (long.strike < short.strike && long.type === 'CALL') {
        return Math.abs(strategy.legs.reduce((sum, leg) => sum + leg.costBasis, 0));
      }
      if (long.strike > short.strike && long.type === 'PUT') {
        return Math.abs(strategy.legs.reduce((sum, leg) => sum + leg.costBasis, 0));
      }
      return width * 100 * quantity;
    }
  }

  if (legs.length === 4) {
    const calls = legs.filter((leg) => leg.type === 'CALL');
    const puts = legs.filter((leg) => leg.type === 'PUT');

    if (calls.length === 2 && puts.length === 2) {
      const longCall = calls.find((leg) => leg.action.includes('BUY'));
      const shortCall = calls.find((leg) => leg.action.includes('SELL'));
      const callWidth = (longCall && shortCall) ? Math.abs(longCall.strike - shortCall.strike) : 0;

      const longPut = puts.find((leg) => leg.action.includes('BUY'));
      const shortPut = puts.find((leg) => leg.action.includes('SELL'));
      const putWidth = (longPut && shortPut) ? Math.abs(longPut.strike - shortPut.strike) : 0;

      const quantity = calls[0].quantity;
      return Math.max(callWidth, putWidth) * 100 * quantity;
    }
  }

  if (legs.length === 1 && shortLegs.length === 1 && shortLegs[0].type === 'PUT') {
    return shortLegs[0].strike * 100 * shortLegs[0].quantity;
  }

  if (legs.length === 1 && shortLegs.length === 1 && shortLegs[0].type === 'CALL') {
    return shortLegs[0].strike * 100 * 0.2 * shortLegs[0].quantity;
  }

  return 0;
};

export const processTradeRows = (rows = []) => {
  let totalDeposits = 0;
  let totalWithdrawals = 0;

  rows.forEach((row) => {
    const subType = row['Sub Type'] ? row['Sub Type'].trim() : '';
    const value = safeFloat(row.Value);

    if (subType === 'Deposit') {
      totalDeposits += value;
    } else if (subType === 'Withdrawal') {
      totalWithdrawals += Math.abs(value);
    }
  });

  const initialBalance = totalDeposits - totalWithdrawals;

  const cleanRows = rows
    .filter((row) => {
      if (!row.Date) return false;
      if (row.Date === 'Date') return false;

      const isTrade = !!row.Action;
      const sub = row['Sub Type'] || '';
      const isLifecycle = sub.includes('Expiration') || sub.includes('Assignment') || sub.includes('Exercise');

      if (!isTrade && !isLifecycle) return false;
      return true;
    })
    .map((row) => {
      let action = row.Action ? row.Action.toUpperCase() : '';
      const subType = row['Sub Type'] || '';

      if (subType.includes('Expiration') || subType.includes('Assignment') || subType.includes('Exercise')) {
        if (!action || !action.includes('CLOSE')) {
          action = 'CLOSE (SYSTEM)';
        }
      }

      return {
        ...row,
        DateObj: new Date(row.Date),
        Quantity: safeFloat(row.Quantity),
        Value: safeFloat(row.Value),
        Total: safeFloat(row.Total),
        Fees: safeFloat(row.Fees),
        Commissions: safeFloat(row.Commissions),
        Strike: safeFloat(row['Strike Price']),
        Price: safeFloat(row['Average Price']),
        ExpirationObj: new Date(row['Expiration Date']),
        Action: action,
        Symbol: row.Symbol ? row.Symbol.trim() : '',
        Underlying: row['Underlying Symbol'],
        Type: row['Call or Put'],
        OrderId: row['Order #'],
        SubType: subType,
      };
    });

  const events = [];
  const groupedOrders = {};
  const noOrderEvents = {};

  cleanRows.forEach((row) => {
    const orderId = row.OrderId;
    if (orderId && orderId.trim() !== '') {
      if (!groupedOrders[orderId]) {
        groupedOrders[orderId] = [];
      }
      groupedOrders[orderId].push(row);
    } else {
      const expDateStr = row.ExpirationObj instanceof Date && !Number.isNaN(row.ExpirationObj.getTime())
        ? row.ExpirationObj.toISOString().split('T')[0]
        : 'INVALID_DATE';

      const contractKey = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}-${row.DateObj.getTime()}`;
      if (!noOrderEvents[contractKey]) {
        noOrderEvents[contractKey] = [];
      }
      noOrderEvents[contractKey].push(row);
    }
  });

  Object.values(groupedOrders).forEach((group) => events.push(group));

  Object.values(noOrderEvents).forEach((group) => {
    group.sort((a, b) => {
      const getPriority = (row) => {
        const sub = row.SubType || '';

        if (sub.includes('Cash Settled')) return 0;
        if (row.Action && !sub.includes('Exercise') && !sub.includes('Assignment') && !sub.includes('Expiration')) return 1;
        return 2;
      };
      return getPriority(a) - getPriority(b);
    });
    events.push(group);
  });

  events.sort((a, b) => a[0].DateObj - b[0].DateObj);

  const inventory = [];
  const strategies = [];

  let maxDatasetDate = new Date(0);
  if (cleanRows.length > 0) {
    maxDatasetDate = cleanRows.reduce((max, row) => (row.DateObj > max ? row.DateObj : max), new Date(0));
  }

  events.forEach((orderRows) => {
    const hasOpen = orderRows.some((row) => row.Action.includes('OPEN'));
    const hasClose = orderRows.some((row) => row.Action.includes('CLOSE')
      || row.SubType.includes('Expiration')
      || row.SubType.includes('Assignment')
      || row.SubType.includes('Exercise')
      || row.SubType.includes('Cash Settled'));

    let targetStrategyId = null;

    if (hasClose) {
      orderRows
        .filter((row) => row.Action.includes('CLOSE')
          || row.SubType.includes('Expiration')
          || row.SubType.includes('Assignment')
          || row.SubType.includes('Exercise')
          || row.SubType.includes('Cash Settled'))
        .forEach((row) => {
          const expDateStr = row.ExpirationObj instanceof Date && !Number.isNaN(row.ExpirationObj.getTime())
            ? row.ExpirationObj.toISOString().split('T')[0]
            : 'INVALID_DATE';
          const contractId = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}`;

          let qtyToClose = Math.abs(row.Quantity);
          if (qtyToClose === 0 || row.Total === 0) return;

          const matches = inventory.filter((item) => item.contractId === contractId && item.legRef.remainingQty > 0);

          for (const match of matches) {
            if (qtyToClose <= 0) break;

            if (!targetStrategyId) targetStrategyId = match.strategyId;

            const taken = Math.min(qtyToClose, match.legRef.remainingQty);
            match.legRef.remainingQty -= taken;

            let actionLabel = row.Action;
            if (row.SubType.includes('Expiration')) actionLabel = 'EXPIRED';
            else if (row.SubType.includes('Assignment')) actionLabel = 'ASSIGNED';
            else if (row.SubType.includes('Exercise')) actionLabel = 'EXERCISED';
            else if (row.SubType.includes('Cash Settled')) actionLabel = 'CASH SETTLED';

            const closeQty = Math.abs(row.Quantity);
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

            match.legRef.closedDetails.push({
              date: row.DateObj,
              price: row.Price,
              action: actionLabel,
              total: portionTotal,
              fees: (row.Fees + row.Commissions),
            });

            const parentStrategy = strategies.find((strategy) => strategy.id === match.strategyId);
            if (parentStrategy) {
              const proportion = closeQty > 0 ? taken / closeQty : 0;
              parentStrategy.totalPL += (totalForPL * proportion);
              parentStrategy.fees += ((row.Fees + row.Commissions) * proportion);

              if (hasOpen && hasClose) {
                parentStrategy.isRolled = true;
                if (row.OrderId) parentStrategy.orderIds.push(row.OrderId);
              }
            }
            qtyToClose -= taken;
          }
        });
    }

    if (hasOpen) {
      const openRows = orderRows.filter((row) => row.Action.includes('OPEN'));
      let strategy;

      const isRoll = hasClose && targetStrategyId;

      if (isRoll) {
        strategy = strategies.find((item) => item.id === targetStrategyId);
      }

      if (!strategy) {
        const stratId = openRows[0].OrderId || `AUTO-${openRows[0].DateObj.getTime()}`;
        strategy = {
          id: stratId,
          orderIds: openRows[0].OrderId ? [openRows[0].OrderId] : [],
          dateOpen: openRows[0].DateObj,
          underlying: openRows[0].Underlying,
          legs: [],
          status: 'OPEN',
          totalPL: 0,
          fees: 0,
          isRolled: false,
        };
        strategies.push(strategy);
      } else if (!isRoll && openRows[0].OrderId) {
        if (!strategy.orderIds.includes(openRows[0].OrderId)) {
          strategy.orderIds.push(openRows[0].OrderId);
        }
      }

      openRows.forEach((row) => {
        const expDateStr = row.ExpirationObj instanceof Date && !Number.isNaN(row.ExpirationObj.getTime())
          ? row.ExpirationObj.toISOString().split('T')[0]
          : 'INVALID_DATE';
        const contractId = `${row.Underlying}-${expDateStr}-${row.Strike}-${row.Type}`;

        const leg = {
          contractId,
          type: row.Type,
          action: row.Action,
          quantity: Math.abs(row.Quantity),
          openPrice: row.Price,
          strike: row.Strike,
          expiration: row.ExpirationObj,
          openDate: row.DateObj,
          costBasis: row.Total,
          remainingQty: Math.abs(row.Quantity),
          closedDetails: [],
        };

        strategy.legs.push(leg);
        strategy.totalPL += row.Total;
        strategy.fees += (row.Fees + row.Commissions);

        inventory.push({
          contractId,
          strategyId: strategy.id,
          legRef: leg,
        });
      });
    }
  });

  strategies.forEach((strategy) => {
    strategy.legs.forEach((leg) => {
      if (leg.remainingQty > 0 && leg.expiration) {
        const cutoff = new Date(leg.expiration);
        cutoff.setHours(23, 59, 59);

        if (maxDatasetDate > cutoff) {
          leg.remainingQty = 0;
          leg.closedDetails.push({
            date: leg.expiration,
            price: 0,
            action: 'EXPIRED (AUTO)',
            total: 0,
            fees: 0,
          });
        }
      }
    });

    const totalQty = strategy.legs.reduce((sum, leg) => sum + leg.quantity, 0);
    const remainingQty = strategy.legs.reduce((sum, leg) => sum + leg.remainingQty, 0);

    if (remainingQty === 0) {
      strategy.status = 'CLOSED';
      const closeDates = strategy.legs.flatMap((leg) => leg.closedDetails.map((detail) => detail.date));
      if (closeDates.length > 0) strategy.dateClosed = new Date(Math.max(...closeDates));
    } else if (remainingQty < totalQty) {
      strategy.status = 'PARTIAL';
    }

    const activeLegs = strategy.legs.filter((leg) => leg.remainingQty > 0);
    const relevantLegs = activeLegs.length > 0 ? activeLegs : strategy.legs;

    const callCount = relevantLegs.filter((leg) => leg.type === 'CALL').length;
    const putCount = relevantLegs.filter((leg) => leg.type === 'PUT').length;
    const legCount = relevantLegs.length;

    let name = 'Custom';
    if (legCount === 1) {
      if (relevantLegs[0].action.includes('BUY')) name = `Long ${relevantLegs[0].type === 'CALL' ? 'Call' : 'Put'}`;
      else name = `Short ${relevantLegs[0].type === 'CALL' ? 'Call' : 'Put'}`;
    } else if (legCount === 2) {
      if (callCount === 2) name = 'Vertical Call Spread';
      else if (putCount === 2) name = 'Vertical Put Spread';
      else name = 'Strangle / Straddle';
    } else if (legCount === 4) {
      name = 'Iron Condor / Butterfly';
    }

    if (strategy.isRolled) name += ' (Rolled)';
    strategy.strategyName = name;
  });

  return {
    initialBalance,
    strategies: strategies.sort((a, b) => b.dateOpen - a.dateOpen),
  };
};
