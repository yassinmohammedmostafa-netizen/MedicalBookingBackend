import * as schema from "./schema.js";
export declare const client: import("@libsql/client").Client;
export declare const db: import("drizzle-orm/libsql").LibSQLDatabase<typeof schema> & {
    $client: import("@libsql/client").Client;
};
export * from "./schema.js";
//# sourceMappingURL=index.d.ts.map