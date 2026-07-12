function must(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

export const env = {
  DATABASE_URL: must("DATABASE_URL"),
  NEXTAUTH_URL: must("NEXTAUTH_URL"),
  NEXTAUTH_SECRET: must("NEXTAUTH_SECRET"),
};
