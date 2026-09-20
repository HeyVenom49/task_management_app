import postgres from "postgres";
import env from "../config/env";

const sql = postgres(env.databaseUrl);

export default sql;
