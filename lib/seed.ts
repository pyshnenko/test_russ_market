import "server-only";
import { defaultEmployees, type Workspace } from "./schedule";

export function initialWorkspace(): Workspace {
  return {
    employees: defaultEmployees,
    shifts: {},
    templates: [
      { id: "9df970bb-b11d-4081-9e57-12d4f1c94d61", name: "Утро", start: "07:00", end: "15:00", color: "blue" },
      { id: "de629c3a-bb55-4b89-8afb-3dbda633ea42", name: "День", start: "10:00", end: "18:00", color: "violet" },
      { id: "bbdf0678-0fbe-44e1-a43a-5dd041bd6350", name: "Вечер", start: "15:00", end: "23:00", color: "green" },
    ],
  };
}
