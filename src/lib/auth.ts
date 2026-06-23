import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "../db"; // your drizzle instance
import * as schema from "../db/schema/auth";

export const auth = betterAuth({
    secret: process.env.BETTERAUTH_SECRET,
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
            imageCldId: {
                type: 'string', required: true, input: true
            }
        }
    }
});