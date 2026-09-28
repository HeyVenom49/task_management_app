CREATE OR REPLACE FUNCTION enforce_no_open_tasks_on_deactivate() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'INACTIVE' AND OLD.status IS DISTINCT FROM 'INACTIVE' THEN
        IF EXISTS (
            SELECT 1
            FROM tasks t
            WHERE t.assignee_member_id = OLD.id
                AND t.status <> 'COMPLETED'
        ) THEN
            RAISE EXCEPTION 'Cannot remove a member who is assigned to open tasks' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_members_no_open_tasks_on_deactivate BEFORE
UPDATE OF status ON members FOR EACH ROW
EXECUTE FUNCTION enforce_no_open_tasks_on_deactivate();

CREATE OR REPLACE FUNCTION enforce_open_tasks_assignee_active() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assignee_member_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'COMPLETED' THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM members m
        WHERE m.id = NEW.assignee_member_id
            AND m.project_id = NEW.project_id
            AND m.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'Invalid assignee'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_open_assignee_active
    BEFORE INSERT OR UPDATE OF assignee_member_id, project_id, status ON tasks
    FOR EACH ROW
    EXECUTE FUNCTION enforce_open_tasks_assignee_active();