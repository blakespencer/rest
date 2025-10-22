/**
 * Plaid Sandbox Test Data Fixtures
 * These match the actual responses from Plaid sandbox environment
 */

/**
 * Plaid sandbox provides these test public tokens
 * You can use these in E2E tests without going through Link UI
 */
export const PLAID_SANDBOX_TOKENS = {
  // Valid public token that can be exchanged
  VALID_PUBLIC_TOKEN: 'public-sandbox-test-token',

  // Invalid public token (will fail exchange)
  INVALID_PUBLIC_TOKEN: 'public-sandbox-invalid',
};

/**
 * Plaid test institution IDs
 * These are real institutions in Plaid sandbox
 */
export const PLAID_TEST_INSTITUTIONS = {
  TARTAN_BANK: 'ins_109508', // First Platypus Bank (Tartan)
  CHASE: 'ins_56', // Chase (sandbox)
};

/**
 * Mock link token response
 */
export function createMockLinkTokenResponse() {
  return {
    link_token: 'link-sandbox-test-token-' + Date.now(),
    expiration: new Date(Date.now() + 3600000).toISOString(), // 1 hour
    request_id: 'req-test-' + Date.now(),
  };
}

/**
 * Mock public token exchange response
 */
export function createMockTokenExchangeResponse(overrides?: {
  itemId?: string;
  institutionId?: string;
}) {
  return {
    access_token: 'access-sandbox-' + Math.random().toString(36).substring(7),
    item_id: overrides?.itemId || 'item-sandbox-' + Date.now(),
    request_id: 'req-exchange-' + Date.now(),
  };
}

/**
 * Mock accounts response from Plaid
 * This matches the structure of Plaid's /accounts/get response
 */
export function createMockAccountsResponse(overrides?: {
  institutionId?: string;
  accountCount?: number;
}) {
  const accountCount = overrides?.accountCount || 2;
  const accounts: any[] = [];

  for (let i = 0; i < accountCount; i++) {
    accounts.push({
      account_id: `acc-sandbox-${i}-${Date.now()}`,
      name: i === 0 ? 'Plaid Checking' : `Plaid Savings ${i}`,
      official_name: i === 0 ? 'Plaid Gold Standard 0% Interest Checking' : `Plaid Silver Standard Savings ${i}`,
      type: 'depository',
      subtype: i === 0 ? 'checking' : 'savings',
      mask: `${1000 + i}`,
      balances: {
        available: 100 + i * 50, // $100, $150, etc.
        current: 110 + i * 50, // $110, $160, etc.
        iso_currency_code: 'USD',
        limit: null,
        unofficial_currency_code: null,
      },
    });
  }

  return {
    accounts,
    item: {
      available_products: ['balance', 'identity', 'investments'],
      billed_products: ['assets', 'auth', 'transactions'],
      consent_expiration_time: null,
      error: null,
      institution_id: overrides?.institutionId || PLAID_TEST_INSTITUTIONS.TARTAN_BANK,
      item_id: 'item-sandbox-' + Date.now(),
      webhook: '',
    },
    request_id: 'req-accounts-' + Date.now(),
  };
}

/**
 * Real Plaid sandbox test credentials
 * These are the usernames you can use in Plaid Link sandbox mode
 */
export const PLAID_SANDBOX_CREDENTIALS = {
  // Successful authentication
  GOOD_USER: {
    username: 'user_good',
    password: 'pass_good',
  },

  // Failed authentication
  BAD_USER: {
    username: 'user_bad',
    password: 'pass_bad',
  },

  // Custom scenarios
  CUSTOM_USER: {
    username: 'user_custom',
    password: 'pass_good',
  },
};
