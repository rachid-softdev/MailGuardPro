export const SCORING_VERSION = 1;

export const SCORING_WEIGHTS = {
  format: { pass: 15, fail: 0 },
  mx: { pass: 25, fail: 0 },
  smtp: { pass: 30, fail: 0 },
  catchAll: { pass: 10, fail: 0 },
  disposable: { pass: 10, fail: 0 },
  generic: { pass: 5, fail: 0 },
  spf: { pass: 5, fail: 0 },
  dmarc: { pass: 5, fail: 0 },
  domainAge: { pass: 5, fail: 0 },
  dnsbl: { pass: 0, fail: -20 },
  typo: { pass: 0, fail: -10 },
} as const;
