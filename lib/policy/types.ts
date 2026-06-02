import { z } from "zod";

export const DenyActionSchema = z.enum(["edit", "publish", "create", "delete"]);
export type DenyAction = z.infer<typeof DenyActionSchema>;

export const DenyRuleSchema = z.object({
  action: DenyActionSchema,
  contentTypeId: z.string().min(1),
  fields: z.array(z.string().min(1)).optional(),
});
export type DenyRule = z.infer<typeof DenyRuleSchema>;

export const DenyPolicySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  denies: z.array(DenyRuleSchema),
});
export type DenyPolicy = z.infer<typeof DenyPolicySchema>;

export interface RoleDefinition {
  name: string;
  description?: string;
  permissions: Record<string, "all" | string[]>;
  policies: RolePolicy[];
}
export interface RolePolicy {
  effect: "allow" | "deny";
  actions: "all" | string[];
  constraint?: unknown;
}
