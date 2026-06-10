import {
  Currency,
  PaymentPeriodicity,
  type CheckPaymentSetupQuery,
  type CheckMemberPlansQuery,
  type CheckSubscriptionSetupQuery,
} from '../../src/generated/graphql.js';

// --- payment methods ---
export const paymentMethodsActive: CheckPaymentSetupQuery = {
  paymentMethods: [
    // a secret-shaped providerID to prove the redaction gate masks it
    {
      id: 'pm1',
      name: 'Credit Card',
      slug: 'cc',
      active: true,
      paymentProviderID: 'sk_live_PROVIDERKEY123456',
    },
    {
      id: 'pm2',
      name: 'TWINT',
      slug: 'twint',
      active: false,
      paymentProviderID: 'prov_twint',
    },
  ],
};

export const paymentMethodsNone: CheckPaymentSetupQuery = {
  paymentMethods: [],
};

export const paymentMethodsInactiveOnly: CheckPaymentSetupQuery = {
  paymentMethods: [
    {
      id: 'pm1',
      name: 'Credit Card',
      slug: 'cc',
      active: false,
      paymentProviderID: 'prov_cc',
    },
  ],
};

// --- member plans ---
export const memberPlansReady: CheckMemberPlansQuery = {
  memberPlans: {
    totalCount: 1,
    nodes: [
      {
        id: 'mp1',
        name: 'Supporter',
        slug: 'supporter',
        active: true,
        amountPerMonthMin: 1000,
        currency: Currency.Chf,
        availablePaymentMethods: [{ paymentMethodIDs: ['pm1'] }],
      },
    ],
  },
};

export const memberPlansIncomplete: CheckMemberPlansQuery = {
  memberPlans: {
    totalCount: 2,
    nodes: [
      {
        id: 'mp1',
        name: 'No Price',
        slug: 'no-price',
        active: true,
        amountPerMonthMin: 0,
        currency: Currency.Chf,
        availablePaymentMethods: [{ paymentMethodIDs: ['pm1'] }],
      },
      {
        id: 'mp2',
        name: 'No Payment Method',
        slug: 'no-pm',
        active: true,
        amountPerMonthMin: 500,
        currency: Currency.Chf,
        availablePaymentMethods: [{ paymentMethodIDs: [] }],
      },
    ],
  },
};

export const memberPlansEmpty: CheckMemberPlansQuery = {
  memberPlans: { totalCount: 0, nodes: [] },
};

// --- subscriptions ---
export const subscriptionsHave: CheckSubscriptionSetupQuery = {
  subscriptions: { totalCount: 5 },
  activeSubscribers: [
    {
      memberPlan: 'Supporter',
      monthlyAmount: 1000,
      paymentPeriodicity: PaymentPeriodicity.Monthly,
    },
    {
      memberPlan: 'Supporter',
      monthlyAmount: 1000,
      paymentPeriodicity: PaymentPeriodicity.Monthly,
    },
  ],
};

export const subscriptionsNone: CheckSubscriptionSetupQuery = {
  subscriptions: { totalCount: 0 },
  activeSubscribers: [],
};
