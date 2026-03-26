import type { HotelAvailabilityStatus } from "./hotel-fetcher";

export type MonitoringTaskStatus = HotelAvailabilityStatus;

export type MonitoringTaskRow = {
  id: string;
  hotel_name: string;
  location: string;
  monitor_date: string; // YYYY-MM-DD
  status: MonitoringTaskStatus;
  is_active: boolean;
  last_check: string | null; // timestamptz
  source_url?: string | null;
};

