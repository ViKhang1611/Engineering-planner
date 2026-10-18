-- PostgreSQL schema contract for a future authenticated REST service.
BEGIN;
CREATE TABLE projects (
 id text PRIMARY KEY,
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
 contract_code text NOT NULL DEFAULT '', client text NOT NULL DEFAULT '',
 start_date date NOT NULL, status_date date NOT NULL,
 holidays date[] NOT NULL DEFAULT '{}', revision bigint NOT NULL DEFAULT 1 CHECK(revision > 0),
 active_baseline_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE tasks (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 id text NOT NULL, parent_id text, sort_order integer NOT NULL,
 name text NOT NULL, duration numeric NOT NULL CHECK(duration >= 0),
 physical_pct numeric NOT NULL CHECK(physical_pct BETWEEN 0 AND 100),
 progress_weight numeric NOT NULL CHECK(progress_weight > 0), requested_start_date date,
 execution_status text NOT NULL CHECK(execution_status IN ('todo','active','review','done')),
 progress_mode text NOT NULL CHECK(progress_mode IN ('manual','checklist')),
 milestone_type text CHECK(milestone_type IN ('FAT','SAT','OTHER')),
 accepted boolean NOT NULL DEFAULT false, acceptance_date date, acceptance_reference text NOT NULL DEFAULT '',
 budget_cost numeric NOT NULL DEFAULT 0 CHECK(budget_cost >= 0), actual_cost numeric NOT NULL DEFAULT 0 CHECK(actual_cost >= 0),
 notes text NOT NULL DEFAULT '', PRIMARY KEY(project_id,id),
 FOREIGN KEY(project_id,parent_id) REFERENCES tasks(project_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(parent_id IS DISTINCT FROM id), CHECK(NOT accepted OR physical_pct = 100)
);
CREATE INDEX tasks_parent_order ON tasks(project_id,parent_id,sort_order);
CREATE TABLE dependencies (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id text NOT NULL,
 predecessor_id text NOT NULL, successor_id text NOT NULL,
 type text NOT NULL CHECK(type IN ('FS','SS','FF','SF')), lag_days numeric NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,id), UNIQUE(project_id,predecessor_id,successor_id),
 FOREIGN KEY(project_id,predecessor_id) REFERENCES tasks(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,successor_id) REFERENCES tasks(project_id,id) ON DELETE CASCADE,
 CHECK(predecessor_id <> successor_id)
);
CREATE TABLE resources (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id text NOT NULL,
 name text NOT NULL, kind text NOT NULL CHECK(kind IN ('engineer','equipment','material')),
 capacity_hours numeric NOT NULL CHECK(capacity_hours > 0 AND capacity_hours <= 24), PRIMARY KEY(project_id,id)
);
CREATE TABLE assignments (
 project_id text NOT NULL, task_id text NOT NULL, resource_id text NOT NULL,
 units numeric NOT NULL CHECK(units > 0 AND units <= 4), quantity numeric CHECK(quantity >= 0),
 PRIMARY KEY(project_id,task_id,resource_id),
 FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id) ON DELETE CASCADE,
 FOREIGN KEY(project_id,resource_id) REFERENCES resources(project_id,id)
);
CREATE TABLE checklist_items (
 project_id text NOT NULL, task_id text NOT NULL, id text NOT NULL, sort_order integer NOT NULL,
 title text NOT NULL, weight numeric NOT NULL CHECK(weight > 0), checked boolean NOT NULL DEFAULT false,
 PRIMARY KEY(project_id,task_id,id), FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id) ON DELETE CASCADE
);
CREATE TABLE baselines (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, id text NOT NULL,
 name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), calendar jsonb NOT NULL,
 tasks_snapshot jsonb NOT NULL CHECK(jsonb_typeof(tasks_snapshot) = 'array'), PRIMARY KEY(project_id,id)
);
ALTER TABLE projects ADD CONSTRAINT selected_baseline_fk FOREIGN KEY(id,active_baseline_id) REFERENCES baselines(project_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE progress_observations (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE, date date NOT NULL,
 physical_pct numeric NOT NULL CHECK(physical_pct BETWEEN 0 AND 100), PRIMARY KEY(project_id,date)
);
CREATE TABLE attachments (
 project_id text NOT NULL, task_id text NOT NULL, id text NOT NULL,
 name text NOT NULL, mime_type text NOT NULL, size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 0 AND 5242880),
 object_key text NOT NULL, PRIMARY KEY(project_id,task_id,id),
 FOREIGN KEY(project_id,task_id) REFERENCES tasks(project_id,id) ON DELETE CASCADE
);
COMMIT;
-- API must validate hierarchy/dependency cycles and run scheduleProject before commit.
-- Ownership/RBAC policies depend on the chosen identity provider and are server responsibilities.
