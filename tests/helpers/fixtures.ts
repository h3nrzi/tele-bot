import type { DependencyContainer } from 'tsyringe';
import { BuyerService } from '@/modules/buyer/buyer.service';
import type { RegisterBuyerInput, RegisterBuyerResult } from '@/modules/buyer/dtos/register-buyer.dto';
import { BankAccountService } from '@/modules/bank-account/bank-account.service';
import type { SetActiveAccountInput } from '@/modules/bank-account/dtos/set-active-account.dto';
import type { BankAccount } from '@/modules/bank-account/bank-account.entity';
import { ExchangeRateService } from '@/modules/exchange-rate/exchange-rate.service';
import type { SetRateInput } from '@/modules/exchange-rate/dtos/set-rate.dto';
import type { ExchangeRate } from '@/modules/exchange-rate/exchange-rate.entity';
import { WalletService } from '@/modules/wallet/wallet.service';
import type { GetBuyerWalletInput, BuyerWalletResult } from '@/modules/wallet/dtos/get-buyer-wallet.dto';
import { TopUpService } from '@/modules/top-up/top-up.service';
import type {
  InitiateTopUpInput,
  InitiateTopUpResult,
} from '@/modules/top-up/dtos/top-up.dto';
import { CatalogService } from '@/modules/catalog/catalog.service';
import type { CreateCatalogItemInput } from '@/modules/catalog/dtos/create-catalog-item.dto';
import type { CatalogItem } from '@/modules/catalog/catalog.entity';
import type { DbClient } from '@/core/database/client';
import { createAppContainer } from '@/core/di/container';

import { OrderService } from '@/modules/order/order.service';
import type {
  PlaceOrderInput,
  PlaceOrderDependencies,
  PlaceOrderResult,
  ClaimOrderInput,
  ClaimOrderDependencies,
  ClaimOrderResult,
} from '@/modules/order/dtos/order.dto';

function getContainer(containerOrDb: DependencyContainer | DbClient): DependencyContainer {
  if ('resolve' in containerOrDb && typeof containerOrDb.resolve === 'function') {
    return containerOrDb as DependencyContainer;
  }
  return createAppContainer({ dbClient: containerOrDb as DbClient, child: true });
}

export async function createTestBuyer(
  containerOrDb: DependencyContainer | DbClient,
  input: RegisterBuyerInput
): Promise<RegisterBuyerResult> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(BuyerService);
  return await service.register(input);
}

export async function setTestActiveAccount(
  containerOrDb: DependencyContainer | DbClient,
  input: SetActiveAccountInput
): Promise<BankAccount> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(BankAccountService);
  return await service.setActiveAccount(input);
}

export async function getTestActiveAccount(
  containerOrDb: DependencyContainer | DbClient
): Promise<BankAccount | null> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(BankAccountService);
  return await service.getActiveAccount();
}

export async function setTestRate(
  containerOrDb: DependencyContainer | DbClient,
  inputOrAdminId: SetRateInput | bigint | number,
  maybeRate?: bigint | number | string
): Promise<ExchangeRate> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(ExchangeRateService);
  if (typeof inputOrAdminId === 'object') {
    return await service.setRate(inputOrAdminId);
  }
  return await service.setRate(inputOrAdminId, maybeRate!);
}

export async function getTestCurrentRate(
  containerOrDb: DependencyContainer | DbClient
): Promise<ExchangeRate | null> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(ExchangeRateService);
  return await service.getCurrentRate();
}

export async function getTestBuyerWallet(
  containerOrDb: DependencyContainer | DbClient,
  input: GetBuyerWalletInput
): Promise<BuyerWalletResult | null> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(WalletService);
  return await service.getBuyerWallet(input);
}

export async function initiateTestTopUp(
  containerOrDb: DependencyContainer | DbClient,
  input: InitiateTopUpInput
): Promise<InitiateTopUpResult> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(TopUpService);
  return await service.initiateTopUp(input);
}

export async function createTestCatalogItem(
  containerOrDb: DependencyContainer | DbClient,
  input: CreateCatalogItemInput
): Promise<CatalogItem> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(CatalogService);
  return await service.createCatalogItem(input);
}

export async function listTestCatalogItems(
  containerOrDb: DependencyContainer | DbClient
): Promise<CatalogItem[]> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(CatalogService);
  return await service.listAll();
}

export async function placeTestOrder(
  containerOrDb: DependencyContainer | DbClient,
  input: PlaceOrderInput,
  dependencies?: PlaceOrderDependencies
): Promise<PlaceOrderResult> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(OrderService);
  return await service.placeOrder(input, dependencies);
}

export async function claimTestOrder(
  containerOrDb: DependencyContainer | DbClient,
  input: ClaimOrderInput,
  dependencies?: ClaimOrderDependencies
): Promise<ClaimOrderResult> {
  const container = getContainer(containerOrDb);
  const service = container.resolve(OrderService);
  return await service.claimOrder(input, dependencies);
}


