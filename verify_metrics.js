
// Mock Data Helper
const createLeg = (type, action, strike, quantity, costBasis) => ({
    type,
    action,
    strike,
    quantity,
    costBasis
});

// --- Capital Estimation Logic (Copied from App.jsx for verification) ---
const estimateCapital = (strategy) => {
    const legs = strategy.legs;
    const longLegs = legs.filter(l => l.action.includes('BUY'));
    const shortLegs = legs.filter(l => l.action.includes('SELL'));

    // 1. Long Only (Single or Multiple)
    if (shortLegs.length === 0) {
        return legs.reduce((sum, leg) => sum + Math.abs(leg.costBasis), 0);
    }

    // 2. Vertical Spreads (Debit or Credit)
    if (legs.length === 2 && longLegs.length === 1 && shortLegs.length === 1) {
        const long = longLegs[0];
        const short = shortLegs[0];

        if (long.type === short.type) {
            const width = Math.abs(long.strike - short.strike);
            const quantity = long.quantity;

            if (long.strike < short.strike && long.type === 'CALL') {
                // Debit Call Spread
                return Math.abs(strategy.legs.reduce((sum, l) => sum + l.costBasis, 0));
            } else if (long.strike > short.strike && long.type === 'PUT') {
                // Debit Put Spread
                return Math.abs(strategy.legs.reduce((sum, l) => sum + l.costBasis, 0));
            } else {
                // Credit Spread
                return width * 100 * quantity;
            }
        }
    }

    // 3. Iron Condors
    if (legs.length === 4) {
        const calls = legs.filter(l => l.type === 'CALL');
        const puts = legs.filter(l => l.type === 'PUT');

        if (calls.length === 2 && puts.length === 2) {
            const longCall = calls.find(l => l.action.includes('BUY'));
            const shortCall = calls.find(l => l.action.includes('SELL'));
            const callWidth = (longCall && shortCall) ? Math.abs(longCall.strike - shortCall.strike) : 0;

            const longPut = puts.find(l => l.action.includes('BUY'));
            const shortPut = puts.find(l => l.action.includes('SELL'));
            const putWidth = (longPut && shortPut) ? Math.abs(longPut.strike - shortPut.strike) : 0;

            const quantity = calls[0].quantity;
            return Math.max(callWidth, putWidth) * 100 * quantity;
        }
    }

    // 4. Cash Secured Puts
    if (legs.length === 1 && shortLegs.length === 1 && shortLegs[0].type === 'PUT') {
        return shortLegs[0].strike * 100 * shortLegs[0].quantity;
    }

    // 5. Naked Calls
    if (legs.length === 1 && shortLegs.length === 1 && shortLegs[0].type === 'CALL') {
        return shortLegs[0].strike * 100 * 0.2 * shortLegs[0].quantity;
    }

    return 0;
};

// --- Tests ---

console.log("Running Verification Tests...");

// Test 1: Long Call (Debit)
const longCall = {
    legs: [createLeg('CALL', 'BUY', 100, 1, -200)] // Cost $200
};
console.log("Test 1 (Long Call):", estimateCapital(longCall) === 200 ? "PASS" : `FAIL (Got ${estimateCapital(longCall)})`);

// Test 2: Vertical Debit Call Spread (Long 100, Short 105)
const debitSpread = {
    legs: [
        createLeg('CALL', 'BUY', 100, 1, -300),
        createLeg('CALL', 'SELL', 105, 1, 100)
    ] // Net Debit -200
};
console.log("Test 2 (Debit Spread):", estimateCapital(debitSpread) === 200 ? "PASS" : `FAIL (Got ${estimateCapital(debitSpread)})`);

// Test 3: Vertical Credit Put Spread (Short 100, Long 95)
const creditSpread = {
    legs: [
        createLeg('PUT', 'SELL', 100, 1, 200),
        createLeg('PUT', 'BUY', 95, 1, -50)
    ] // Width 5, Risk 500
};
console.log("Test 3 (Credit Spread):", estimateCapital(creditSpread) === 500 ? "PASS" : `FAIL (Got ${estimateCapital(creditSpread)})`);

// Test 4: Iron Condor (Short 100P/110C, Long 95P/115C)
const ironCondor = {
    legs: [
        createLeg('PUT', 'SELL', 100, 1, 100),
        createLeg('PUT', 'BUY', 95, 1, -20),
        createLeg('CALL', 'SELL', 110, 1, 100),
        createLeg('CALL', 'BUY', 115, 1, -20)
    ] // Put Width 5, Call Width 5. Risk 500.
};
console.log("Test 4 (Iron Condor):", estimateCapital(ironCondor) === 500 ? "PASS" : `FAIL (Got ${estimateCapital(ironCondor)})`);

// Test 5: Cash Secured Put (Short 100P)
const csp = {
    legs: [createLeg('PUT', 'SELL', 100, 1, 200)]
};
console.log("Test 5 (CSP):", estimateCapital(csp) === 10000 ? "PASS" : `FAIL (Got ${estimateCapital(csp)})`);

// Test 6: Naked Call (Short 100C) - 20% Rule
const nakedCall = {
    legs: [createLeg('CALL', 'SELL', 100, 1, 200)]
};
console.log("Test 6 (Naked Call):", estimateCapital(nakedCall) === 2000 ? "PASS" : `FAIL (Got ${estimateCapital(nakedCall)})`);

