import sql from "../../db/client";

export async function resetDb(): Promise<void> {
  await sql`
        TRUNCATE TABLE
            tasks,
            members,
            projects,
            sessions,
            email_verification_tokens,
            password_reset_tokens,
            users
        RESTART IDENTITY CASCADE
    `;
}
