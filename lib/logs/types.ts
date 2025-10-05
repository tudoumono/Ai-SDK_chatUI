export type LogLevel = "info" | "warning" | "error";

export type LogEntry = {
  id: string;
  timestamp: string;
  level: LogLevel;
  scope: "setup" | "chat" | "api";
  message: string;
  detail?: string;
};
