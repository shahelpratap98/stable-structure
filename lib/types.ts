export type Role = "employee" | "approver" | "admin";
export type EntryStatus = "draft" | "submitted" | "returned" | "approved" | "invoiced";

export type Profile = {
  user_id: string;
  display_name: string;
  email: string;
  role: Role;
  standard_day_hours: number | null;
  is_active: boolean;
};

export type ProjectOption = {
  id: string;
  project_no: string;
  name: string;
  default_chargeable: boolean;
};

export type WorkTypeOption = { id: string; name: string };

export type TimeEntry = {
  id: string;
  entry_date: string;
  project_id: string | null;
  work_type_id: string | null;
  chargeable: boolean;
  hours: number | null;
  description: string;
  status: EntryStatus;
  return_note: string | null;
};

// A row in v_entries, as an approver sees it.
export type EntryView = {
  id: string;
  entry_date: string;
  user_id: string;
  employee: string;
  project_no: string | null;
  project: string | null;
  work_type: string | null;
  chargeable: boolean;
  hours: number | null;
  description: string;
  status: EntryStatus;
  rate: number | null;
  value: number | null;
};
