import type { DependencyContainer } from 'tsyringe';
import { TOKENS } from '@/core/di/tokens';
import { CatalogRepository, DrizzleCatalogRepository } from '@/modules/catalog/catalog.repository';
import { CatalogService } from '@/modules/catalog/catalog.service';

/**
 * Registers Catalog repositories and application services into the DI container.
 */
export function registerCatalogModule(container: DependencyContainer): void {
  container.register(TOKENS.CatalogRepository, {
    useClass: DrizzleCatalogRepository,
  });

  container.register(TOKENS.CatalogService, {
    useClass: CatalogService,
  });
}
