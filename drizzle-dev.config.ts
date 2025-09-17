import { defineConfig } from "drizzle-kit";

export default defineConfig({
    out: "./drizzle/migrations",
    schema: "./worker/infrastructure/db/schema.ts",
    dialect: "sqlite",
    driver: "d1-http",
});