const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatNumericField = (value) => {
  if (!Number.isFinite(value)) return '';
  const rounded = Math.round(value * 1e8) / 1e8;
  return `${rounded === 0 ? 0 : rounded}`;
};

const normalizeEffect = (effect) => (typeof effect === 'string' ? effect.trim().toLowerCase() : '');

export const normalizeAction = (action) => (
  (action || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
);

export const applyValueEffect = (amount, effect) => {
  const value = Math.abs(toFiniteNumber(amount));
  const normalized = normalizeEffect(effect);
  if (normalized === 'debit') return -value;
  if (normalized === 'credit') return value;
  return toFiniteNumber(amount);
};

const inferSignedPrice = (price, action, valueEffect) => {
  const numericPrice = Math.abs(toFiniteNumber(price));
  if (!numericPrice) return 0;
  if (action.startsWith('BUY')) return -numericPrice;
  if (action.startsWith('SELL')) return numericPrice;
  return applyValueEffect(numericPrice, valueEffect);
};

const toDateInputFormat = (value) => {
  if (!value) return '';
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(value)) return value;
  const isoMatch = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${month}/${day}/${year.slice(2)}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const year = `${date.getUTCFullYear()}`.slice(2);
  return `${month}/${day}/${year}`;
};

export const parseOptionSymbol = (symbol) => {
  const trimmed = (symbol || '').trim();
  if (!trimmed) return null;

  const spacedMatch = trimmed.match(/^([A-Z0-9./_-]+)\s+(\d{6})([CP])(\d{8})$/i);
  const compactMatch = trimmed.match(/^([A-Z0-9./_-]{1,8})(\d{6})([CP])(\d{8})$/i);
  const match = spacedMatch || compactMatch;

  if (!match) return null;

  const [, rawUnderlying, yymmdd, cpFlag, strikeRaw] = match;
  const yy = Number(yymmdd.slice(0, 2));
  const year = yy >= 70 ? 1900 + yy : 2000 + yy;
  const month = yymmdd.slice(2, 4);
  const day = yymmdd.slice(4, 6);
  const strike = Number(strikeRaw) / 1000;

  return {
    underlying: rawUnderlying.trim(),
    expirationDate: `${month}/${day}/${String(year).slice(2)}`,
    strikePrice: Number.isFinite(strike) ? strike : 0,
    callOrPut: cpFlag.toUpperCase() === 'C' ? 'CALL' : 'PUT',
  };
};

const resolveUnderlyingSymbol = (transaction, parsedOption) => (
  transaction?.['underlying-symbol']
  || transaction?.underlyingSymbol
  || parsedOption?.underlying
  || ''
);

const sumFeeComponents = (transaction) => {
  const feeFields = [
    ['regulatory-fees', 'regulatory-fees-effect'],
    ['clearing-fees', 'clearing-fees-effect'],
    ['proprietary-index-option-fees', 'proprietary-index-option-fees-effect'],
    ['currency-conversion-fees', 'currency-conversion-fees-effect'],
    ['other-charge', 'other-charge-effect'],
  ];

  return feeFields.reduce((sum, [amountField, effectField]) => (
    sum + applyValueEffect(transaction?.[amountField], transaction?.[effectField])
  ), 0);
};

export const mapTastytradeTransactionToCsvRow = (transaction) => {
  const rawSymbol = transaction?.symbol || '';
  const parsedOption = parseOptionSymbol(rawSymbol);
  const normalizedAction = normalizeAction(transaction?.action);

  const value = applyValueEffect(transaction?.value, transaction?.['value-effect']);
  const commission = applyValueEffect(transaction?.commission, transaction?.['commission-effect']);
  const fees = sumFeeComponents(transaction);
  const netValueRaw = transaction?.['net-value'];
  const hasNetValue = netValueRaw !== null && netValueRaw !== undefined && netValueRaw !== '';
  const total = hasNetValue
    ? applyValueEffect(netValueRaw, transaction?.['net-value-effect'])
    : value + commission + fees;

  const instrumentType = transaction?.['instrument-type'] || '';
  const multiplier = toFiniteNumber(transaction?.multiplier)
    || (instrumentType.toLowerCase().includes('option') ? 100 : 1);

  const quantity = Math.abs(toFiniteNumber(transaction?.quantity));
  const averagePrice = inferSignedPrice(
    transaction?.price,
    normalizedAction,
    transaction?.['value-effect'],
  );
  const underlyingSymbol = resolveUnderlyingSymbol(transaction, parsedOption);

  return {
    Date: transaction?.['executed-at'] || transaction?.['transaction-date'] || '',
    Type: transaction?.['transaction-type'] || '',
    'Sub Type': transaction?.['transaction-sub-type'] || '',
    Action: normalizedAction,
    Symbol: rawSymbol,
    'Instrument Type': instrumentType,
    Description: transaction?.description || '',
    Value: formatNumericField(value),
    Quantity: formatNumericField(quantity),
    'Average Price': formatNumericField(averagePrice),
    Commissions: formatNumericField(commission),
    Fees: formatNumericField(fees),
    Multiplier: formatNumericField(multiplier),
    'Root Symbol': parsedOption?.underlying || underlyingSymbol,
    'Underlying Symbol': underlyingSymbol,
    'Expiration Date': transaction?.['expiration-date']
      ? toDateInputFormat(transaction['expiration-date'])
      : parsedOption?.expirationDate || '',
    'Strike Price': formatNumericField(
      transaction?.['strike-price'] ?? parsedOption?.strikePrice ?? 0,
    ),
    'Call or Put': transaction?.['call-or-put'] || parsedOption?.callOrPut || '',
    'Order #': transaction?.['order-id'] ? `${transaction['order-id']}` : '',
    Total: formatNumericField(total),
    Currency: transaction?.currency || 'USD',
  };
};

export const mapTastytradeTransactionsToRows = (transactions = []) => (
  transactions.map((transaction) => mapTastytradeTransactionToCsvRow(transaction))
);
