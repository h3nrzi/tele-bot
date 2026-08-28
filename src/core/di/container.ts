import 'reflect-metadata';
import { container, type DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import {
  createDatabaseConnection,
  getDefaultDb,
  type DbClient,
  type DatabaseConnection,
} from '@/core/database/client';
import { TopUpLimits } from '@/modules/top-up/top-up.limits.vo';
import { registerBuyerModule } from '@/modules/buyer/buyer.module';
import { registerWalletModule } from '@/modules/wallet/wallet.module';
import { registerExchangeRateModule } from '@/modules/exchange-rate/exchange-rate.module';
import { registerBankAccountModule } from '@/modules/bank-account/bank-account.module';
import { registerLedgerModule } from '@/modules/ledger/ledger.module';
import { registerTopUpModule } from '@/modules/top-up/top-up.module';

export interface AppContainerOptions {
  dbClient?: DbClient | undefined;
  databaseConnection?: DatabaseConnection | undefined;
  topUpLimits?: TopUpLimits | undefined;
  child?: boolean | undefined;
}

/**
 * Bootstraps and registers all core services, repositories, and feature modules into a DI container.
 */
export function createAppContainer(options?: AppContainerOptions): DependencyContainer {
  const targetContainer = options?.child ? container.createChildContainer() : container;

  // 1. Database Client & Connection
  if (options?.dbClient) {
    targetContainer.register(TOKENS.DbClient, { useValue: options.dbClient });
  } else if (options?.databaseConnection) {
    targetContainer.register(TOKENS.DatabaseConnection, {
      useValue: options.databaseConnection,
    });
    targetContainer.register(TOKENS.DbClient, {
      useValue: options.databaseConnection.db,
    });
  } else {
    targetContainer.register(TOKENS.DbClient, {
      useFactory: () => getDefaultDb(),
    });
  }

  // 2. Configuration & Limits
  if (options?.topUpLimits) {
    targetContainer.register(TOKENS.TopUpLimits, {
      useValue: options.topUpLimits,
    });
  } else {
    try {
      targetContainer.register(TOKENS.TopUpLimits, {
        useFactory: () => TopUpLimits.fromEnv(),
      });
    } catch {
      // Allow environment variables to be absent during tests
    }
  }

  // 3. Register Feature Modules
  registerBuyerModule(targetContainer);
  registerWalletModule(targetContainer);
  registerExchangeRateModule(targetContainer);
  registerBankAccountModule(targetContainer);
  registerLedgerModule(targetContainer);
  registerTopUpModule(targetContainer);

  return targetContainer;
}

export { container };
