/**
 * Dependency Injection Tokens used across the application.
 */
export const TOKENS = {
  // Database & Infrastructure
  DbClient: Symbol('DbClient'),
  DatabaseConnection: Symbol('DatabaseConnection'),

  // Configuration
  TopUpLimits: Symbol('TopUpLimits'),
  BotToken: Symbol('BotToken'),
  AdminIds: Symbol('AdminIds'),

  // Repositories
  BuyerRepository: Symbol('BuyerRepository'),
  WalletRepository: Symbol('WalletRepository'),
  ExchangeRateRepository: Symbol('ExchangeRateRepository'),
  BankAccountRepository: Symbol('BankAccountRepository'),
  LedgerRepository: Symbol('LedgerRepository'),
  TopUpRepository: Symbol('TopUpRepository'),

  // Services
  BuyerService: Symbol('BuyerService'),
  WalletService: Symbol('WalletService'),
  ExchangeRateService: Symbol('ExchangeRateService'),
  BankAccountService: Symbol('BankAccountService'),
  TopUpService: Symbol('TopUpService'),
} as const;
