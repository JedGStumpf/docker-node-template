export interface IAsanaClient {
  createTask(params: {
    name: string;
    notes: string;
    projectGid: string;
    assigneeGid?: string;
  }): Promise<{ gid: string }>;
}

export class RealAsanaClient implements IAsanaClient {
  private tasksApi: any | null = null;

  private async getTasksApi() {
    if (!this.tasksApi) {
      const asanaSdk = await import('asana');
      const token = process.env.ASANA_ACCESS_TOKEN || '';
      const apiClient = new asanaSdk.ApiClient();
      if (apiClient.authentications?.personalAccessToken) {
        apiClient.authentications.personalAccessToken.accessToken = token;
      }
      this.tasksApi = new asanaSdk.TasksApi(apiClient);
    }
    return this.tasksApi;
  }

  async createTask(params: {
    name: string;
    notes: string;
    projectGid: string;
    assigneeGid?: string;
  }): Promise<{ gid: string }> {
    const tasksApi = await this.getTasksApi();
    const task = await tasksApi.createTask({
      data: {
        name: params.name,
        notes: params.notes,
        projects: [params.projectGid],
        assignee: params.assigneeGid,
      },
    });
    const gid = task?.gid || task?.data?.gid;
    if (!gid) {
      throw new Error('Asana createTask did not return a gid');
    }
    return { gid: String(gid) };
  }
}

export class MockAsanaClient implements IAsanaClient {
  async createTask(): Promise<{ gid: string }> {
    return { gid: `mock-task-${Date.now()}` };
  }
}
