import type postgres from "postgres";
import type { CreateUserInput, PublicUser } from "./auth.types";

type Sql = ReturnType<typeof postgres>;

export class AuthRepository {
  constructor(private readonly sql: Sql) {}

  async register(input: CreateUserInput): Promise<PublicUser> {
    const [row] = await this.sql`
            INSERT INTO users (
                name,
                email,
                hash_password,
                role,
                status
            )
            VALUES (
                ${input.name},
                ${input.email},
                ${input.passwordHash},
                'USER',
                'ACTIVE'
            )
            RETURNING
                id,
                name,
                email,
                role,
                status,
                created_at
        `;

    if (!row) {
      throw new Error("Failed to create user");
    }
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
    };
  }
}
