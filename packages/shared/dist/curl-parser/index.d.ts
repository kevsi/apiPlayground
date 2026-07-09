/**
 * Parser curl unifié entre reqy-web et reqy-mcp.
 * Supporte : -X, --request, -H, --header, -d, --data, --data-raw, -u
 * Génération : generateCurlCommand pour exporter une requête en curl
 */
export interface ParsedCurl {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    auth?: {
        type: "basic";
        username: string;
        password: string;
    };
}
export declare function parseCurlCommand(command: string): ParsedCurl | null;
export declare function generateCurlCommand(request: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: string;
    authType?: string;
    authToken?: string;
}): string;
//# sourceMappingURL=index.d.ts.map