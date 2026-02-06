import { estimateCapital, isZeroDTE } from './tradeProcessing.js';

export const getContextData = (tradeData, currentView) => {
  if (!tradeData) return [];
  if (currentView === 'zero-dte') {
    return tradeData.filter((strategy) => {
      const isIndex = ['SPX', 'RUT', 'XSP'].includes(strategy.underlying);
      return isIndex && isZeroDTE(strategy);
    });
  }
  return tradeData;
};

export const computeStats = (currentContextData, currentView, initialBalance) => {
  if (!currentContextData) return null;
  const data = currentContextData;

  const closed = data.filter((strategy) => strategy.status === 'CLOSED');
  const totalPL = data.reduce((sum, strategy) => sum + strategy.totalPL, 0);
  const closedPL = closed.reduce((sum, strategy) => sum + strategy.totalPL, 0);
  const totalFees = data.reduce((sum, strategy) => sum + Math.abs(strategy.fees), 0);
  const closedFees = closed.reduce((sum, strategy) => sum + Math.abs(strategy.fees), 0);

  const totalPLBeforeFees = totalPL + totalFees;
  const closedPLBeforeFees = closedPL + closedFees;

  const totalPLAfterFees = totalPL;
  const closedPLAfterFees = closedPL;

  const winCount = closed.filter((strategy) => strategy.totalPL > 0).length;
  const lossCount = closed.filter((strategy) => strategy.totalPL <= 0).length;
  const winRate = closed.length > 0 ? (winCount / closed.length) * 100 : 0;
  const openCount = data.filter((strategy) => strategy.status === 'OPEN' || strategy.status === 'PARTIAL').length;

  let totalDuration = 0;
  let durationCount = 0;
  let zeroDTEPL = 0;

  closed.forEach((strategy) => {
    const is0DTE = isZeroDTE(strategy);

    if (is0DTE) {
      zeroDTEPL += strategy.totalPL;
    }

    if (strategy.dateOpen && strategy.dateClosed) {
      const shouldInclude = currentView === 'zero-dte' ? true : !is0DTE;

      if (shouldInclude) {
        const diffTime = Math.abs(strategy.dateClosed - strategy.dateOpen);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        totalDuration += diffDays;
        durationCount += 1;
      }
    }
  });
  const avgDuration = durationCount > 0 ? totalDuration / durationCount : 0;

  let totalROC = 0;
  let rocCount = 0;
  let totalCapital = 0;
  let capitalCount = 0;

  data.forEach((strategy) => {
    const capital = estimateCapital(strategy);
    if (capital > 0) {
      totalCapital += capital;
      capitalCount += 1;

      if (strategy.status === 'CLOSED') {
        const roc = (strategy.totalPL / capital) * 100;
        totalROC += roc;
        rocCount += 1;
      }
    }
  });

  const avgROC = rocCount > 0 ? totalROC / rocCount : 0;
  const avgCapital = capitalCount > 0 ? totalCapital / capitalCount : 0;

  const winningTrades = closed.filter((strategy) => strategy.totalPL > 0);
  const losingTrades = closed.filter((strategy) => strategy.totalPL <= 0);
  const avgWin = winningTrades.length > 0
    ? winningTrades.reduce((sum, strategy) => sum + strategy.totalPL, 0) / winningTrades.length
    : 0;
  const avgLoss = losingTrades.length > 0
    ? Math.abs(losingTrades.reduce((sum, strategy) => sum + strategy.totalPL, 0) / losingTrades.length)
    : 0;

  const startingBalance = initialBalance;
  const currentBalance = startingBalance + closedPLAfterFees;
  const returnPercentage = startingBalance > 0 ? (closedPLAfterFees / startingBalance) * 100 : 0;

  return {
    totalPL,
    closedPL,
    totalFees,
    closedFees,
    totalPLBeforeFees,
    closedPLBeforeFees,
    totalPLAfterFees,
    closedPLAfterFees,
    winCount,
    lossCount,
    winRate,
    openCount,
    avgDuration,
    avgROC,
    avgCapital,
    avgWin,
    avgLoss,
    zeroDTEPL,
    startingBalance,
    currentBalance,
    returnPercentage,
  };
};

export const filterStrategies = (currentContextData, filter, symbolFilter) => {
  if (!currentContextData) return [];
  let filtered = currentContextData;

  if (filter !== 'ALL') {
    if (filter === 'OPEN') filtered = filtered.filter((strategy) => strategy.status === 'OPEN' || strategy.status === 'PARTIAL');
    if (filter === 'CLOSED') filtered = filtered.filter((strategy) => strategy.status === 'CLOSED');
  }

  if (symbolFilter.trim()) {
    const searchTerm = symbolFilter.toUpperCase().trim();
    filtered = filtered.filter(
      (strategy) => strategy.underlying && strategy.underlying.toUpperCase().includes(searchTerm),
    );
  }

  return filtered;
};

export const getPLPerSymbolData = (tradeData) => {
  if (!tradeData) return [];

  const symbolMap = {};

  tradeData.forEach((strategy) => {
    const symbol = strategy.underlying;
    if (!symbol) return;

    if (!symbolMap[symbol]) {
      symbolMap[symbol] = {
        symbol,
        plBeforeFees: 0,
        totalFees: 0,
        plAfterFees: 0,
        strategyCount: 0,
        closedStrategies: 0,
        winningStrategies: 0,
        strategies: [],
      };
    }

    const symbolData = symbolMap[symbol];
    symbolData.strategyCount += 1;
    symbolData.strategies.push(strategy);

    if (strategy.status === 'CLOSED') {
      symbolData.plBeforeFees += strategy.totalPL + Math.abs(strategy.fees);
      symbolData.totalFees += Math.abs(strategy.fees);
      symbolData.plAfterFees += strategy.totalPL;
      symbolData.closedStrategies += 1;

      if (strategy.totalPL > 0) {
        symbolData.winningStrategies += 1;
      }
    }
  });

  return Object.values(symbolMap)
    .filter((data) => data.closedStrategies > 0)
    .sort((a, b) => b.plAfterFees - a.plAfterFees);
};

export const getPLPerStrategyData = (tradeData) => {
  if (!tradeData) return [];

  const typeMap = {};

  tradeData.forEach((strategy) => {
    if (strategy.status !== 'CLOSED') return;

    const cleanName = strategy.strategyName.replace(' (Rolled)', '').trim();

    if (!typeMap[cleanName]) {
      typeMap[cleanName] = {
        strategyType: cleanName,
        plBeforeFees: 0,
        totalFees: 0,
        plAfterFees: 0,
        strategyCount: 0,
        winningStrategies: 0,
      };
    }

    const typeData = typeMap[cleanName];
    typeData.plBeforeFees += strategy.totalPL + Math.abs(strategy.fees);
    typeData.totalFees += Math.abs(strategy.fees);
    typeData.plAfterFees += strategy.totalPL;
    typeData.strategyCount += 1;

    if (strategy.totalPL > 0) {
      typeData.winningStrategies += 1;
    }
  });

  return Object.values(typeMap)
    .filter((data) => data.strategyCount > 0)
    .sort((a, b) => b.plAfterFees - a.plAfterFees);
};
