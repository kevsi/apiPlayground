/**
 * Module OpenAPI unifié — import/export au format OpenAPI 3.0
 * Basé sur recli (référence la plus avancée) + export depuis reqy-mcp
 */
import type { ExportBundle, Collection } from "../types.js";
/**
 * Importe une spec OpenAPI (JSON ou YAML) et retourne un ExportBundle.
 * Supporte OpenAPI 3.x
 */
export declare function importOpenAPI(specYamlOrJson: string): ExportBundle;
/**
 * Exporte des collections au format OpenAPI 3.0 (JSON)
 */
export declare function exportToOpenApi(collections: Collection[]): string;
//# sourceMappingURL=index.d.ts.map