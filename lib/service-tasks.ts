import type { TaskCategory } from "@/types";

/**
 * Display labels for the API's task categories. The catalogue itself —
 * intervals, estimates, which items are critical — is `GET /service-tasks`.
 */
export const CATEGORY_LABEL: Record<TaskCategory, string> = {
  engine: "Engine",
  drivetrain: "Drivetrain",
  brakes: "Brakes",
  tires: "Tires & wheels",
  electrical: "Electrical",
  safety: "Safety",
  body: "Body & interior",
};
