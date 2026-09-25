INSERT INTO
    members (
        user_id,
        project_id,
        role,
        status
    )
SELECT p.creator_id, p.id, 'OWNER', 'ACTIVE'
FROM projects p
WHERE
    NOT EXISTS (
        SELECT 1
        FROM members m
        WHERE
            m.project_id = p.id
            AND m.user_id = p.creator_id
    );