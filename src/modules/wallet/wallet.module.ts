import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { DrizzleWalletRepository } from '@/modules/wallet/wallet.repository';
import { WalletService } from '@/modules/wallet/wallet.service';

export function registerWalletModule(container: DependencyContainer): void {
  container.register(TOKENS.WalletRepository, {
    useClass: DrizzleWalletRepository,
  });
  container.register(TOKENS.WalletService, {
    useClass: WalletService,
  });
}
