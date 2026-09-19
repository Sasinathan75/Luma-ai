export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // OpenRouter configuration
  forgeApiUrl:
    process.env.OPENROUTER_API_URL ??
    "https://openrouter.ai/api/v1",

  forgeApiKey:
    process.env.OPENROUTER_API_KEY ??
    process.env.BUILT_IN_FORGE_API_KEY ??
    "",

  openRouterModel:
    process.env.OPENROUTER_MODEL ??
    "openai/gpt-chat-latest",
};