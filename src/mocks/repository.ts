import type { KeyResult, Milestone, Objective, ProgressSnapshot, Project, Risk, User, WorkloadEntry } from '../domain/types';
import { keyResults, milestones, objectives, progressSnapshots, projects, risks } from './okr';
import { workloads } from './reports';
import { users } from './users';

export interface DashboardData {
  currentUser: User;
  projects: Project[];
  objectives: Objective[];
  keyResults: KeyResult[];
  milestones: Milestone[];
  risks: Risk[];
  progressSnapshots: ProgressSnapshot[];
  workloads: WorkloadEntry[];
}

export const mockRepository = {
  getUser(id: string): User | undefined {
    return users.find((user) => user.id === id);
  },

  getDashboardData(userId: string): DashboardData {
    const currentUser = this.getUser(userId);

    if (!currentUser) {
      throw new Error(`Unknown mock user: ${userId}`);
    }

    return {
      currentUser,
      projects,
      objectives,
      keyResults,
      milestones,
      risks,
      progressSnapshots,
      workloads,
    };
  },
};
