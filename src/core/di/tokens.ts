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
  WallexConfig: Symbol('WallexConfig'),

  // External Clients & Adapters
  WallexClient: Symbol('WallexClient'),

  // Repositories
  BuyerRepository: Symbol('BuyerRepository'),
  WalletRepository: Symbol('WalletRepository'),
  ExchangeRateRepository: Symbol('ExchangeRateRepository'),
  ExchangeRateConfigRepository: Symbol('ExchangeRateConfigRepository'),
  BankAccountRepository: Symbol('BankAccountRepository'),
  LedgerRepository: Symbol('LedgerRepository'),
  TopUpRepository: Symbol('TopUpRepository'),
  CatalogRepository: Symbol('CatalogRepository'),
  OrderRepository: Symbol('OrderRepository'),
  OtcPurchaseRepository: Symbol('OtcPurchaseRepository'),

  // Services
  BuyerService: Symbol('BuyerService'),
  WalletService: Symbol('WalletService'),
  ExchangeRateService: Symbol('ExchangeRateService'),
  ExchangeRateConfigService: Symbol('ExchangeRateConfigService'),
  BankAccountService: Symbol('BankAccountService'),
  LedgerService: Symbol('LedgerService'),
  TopUpService: Symbol('TopUpService'),
  CatalogService: Symbol('CatalogService'),
  OrderService: Symbol('OrderService'),
  OtcPurchaseService: Symbol('OtcPurchaseService'),
} as const;
