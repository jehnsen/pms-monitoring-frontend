/**
 * API resource types. Generated ones come from `types/api.ts`
 * (`npm run api:types`); where the generator is loose (inferred arrays,
 * JSON objects) the shape is written out here, checked against the API's
 * resources.
 */
import type { components } from "@/types/api";

export type Schemas = components["schemas"];

export type ApiVehicle = Schemas["VehicleResource"];
export type ApiVehicleHealth = Schemas["VehicleHealthResource"];
export type ApiWorkOrder = Schemas["WorkOrderResource"];
export type ApiDocument = Schemas["DocumentResource"];
export type ApiServiceTask = Schemas["ServiceTaskResource"];
export type ApiTechnician = Schemas["TechnicianResource"];
export type ApiBay = Schemas["BayResource"];
export type ApiVendor = Schemas["VendorResource"];
export type ApiCustomerAccount = Schemas["CustomerAccountResource"];
export type ApiUser = Schemas["UserResource"];
export type ApiInvitation = Schemas["InvitationResource"];
export type ApiPurchaseOrder = Schemas["PurchaseOrderResource"];
export type ApiFleetPart = Schemas["FleetPartResource"];
export type ApiMeterReading = Schemas["MeterReadingResource"];
export type ApiOrganization = Schemas["OrganizationResource"];
export type ApiFleetSummary = Schemas["FleetSummaryResource"];

export interface ApiBranchRef {
  id: string;
  name: string;
  slug: string;
  status: string;
}

/** GET /me */
export interface ApiMe {
  user: {
    id: string;
    name: string;
    first_name: string;
    last_name: string;
    username: string | null;
    email: string;
    title: string | null;
    role: string;
    role_label: string;
    side: "staff" | "portal";
    status: string;
  };
  organization: { id: string; name: string; slug: string };
  side: "staff" | "portal";
  branches: {
    allowed: ApiBranchRef[];
    /** One branch id, "all", or null (portal). */
    selected: string | null;
    restricted: boolean;
  };
  customer_account: { id: string; display_name: string; account_type: string; status: string } | null;
  capabilities: string[];
  modules: { active: string[]; organization: string[]; by_branch: Record<string, string[]> };
  branding: {
    display_name: string;
    logo_url: string | null;
    brand_color: string | null;
    support_email: string | null;
    theme_tokens: Record<string, string> | null;
  };
}
