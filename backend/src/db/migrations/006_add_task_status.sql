ALTER TABLE tasks
ADD COLUMN status task_status NOT NULL DEFAULT 'NOT_STARTED';

CREATE INDEX idx_tasks_projects_status ON tasks (project_id, status);