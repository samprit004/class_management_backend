import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db"; // your drizzle instance
import * as schema from "../db/schema/auth";

const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

export const auth = betterAuth({
    secret: process.env.BETTERAUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL || "http://localhost:8000",
    trustedOrigins: [frontendUrl, "http://localhost:5173", "http://localhost:3000"],
    database: drizzleAdapter(db, {
        provider: "pg",
        schema
    }),
    emailAndPassword: {
        enabled: true
    },
    user: {
        additionalFields: {
            role: {
                type: 'string', required: true, defaultValue: 'student', input: true,
            },
        }
    }
});