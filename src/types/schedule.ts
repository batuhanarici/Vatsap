export interface ScheduledDispatch {
  id: string;
  targetTimestamp: number; // Unix timestamp in ms
  targetTimeString: string; // e.g. "19:30"
  targetDateString: string; // e.g. "2026-10-04"
  examName: string;
  selectedGroup: string;
  studentCount: number;
  createdAt: number;
  note?: string;
}
