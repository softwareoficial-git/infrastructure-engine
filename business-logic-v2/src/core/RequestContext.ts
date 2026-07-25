export interface RequestContext {
  tenantId: number;
  userId?: string;
  role: string;
  plan: string;
  token: string;
  source: "FRONTEND" | "BACKEND" | "CLIENT_APP";
  requestId: string;
  userAgent?: string;
  ipAddress?: string;
}
