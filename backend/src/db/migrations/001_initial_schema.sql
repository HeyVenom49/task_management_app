CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- enums
CREATE TYPE user_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);

CREATE TYPE user_role AS ENUM (
    'USER',
    'ADMIN'
);

CREATE TYPE member_role AS ENUM (
    'OWNER',
    'MEMBER'
);

CREATE TYPE member_status AS ENUM (
    'ACTIVE',
    'INACTIVE'
);

CREATE TYPE task_status AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'BLOCKED',
    'COMPLETED'
);

CREATE TYPE task_priority AS ENUM (
    'VERY_LOW',
    'LOW',
    'MODERATE',
    'HIGH',
    'URGENT'
);

-- users

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    hash_password TEXT NOT NULL,
    role user_role NOT NULL,
    status user_status NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- projects

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    creator_id UUID NOT NULL REFERENCES users (id),
    info TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- members

CREATE TABLE members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (id),
    project_id UUID NOT NULL REFERENCES projects (id),
    role member_role NOT NULL,
    status member_status NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, project_id),
    UNIQUE (id, project_id)
);

-- tasks

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    project_id UUID NOT NULL,
    creator_member_id UUID NOT NULL,
    assignee_member_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    priority task_priority NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY (creator_member_id, project_id) REFERENCES members (id, project_id),
    FOREIGN KEY (
        assignee_member_id,
        project_id
    ) REFERENCES members (id, project_id)
);

CREATE INDEX idx_members_project_id ON members (project_id);

CREATE INDEX idx_tasks_project_id ON tasks (project_id);