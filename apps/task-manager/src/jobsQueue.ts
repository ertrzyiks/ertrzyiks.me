export interface JobLike {
  id?: string;
  getState(): Promise<string>;
  returnvalue: unknown;
  failedReason?: string;
}

export interface JobsQueue {
  add(name: string, data: { emailId: string }): Promise<{ id?: string }>;
  getJob(jobId: string): Promise<JobLike | undefined>;
}
