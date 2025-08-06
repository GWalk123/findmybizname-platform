export interface GeneratedName {
  id: string;
  name: string;
  available: boolean;
  score: number;
  timestamp: Date;
}

export interface User {
  id: string;
  email: string;
  plan: "free" | "basic" | "pro" | "enterprise";
  usage: number;
  limit: number;
}
