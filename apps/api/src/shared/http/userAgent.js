const MAX_USER_AGENT_LENGTH = 255;

export const userAgentOf = (req) => req.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? null;
