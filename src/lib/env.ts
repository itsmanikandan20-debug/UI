export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new MissingEnvError(name);
  }
  return value;
}

export class MissingEnvError extends Error {
  constructor(public readonly varName: string) {
    super(
      `${varName} is not set. Add it to .env.local (see .env.local.example) and restart the server.`
    );
    this.name = "MissingEnvError";
  }
}

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
