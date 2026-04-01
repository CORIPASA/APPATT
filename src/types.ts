export type Rating = "happy" | "neutral" | "sad";

export interface ServiceRequest {
  id: string;
  user: string;
  department: string;
  problem: string;
  requestTime: number; // timestamp
  startTime?: number; // timestamp
  endTime?: number; // timestamp
  rating?: Rating;
  status: "pending" | "in-progress" | "completed";
}

export interface ServiceReport {
  requestId: string;
  user: string;
  department: string;
  problem: string;
  waitTime: number; // in minutes (startTime - requestTime)
  serviceDuration: number; // in minutes (endTime - startTime)
  rating: Rating;
  requestTime: number;
}
